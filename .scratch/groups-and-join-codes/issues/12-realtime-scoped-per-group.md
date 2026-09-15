# 12 — Realtime, scoped per Group: filter, or broadcast

Type: grilling
Status: open

## Question

Graduated from the map's fog by [ticket 02](02-membership-rls-research.md),
which found the shape sharp enough to ticket and framed the choice without
closing it, because it has client consequences.

**The problem v1 does not have.** `03-realtime.sql` reasoned the Realtime DELETE
exemption away — RLS is not applied to delete events, but `availability`'s read
policy was `using (true)`, so a delete event "carries nothing a `select` would
not have handed over". Per-Group Availability removes that footing. After this
effort `availability` and `hangout` are tables whose reads are restricted, which
is the exact case that same file warns against. With default replica identity a
delete payload carries the primary key, and ticket 04's key is
`(group_id, friend_id, slot_start)` — so every Friend with the app open would
receive, for every erased half-hour in every cal in the product, a row naming
the Group, the Friend and the time.

Not catastrophic. Precisely the cross-Group visibility ticket 01 decided
against, arriving through a side door.

The two documented shapes:

- **A. `postgres_changes` with a per-Group filter and `replica identity full`.**
  A near one-line change to three hooks that already exist. Costs what
  `03-realtime.sql` deliberately avoided — the whole old row into the WAL on
  every write — and puts the delete boundary in a **client filter string**
  rather than in a database policy. Ticket 02 could not confirm which record the
  filter is evaluated against for a delete under `replica identity full`, and
  under this option that filter is the only thing between a delete and the wrong
  subscriber. **Test it, do not trust it.**

- **B. Broadcast from the database**, on a `group:<id>` private topic, gated by
  an RLS policy on `realtime.messages` using the same membership helper.
  Supabase now ranks this first for "scalability and security". It closes the
  delete hole properly, because a delete becomes a message on a topic you had to
  be authorized to join. Costs a trigger per table, three hooks rewritten,
  `setAuth()` before subscribing, and a three-day copy of every change in
  `realtime.messages`.

Ticket 02's read: **B is the right destination, A is the honest v1-scale answer,
if and only if the client filter is treated as load-bearing and written down as
such.** That is a recommendation, not a decision.

Also to settle here:

1. **`useRoster`'s subscription on `friend`.** It is `event: '*'` and table-wide
   today. Under scoped reads it should only carry co-Members. Does it fit
   whichever shape wins, or does the roster need its own answer?

2. **The caching question ticket 02 could not confirm**: whether
   `postgres_changes` authorization is cached per connection the way
   `realtime.messages` channel policies are. If it is, **a Friend who joins a
   cal mid-session may receive none of its events until they reconnect** — which
   is a visible bug on exactly the flow this whole effort adds. Establish it
   empirically if the docs will not say.

3. **Whether switching Groups re-subscribes or re-connects.** Ticket 01 put the
   Group in the URL, so switching is a route change, and three hooks currently
   subscribe on mount.

## From ticket 04, which is now resolved

[04](04-group-schema-and-migration.md) did not decide Realtime, and made this
ticket more urgent rather than less.

- **The key is now `(cal_id, friend_id, slot_start)`.** With default replica
  identity a delete payload is the primary key, so every delete event now
  **names the cal**. That is ticket 02 §4's warning arriving as a fact.
- **The client's store keeps its two-part key** (`slotKey(friendId, slotStart)`),
  because one cal is on screen at a time. So whatever this ticket chooses, the
  fold and the removal path do not have to widen; the subscription has to stop
  delivering other cals' events.
- **`friend` stays `using (true)`** and stays published, unchanged. Only
  `availability` and `hangout` are tables whose reads became restricted, so the
  delete hole is scoped to those two.
- **Option A's cost went up slightly.** `replica identity full` on a table whose
  key is now three columns writes the whole old row on every statement, against
  a table that takes sixteen-row inserts.
