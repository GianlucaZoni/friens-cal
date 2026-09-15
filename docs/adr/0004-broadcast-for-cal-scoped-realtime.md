# ADR-0004: Broadcast for cal-scoped Realtime, `postgres_changes` for `friend`

**Status:** Accepted — 2026-09-16

## Context

Until the groups effort, every table this product publishes to Realtime had a
`using (true)` read policy. `03-realtime.sql` wrote that down as the reason the
one documented hole was harmless: **RLS is not applied to Realtime DELETE
events**, so every subscriber sees every delete, and a delete "carries nothing a
`select` would not have handed over". The file also recorded the general rule it
was relying on: *do not publish a table whose reads are restricted*.

Per-Group Availability (issue 01, Q4) restricts the reads on three of the four
published tables. The footing is gone.

Issue 12 found the consequence is worse than the leak, and that the leak was the
smaller half:

- **On insert, RLS cannot help, because it is working correctly.** A Friend in
  two cals is authorised to read both. Their cal-B inserts arrive at a client
  showing cal A, and the client store is keyed `(friendId, slotStart)` with no
  cal in it, so cal B's Availability paints onto cal A's grid. No policy can fix
  a subscriber who is legitimately allowed to see both rows.
- **On delete, nothing is applied at all.** The key is now
  `(cal_id, friend_id, slot_start)`, so every delete event names the cal, the
  Friend and the time, to every Friend in the product.

Two shapes were documented. **`postgres_changes` with a per-cal filter** is a
near one-line change to two hooks and, per issue 12's research, cheaper than
either issue 02 or issue 04 believed: the filter is evaluated against the WAL
identity rather than the delivered payload, so `availability` needs no
`replica identity full` at all. **Broadcast from the database** on a private
per-cal topic costs a trigger per table, both hooks rewritten, and a three-day
copy of every change in `realtime.messages`.

## Decision

**Broadcast, on two private topics per cal (`cal:<id>:availability` and
`cal:<id>:hangouts`), and `availability`, `hangout` and `hangout_participant`
are removed from the `supabase_realtime` publication. `friend` keeps its
table-wide `postgres_changes` subscription and stays published.**

Three things decided this, in order.

**1. Removing the tables from the publication is the only thing that actually
closes the hole.** The delete exemption is a property of the publication, not of
our client. Any holder of the publishable key can open a `postgres_changes`
subscription and receive every delete on a published table, whatever our hooks
do. A client-side filter narrows what *we* subscribe to and narrows nothing
else. Once the tables leave the publication, broadcast is the only remaining
path, so the decision is really "drop them, and therefore broadcast", not
"broadcast, and optionally drop them".

**2. Under a filter, the browser has nothing to check.** With RLS enabled a
delete's payload is trimmed to primary-key columns, so a `hangout` delete
arrives as `{id}` with no `cal_id` in it. The filter string in the hook is the
entire boundary and nothing downstream can detect its absence. Issue 02's
condition ("if and only if the client filter is treated as load-bearing and
written down as such") is the kind that survives in a comment and dies in the
next refactor.

**3. The policy is a policy.** Under broadcast a delete is a message on a topic
a `realtime.messages` policy had to authorise, using the same
`private.my_cal_ids()` helper as every other policy in the schema. The boundary
lives where the project keeps its other boundaries.

The policy grants **`select` only**. No insert policy for `authenticated`, so
the trigger is the only writer. A Friend able to insert on these topics could
forge events into a cal they belong to and paint rows on other people's grids
that do not exist in the database. This is ADR-0003's rule restated: the caller
never says who.

`friend` is excluded deliberately, not overlooked. Issue 04 kept it
`using (true)` because identity is global, so its reads are not restricted and
`03-realtime.sql`'s original reasoning still holds for it word for word.

## Consequences

- **There is no `postgres_changes` fallback for those three tables.** If
  broadcast misbehaves in production, the way back is a migration, not a client
  change. This is the part that is hard to reverse.
- **The product runs two Realtime mechanisms at once**, and a reader will
  notice. That is this ADR's main reason to exist.
- **Leaving a cal produces a burst.** Availability cascades from `membership`
  (issue 04) and issue 10 keeps that cascade, so a per-row trigger turns a
  Friend with months of drawn Slots into thousands of messages, retained three
  days. Correct, and fine at nine Friends. It is the first number to look at if
  `realtime.messages` ever gets big.
- **Channel authorization is cached for the life of the connection**, unlike
  `postgres_changes`, which re-evaluates per event. A Friend who left a cal
  while connected would keep receiving its messages until reconnect. In practice
  Leave routes them out of `/g/:id` and the channel unmounts, so the cache is
  never exercised. Recorded because it is a boundary that leans on a route
  change.
- **Two costs listed against broadcast turned out not to exist.** `setAuth()` is
  already wired by the installed client on connect and on every auth event, and
  `replica identity full` is irrelevant to a trigger that reads `OLD` in full.
- **The retention buys something back.** `broadcast: { replay: { since, limit }
  }` works on private channels only, which these now are, so the three-day copy
  is a replay buffer for the gap between a hook's read and its subscription.
  Unused for now, deliberately.
- **`scripts/verify-realtime.mjs` no longer proves what it claims.** It tests
  `postgres_changes`, so after this it passes on `friend` and says nothing about
  the three tables that moved.
