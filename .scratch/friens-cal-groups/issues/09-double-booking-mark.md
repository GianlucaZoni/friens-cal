# 09 — The double-booking mark

Status: ready-for-agent
Blocked by: 02

## Parent

[friens-cal — many Groups, joined by Code](../../groups-and-join-codes/map.md)

## What to build

Per-cal Hangouts mean the exclusion constraint stops protecting *you*: two cals
can each confirm 8pm Saturday and neither can see the other. This warns you, and
only you, because they are your own commitments.

**A mark, not an interruption.** A confirm-time modal was the obvious shape and
it is wrong: `candidate-card.tsx:63` states the rule it would have broken —
*confirming needs no dialog*, because retime writes other people's Availability
and confirm writes none. It would have been the first dialog on the one action
deliberately built without one. So the warning moves **earlier**, to where you
are scanning rather than committing.

**One rule keeps it coherent: the mark is on a commitment you could take on,
never on one you hold.** That is why confirming makes the mark vanish from the
card just clicked, and why drawing Availability is untouched at both ends — an
offer is not a commitment.

**There are four acts that make you a Participant, not three.** Confirm, Join,
Rejoin, and retime. Rejoin arrived from the leaving work and is easy to miss.

**There is no all-clear anywhere.** No green state, no "no conflicts" — the
absence of a mark must never be readable as a pass. Which is also why a failed
fetch takes the list's existing failure path rather than quietly drawing
nothing.

**The card carries the time only** — bounded, and it says whether the conflict
matters. The detail view and the retime dialog carry the naming.

**Retime is the best instance of the feature**: its dialog already states
consequences and its picker is live, so the line recomputes as you move the
range and steers you off the collision.

**Snapshot, not live.** Deliberately, so the Realtime work is not bent around a
nicety. It is nonetheless the first consumer wanting data from cals not on
screen.

The read needs **no RPC and no policy change** — ADR-0003's set stays at three.
Blocking was never available: the constraint is per-cal, and preventing this
needs the coupling per-cal Availability exists to remove.

Invisible until somebody is in two cals.

## Acceptance criteria

- [ ] A Candidate overlapping a Hangout you are a Participant in, in another
      cal, carries a mark with the conflicting time
- [ ] The mark never appears on a commitment you already hold, and vanishes from
      the card you just confirmed
- [ ] All four acts are covered: confirm, Join, Rejoin, retime
- [ ] Drawing or erasing Availability never marks anything
- [ ] No green or "no conflicts" state exists anywhere
- [ ] A failed cross-cal fetch takes the list's failure path, not silence
- [ ] The retime dialog's line recomputes as the picker moves
- [ ] A Friend in one cal sees no marks at all
- [ ] Nothing warns you about anybody else's commitments
- [ ] `npx tsc -b` is clean, `yarn test` passes, lint unchanged at nine

## Blocked by

- [02 — Join or create a cal at `/`](./02-join-or-create.md)
