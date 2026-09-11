# 14 — Allowlist and self-signup

Status: ready-for-human
Blocked by: 01

## Parent

[friens-cal v1 map](../../shared-availability-calendar/map.md)

## What to build

Friends sign themselves up, and nobody else can. Requires dashboard work, which
is why it is human-led.

The **`before-user-created` Auth Hook, as a Postgres function**, is the only
enforceable allowlist gate — client-side checks and RLS cannot stop a signup.
It reads an `allowlist` table of lower-cased email addresses. **That table has no
browser access at all.**

The hook must be registered in the Supabase dashboard, and needs
`search_path = ''` and explicit grant/revoke like any `security definer`
function. Only the Auth server may call it; the Data API must not.

**Nothing here may leak whether an address is on the list.** The research
document's drafted rejection string (`'That email is not on the list…'`) is
exactly the leak this forbids and must not ship — the ticket 18 copy goes in the
hook's SQL instead.

**Copy alone cannot close the enumeration leak.** With Confirm Email disabled, an
already-registered address returns Supabase's own `User already registered`
regardless of what the hook says. Only a **client-side catch-all** closes it,
which is what ticket 18's draft A is shaped around.

Confirm Email stays **disabled** — safe only because this hook exists. There is
no password reset (ticket 13); the sign-in screen already says so honestly.

## Acceptance criteria

- [x] `allowlist` table, lower-cased emails, with **no** grants to `anon` or
      `authenticated`
- [x] `before-user-created` hook function with `search_path = ''` and explicit
      grant/revoke; not reachable over the Data API
- [x] The hook is registered in the dashboard
- [x] Sign-up screen using the ticket 18 draft A copy
- [ ] An address on the list can sign up and lands in the setup flow
- [x] An address not on the list is refused, with a message that does **not**
      reveal list membership
- [x] An already-registered address produces the same message as a rejected one,
      via the client-side catch-all
- [x] The real Friends' addresses are seeded, and adding one later is documented
- [x] `npx tsc -p tsconfig.app.json --noEmit` is clean

## Blocked by

- [01 — Sign in, and your Friend row exists](./01-sign-in-and-friend-row.md)


## Built

Everything that can be built from a repo is built. Two of the nine criteria
cannot be, and they are the two this ticket was marked `ready-for-human` for:
running DDL against the project, and flipping a switch in the dashboard.
`scripts/setup-allowlist.sh` is the handover — six stages, no prose.

`supabase/07-allowlist.sql` is the table, the `before-user-created` hook
function and the grants. `scripts/verify-allowlist.mjs` proves the locks from a
browser-shaped client. `src/pages/SignUpPage.tsx` is the screen; `signUp` and
`SIGNUP_FAILURE` live in `src/auth/use-session.ts` and
`src/auth/session-provider.tsx`; `AppRoutes.tsx` gains `/sign-up`;
`password-field.tsx` gains an `invalid` prop. `SignInPage.tsx` gains a comment
and nothing else, deliberately — see decision 3.

### The decisions this slice had to make, not just carry

1. **The table is `allowlist`. The function keeps the research document's
   name.** The ticket says `allowlist` and the research's copy-pasteable SQL
   says `signup_allowlist`, and a table that will be hand-edited for the rest of
   this project's life gets named once. `allowlist` wins on weight of shipped
   prose: `03-realtime.sql` and `05-hangout.sql` each single it out by that name
   as the one table that must never be published, `verify-realtime.mjs` repeats
   it, ticket 07's schema lists it, and this ticket's own criterion says it —
   five places that would have to become wrong. The FUNCTION is the other way
   round: `hook_restrict_signup_to_allowlist` is quoted verbatim in ticket 18
   and in the ticket 18 prototype findings as the place the rejection copy
   lives, and nothing shipped contradicts it. So the table was renamed and the
   function was not.

2. **The catch-all is a return type, not a rule.** The criterion is that the
   signup screen never surfaces a Supabase error verbatim, and a rule shaped
   like that decays the first time somebody adds a `catch` that seems helpful.
   So `signUp` returns `SignUpFailure | null` and `SignUpFailure` has exactly
   one inhabitant: there is no channel through which a Supabase string could
   reach the screen. The real reason goes to `console.error`, which is now the
   only place it survives — worth knowing when the debugging happens in the
   group chat.

