# 07 — Inviting a Friend, and the enumeration leak it reopens

Type: grilling
Status: resolved

## Question

Ticket 01 gave every Friend the power to put an address on the allowlist, with
`invited_by` recording who. Design the act.

1. **Where it lives.** Proposed: the top-right blobatar menu, because admission
   is account-level and not Group-level. The competing pull is that a Friend
   invites somebody *because of* a particular cal, which argues for the Group
   dropdown — but ticket 01 already ruled an Invite does not carry a
   destination, so putting it there would promise something it does not do.

2. **The leak, which is the hard part.** v1's ticket 18 chose its signup copy
   specifically to close an enumeration leak, and `07-allowlist.sql` rejected the
   documentation's own suggested rejection string as "exactly the leak issue 14
   forbids". An invite screen reopens it from the other side: if it says
   "already on the list", it answers, for any address anyone types, whether that
   person uses this app.

   The options are all unpleasant. Always say "invited", whether or not it was
   already there, and accept that a Friend cannot tell whether they just did
   something. Or say "already invited" and accept the leak on the grounds that
   everybody holding an account is already vetted. Or show the inviter their
   *own* invites and nothing else, so the answer is scoped to what they did.

   Note the asymmetry that makes the third tempting: `invited_by` means the table
   now knows who vouched, so "your invites" is a query that exists anyway.

3. **What the invited person is told, and by whom.** There is no email in this
   product (v1 ticket 13 killed it, and ADR-0001's single-vendor argument depends
   on that staying true). So an Invite writes a row and nothing happens. The
   Friend still has to message them, with the sign-up URL *and* a Code. Does the
   invite dialog hand over a ready-made sentence to paste, and does that sentence
   include a Code — which would quietly make the Invite Group-flavoured after all?

4. **Removing an invite.** Somebody typos an address. It sits on the allowlist
   forever. Is there a delete, and who may do it — anyone, or only `invited_by`?

5. **Validation.** `allowlist.email` has a `check (email = lower(email))`
   constraint, and `07-allowlist.sql` is explicit that "a pasted address arrives
   with a capital or a trailing space more often than not". The client must
   `lower(trim())` before it writes or the insert is refused by a constraint
   whose error message explains nothing.

6. **The grant.** `allowlist` currently revokes everything from `anon` and
   `authenticated` and has RLS with no policies at all — deliberately, since
   there was no row anyone holding a publishable key was allowed to see. That is
   no longer true. Opening an insert path to `authenticated` is the single
   riskiest line in this effort, and it needs its policy written with the same
   care ticket 02 is spending on the others. An RPC may be the better shape than
   a grant.

## Answer

Eight questions over two rounds, all settled on the recommendation. Two
findings reshaped the ticket before the questions started, and both outrank the
placement debate §1 opens with.

**`allowlist` has no `invited_by` column.** Ticket 01 promised the provenance
and `07-allowlist.sql` never had it: the table is `email`, `note`, `added_at`.
So this ticket specifies a schema change, not just a screen, and the five
seeded rows carry a null inviter for the rest of the project's life.

**ADR-0003's condition 1 cannot be satisfied by an invite function.** "The
caller can never name another Friend. Arguments may say *what* and *where*;
never *who*." An `invite(email)` RPC takes an argument that is a person's
identity, and it is the first thing anyone has proposed here that does. That
did not become an argument for amending the rule. It became the argument for
**not writing the function**, which turned out to be the better design anyway.

### 1. It lives in the blobatar menu

`src/shell/top-bar.tsx`, alongside Profile, How you look, Change password, Sign
out. Admission is account-level and that menu is the account drawer. The Group
dropdown from ticket 06 is a switcher, and an Invite sitting in it would read as
"invite to this cal", which is the promise ticket 01 refused. The two surfaces
touch exactly once, in §5's copy, and never in the data.

Menu item: **"Invite a frien"**, the glossary term in the product's own
spelling.

### 2. The leak: insert-only, and the inviter learns nothing about prior state

