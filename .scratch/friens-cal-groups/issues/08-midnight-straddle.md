# 08 — A run that crosses the viewer's midnight

Status: claimed
Blocked by: 07

## Parent

[friens-cal — many Groups, joined by Code](../../groups-and-join-codes/map.md)

## What to build

**An open edge and a chevron, and nothing else.** A prototype exists on
`prototype/13-midnight-straddle`, which mounts the real grid twice over one
store, and it came back saying the composite, the month and the Candidate card
all need **no** change.

**The premise this was raised on is backwards.** A run splits only where the far
viewer's midnight lands *inside* it, an offset of roughly +0:30 to +4:00. Past
four hours the evening stops fragmenting and instead lands **whole on a day
nobody drew on** — which is commoner, and which nothing can mark, because
Availability is slot rows and there is no stored fact that a run has a home day.

**Where it does split, it splits into a 30-minute sliver** that reads as a
mis-click, with the two fragments about 960px apart in the scroller, so no
scroll position shows both. That sliver is the thing worth beating.

**What ships**: the block's edge is drawn **open** where the run continues past
the column boundary, plus a chevron. The named variant lost because its label
truncates at week-column width, which is exactly the width where splits are
commonest, and the Candidate card already carries the naming.

**The off-screen case dissolved** — a chevron pointing *down* is not an arrow at
a column, so the lie only existed in a spelling nobody built. But continuation
is asked of the **store**, not of the columns currently on screen, and that
distinction is the part the build has to carry.

**The month gains a phantom day** — one more than the drawer's — holding a
2½-hour tail and painted as dark as a whole evening, because `peakOf` is
concurrency and ticket 15 forbade a second channel. Accepted as-is.

**Not gated on the cal spanning zones.** A Rome Friend drawing 22:00–01:00 gets
the same two fragments today, so this is a v1 defect that per-viewer rendering
merely makes common.

## Acceptance criteria

- [ ] A run continuing past a column boundary draws an open edge and a chevron
      at that boundary
- [ ] Continuation is computed from the store, not from the columns on screen,
      so a run continuing off the visible week still marks
- [ ] A 22:00–01:00 run drawn by a Friend in the viewer's own zone marks at both
      fragments
- [ ] The composite, the Candidate card and the month lattice are otherwise
      unchanged
- [ ] The month shows the phantom day for a tail that crosses midnight
- [ ] `npx tsc -b` is clean, `yarn test` passes, lint unchanged at nine

## Blocked by

- [07 — The grid draws the viewer's time zone](./07-per-viewer-time-zone.md)
