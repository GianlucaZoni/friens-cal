# 04 — The Group, Membership, and dragging `group_id` through everything

Type: grilling
Blocked by: 02
Status: resolved

## Question

The schema, its policies, and the migration of live data. Ticket 01 settled the
*shape* of the domain; this settles the tables, and it is the ticket the rest of
the build is generated from.

1. **`group`** — id, name, code, `time_zone`, `created_at`, provenance. Is
   `group` even a legal table name in Postgres (it is a reserved word), and if
   quoting it everywhere is the cost, is `friens_cal` or `circle` the better
   physical name for a thing the glossary calls a Group? Ticket 01 fixed the
   *domain* term, not the identifier.

2. **`membership`** — `(group_id, friend_id)`, `joined_at`. Is that the whole
   row? Anything per-membership at all, given ticket 01 put identity globally on
   `friend`?

3. **The Code's uniqueness and generation.** Six characters from a 26-letter
   alphabet. Generated where — a Postgres `default`, a trigger, or the client
   retrying on conflict? A `default` that calls a random function cannot retry
   itself on a unique violation.

4. **`availability` changes its primary key** to
   `(group_id, friend_id, slot_start)`. That is not an `alter` on a shipped
   table the way `01-friend.sql` and `02-availability.sql` are written ("changing
   a shipped column means a new file, not an edit to this one"). What does the
   new file look like, and does the client's optimistic write keying (v1 ticket
   19) survive the wider key unchanged?