The ticket offered three options. **The third one dies on a fact the ticket did
not have.** "Show the inviter their own invites" needs a `select` path on
`allowlist`, and `07-allowlist.sql` is built end to end on the property that no
row in that table is readable by anyone holding a publishable key. That is why
it is the one table banned from the Realtime publication: RLS is not applied to
DELETE events, so publishing it would broadcast an address. A policy-scoped
select is defensible in isolation, but it converts the table from unreadable to
conditionally readable, which is a far larger change than a convenience earns.
The `invited_by` asymmetry that made option three tempting is real and still
does not pay for opening reads.

So **option one**, with the copy doing the work: the confirmation is phrased as
the resulting state rather than as a report of what was written.

> rob@gmail.com can now create an account.

That sentence is true whether or not the row already existed, so it answers
nothing about prior state. It is still a real answer to "did my click do
anything", which is the cost option one was supposed to carry and mostly
doesn't.

### 3. A grant, not a fourth RPC, and ADR-0003 stays at three

With no read path, a plain insert grant is sufficient, so the `security
definer` question never arises. This is the second time in this effort that
the auditable-as-a-set property earned its place by making somebody notice a
function did not need writing: ticket 04 caught leaving a Group, this catches
inviting.

- `grant insert on table public.allowlist to authenticated`, and **only**
  `insert`. `select`, `update` and `delete` stay revoked.
- RLS policy `for insert to authenticated with check (invited_by = (select
  auth.uid()))`. The table had RLS enabled with **no policies at all**, so it
  denied everything; it now has exactly one, and the other three verbs still
  have none and still deny.
- The write is an upsert with `on conflict do nothing` and `return=minimal`.
  `on conflict do nothing` needs only INSERT privilege, so the grant stays one
  verb wide, and a minimal return makes the response identical whether or not
  the address was already there. **The builder must verify that identity rather
  than assume it**: if PostgREST distinguishes the two cases in any header or
  status, the leak is back and the copy in §2 cannot close it.

**The check constraint gets tightened.** `check (email = lower(email))` does not
reject a trailing space, so `' bob@x.com '` stores happily and then matches the
hook never, which is the one failure `07-allowlist.sql` says nobody could debug
from the outside. It becomes `check (email = lower(btrim(email)))`, which holds
the SQL Editor to the same rule as the browser. The client normalises too, so
the Friend gets a sentence instead of a constraint error.

### 4. What the row records

- `note`, written from a **"Who is this?"** field in the dialog. The column
  exists because an address alone is not enough to remember, and with no
  reading screen the SQL Editor stays its only reader.
- `invited_by uuid references public.friend(id) on delete set null`, nullable
  for the five seeded rows, with `default (select auth.uid())` so the SQL
  Editor path gets null naturally and the browser path cannot get it wrong. The
  policy asserts it regardless of the default.
- On conflict the existing row keeps its original `note` and `invited_by`. The
  first voucher keeps the provenance.

### 5. The handover sentence carries a Code, and the row still does not

There is no email (v1 ticket 13), so the Invite writes a row and nothing happens
to anybody. Ticket 01 ruled that an Invite does not carry a destination Group.
**That ruling is about what the row holds, not about what a human pastes into a
group chat**, and the distinction is what lets this work: the allowlist row has
no `cal_id` and never will.

The dialog hands over a copyable sentence carrying the sign-up URL and the Code
of the cal currently on screen, naming which cal that is so the Friend can see
what they are about to send. On the join-or-create page there is no cal in
scope and the sentence carries the URL alone. The URL comes from
`window.location.origin`, so a preview deploy hands out its own address instead
of production's.

### 6. No delete ships, and the typo is confirmed away rather than removed

Q2 left no list, so there is no surface to delete from, and the SQL Editor
stays the only way. That matches the fog the map already carries about a
reading screen.

