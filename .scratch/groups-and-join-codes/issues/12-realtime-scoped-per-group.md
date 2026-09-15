# 12 — Realtime, scoped per Group: filter, or broadcast

Type: grilling
Status: resolved

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

## Note from ticket 09 — the first consumer that wants *more* than one cal

[Ticket 09](09-double-booking.md) resolved with a cross-cal busy mark, and it is
worth knowing before this ticket chooses: **both options above are shaped around
narrowing to one cal, and 09 is the first thing in the product that wants data
from the cals that are not on screen.** Its query is your own non-Left
Participant rows in every cal you are a Member of, over the view window.

- **Option A** narrows with a filter string on `postgres_changes`. A cross-cal
  subscription is not one filter string.
- **Option B** gives each cal its own `cal:<id>` topic. Staying live across cals
  means subscribing to *N* topics, one per Membership.

**Ticket 09 chose not to need this.** Its mark is a snapshot refreshed on view
or cal change, not a live subscription, explicitly so that this ticket is not
bent around a non-blocking nicety. So it is a constraint you may ignore — but
ignore it knowingly: if B wins and the topic is the unit of subscription, a
future feature that does want live cross-cal data pays N subscriptions, and that
is the moment to remember this note rather than discover it.

## Answer

**B. Broadcast from the database, on a private per-cal topic, and the three
tables come out of the `supabase_realtime` publication.** Research notes:
[`research/realtime-delete-filters.md`](../research/realtime-delete-filters.md),
fetched 2026-09-15 from `supabase.com/docs`, the `supabase/realtime` and
`supabase/walrus` sources.

Two findings outrank the A-versus-B choice, and one of them is why the answer is
not simply "A, at v1 scale".

### 1. This was never only a leak. It is a rendering bug, and RLS causes it

The ticket is framed around deletes escaping RLS. The worse problem is on
**insert**, where RLS is working exactly as designed.

A Friend in cal A and cal B passes the read policy for both, legitimately. So
their cal-B inserts arrive at a client showing cal A. The client store is keyed
`slotKey(friendId, slotStart)` with no cal in it (ticket 04 §6 kept it two-part
deliberately), so **cal B's Saturday paints onto cal A's grid**. No policy can
prevent this, now or ever: the subscriber is authorised to read both rows and
the store cannot tell them apart.

`hangout` and `hangout_participant` have the same insert problem and no delete
problem, because their stores are keyed on globally unique uuids, so a wrong-cal
delete removes a row the store does not hold and is a no-op. That harmlessness
is an accident of key shape, not a property anybody maintains, which is why the
answer treats all three tables alike.

So "accept the leak" was never available. The multi-cal Friend is the entire
point of this effort and is exactly who breaks.

### 2. Three tables, not two. Two hooks, not three

The ticket says `availability` and `hangout`. `05-hangout.sql:420` also
publishes **`hangout_participant`**, and ticket 04 §4 gave it a `cal_id` and a
composite FK, so its reads are restricted too.

The client side is two hooks, not three: `useAvailability` owns one channel, and
`useHangouts` already carries `hangout` and `hangout_participant` on a single
channel. `useRoster` is the third channel and is not in scope here (§7).

### 3. What `postgres_changes` actually does, recorded because it corrects two tickets

Option A was rejected, but the mechanics are written down because ticket 02 and
ticket 04 both guessed at them and both guessed wrong, and because §5 depends on
them.

**The filter reads the WAL identity, not the delivered payload.** `apply_rls`
builds `old_columns` from `wal -> 'identity'` and never removes a column from
it. The pkey trim (`and ( not is_rls_enabled or (c).is_pkey )`) assembles
`old_record` in a later loop. So on an RLS'd table a column is available to the
filter and absent from the payload, both at once. Deletes match on the old
record, confirmed in source and by `walrus`'s `issue_50_delete_filters` fixture.

**Which inverts the cost ticket 04 §6 recorded.** `cal_id` leads
`availability`'s new key, so a `cal_id=eq.<uuid>` filter matches its deletes
under the **default** replica identity. `availability` never needed
`replica identity full`. `hangout` and `hangout_participant` would have needed
it, not for payload richness but for the filter to find its column at all, since
`cal_id` is not in either identity. Ticket 04 §6's "Option A's cost went up
slightly ... against a table that takes sixteen-row inserts" is backwards: the
write amplification would have skipped the hot table and landed on the two that
see a handful of writes a week.