5. **`hangout` changes its exclusion constraint** to
   `exclude using gist (group_id with =, tstzrange(starts_at, ends_at) with &&)`.
   Confirm `btree_gist` covers the scalar equality half — v1's `05-hangout.sql`
   predicted this exact day ("`btree_gist` becomes load-bearing the day a scalar
   joins the constraint").

6. **ADR-0002's RPC.** `retime_hangout(hangout_id, starts_at, ends_at)` now
   writes `availability` rows that need a `group_id`. It derives *who* from the
   stored row; deriving *which Group* from the same row keeps the hole exactly as
   narrow, but the ADR needs an amendment saying so rather than a silent widening.

7. **Every policy on every table**, rewritten against ticket 02's helper. Five
   tables. Plus the grants, which v1's ADR-0001 refinement established as an
   independent second lock.

8. **The migration**, as a runnable file. Ticket 01 settled the content — one
   Group named "spiritually unemployed", everybody joined, every row backfilled,
   every `allowlist` row attributed to the human. The open part is *ordering*: a
   `not null group_id` cannot be added before the backfill, and the app is
   deployed and live while this runs. Is there a safe order that avoids a
   window where the deployed client writes rows the new schema rejects, or does
   this accept a few minutes of downtime and say so?

9. **`CONTEXT.md`** already carries the new terms from ticket 01. Check it still
   matches what this ticket decides, and that no implementation detail leaked
   into it.

## From ticket 02, which is now resolved

Read [02](02-membership-rls-research.md) before starting. Four findings land
directly on this ticket:

- **`membership` needs an index on `friend_id`.** Q2 above proposes the key
  `(group_id, friend_id)`, and every helper filters on `friend_id`, which is the
  key's trailing column. v1 ticket 07 §11's trap, for the third time in this
  schema, and this time it sits inside every policy in the product.
- **Give `hangout_participant` a `group_id`.** It is the one table the two
  helpers do not cover cleanly; without the column its policy is a per-row
  correlated join through `hangout`, which the performance guide says to rewrite.
  One redundant column collapses it to the same shape as everything else.
- **Never put `force row level security` on `membership`**, and create the
  helpers in the SQL Editor so `postgres` owns them. A `security definer`
  function only skips RLS when its owner can, so either of those breaks every
  read in the product from a line that looks like hardening. It wants a comment
  in the migration.
- **Q6 (ADR-0002's RPC) has grown a sibling.** Joining by Code needs a second
  exposed `security definer` function, which ends the ADR's "exactly one"
  property. That is ticket 11, not this one, but the schema cannot be finished
  without its answer.

## From ticket 11, which is now resolved

[11](11-joining-by-code-needs-a-second-rpc.md) answers the sibling it left open
above, and adds one:

- **Two new functions, both `security definer`, both exposed**:
  `join_group(code)` and `create_group(name)`. They must satisfy all four
  conditions of **[ADR-0003](../../../docs/adr/0003-exposed-security-definer-rpcs.md)**,
  which this ticket's migration comments have to restate beside each one
  (condition 4 requires it).
- **Q3 is half-answered.** The Code is generated inside `create_group` with
  retry-on-collision, not by a column `default`, because a `default` cannot
  retry itself on a unique violation. What is left for this ticket is the
  alphabet constant and where it lives.
- **`create_group` is two inserts in one transaction.** A Group row and the
  creator's Membership. Split across two statements it orphans a Group nobody
  can reach or delete.
- **`join_group` is `insert ... on conflict do nothing` and returns the Group
  row**, so it is idempotent; a bad Code raises.
- **Q6 is settled and ADR-0002 needs no amendment.** Its property is scoped to
  cross-Friend Availability writes, which neither function touches.
  `retime_hangout` still gains a Group, derived from the stored Hangout row.

## Answer

Fourteen questions over two rounds, all resolved as recommended. The schema is
settled and the build can be generated from it.

Two things here were not in the nine questions above. One is a **live bug** the
schema change creates (§5), and one **reverses a recommendation ticket 02 made**
(§9). Both are load-bearing; read them before the mechanical parts.

### 1. The table is `cal`, and the column is `cal_id`

`group` is a fully reserved word in Postgres, so the domain term cannot be the
identifier without quoting every reference: the DDL, every policy expression,
`supabase.from()`, and the generated types. `friens_cal` is the UI string and
`circle` is a fourth word nobody has used.

**`cal`.** Unreserved, short, already the tail of the product's own name for the
thing, and `cal_id` reads better than `group_id` through five tables.

The product now has **two** words rather than three: the glossary concept is
**Group**, the identifier is `cal`, the UI string is "friens cal". The map's
Notes said *"The UI says 'friens cal'; the code says Group"* and that line is
amended by this ticket.

`CONTEXT.md` needs **no change at all**, and that is the check ticket 04 Q9
asked for rather than an omission. A physical table name is exactly the
implementation detail a glossary excludes. Its Group, Member, Code, Availability
and Participant entries were all re-read against what this ticket decided and
every one of them still holds.

### 2. `membership` is three columns, and leaving deletes the row

`(cal_id, friend_id, joined_at)`, keyed `(cal_id, friend_id)`, plus the index on
`friend_id` ticket 02 insisted on. Identity is global on `friend`, so nothing
else belongs per-Membership.

**Leaving is a hard delete, not a `left_at`.** Nothing in the product asks
whether Marco was ever in a cal, and the Hangouts he confirmed keep his name
regardless (§4). A nullable column here would put `where left_at is null` inside
the one object every policy in the product reads through, permanently, to answer
a question nobody has.

### 3. `availability` references `membership`, not `friend`

```sql
foreign key (cal_id, friend_id)
  references public.membership (cal_id, friend_id) on delete cascade
```

The referenced columns are `membership`'s own primary key, so this needs no new
index. It buys two things that would otherwise be policy's job or nobody's:

- **You cannot hold Availability in a cal you are not in.** Structural, not
  enforced by a `with check` that has to stay correct.
- **Leaving a cal erases your Availability in it, by cascade.** Which is exactly
  what ticket 01 said leaving does, for free.

**One tension handed to ticket 10 rather than resolved here.** The cascade
*drops* you from that cal's Hangouts, through the existing statement-level
trigger on `availability`, rather than marking you **Left**. Ticket 01 said
"marked Left". Those differ, and ticket 10 owns which one leaving actually
performs. This ticket only guarantees the Availability goes.

### 4. `hangout_participant` keeps referencing `friend`, and its `cal_id` cannot lie

Ticket 02 asked for a `cal_id` on `hangout_participant` so its policy collapses
to the same shape as everything else instead of being a per-row correlated join
through `hangout`. Granted. A redundant column can disagree with its source, so:

```sql
-- on hangout, free next to the primary key on id
unique (id, cal_id)

-- on hangout_participant
foreign key (hangout_id, cal_id) references public.hangout (id, cal_id)
```

Disagreement becomes unrepresentable rather than merely unlikely. Same instinct
as `02-availability.sql` withholding the `update` grant so RLS never has to be
right about `friend_id`.

**It does *not* cascade from `membership`.** `friend_id` still references
`friend`. Availability is a statement about the future and should leave with
you; a Participant row is a record that you were there, and deleting it rewrites
history to make the schema tidier. CONTEXT.md is explicit that a Hangout is
"visible to every Friend, including those who are not Participants".

This asymmetry is what makes §9 a real question rather than a hypothetical.

### 5. The lifecycle triggers are group-blind, and per-Group Availability turns that into a bug

**Not in the ticket's nine questions, and it would have shipped.**

`drop_participants_losing_coverage` matches erased Slots to Hangouts on
`friend_id` and time alone, then tests coverage with
`a.friend_id = s.friend_id and a.slot_start = g.slot`. Both halves are blind to
which cal anything is in. Once the same Friend can hold the same Slot in two
cals, that breaks in both directions at once:

- Erasing your Saturday in cal A **drops you from cal B's Saturday Hangout**.
- Your cal-A Availability **keeps you on** a cal-B Hangout you no longer cover.

Both join predicates gain `cal_id`. `retime_hangout`'s
`on conflict (friend_id, slot_start)` also stops matching the new key and
becomes `(cal_id, friend_id, slot_start)`; its Group is derived from the stored
Hangout row, per ticket 11.

These three function bodies get **their own file**, not an edit to
`06-hangout-lifecycle.sql`. The rule this repo set is that changing a shipped
thing means a new file, and a reader comparing the two wants a readable diff.

### 6. `availability`'s new key, and what the client does *not* have to change

Key becomes `(cal_id, friend_id, slot_start)`.

**The client's store keeps its two-part key.** `slotKey(friendId, slotStart)`
and the flat `Set` in `slots.ts` are untouched, because `/g/:id` means exactly
one cal is ever loaded, and `cal_id` is supplied at the query boundary instead.
v1 ticket 19's property survives intact: a repeated fetch is still free, and the
Realtime echo of your own insert still lands on the same key. What does change
is every `upsert` conflict target (`cal_id,friend_id,slot_start`) and the
queries themselves.

Two index corrections that fall out of the wider key:

- `availability_slot_start_idx` becomes **`(cal_id, slot_start)`**. The
  today-forward Candidate scan is now per-cal, and a leading `slot_start` no
  longer serves it. v1 ticket 07 §11's trap a fourth time.
- A plain **`btree` index on `hangout (cal_id)`**. Ticket 02 could not confirm
  that a GiST exclusion constraint's leading equality column satisfies "index
  your policy filter column", and the guide's wording reads as excluding GiST.
  Cheap insurance, as they said.

`hangout`'s exclusion constraint becomes
`exclude using gist (cal_id with =, tstzrange(starts_at, ends_at) with &&)`.
`btree_gist` is already installed by `00-provisioning.sql`, which is what makes
the scalar equality half legal. v1's `05-hangout.sql` predicted this exact day
and was right.

### 7. The Code's alphabet lives in the database, and the client's pattern is deliberately looser

Generation stays inside `create_cal` with retry-on-collision, per ticket 11. The
alphabet is a constant in the migration beside it.

It exists twice whether or not anybody wants it to, because ticket 03 found
`input-otp` tests `pattern` *before* `onChange`, so the client needs the alphabet
as a regex. **The client's copy is `^[A-Za-z0-9]*$`**: wide enough that it can
never reject a keystroke the server would have accepted, with the real check
being that the RPC raised. Two narrow copies would drift, and the failure mode
is a Friend unable to type a Code that is genuinely theirs.

A `get_code_alphabet()` RPC would give one copy, and is ceremony for a string
that changes never.

### 8. The migration accepts an outage, and says so

The unavoidable break: PostgREST's `onConflict: 'friend_id,slot_start'` needs a
matching unique constraint, so **the moment the key widens, the deployed
client's every draw and every Join fails.** A nullable `cal_id` with a default
papers over the column but not the key, and no unique index on
`(friend_id, slot_start)` can survive, because permitting the same Friend and
Slot in two cals is the entire point.

So the zero-break version is a four-step sequence with a **deploy in the
middle**: nullable column with a default, backfill, ship the new client, then
flip the key and drop the default.

**Rejected.** Three Friends, one cal, and the failure mode is a tab showing an
error until it is reloaded. The staged version is correct at a scale this
product does not have, and it would push a deploy step into the middle of the
issue set `/to-issues` generates. The file carries a blunt comment instead: run
this, deploy, tell the three people to reload.

### 9. `friend` stays readable by every Friend, and ticket 02's second helper is dropped

**This reverses a recommendation from resolved ticket 02**, which proposed
`private.my_co_member_ids()` so `friend` reads are co-member-scoped, plus an
`id = (select auth.uid())` arm so a Friend with no Membership could still read
their own row on the join-or-create page.

Two things defeat it.

**The domain says identity is global.** CONTEXT.md: *"A Friend is one person
everywhere. Their name, face and colour do not vary from Group to Group."* What
is per-Group is the *statements*, Availability and Candidates and Hangouts, not
the *people*. Scoping `friend` by Membership hides the one thing the glossary
declares unscoped.

**And §4 opens a hole.** A Friend who leaves a cal keeps their Participant rows
on its past Hangouts. Under co-member scoping their `friend` row stops being
readable, and that card renders **a Participant with no name and no face**.

So `friend` keeps v1's `using (true)`. Three things fall out:

- the faceless-Participant hole never opens;
- the `id = (select auth.uid())` arm ticket 02 called "not redundant" becomes
  genuinely unnecessary;
- the schema has **one** policy helper, `private.my_cal_ids()`, not two.

The cost, named exactly: an authenticated Friend can enumerate the names and
blobatars of everyone holding an account. No email, which `01-friend.sql` keeps
on `auth.users` deliberately, and **no cal membership**, because `membership`
stays scoped. It tells you Marco exists. It never tells you which cals he is in.
Everyone on that list was invited by name by somebody, and v1 shipped exactly
this policy.

### 10. Leaving is a plain `delete`, so ADR-0003's set stays at three

`membership` gets `using (friend_id = (select auth.uid()))` on delete, and the
browser holds the grant. The cascade in §3 does the rest. A fourth
`security definer` function would buy nothing the policies cannot express, and
the whole point of ADR-0003 is that the set stays small enough to audit as a
set.

`membership`'s grants are therefore `select` and `delete`, with **no `insert`**
(`create_cal` and `join_cal` are its only legitimate creators, the same instinct
as `friend` withholding `insert` because its trigger is) and **no `update`**
(there is nothing on the row to change).

`cal`'s grants are `select` and `update (name)` alone. No `insert`, because
`create_cal` is the only creator. No `delete`, ever, which is the Out-of-scope
decision made structural.

### 11. `cal.time_zone` lands validated, and nothing reads it yet

`text not null default 'Europe/Rome'`, with a check against
`pg_timezone_names`. The check is one line and catches the only mistake that
matters: a typo that makes every `at time zone` in the product throw at render
time rather than at write time.

**The client's `GROUP_TIME_ZONE` constant survives this ticket.** Ticket 08 owns
whose zone the grid draws, and replacing the constant before that is answered
would be deciding ticket 08 by implementation. The migration comment says so, so
the next reader does not read it as forgotten.

### 12. Three files

- **`08-cal-and-membership.sql`** — `create schema private`, the single helper
  `private.my_cal_ids() returns setof uuid`, `cal`, `membership`, and the two
  RPCs. ADR-0003's reasoning is restated beside each RPC, which its condition 4
  requires. It also carries ticket 02's warning as a comment: **never add
  `force row level security` to `membership`**, and create the helper so
  `postgres` owns it, because a `security definer` function only skips RLS when
  its owner can. Either mistake breaks every read in the product from a line
  that looks like hardening.
- **`09-per-cal.sql`** — the outage file. `cal_id` through `availability`,
  `hangout` and `hangout_participant`; the key, constraint and index changes;
  every rewritten policy; the backfill into one cal named "spiritually
  unemployed"; and the `allowlist` attribution. Not split further, because the
  backfill and the `not null` that depends on it must not be in different files.
- **`10-lifecycle-per-cal.sql`** — the three function bodies from §5.

### The functions are `join_cal` and `create_cal`

ADR-0003 is Accepted and names them `join_group(code)` and `create_group(name)`.
Renaming the table without renaming them leaves a function called `join_group`
reaching into a table called `cal`, which is the kind of seam that makes the
next reader ask which one is stale. **ADR-0003 is amended by this ticket**, in
its own Amendment section, following ADR-0002's convention. Its four conditions
do not move. Only the names do.

### What this does not decide

- **Realtime.** Ticket 12's, and §6 makes it urgent rather than answers it: with
  default replica identity the delete payload is the primary key, and that key
  now names the cal.
- **Whose time zone the grid draws.** Ticket 08's. See §11.
- **What leaving marks on Hangouts.** Ticket 10's. See §3.
- **Whether double-booking warns.** Ticket 09's, now unblocked.
