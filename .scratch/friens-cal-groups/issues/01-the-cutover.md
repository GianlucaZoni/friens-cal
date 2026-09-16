# 01 — The cutover: every table gains a cal, and Realtime moves to broadcast

Status: ready-for-human — built, 3 criteria await the cutover
Blocked by: none

## Parent

[friens-cal — many Groups, joined by Code](../../groups-and-join-codes/map.md)

## What to build

The one-outage migration that turns the single implicit Group into a real `cal`
table, drags `cal_id` through every table that holds a statement about time, and
moves Realtime off the `supabase_realtime` publication onto broadcast. Nothing
new is visible afterwards: the product behaves exactly as it does today, on one
cal named "spiritually unemployed", with live updates still working.

**This is a human-run slice.** Nothing in the repo can reach the project with
DDL rights (ADR-0001), so every file below is pasted into the SQL Editor.

**Why it is one slice and not four.** Ticket 04 chose an outage over a staged
rollout: the moment `availability`'s key widens, the deployed client's every
draw and Join fails, because PostgREST's `onConflict` needs a matching unique
constraint and no unique index on `(friend_id, slot_start)` can survive per-cal
Availability. Ticket 12 then found the publication drop has to land in the same
window, or a deployed client is subscribed to a firehose that has stopped and
has not yet learned to listen anywhere else.

**Five files, run in order.**

- `08-cal-and-membership.sql` — the `private` schema and the single policy
  helper `private.my_cal_ids() returns setof uuid`; `cal` and `membership`; the
  two RPCs `join_cal(code)` and `create_cal(name)`. Both RPCs restate
  [ADR-0003](../../../docs/adr/0003-exposed-security-definer-rpcs.md)'s
  reasoning beside them, which its condition 4 requires.
- `09-per-cal.sql` — the outage file. `cal_id` through `availability`, `hangout`
  and `hangout_participant`; the key, constraint and index changes; every
  rewritten policy; `friend.time_zone`; the backfill into the one cal; the
  `allowlist` attribution.
- `10-lifecycle-per-cal.sql` — the three lifecycle function bodies, made
  cal-aware, plus the `before delete on membership` trigger that writes Left.
- `11-realtime-per-cal.sql` — three `realtime.broadcast_changes()` triggers, the
  `realtime.messages` select policy, and the three
  `alter publication ... drop table` statements.

**The Code alphabet** is a constant beside `create_cal`, six characters with
`0 O 1 I L U` removed. Generation is inside `create_cal` with retry on
collision, because a column `default` cannot retry itself on a unique violation.

**`membership` has two traps that look like hardening.** Never add
`force row level security` to it, and create the helper so `postgres` owns it —
a `security definer` function only skips RLS when its owner can, and either
mistake breaks every read in the product. Both want a comment in the file.

**The client half.** Thread `cal_id` through every query and every write. The
current cal is read from the Friend's single Membership rather than hardcoded,
so slice 02 changes nothing here. The client's two-part `slotKey` stays as it
is — one cal is on screen at a time, so `cal_id` is supplied at the query
boundary, and ticket 19's optimistic-write property survives untouched.

Both Realtime hooks move to broadcast on `cal:<id>:availability` and
`cal:<id>:hangouts`. The `friend` subscription **stays** on `postgres_changes`,
table-wide — the product runs both mechanisms deliberately, and narrowing it
breaks a case slice 04 depends on.

**Two corrections that only exist because a later ticket found them.** The
lifecycle triggers are blind to which cal a row is in, so without the fix
erasing your Saturday in one cal drops you from another cal's Saturday Hangout,
and your Availability over there keeps you on a Hangout you no longer cover.
And leaving cascades away *past* Availability too, and the drop trigger has no
Past exemption, so a departure would erase you from the cal's history — the
shield is one predicate asking whether the Friend is still a Member.

## Acceptance criteria

- [ ] The five migration files exist, are commented, and have been run in order
      against the live project
- [ ] `cal` and `membership` exist; one cal named "spiritually unemployed" holds
      every existing Friend, and every `availability`, `hangout` and
      `hangout_participant` row is backfilled to it
