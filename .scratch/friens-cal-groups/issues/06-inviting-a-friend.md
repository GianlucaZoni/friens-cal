# 06 — Inviting a Friend

Status: ready-for-human — built, 3 criteria await a human
Blocked by: 02

## Parent

[friens-cal — many Groups, joined by Code](../../groups-and-join-codes/map.md)

## What to build

Putting an email address on the allowlist from inside the app, so invites stop
being a trip to the SQL Editor.

**`13-invite.sql`.** `allowlist` never had an `invited_by` column, so this is a
schema change, and the five seeded rows carry a null inviter forever. The check
constraint tightens to `lower(btrim(email))` — the old one let a trailing space
through, and such a row would match the signup hook never.

**No function.** ADR-0003's condition 1 cannot be met by an invite function: its
only meaningful argument is a person's address, which is *who*. The rule was not
widened, and the audited set stays at exactly three. What ships instead is a
plain `insert` grant plus `with check (invited_by = (select auth.uid()))`, one
verb wide.

**There is no read side, and that is the load-bearing refusal.** "Show me my own
invites" needs a `select` path on a table of personal addresses, and
`07-allowlist.sql` is built end to end on nothing there being readable by a
publishable key. With no read, the write is upserted `on conflict do nothing`
with `return=minimal`, so the response cannot distinguish a new address from one
already on the list. The inviter therefore learns nothing about prior state, and
the copy must state an outcome rather than an event: *"rob@gmail.com can now
create an account."*

**A typo is a live door, not a mess.** `friend` is `using (true)`, so a mistyped
address buys a stranger the whole roster. No delete ships, so
confirm-before-write is the whole mitigation and it is not optional.

**The dialog lives in the blobatar menu** and is disabled until a Friend row
exists — because of the foreign key, not because setup is incomplete. It is
**two steps whose second one is yours**: the product sends no email, so step two
hands over a pasteable sentence carrying where the invite came from and the
current cal's Code.

**The row stays cal-free.** An Invite admits somebody to the product, not to a
cal. What a human pastes into a message is not what the row holds.

## Acceptance criteria

- [x] `13-invite.sql` exists, is commented, and has been run
- [x] `allowlist` has `invited_by`; the five seeded rows are null and stay null
- [x] The check constraint rejects a trailing space
- [x] A Friend can insert an allowlist row only with their own id as inviter
- [x] No client can read `allowlist`, and this is asserted rather than assumed
- [x] Inviting an address already on the list is indistinguishable in the
      response from inviting a new one
- [x] The dialog confirms before writing and names the address being invited
- [x] Step two offers a pasteable sentence carrying the origin and the current
      cal's Code
- [x] The entry is disabled until the Friend row exists
- [ ] An invited address can then sign up, and an uninvited one still cannot
- [x] `npx tsc -b` is clean, `yarn test` passes, lint unchanged at nine

## Blocked by

- [02 — Join or create a cal at `/`](./02-join-or-create.md)

## Built

`supabase/13-invite.sql` is the column, the tightened constraint, the grant,
the policy and one trigger nobody planned for. `src/identity/invite.ts` is the
three pure rules with `invite.test.ts` beside it; `src/identity/invite-dialog.tsx`
is the dialog; `src/shell/top-bar.tsx` gains one menu item and one mount and
nothing else. `src/lib/database.types.ts` gains the `allowlist` table, which it
never had. `scripts/verify-allowlist.mjs` is rewritten around the verb that
opened. `supabase/README.md` gains the file-table row.

### The two things the design ticket got wrong, both found by running it

**1. `default (select auth.uid())` is not legal SQL.** Planning §4 specifies it
and a DEFAULT expression may not contain a subquery; Postgres refuses the
statement outright. The `(select …)` wrapper is an RLS idiom, worth its
parentheses in the policy where it caches one initplan across candidate rows,
and invalid in a default. It ships as `default auth.uid()`, in a statement of
its own rather than on the `add column`, because `add column … default …`
backfills existing rows with whatever the default evaluates to at that moment.
Split, the rows already in the table keep their null no matter who runs the
file. Criterion two is a property of that split.

