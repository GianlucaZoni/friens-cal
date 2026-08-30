# 08 — The Candidate list

Status: ready-for-agent
Blocked by: 07

## Parent

[friens-cal v1 map](../../shared-availability-calendar/map.md)

## What to build

The right sidebar answers "so when can we actually meet". A Candidate is a
**computed** suggestion — a range where two or more non-Hidden Friends are all
free. It is not stored and has no identity.

### The pipeline (ticket 09), client-side over loaded Availability

1. **Horizon** — discard every slot before the start of the current 30-minute
   slot. This clips today's partial day without ever producing a sub-30-minute
   Candidate.
2. **Filter to visible** Friends.
3. **Blank the Hangouts** — drop slots inside any confirmed Hangout's range, for
   **every** Friend, not only its Participants: no second Hangout may exist at
   that time, so a Candidate there could never be confirmed.
4. **Sweep** into atomic runs of `{start, end, friendIds}` over one continuous
   timeline — **do not break at midnight**; a Candidate may span days.
5. **Extend** — for each run with ≥2 Friends, extend outward to the largest
   interval where all of them are continuously free. Dedupe.
6. **Prune dominated** — drop C if some D has `D.friends ⊇ C.friends` **and**
   `C interval ⊆ D interval`.
7. **Sort** — friend count desc → start asc → duration desc → friend-id order.
   Count strictly dominates duration. The last two keys are not cosmetic:
   without them a Realtime update visibly reshuffles tied cards.

Worked example — Marco 18:00–22:00, Sara 20:00–23:00, Luca 21:00–21:30 yields
**two** Candidates: *Marco + Sara 20:00–22:00* and *all three 21:00–21:30*.

**Glow when `2 × friends > group_size`**, group size counting **all** Friends
including Hidden ones — so hiding can only ever *suppress* a glow, never
manufacture one. A true full house additionally shows an **"everyone" pill**.

**Recompute** on: any Availability change (local or Realtime), any eye toggle,
any Hangout change, **a timer aligned to the :00 and :30 slot boundaries**, and
tab focus. That timer is not optional — step 1 makes the list stale with no data
change at all.

### The cards

Date top-left, `everyone` pill top-right, time range bottom-left, **wrapping**
blobatars bottom-right. **No count numeral** — the count is read off the faces,
and blobatars never overlap into a `+N` stack, which hides people on exactly the
cards that matter. The multi-colour border is a **left stripe** in the computed
`oklch` colours, and **the border *is* the glow**: non-glowing cards carry no
hue at all.

A sub-Candidate card annotates its relation ("inside 19:00–21:30"), or the pair
reads as the list repeating itself.

**Flat list, no day headers** — the sort is not chronological, so headers are
impossible without abandoning it. **Everything below the glow threshold collapses
behind "show more"** — not a cap; the cut line is the same `2n > group_size`.

Three empty states, in order: fewer than two Friends visible / no Availability
from now forward / Availability exists but nothing overlaps. The first **rewords
when Hangouts are pinned**, or it reads "show more friends" directly beneath
cards showing those same Friends' faces.

## Acceptance criteria

- [ ] The pipeline is implemented as above and unit-tested, including the worked
      example and a Candidate spanning midnight
- [ ] Domination pruning verified: no card is a subset of another in both axes
- [ ] Sort is stable across recomputes
- [ ] Glow fires exactly when `2 × friends > group_size`; hiding never creates one
- [ ] Slot-boundary timer and focus recompute both re-clip today
- [ ] Cards: wrapping blobatars, no numeral, left stripe, colour only when glowing
- [ ] Sub-Candidates annotate their containing range
- [ ] Sub-glow tail collapses behind "show more"
- [ ] All three empty states, with the pinned-Hangout rewording
- [ ] `npx tsc -p tsconfig.app.json --noEmit` is clean

## Blocked by

- [07 — Everyone's Availability as a heatmap](./07-heatmap.md)