- [x] `create_cal` and `join_cal` satisfy all four of ADR-0003's conditions, with
      the reasoning written beside each
- [x] `hangout`'s exclusion constraint is per-cal and `hangout_participant`'s
      redundant `cal_id` cannot disagree with its Hangout's
- [x] Erasing Availability in one cal does not drop you from another cal's
      Hangout, and Availability in one cal does not keep you on another's
- [x] Leaving a cal marks you Left on its future Hangouts and leaves past ones
      holding your name
- [x] `availability`, `hangout` and `hangout_participant` are no longer members
      of `supabase_realtime`; `friend` still is
- [ ] Drawing in the app still paints on another signed-in browser, live
- [x] `scripts/verify-realtime.mjs` is rewritten against broadcast and passes —
      the old one tests `postgres_changes` and would pass on `friend` while
      proving nothing about the three tables that moved
- [x] `npx tsc -b` is clean and `yarn test` passes
- [x] Lint is unchanged at nine errors

## Blocked by

None - can start immediately

## Built

Four SQL files, not five. `supabase/08-cal-and-membership.sql`,
`09-per-cal.sql`, `10-lifecycle-per-cal.sql`, `11-realtime-per-cal.sql`, plus a
`supabase/README.md` that records how to rehearse them. The ticket says "Five
files, run in order" and then lists four; the four above are what groups ticket
04 §12 and ticket 12 specify between them, and nothing is missing.

Client: `src/cal/use-current-cal.ts` and `src/cal/current-cal-provider.tsx` are
the seam, `src/lib/broadcast.ts` (+ test) is the payload boundary, and
`use-availability.ts`, `use-hangouts.ts`, `database.types.ts`, `CalendarPage.tsx`
and `scripts/verify-realtime.mjs` are everything else.

**All four files were run, in order, against a local Supabase stack** built from
`00`–`07` with three accounts on it, and the behaviour below was exercised
there rather than described. `supabase/README.md` is that procedure written
down so the next migration stacks on it. Nothing was run against the live
project, which is the human's half.

### The decisions this slice had to make, not just carry

1. **`hangout.cal_id` is mutable, and nobody had noticed.** The update grant on
   `hangout` is table-wide and the new update policy is
   `using (cal_id in (…)) with check (… and cal_id in (…))` — which a Friend who
   is a Member of two cals satisfies **while moving a plan from one to the
   other**, carrying its Participants, its title and its provenance into a room
   the other Members never agreed to. No policy can refuse it: "`cal_id` must
   not change" compares the old row against the new, which is exactly the
   expression `with check` cannot contain. It is pinned in
   `10-lifecycle-per-cal.sql` §1, one line beside the line that already pins
   `created_by` for the identical reason. Rehearsed: an update that named the
   other cal left the Hangout where it was.
2. **`cal.time_zone`'s check constraint could never have been written.** Groups
   ticket 04 §11 specified `text not null default 'Europe/Rome'` "with a check
   against `pg_timezone_names`", and Postgres refuses that outright — a check
   constraint may not contain a subquery (`0A000`, confirmed in rehearsal).
   Ticket 08 deleted the column before it shipped, so the migration that could
   not have run was never written. `friend.time_zone` therefore lands with no
   check and a comment saying why, and the column has no reader in the renderer
   anyway: the grid reads the live device.
3. **The `allowlist` attribution is not in `09`.** Groups ticket 04 §12 lists it
   as part of this file. Ticket 07 resolved later, found `allowlist` never had
   an `invited_by` column at all, and gave inviting its own slice — build ticket
   06's `13-invite.sql`, which also carries the `insert` grant and the ADR-0003
   condition 4 comment that contradicts `07-allowlist.sql`'s prose. Two files
   adding the same column is worse than one file adding it late.
4. **`cal` has no provenance column**, which ticket 04 Q1 asked about and its
   Answer never returns to. `hangout.created_by` exists because flat trust plus
   no notifications leaves *who moved this* unanswerable by anything else. Who
   made a cal is answerable already: the Member with the earliest `joined_at`.
   And CONTEXT.md says "no Member outranks another", so a `created_by` here
   would be the first hint of an ownership model the domain has refused.