**And under A the client could not audit a delete.** Even with `full`, the
delivered payload is pkey columns only, so a `hangout` delete arrives as
`{id}` with no `cal_id` in it. There is no second check available in the
browser. If the filter string were wrong or missing, nothing downstream would
notice. That is ticket 02's "treat the filter as load-bearing" made concrete,
and it is the argument that decided this.

One aside worth keeping: `is_visible_through_filters` joins on column name and
never consults `is_selectable`, so a filter can match a column the role cannot
`select`. The filter is not a permission check in disguise.

### 4. Open item 2, answered, and the inverse lands on ticket 10

**`postgres_changes` authorization is not cached.** `apply_rls` re-executes per
WAL record with the caller's claims; the subscription row stores the JWT claims,
not a policy result. A membership row inserted mid-session takes effect
immediately, no reconnect. The cached-policy sentence ticket 02 found belongs to
`realtime.messages` channel policies.

**Which means the caching problem belongs to B, not to A, and it lands on
leaving rather than joining.** Channel policies are cached for the duration of
the connection, so a Friend who leaves a cal while connected would keep
receiving its messages until they reconnect. In practice the channel is torn
down before that matters: [ticket 10](10-leaving-a-group.md) puts Leave on `/`
and leaving routes you out of `/g/:id`, so §6's per-cal channel unmounts.
**Recorded rather than relied upon**, because it is a security boundary that
depends on a route change. Rejoining is unaffected: a new topic is a fresh
channel join and re-runs the policy.

### 5. The decision, and why the publication drop is the load-bearing half

**Two topics, mapping one-to-one onto the two hooks**: `cal:<id>:availability`
and `cal:<id>:hangouts`. Sharing one topic between two hooks would need a shared
channel provider, because supabase-js discourages two channels on one topic, and
the hooks' independence is how this codebase is built. The policy parses the id
the same either way (`split_part(realtime.topic(), ':', 2)`).

**`availability`, `hangout` and `hangout_participant` are dropped from the
`supabase_realtime` publication.** This is what makes B close anything. Broadcast
changes what *our client* subscribes to; it does nothing about another client
opening a `postgres_changes` subscription with the same publishable key and
receiving every delete on those tables. **The delete hole is a property of the
publication, not of our hooks.** Leaving them published would pay B's full cost
and close none of the leak.

Understand what that forecloses: there is no `postgres_changes` fallback
afterwards. If broadcast misbehaves in production the way back is a migration,
not a client change.

**The policy on `realtime.messages` grants `select` only.** No insert policy for
`authenticated`, so the trigger is the only writer. A Friend who could insert on
these topics could forge availability into a cal they belong to and paint rows
on other people's grids that do not exist in the database. This is ADR-0003's
rule in another costume: the caller never says who. Written into the migration
as a comment, because an insert policy is the kind of thing added later to
enable typing indicators without noticing what else it enables.

**Per-row `realtime.broadcast_changes()` triggers**, the documented shape. Every
one of the three tables carries `cal_id` after ticket 04, including the
redundant one on `hangout_participant`, so the topic comes from `NEW.cal_id` or
`OLD.cal_id` with no join. The column ticket 04 added to collapse a policy also
makes these triggers trivial.

### 6. Switching cals, and the burst on leaving

**Channel, never the socket.** `calId` joins the effect deps and the channel name
carries it, so React tears down and rebuilds on the route change ticket 01 put
in the URL. Under B that rebuild also re-runs the topic authorization, which is
the honest answer to "did my new membership take effect".

