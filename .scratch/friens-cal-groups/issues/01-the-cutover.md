# 01 — The cutover: every table gains a cal, and Realtime moves to broadcast

Status: ready-for-human
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
- [ ] `create_cal` and `join_cal` satisfy all four of ADR-0003's conditions, with
      the reasoning written beside each
- [ ] `hangout`'s exclusion constraint is per-cal and `hangout_participant`'s
      redundant `cal_id` cannot disagree with its Hangout's
- [ ] Erasing Availability in one cal does not drop you from another cal's
      Hangout, and Availability in one cal does not keep you on another's
- [ ] Leaving a cal marks you Left on its future Hangouts and leaves past ones
      holding your name
- [ ] `availability`, `hangout` and `hangout_participant` are no longer members
      of `supabase_realtime`; `friend` still is
- [ ] Drawing in the app still paints on another signed-in browser, live
- [ ] `scripts/verify-realtime.mjs` is rewritten against broadcast and passes —
      the old one tests `postgres_changes` and would pass on `friend` while
      proving nothing about the three tables that moved
- [ ] `npx tsc -b` is clean and `yarn test` passes
- [ ] Lint is unchanged at nine errors

## Blocked by

None - can start immediately