5. **One broadcast trigger function, three triggers, and the topic suffix is
   `tg_argv[0]`.** Three near-identical function bodies would drift; this way
   the whole topic vocabulary is in the three `create trigger` statements where
   it can be read at once. `realtime.send` swallows its own failures with a
   WARNING, so a Realtime hiccup cannot block a draw — worth knowing before
   somebody wraps the trigger in defensive code.
6. **The `realtime.messages` policy compares the topic as text, never casts it.**
   `split_part(realtime.topic(), ':', 2)::uuid` raises `22P02` on a malformed
   topic, and an exception inside a policy is an error rather than a refusal.
   Rehearsed against `cal:not-a-uuid:availability`: 0 rows, no error.
7. **The seam is a provider that reads `cal`, not `membership`.** `cal`'s select
   policy *is* `id in (select private.my_cal_ids())`, so the query returns
   exactly the Friend's cals — the Membership is expressed by the policy instead
   of by an `.eq()` — and the row carries the name and the Code that slices 02
   and 03 need. The provider gates rendering until it resolves, so no hook below
   handles a null cal.
8. **A third index, beyond the two ticket 04 §6 names.**
   `hangout_participant_cal_id_idx`: the key is `(hangout_id, friend_id)` and
   the policy filters on `cal_id`, which leads nothing. Same insurance as
   `hangout_cal_id_idx`, one table over.
9. **`09` mints the first cal's Code rather than hard-coding one.** It calls the
   same `private.new_cal_code()` `create_cal` uses, with the same retry, so the
   backfilled cal's Code comes from the same thirty characters as every later
   one and the repository holds no live cal's Code. The file ends with the
   `select` that reads it back.

### What the rehearsal proved

A local stack, `00`–`07` applied, three accounts, pre-cutover Availability and
two Hangouts (one past, one future) with everyone on them. Then `08`–`11`.

- `create_cal` trims the name, mints a Code, and the creator is the first
  Member. A second Friend cannot see the cal until they use the Code.
- `join_cal` works on ` nzjssv ` (lower case, stray space), is idempotent on a
  Code you already hold, and raises `no_data_found` on `ZZZZZZ`.
- Backfill: 0 null `cal_id` on all three tables, one Membership per Friend.
- Two cals can hold overlapping Hangouts; one cal still cannot (`23P01`).
- **Erasing in cal A did not drop her from cal B's Hangout** — and dropping her
  from cal A's left her alone on it, so the auto-cancel deleted it, which is the
  existing rule still working.
- **Availability in cal A did not keep her on cal B's Hangout**: holding the
  whole range in A, she was dropped from B the moment her one B Slot went.
- **Leaving** marked Bea Left on the cal's future Hangout, left her a plain
  Participant on its past one, erased her Availability in that cal and nothing
  in the other.
- The `realtime.messages` policy: a Friend in one cal sees their own topic,
  gets nothing on another cal's, nothing on junk, and no error on a malformed
  one.
- The publication holds exactly `public.friend`.
- `availability_on_the_slot_grid` rejects an off-grid instant (`23514`).
- **All four files re-run cleanly, twice**, which found two idempotence bugs
  that would only ever have bitten a second paste: `hangout_cal_id_fkey` had no
  `drop constraint if exists` in front of it, and `hangout_id_cal_id_key` cannot
  be dropped at all once §4's foreign key points at its index, so it is added
  only if absent. Both are fixed and both are commented.
- And the outage, demonstrated rather than predicted: an upsert with
  `onConflict: 'cal_id,friend_id,slot_start'` succeeds and is idempotent; the
  deployed client's `'friend_id,slot_start'` comes back `42P10 there is no
  unique or exclusion constraint matching the ON CONFLICT specification`.

`scripts/verify-realtime.mjs`, rewritten, passes end to end against that stack —
including its new negative check, which is the one the old script could not
make: a `postgres_changes` subscriber hears nothing about a write the broadcast
subscriber just received, so the publication drop is demonstrated rather than
asserted.

One rehearsal gotcha, recorded in `supabase/README.md`: the local Realtime
container creates its `realtime.messages` replication slot lazily on the first
private channel join, so the first run on a fresh stack can miss a message by
milliseconds and report "NO INSERT MESSAGE" with the trigger perfectly fine. Run
it twice; believe the second.

### Checks

```
$ npx tsc -b
(clean)