**Leaving is the worst case for message volume, and it is worth naming.**
Ticket 04 cascades Availability from `membership`, and ticket 10 keeps that
cascade, so leaving deletes every Availability row you hold in that cal in one
statement. A per-row trigger turns a Friend with six months of drawn Slots into
thousands of messages in `realtime.messages`, retained three days. Correct
behaviour (the remaining members' grids should empty out) and fine at nine
Friends, but it is the number to look at first if that table ever gets big. The
alternative, a statement-level trigger with a hand-rolled aggregate payload,
trades a supported helper for a bespoke one and a different client fold.

### 7. The roster: the subscription stays, the read is a new ticket

Open item 1 splits in two, and the halves have opposite answers.

**The subscription stays exactly as it is**: table-wide, `event: '*'`, on
`postgres_changes`, with `friend` still in the publication. Ticket 04 kept
`friend` at `using (true)` because identity is global, and v1 ticket 11 wants a
hue change to reach every screen. So the product deliberately runs both
mechanisms at once. That is not drift.

**The read is broken and nobody owned it.** `use-roster.ts:123` is
`from('friend').select('*')` with no filter. With `friend` open by decision and
many cals in the product, the sidebar lists strangers. Ticket 04 settled the
policy and moved the scoping burden into every query; this is the query that has
it. Split out as [ticket 14](14-roster-read-scoping.md) rather than settled
here, because bundling them invites someone to "fix" the subscription the same
way and break the past-Hangout case ticket 04 protected.

### 8. What this costs, and two things it does not

Off the bill entirely: **`setAuth()`**, which `RealtimeClient.js:204` already
calls on connect and on every auth event, and **`replica identity full`**, which
is irrelevant to broadcast because a trigger reads `OLD` in full regardless.
Both were listed as B's costs in the ticket. Neither is real.

Found rather than paid for: **`broadcast: { replay: { since, limit } }`**, which
`RealtimeChannel.js:113` allows on private channels only, which these now are.
The three-day retention the ticket listed as a cost is a replay buffer that
`postgres_changes` cannot offer at all. **Not used here** (§9).

One consequence worth stating plainly, because it is the opposite of A's: under
broadcast the payload is whatever the trigger sends, so a delete carries the
whole `OLD` row including `cal_id`. The client *can* audit. It should not need
to, and this ticket does not ask it to, but the option exists where under A it
did not.

### 9. What this does not decide

- **The gap between the read and the subscription.** Both hooks read and
  subscribe independently, so an event landing between the two is missed. A
  missed insert is repaired by the read; a missed delete leaves a phantom row
  until reload. v1 accepted that window and this ticket leaves it there.
  `replay` could close it, but choosing `since` after a reconnect is a client
  state question with no bearing on the security decision, and this ticket has
  grown twice already. Recorded as fog on the map.
- **Two empirical checks, now specific enough to be acceptance criteria rather
  than open questions.** No `walrus` fixture covers a filter on an absent column
  for a delete on an RLS'd table, nor a composite-key filter. Both concern
  option A and neither blocks B. What *does* want checking on the live project is
  that the installed `apply_rls` matches what was read (`select prosrc from
  pg_proc where proname = 'apply_rls'`), since it ships through tenant
  migrations. One read-only query in the SQL Editor.
- **Ticket 09's boundary holds and is not reopened.** The double-booking warning
  is the first consumer wanting data from cals not on screen, and it is a
  snapshot read rather than a subscription. Per-cal topics keep that distinction
  intact: cross-cal data arrives because somebody asked a query for it, never
  because a firehose delivered it.

### Files and sequencing

A new **`11-realtime-per-cal.sql`**, following ticket 04's rule that changing a
shipped thing means a new file rather than an edit. It carries the three
triggers, the `realtime.messages` policy, and the three
`alter publication ... drop table` statements. `03-realtime.sql` and
`05-hangout.sql` stay as they are and are superseded in part, which the new file
says at the top.

**It rides ticket 04's outage.** The publication drop and the triggers have to
land with `09-per-cal.sql`, or a deployed client is subscribed to a firehose
that has stopped and has not yet learned to listen anywhere else.

`scripts/verify-realtime.mjs` is v1's acceptance check for this slice and tests
`postgres_changes`. It has to be rewritten against broadcast, or it will pass on
`friend` and prove nothing about the three tables that moved.

### Domain and decisions

`CONTEXT.md` needs no change, and that was checked rather than assumed. Topics,
channels and publications are implementation; the glossary holds Group, Code,
Membership and Left, none of which this ticket touches.

**[ADR-0004](../../docs/adr/0004-broadcast-for-cal-scoped-realtime.md)** is
written, and it meets all three tests. Hard to reverse: the publication drop
forecloses `postgres_changes` for those tables. Surprising without context: a
future reader finds two Realtime mechanisms in one small product and no reason
given. A real trade-off: option A was viable, cheaper than either earlier ticket
believed, and needed no client handler changes at all.