3. **Nothing in the app links to `/sign-up`.** The sign-in footer's "Everyone
   here was added by hand." stays a full stop, which is what it was written to
   be. A new Friend is sent the URL in the same message that tells them they
   were added to the list; everybody else reads a sentence that is already the
   honest answer instead of following a link to a form that will refuse them
   without explaining why. The signup screen does link back to sign-in — that
   direction costs nothing and somebody handed the URL who already has an
   account needs a way out.

4. **A fresh account is sent to `/`, not to `/setup`.** The rule that decides
   where a brand-new Friend belongs already exists and already handles a blank
   Friend row: `RequireAuth` passes the fresh session and `RequireSetup` sends it
   on, because the row `01-friend.sql`'s trigger just made has no `hue`. Naming
   `/setup` on the signup screen would be a second copy of that rule, and two
   copies drift. The criterion was proved rather than rebuilt.

5. **`07-allowlist.sql` seeds nothing.** The file's whole purpose is to be
   pasted whole into the SQL Editor, so a placeholder row in it is a real row in
   the database roughly a minute later. §2 of the file is the insert statement
   as documentation — which is also the answer to "adding one later", since
   adding a Friend later is that same statement with one row and there is
   deliberately no screen for it. The real addresses are typed into the wizard
   and go to Postgres without passing through a file.

6. **The table is not `force row level security`.** It reads like an omission
   and it is not: the hook is `security definer`, so it runs as the table's
   owner, and an owner bypasses RLS unless it is forced. Forcing it would lock
   the hook out of the only table it exists to read, and the symptom would be
   every signup in the project refused by a message that by design explains
   nothing. Written into the SQL where somebody would go to "fix" it.

7. **`signUp` treats "no error, no session" as a failure.** Unreachable today
   and kept anyway. It is what Confirm Email being switched back on looks like
   from here — both for a genuinely new account and for an already-registered
   one, which Supabase then obfuscates into a user with no identities rather
   than admitting it exists. Ticket 13 turned Confirm Email off and this slice
   is safe only while it stays off; if it ever comes back this screen wants
   rewriting, but it must not silently hand back a session that is not there.

8. **The docs' own "Allow by Domain" example is not what shipped.** Research
   §1.5 called it out by inspection — it compares its table against `$1`, the
   whole `event` argument, rather than the local variable it meant, and names
   that variable after a column it also selects on. The rewritten form in §1.4
   is what this uses, with `a.email = candidate_email` rather than
   `lower(a.email) = …` so the comparison is a primary-key lookup instead of a
   scan over a function of one. The check constraint is what makes that safe.

### Verified in the browser, driving the real screen at 375×812

The dev server talks to the live project and the demo data is the only copy, so
every check below was chosen to write nothing.

- **The catch-all, end to end, at zero risk.** Submitting an address with an
  EMPTY password cannot create an account under any configuration — an account
  requires a password — so it exercises the whole failure path whatever the
  dashboard is currently set to. Supabase answered
  `validation_failed / Signup requires a valid password`; the screen showed
  *"We could not create an account with those details."* and *"Everyone here was
  added by hand. If you think you should be in, ask in the group chat."*, both
  fields red, still on `/sign-up`. The Supabase sentence appeared only in the
  console. That is the criterion — the same copy for a cause the copy never
  names — demonstrated on a cause nobody had thought to list.
- **A signed-in Friend visiting `/sign-up` is sent to `/`.** Found by accident:
  the first navigation landed on the calendar because the pane holds a live
  UserTwo session.
- **The session was parked, not ended.** Seeing a signed-out screen needed the
  session gone, and signing out would have revoked it — the password is not
  something an agent can type back. Removing the `sb-…-auth-token` key from
  `localStorage` does not revoke anything, so it was moved to `sessionStorage`,
  the verification run, and the key put back. UserTwo is signed in, on the
  calendar, with `goopy` on screen, exactly as before.
- **Nothing was written.** No `auth.users` row, no `friend` row, no
  `availability` row. The Group still has three set-up Friends and two Hangouts.

**What could not be verified from here, and why.** Everything downstream of the
SQL: the SQL has not been run, and nothing in this repo can run it (`.env` holds
the publishable key only, ADR-0001). So the table's locks, the hook's refusal
and the acceptance signup are all `setup-allowlist.sh`'s to prove, in that
order. `verify-allowlist.mjs` was deliberately **not** run for the same reason —
see the next section.