**A typo is not untidy, it is a live door, and the answer records the blast
radius rather than waving at it.** `rob@gmail.com` for `bob@gmail.com` is
somebody, and that somebody can now create an account. They land on
join-or-create with no Code, so they see no calendar. But `friend` is
`using (true)` for every authenticated reader (`01-friend.sql`), kept that way
deliberately by ticket 04 because identity is global, so **they read the entire
roster: every display name and blobatar seed in the product.** That is the whole
radius. It is small. It is not nothing.

The mitigation is not a delete, it is not writing the row: **a confirm step
showing the address back before the write**, at a size you can proofread. The
address is the one thing in this dialog that cannot be undone from inside the
app.

### 7. The copy is shaped as two steps, and the second one is yours

The failure mode worth designing against is not the leak, it is the Friend who
clicks Invite, sees a success message, assumes a mail went out, and never sends
the message. The invited person then waits for an email that does not exist and
cannot.

So the dialog is not shaped as "invite someone". The paste sentence is not a
convenience below a success state, it is **the other half of the action**, and
the copy says so.

- Title: **Invite a frien**
- Body: *Adding someone here lets them create an account. It doesn't message
  them. That part's on you.*
- Fields: email, and **Who is this?**
- Confirm: *Let **rob@gmail.com** create an account?*
- After: *rob@gmail.com can now create an account.* then **Send them this:**
  and the sentence
- In a cal: *Join me on friens cal: <origin> — sign up with this email, then
  enter the code **K4M7PQ***

### 8. Disabled until there is a Friend row

`invited_by` references `friend(id)`, and a new account reaching join-or-create
may not have that row yet (ticket 02 caught the neighbouring case, a new Friend
failing to read their own row). The insert would fail at the FK with an error
explaining nothing.

The menu already has this pattern: How you look is `disabled={identity ===
null}`. Invite gets the same guard **for a different reason**, and the reason
belongs in a comment beside it, because a later reader will find two items
disabled on one condition and assume one cause. How you look is disabled so
nobody keeps a colour they never chose. Invite is disabled because the write
would be rejected by the foreign key.

### The migration: `11-invite.sql`

Ticket 04 took `08`–`10`. This is one small file:

1. `alter table public.allowlist add column invited_by uuid references
   public.friend (id) on delete set null default (select auth.uid())`
2. drop and recreate the email check as `email = lower(btrim(email))`
3. `grant insert on table public.allowlist to authenticated`
4. the single `for insert` policy
5. the reasoning as a comment, per ADR-0003 condition 4, which applies to the
   judgement even though the object is a grant rather than a function

### Accepted risks, recorded rather than solved

- **A typo admits a stranger to the roster.** §6. Confirm-before-write is the
  mitigation; there is no removal from inside the app.
- **Any Friend can write unlimited allowlist rows.** There is no rate limit and
  no place to put one in a static SPA. The population that can do it is five
  people who already hold accounts, and the gain from stuffing the table is
  more accounts that can read a roster of five names.
- **Both are smaller than ticket 11's accepted brute force** and are recorded
  for the same reason: so the next person finds a decision rather than an
  oversight.

### What was checked and did not change

- **`CONTEXT.md` needs no edit.** Its Invite entry already reads "Permission for
  one email address to hold an account at all, granted by a Friend and recorded
  against their name. It admits somebody to the product, not to any particular
  Group." That is exactly what was designed, including §5's separation. Checked,
  not assumed.
- **The Realtime ban holds.** `allowlist` stays out of the publication. Nothing
  here publishes it and the DELETE-event reasoning is untouched.
- **The `before-user-created` hook is untouched.** It still reads the table as
  owner, the rejection copy from v1 ticket 18 draft A still stands, and the
  `revoke execute` from §4 of `07-allowlist.sql` is unaffected by a table grant.
- **`force row level security` stays off**, for the same reason as before: the
  hook is `security definer` and forcing RLS would lock it out of the only
  table it reads.
- **ADR-0003 held at three and gained an amendment.** The fourth candidate was
  Invite, and it was refused. Recorded there rather than only here, because
  ADR-0003 exists precisely because a judgement buried in a closed ticket is the
  wrong shape.