$ yarn test
ℹ tests 244
ℹ pass 244
ℹ fail 0

$ yarn lint
✖ 9 problems (9 errors, 0 warnings)
```

Six of those 244 are new, in `src/lib/broadcast.test.ts`: the payload boundary,
asserted against the literal shape `realtime.broadcast_changes()` writes — read
off the installed function's source and confirmed against `realtime.messages`,
not guessed from the docs.

### What this leaves behind

- **The other five verify scripts are stale.** `verify-availability.mjs`,
  `verify-candidates.mjs`, `verify-hangout.mjs`, `verify-hangout-lifecycle.mjs`
  all write `availability` and `hangout` rows without a `cal_id`, so every write
  in them fails from the moment `09` runs. `verify-friend-row.mjs` and
  `verify-allowlist.mjs` are untouched by this. Not in scope here and not
  silently ignorable either: they are the regression suite for the lifecycle
  this slice just rewrote.
- **The two stores are not keyed by cal.** `slotKey` stays two-part on purpose
  (ticket 04 §6), so `useAvailability` and `useHangouts` hold one cal's rows and
  nothing resets them when the cal changes. Slice 02 wants `key={calId}` on what
  the provider renders; a merge would paint one cal's Saturday on another's
  grid. Said in both hooks' comments.
- **ADR-0003's issue 07 amendment names `11-invite.sql`.** Build ticket 06 calls
  it `13-invite.sql`, which is right — `11` is this slice's Realtime file. One
  stale filename in an ADR, left for whoever writes that slice.

### Left for after the cutover

Three criteria, and every one of them needs the live project.

1. **"The five migration files … have been run in order against the live
   project."** Four files, and a human pastes each into the SQL Editor in this
   order: `08-cal-and-membership.sql`, `09-per-cal.sql`,
   `10-lifecycle-per-cal.sql`, `11-realtime-per-cal.sql`. `08` is safe to run
   ahead of time and touches nothing the deployed client can see. `09` starts
   the outage and `11` silences the deployed client's Realtime, so those three
   and the client deploy are one sitting. Then, in the SQL Editor:

   ```sql
   select id, name, code from public.cal;
   select tablename from pg_publication_tables where pubname = 'supabase_realtime';
   ```

   Expect one cal, and exactly `friend`.

2. **"`cal` and `membership` exist … every row is backfilled to it."** Proven in
   rehearsal against a stack built from these exact files; not proven here
   against the live data, which has rows this checkout has never seen. After
   `09`:

   ```sql
   select count(*) from public.availability where cal_id is null;        -- 0
   select count(*) from public.hangout where cal_id is null;             -- 0
   select count(*) from public.hangout_participant where cal_id is null; -- 0
   select count(*) from public.membership;      -- one per row in public.friend
   ```

   If `09` stops on `23514` at `availability_on_the_slot_grid`, there are
   off-grid Slots; the query that finds them is in the comment above that
   statement.

3. **"Drawing in the app still paints on another signed-in browser, live."** Two
   signed-in browsers on the deployed client, after all four files and the
   deploy. Nothing in this repo can stand in for it: the dev server here points
   at the live project, whose schema is pre-cutover until a human changes it.

And the run that ties them together, which is the acceptance check for the
Realtime half and is worth doing on the live project even though it is ticked
above against the rehearsal:

```sh
node --env-file=.env scripts/verify-realtime.mjs
```

Two more things for whoever holds the runbook, neither of them an acceptance
criterion here:

- **Suppress Supabase's linter rule 0029** against `create_cal` and `join_cal`,
  naming ADR-0003. Both are the documented intentional case; two standing
  advisories train everybody to ignore the advisor.
- **The other verify scripts need their own pass** before they mean anything
  again. See "What this leaves behind" above.