### The handover, and the one check that has a cost

`scripts/setup-allowlist.sh`, six stages: paste the SQL, seed the addresses
(typed at the prompt, never written to a file), register the hook, confirm
Confirm Email is still off, run the verify script, then the one acceptance
signup.

The order is not cosmetic. **Nothing can read a hook's registration back over
the Data API**, so `verify-allowlist.mjs` cannot ask politely whether the hook is
on — it finds out by attempting a signup that ought to fail. If the hook is
registered, that costs nothing and can be re-run all day. If it is not, the
signup SUCCEEDS and leaves an `auth.users` row that neither the script nor the
app can delete. The script prints the address before it uses it and, on that
failure, stops and says which account to remove from the dashboard. Registering
the hook first is what makes the check free.

### Where the nine criteria stand

- **Table, hook function, grants** — written, and correct as far as inspection
  goes. True of the database once stage 1 of the wizard runs.
- **Hook registered** — the human's. Stage 3.
- **Sign-up screen, draft A copy** — done, and verified on screen.
- **On the list can sign up, lands in setup** — the routing half is proved (a
  session on `/sign-up` goes to `/`, and `RequireSetup` already sends a blank
  Friend row to `/setup`); the signup half is stage 6, and it is the one
  irreversible step in the slice.
- **Not on the list is refused, without revealing membership** — the hook
  returns draft A's first sentence and `verify-allowlist.mjs` §5 fails the run
  if the refusal ever contains the research draft's "not on the list".
- **Already-registered gives the same message** — done, and this is the one the
  browser proved outright.
- **Real addresses seeded, adding one documented** — documented in
  `07-allowlist.sql` §2; the seeding is stage 2.
- **`tsc -p tsconfig.app.json --noEmit` clean** — yes.

### Left behind

- **No new test, and there is nothing to test.** The catch-all is branchless by
  construction: one failure value, no mapping, no branch a test could pin. The
  harness is `node --test` over `src/**/*.test.ts` with no DOM, so the screen is
  not testable in this repo either — which is why the empty-password run above
  is the evidence rather than an assertion.
- **`PGRST205` cannot tell a locked table from an absent one.** PostgREST
  answers both with "could not find the table in the schema cache", so §1 of the
  verify script proves `allowlist` is unreachable — the criterion — and cannot
  prove on its own that it is there. `42501` would settle it and means the same
  thing. What proves the table exists and holds the right rows is the acceptance
  signup.
- **The gate is entry, not membership.** Deleting a row from `allowlist` does
  nothing to an account that already exists; there is no route in the app to
  remove a Friend, and a token already issued stays valid until it expires.
  Revoking access means deleting the auth user from the dashboard.
- **Draft A's accepted cost is unchanged**: a Friend who typos their own address
  is told nothing that would help them notice. Ticket 18 weighed that against
  the enumeration leak and chose the leak's closure.
- **`/sign-up` is reachable by URL and by nothing else**, which means somebody
  has to remember to send it. That is decision 3 working as intended, and it is
  also the thing most likely to be "fixed" by a later reader — hence the comment
  on the sign-in footer as well as on the route.
- **Auth Hooks is still labelled BETA** in the dashboard (research §1.6). It is
  the only documented mechanism for this, so that is knowledge rather than a
  reason.
- **Stage 6 adds a Friend to the Group permanently.** `groupSize` is
  `setUpOnly(roster.friends).length`, so the new account moves ticket 09's
  glow threshold and the heatmap denominator only once they finish setup — but
  the blank `friend` row exists from the trigger the moment the account does.

### State of the checks

`npx tsc -b` clean for all three projects, and `tsc -p tsconfig.app.json
--noEmit` clean. `yarn test` **237 passing**, unchanged — this slice adds no
testable pure function. `yarn lint` unchanged at the **9** pre-existing errors in
`src/components/ui/`: `SIGNUP_FAILURE` is exported from `use-session.ts`, which
is a `.ts` file, so the react-refresh rule never sees it. Prettier clean on all
six changed source files. `verify-hangout.mjs`, `verify-hangout-lifecycle.mjs`
and `verify-availability.mjs` were not re-run: this slice changes no shipped SQL,
no write path and no table any of them touches, and the last of the three ends by
seeding demo rows. `verify-allowlist.mjs` has never been run — by design, and
stage 5 of the wizard is where it runs first.