**2. `on conflict do nothing` cannot be reached from a browser, and the whole
leak argument rested on it.** Planning §3 says it "needs only INSERT privilege,
so the grant stays one verb wide", and told the builder to verify the response
identity rather than assume it. Measured on Postgres 17.6 and PostgREST 16.2 as
`authenticated` holding `insert` alone:

    insert … on conflict (email) do nothing   →  42501, hint: GRANT SELECT
    insert … on conflict do nothing           →  fine, 0 or 1 rows

A conflict target is an inference clause, and inferring an arbiter index needs
`select` on the column it is inferred over. PostgREST emits a target either
way: `?on_conflict=email` uses that column, omitting the parameter makes it
infer the primary key. Both refused, over HTTP as well as in psql. There is no
way to ask PostgREST for the bare form.

That left granting `select` on a table of personal addresses, which is the one
thing `07-allowlist.sql` exists to prevent, or a plain insert whose duplicate
comes back `409 23505` while a new address comes back `201`, which is the
enumeration leak reopened at the network layer and exactly what planning §3
said would sink the copy.

**So the sameness moved into the database.** A `before insert` trigger,
`ignore_repeat_invite()`, returns null for an address already listed. A null
from a before-row trigger abandons the insert and reports success, and the
function is `security definer` so its `exists` reads a table the browser cannot.
Both cases are then one `201`, `content-length: 0`, `content-range: */*`, empty
body. ADR-0003's own issue-10 amendment already puts trigger functions outside
the audited set ("not callable over the Data API … reached by the referential
machinery alone"), so the set is still exactly three and no ADR was touched.
Two consequences are written into §5 of the file rather than discovered later:
the trigger fires for the SQL Editor too, and a row it skips never reaches the
policy's `with check`, so forging an inviter on an address that is *already*
listed comes back `201` rather than `42501`. Nothing is written either way.

### The smaller decisions

**The verify script was rewritten, not joined by a second one.** Its
`proveTableIsShut` asserted that an insert as `authenticated` is refused, and
that is now the one thing a Friend may do. A `verify-invite.mjs` would have
left this file failing. The lock it describes is half open and the file that
describes the lock is the file that says which half.

**It compares raw responses, not supabase-js's.** "Indistinguishable" has to
mean the bytes, so the script installs a recording `fetch` and compares status,
reason and every non-volatile header. A leak in a header would not show up in
`{ data, error }`.

**It leaves one row and says so.** §4 needs an address that is new, and nothing
holding a publishable key can delete one afterwards. The address is fixed
rather than timestamped, so re-running adds nothing, and it is
`invite-probe@friens-cal.invalid`: RFC 2606 reserves that TLD so it can never
resolve, so nobody can receive mail there and nobody can ever prove ownership
of it to the signup form. The row is a door onto a wall. The delete statement
prints at the end of every run.

**The sentence takes `window.location.origin`, which planning §5 settled and
the build note nudged toward a literal.** On production that origin *is*
`https://friens-cal.vercel.app`, so the note is satisfied where it matters, and
a preview deploy hands out its own address instead of sending a tester to
production. It is one pure function with the origin, the name and the cal
handed in, so all four shapes are asserted rather than eyeballed.

**The sentence itself is reworded from planning §7's draft**, which reads
*Join me on friens cal: <origin> — sign up with this email, then enter the code
K4M7PQ*. Three changes, none of them taste. The inviter's name goes in, which
the build note asked for and which "Join me" only implies. The cal is named,
which §5 requires and §7's line does not do. And the em dash goes, because the
build brief forbids them in anything this branch writes and a dash pasted into
a group chat is this branch's prose as much as a comment is.

**`DialogShell` moved out of `profile-dialogs.tsx` into its own file**, which
is the one edit this slice makes outside its own files. It was a local helper
carrying the paragraph that explains why `open` is hard-coded, and the invite
dialog is its fourth caller. Rebuilding the frame by hand would have been a
second copy of that paragraph, which is the copy that goes stale. Nothing about
the three existing dialogs changes.

**`canInvite` is `friend !== null` and takes `{ id }`.** Not `identityOf`,
which is the other disabled item in the same menu and a different question, and
the reason is a comment beside the menu item because a reader finding two items
disabled on one screen will otherwise assume one cause.

**The address field keeps `type="email"`.** Driving the dialog raised a
suspicion that the browser would refuse to submit a pasted address with a
trailing space, which is the exact case `normaliseAddress` exists for. It does
not: the `type="email"` value sanitization algorithm strips surrounding
whitespace itself, so the address arrives already trimmed and the function is
left holding the case. The suspicion is recorded in the comment because the
obvious reading of the pair is that one of them is redundant.

### What was verified, and how

Rehearsed against the running local stack (`supabase_db_rehearsal`, migrations
00 to 11 already applied), not against production. The file was applied twice
on purpose: once with a deliberately bad row in the table, which aborted it at
§2 exactly as its header says it will, and again after fixing the row, which
completed and is idempotent.

From psql as `authenticated` with jwt claims, each probe in its own transaction
that rolls back: `select` refused (42501); insert with own id accepted; insert
with `invited_by` omitted accepted, so the default works; insert with another
Friend's id refused by the policy; insert with a null inviter refused;
trailing space and a capital both refused by the constraint (23514); `update`
and `delete` refused (42501); `anon` insert refused.

The disabled entry is the one ticked criterion nobody watched happen: the gap
it covers is a brand-new account in the beat before its `friend` row lands, and
there is no way to hold a browser still inside it. What was checked is the
predicate, by test, and the single expression that binds it to the item.

Over HTTP against the local PostgREST, which is the half that matters for the
leak: a new address and one already listed came back identical down to the
header, `201 Created` / `content-length: 0` / `content-range: */*` / no body.
A forged inviter on a *new* address came back 403 42501, a trailing space 400
23514, `select` 403 42501.

`node --env-file=.env.rehearsal scripts/verify-allowlist.mjs` against the same
stack (never against `.env`) passes §1 to §5 and then fails §6 as it must: the
`before-user-created` hook is a dashboard registration and a local stack has
none, so an unlisted address signs up. That is the documented local behaviour
(`supabase/README.md`), not a regression. The account it created was deleted
and the allowlist rows were cleared, so the stack is as it was found.

The dialog was driven in a browser against that stack, dev server on port 5199
with a throwaway `.env.rehearsal` and `--mode rehearsal`. Both steps render;
`  Rob@DIALOG-probe.invalid ` was confirmed back as `rob@dialog-probe.invalid`;
the row landed with a null note and the inviter's id; the sentence read
`Ada invited you to friens cal: http://localhost:5199. Sign up with this email
address, then enter the code M9JJGN to join ada only.`; and inviting the same
address a second time produced the identical screen with no error.

    $ npx tsc -b        # clean
    $ yarn test
    ℹ tests 296
    ℹ pass 296
    ℹ fail 0
    $ yarn lint
    ✖ 9 problems (9 errors, 0 warnings)

Twelve of those 296 are new.

### What was deliberately not built

No read side, no invite list, no delete, and no `cal_id` on the row. Each is
planning §2, §6 and the ticket's own "load-bearing refusal", and each is why
the copy says what it says. No ADR was added or amended: the invite was already
refused as a function in ADR-0003's issue-07 amendment, and the issue-10
amendment already covers the trigger.

### Left for after the cutover

Three criteria need a human, and none of them needs the `08`-`11` outage:
`13-invite.sql` touches only `allowlist`, which the cutover does not, so it can
be pasted before or after it.

- **`13-invite.sql` has been run.** Paste it into the SQL Editor. Run the query
  in its §2 first: an address already stored with a capital or a trailing space
  will abort the file, and it is a Friend who cannot sign up today.
- **`allowlist` has `invited_by`; the seeded rows are null and stay null.**
  Falls out of the same paste. Confirm with
  `select email, invited_by from public.allowlist order by added_at;`
- **An invited address can then sign up, and an uninvited one still cannot.**
  Needs the production `before-user-created` hook (already registered) and a
  real signup by a second person, which no script here can do without creating
  an account nothing in this repo can delete.

Then, from the repo, `node --env-file=.env scripts/verify-allowlist.mjs`. It
will leave `invite-probe@friens-cal.invalid` on the list and print the
statement that removes it.

### Run against the live project, 2026-09-16

Applied with `supabase db query --linked --project-ref mvvxyzqbdkkauxkltavw -f <file>`
rather than the SQL Editor. The post-checks are recorded in
`.scratch/friens-cal-groups/cutover-runbook.md`. The criteria above that waited
on the run are ticked; the browser criteria still wait on real accounts.
