# ADR-0002: Cross-Friend availability writes go through one narrow RPC

**Status:** Accepted — 2026-08-29

## Context

Confirming a Hangout allows the confirmer to **force-write** its time — to move
or extend it past what the underlying Candidate covered. When they do, the
Availability of the Friends already on that Hangout is extended to cover the new
time.

That breaks the otherwise clean rule the whole schema rests on: *a Friend may
only write Availability rows where `auth.uid() = friend_id`*. It is the single
place in the product where one Friend mutates another Friend's data.

Two ways to permit it:

- **Flat trust** — let any Friend write any Friend's Availability, and have RLS
  check only group membership. Trivially simple, and arguably honest about five
  friends trusting each other.
- **Narrow hole** — keep Availability self-write-only, and add one
  `security definer` Postgres function permitted to *extend* Availability, only
  for Friends already Participants on the Hangout, and only to cover that
  Hangout's range.

## Decision

The narrow hole. Availability stays self-write-only at the RLS layer; exactly
one audited server-side function may extend another Friend's Availability, and
only ever **extend** — never shorten, never delete.

Extensions are **not reverted** when a Hangout is cancelled or retimed shorter.

## Consequences

- There is one choke point to audit and test for "can someone else change my
  calendar", instead of an open permission that any bug can walk through.
- Costs an extra piece of Supabase machinery (a `security definer` function) in
  a codebase that otherwise has no server-side logic at all, and the team is new
  to Supabase — so the function's shape is researched before it is written.
- Not reverting extensions means no provenance tracking on Availability rows
  (no "this half-hour was added by Hangout X"), which keeps the row shape
  minimal at the cost of leaving behind Availability the Friend never drew.
- If flat trust is ever wanted, collapsing to it is easy; the reverse is not.

## Refinements (2026-08-29, from research ticket 02)

- **The RPC takes exactly one argument: the hangout id.** A
  `(friend_id, start, end)` signature running with elevated rights is strictly
  *worse* than the flat-trust option this ADR rejected — the same power, behind
  a safer-looking name. Deriving the participants and the time range from the
  stored hangout row is the entire reason the hole is narrow.
- **Unresolved sharp edge.** Supabase's RLS guide says "never create a
  `security definer` function in a schema listed under Exposed schemas" — yet
  `supabase.rpc()` requires exactly that. The caution reads as aimed at policy
  *helper* functions rather than intentional RPCs, but **no page states that
  carve-out**. Resolve in ticket 07 before writing the function; do not assume.
- **`with check` is load-bearing.** The availability `update` policy needs
  `with check`, not only `using` — otherwise a Friend can update their own row
  and reassign `friend_id`, opening a second cross-Friend write path that
  bypasses this ADR entirely.

## Amendment (2026-09-02, from issue 10) — the RPC takes three arguments

**Superseding the first refinement above.** The function is
`retime_hangout(hangout_id, starts_at, ends_at)`, not `extend(hangout_id)`, and
it performs the move as well as the extension.

The refinement's one-argument rule was written to keep the hole narrow by
deriving everything from the stored row. Implementing it exposed a
chicken-and-egg that one argument cannot resolve: a retime needs the
Participants extended to the **new** range, and until the row has moved the
stored row only knows the old one.

- **RPC then update** extends everyone to the range the Hangout is *leaving* —
  the one range they already covered by definition.
- **Update then RPC** is two statements outside a transaction, which PostgREST
  cannot span and this project has no server for (ADR-0001). If the second
  fails, the Hangout has moved to a time nobody covers, and **the drop trigger
  cannot repair it** — that trigger fires on an `availability` delete, and no
  Availability was deleted. Compensating client-side, the way issue 09 does for
  a failed Participant seed, does not work either: the `update` back can itself
  be refused by the exclusion constraint if somebody took the old window in
  between.

So both happen in one statement, in one transaction, and the range is an
argument because the caller is what chooses it.

**This is not the `(friend_id, start, end)` signature this ADR rejected.** That
one is "write any Friend's calendar, anywhere", behind a safer-looking name.
This one still derives **who** from the stored row — the Participants of that
Hangout whose `left_at` is null — and by the time it returns, the range it wrote
*is* the Hangout's own range, because the same statement put it there. The
invariant the narrow hole bought is intact: nothing this function writes is
Availability that no Hangout covers.

What the extra arguments do cost, recorded rather than glossed: the function is
no longer *only* an extension, so "the RPC" and "the retime" are now the same
object. A future second reason to extend somebody's Availability cannot reuse
it, and should not be given a range argument on this precedent — it should
derive its own, or this ADR needs revisiting properly.

The remaining refinements stand unchanged: `search_path = ''`, explicit
revoke-then-grant, insert-only, and `with check` on the `availability` update
policy.