## Correction, from the first run against the real project (8 Sep 2026)

The SQL has been run and the two real addresses seeded. Two things the earlier
`## Built` section got wrong, both found by checks that create nothing.

**1. `Confirm Email` is ON in the dashboard, and ticket 13 says it should be
off.** Signing up an address that already exists returns no error, no session,
and a fabricated user — `identities: []`, with `created_at` and
`confirmation_sent_at` both stamped at the moment of the call rather than the
account's real ones. That is Supabase's enumeration protection, and it only runs
when email confirmation is enabled. So:

- **`signUp` decision 7 above is not "unreachable today".** The `!data.session`
  branch is load-bearing right now — it is the only thing between a new Friend
  and a form that accepts their details and then does nothing. It was written as
  a guard against a configuration we had decided against, and the configuration
  turned out to be live.
- **Nobody can complete a signup until it is switched off.** The account would be
  created unconfirmed and the confirmation mail would never arrive: ticket 13's
  founding finding is that Supabase's default mailer refuses every address that
  is not a project team member. This is why that ticket chose "no email at all".
- `verify-allowlist.mjs` §3 already fails the run on exactly this signature, and
  says so in those words. It has still never been run end to end.

**2. Both locks answer `42501`, not `PGRST205`** — "permission denied for table
allowlist" and "permission denied for function
hook_restrict_signup_to_allowlist", for `anon` and for `authenticated` alike.
The **Left behind** note about PostgREST being unable to distinguish a locked
table from an absent one does not apply to this project: `42501` is Postgres
refusing a table it can see, so the table and the function both demonstrably
exist, are correctly revoked from both browser roles, and the criterion is met
by stronger evidence than the script was written to expect.

**Still unverified: whether the hook is registered.** There is no zero-risk probe
for it. Password validation fires before the hook — an unlisted address with an
empty password returns `validation_failed / Signup requires a valid password`,
which is the same answer with the hook on or off — so the only test is a signup
with a real password, which is the one that creates an account when the hook is
off. It stays the human's, in the order `setup-allowlist.sh` sets.


## Verified against the live project, 11 Sep 2026

`Confirm Email` is off, the hook is registered, and
`node --env-file=.env scripts/verify-allowlist.mjs` is green on its first full
run. Eleven checks:

```
✓ select on `allowlist` as `anon` is refused (42501)
✓ insert into `allowlist` as `anon` is refused (42501)
✓ the hook function is not callable as `anon` (42501)
✓ signed in as friend@example.com
✓ select on `allowlist` as `authenticated` is refused (42501)
✓ insert into `allowlist` as `authenticated` is refused (42501)
✓ the hook function is not callable as `authenticated` (42501)
✓ an already-registered address is refused (user_already_exists: User already registered)
✓ an unlisted address is refused (unknown)
✓ the refusal does not reveal whether the address is on the list
✓ the refusal is ticket 18 draft A, word for word
```

**The last line is the one that proves the most.** An unlisted signup came back
carrying *"We could not create an account with those details."* verbatim, which
is a string that exists in exactly one place: the body of
`hook_restrict_signup_to_allowlist`. So the hook is registered, the Auth server
is calling it, it read `public.allowlist` through `security definer` and found
nothing, and the research document's leaky draft did not ship. Four facts from
one string. No account was created.

`user_already_exists` on the line above it confirms the correction of 8 Sep
landed: with `Confirm Email` off, Supabase names the duplicate instead of
obfuscating it. That is the leak the client catch-all exists to cover, now
observable in the wild rather than argued from the docs.

The unlisted refusal reports its code as `unknown` because a hook rejection
carries a message and an HTTP status but no Supabase error code. Nothing to fix;
worth knowing before somebody matches on `error.code` here.

**Eight of nine criteria are met.** What is left is the acceptance signup, which
is one run by a real Friend and is the only thing that can prove the two seeded
addresses are on the list — nothing readable from here can see that table, and
any signup that would confirm it is the signup that creates the account.
`RequireAuth` → `/setup` is already proved separately (a session on `/sign-up`
redirects to `/`, and `RequireSetup` sends a blank Friend row on to `/setup`),
so what the run adds is the hook saying yes rather than no.

