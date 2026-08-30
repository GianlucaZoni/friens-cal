# 19 — Optimistic writes, failed round-trips, and the gap in between

Type: grilling
Status: resolved
Blocked by: —

## Question

The last decision a builder would otherwise guess at. Everything it depends on
is settled: slot rows (07), the Hangout state machine (08), the Candidate
pipeline and its recompute triggers (09), and the create gestures (10).

1. **What the grid shows between a drag ending and the rows landing.** Undefined
   today. Optimistic paint, a pending treatment, or nothing until the round trip
   returns?
2. **What happens when the write fails.** Ticket 01 settled **no undo and no
   reset**, so there is no stack to roll back to — the optimistic state simply
   has to be reverted, and the Friend told. What does that look like, and does it
   differ for a drag (many slots) versus a single slot?
3. **Partial failure.** A drag inserts many slot rows at once. If some land and
   some do not, is the whole thing reverted or is the partial result kept? The
   unique constraint on `(friend_id, slot_start)` makes retry safe, which may
   make retry the better answer than revert.
4. **The cross-Friend write.** Force-writing a Hangout extends *other people's*
   Availability through the ADR-0002 RPC. A failure there is the one case where
   the optimistic state on screen is about someone else's data.
5. **Realtime versus your own optimistic state.** Your own insert arrives back
   over the Realtime subscription. Does it reconcile cleanly, or can it fight the
   optimistic row and flicker?
6. **Offline.** Does the app detect it and say so, or does every write just fail
   individually?
7. **Ticket 09's recompute.** The Candidate list recomputes on every Availability
   change. Does it recompute on the *optimistic* state, so the sidebar moves
   before the write lands, or only on confirmed rows?

## Answer

<!-- the write model -->

## Answer

### The write model

**Paint optimistically, with no distinct treatment.** The rows go into the store
the moment the gesture ends and the grid renders them like any other. Only if a
write is still outstanding after **~400ms** does anything appear — and it cannot
be a faded block, because **ticket 15 spent opacity on *how many Friends are
free***. A dimmed block would read as "fewer people", not "not saved yet". Use a
channel the grid does not already own: an outline pulse, or an indicator outside
the grid.

**One `insert` per gesture, never chunked.** PostgREST sends a multi-row insert
as one statement in one transaction, so partial failure is not reachable unless
we create it. Item 3 of this ticket dissolves rather than resolving.

**`insert ... on conflict do nothing`.** Drawing across the edge of Availability
you already have is the most ordinary action in the app — ticket 01 made
Availability merging — so the overlap is normal, not an error. Ticket 07's
unique constraint on `(friend_id, slot_start)` exists for exactly this, and
using it here has a second payoff: **retry is idempotent by construction**.

### Failure

**Two automatic retries with backoff, then revert and toast.** The toast
**names the range** — *"couldn't save Thu 20:00–23:00"* — because once the paint
is reverted there is no trace of it on screen, and ticket 01 left no undo stack.
Redraw or the toast's **Retry** are the only routes back.

Rejected: reverting silently, which makes Availability vanish with no
explanation; and retrying forever, which leaves the screen permanently lying.

**The erase path is symmetric**, and safe for the same reason: deleting an
absent slot row is also a no-op, so an erase retries as safely as an insert. On
failure the erased blocks re-appear.

### Realtime

**Slots are keyed by `(friend_id, slot_start)`** — their natural key, already
unique per ticket 07. An optimistic row and its Realtime echo are therefore
**the same row**, and the echo is a no-op.

No dedupe pass, no reconciliation, no flicker, and no "is this event mine"
bookkeeping. Filtering out your own session's events was rejected outright: it
**would break your own second device** — drawing on a laptop must still reach
the phone.

### The cross-Friend write is the exception

Force-writing a Hangout extends *other Friends'* Availability through the
ADR-0002 RPC. **It is not painted optimistically.** The dialog holds a pending
state and reports the outcome in place.

It is already a deliberate modal flow behind a confirm button, so no gesture
feedback is lost, and a spinner in a dialog is unremarkable. Ticket 16 made it a
Dialog so the consequence is stated *before* the controls; the result belongs
there too. Painting five people's calendars and then un-painting them is a bad
thing to do on the product's most consequential write.

### Offline

**Detect it, show a persistent banner, and let writes still attempt** and fail
through the normal path above.

Blocking writes on `navigator.onLine` was rejected because it lies often enough
— captive portals, dead wifi with a live interface — that it would lock people
out of a working connection. A banner plus honest per-write failure degrades
correctly whichever way the detection is wrong.

**An offline write queue is out of scope.** Persisting drafts and replaying them
on reconnect carries its own conflict semantics and nothing on the map asked for
it.

### The Candidate list recomputes on optimistic rows

One store, so ticket 09's pipeline sees the optimistic rows and the sidebar
tracks the grid with no lag. The failure path reverts the rows, so the sidebar
reverts with them for free.

**One accepted race**, named rather than left to be discovered: a Candidate can
be confirmed while resting on an optimistic slot that never lands. It requires
drawing and reaching the sidebar inside ~200ms, so it is close to unreachable —
and it is harmless. You become a Participant whose Availability does not cover
the Hangout, and nothing fires: ticket 08's strict drop triggers on Availability
being **deleted**, not on it being absent. You meant to be there, and you are.
