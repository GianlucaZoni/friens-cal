# 08 — A run that crosses the viewer's midnight

Status: done
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

- [x] A run continuing past a column boundary draws an open edge and a chevron
      at that boundary
- [x] Continuation is computed from the store, not from the columns on screen,
      so a run continuing off the visible week still marks
- [x] A 22:00–01:00 run drawn by a Friend in the viewer's own zone marks at both
      fragments
- [x] The composite, the Candidate card and the month lattice are otherwise
      unchanged
- [x] The month shows the phantom day for a tail that crosses midnight
- [x] `npx tsc -b` is clean, `yarn test` passes, lint unchanged at nine

## Blocked by

- [07 — The grid draws the viewer's time zone](./07-per-viewer-time-zone.md)

## Built

One new module and one component changed. Nothing else in `src/` moved.

- **`src/availability/continuation.ts`** — pure, `@/`-free, tested under plain
  Node. `withContinuation(runs, slots, isHeld)` decorates a column's runs with
  `continuesBefore` / `continuesAfter`, which is the whole of the logic.
- **`src/availability/week-grid.tsx`** — the run's ring became four directional
  inset shadows so a single edge can be dropped, an edge that continues loses
  its radius and its border, and `ContinuationMark` puts a 10px chevron inside
  it.

`month.test.ts` gained one test that does not change anything: it pins the
phantom day.

### Six decisions the slice had to make

**1. The rule is the column's edge AND the store, not the Slot next to the
run.** Those two come apart, and the case that pulls them apart is already in
the product: `runsOf` is handed the gesture in flight as well as the committed
Slots, so an erase draft opens a hole at 23:30 in a block the store still holds
whole. Phrased as "the Slot after the run is held", that run grows a chevron in
the middle of the column. Phrased as "the run reaches the column's own last row
and the store holds the Slot past it", it does not. There is a test named after
it.

**2. The probe goes to the store rather than to the draft, and that costs
something.** A draft's cells are keyed by column (`draftCell`), so a column
cannot see what its neighbour's half of an over-midnight drag holds. The
consequence, stated rather than hidden: a drag across midnight grows its
chevrons when it commits, not under the pointer. Reaching for the neighbour's
draft would mean threading a second column's row count into `DayColumn` to buy
a marker that is correct half a second early.

**3. Two probes per column, not two per run.** Only a run at the column's own
edge can be marked, so `continuesBefore` and `continuesAfter` are each asked
once and then ANDed with the run's position. On a week that is fourteen
`isFree` calls.

**4. The ring is four `inset` shadows.** One `inset 0 0 0 2px` spread cannot
drop a single side, and an open edge that kept its bar reads as a closed block
with a gap in its border. With both edges capped the four shadows are the same
two pixels, so every run that does not cross midnight is drawn exactly as
before — checked side by side against the old spread before the change went in.

**5. The words go in the `aria-label`, and nowhere else.** The grid stays
wordless: prototype 13 measured the named variant truncating to `to …` at
week-column width, which is the width where splits are commonest. But the
chevron is `aria-hidden`, and without a change the sliver reads out as *"You are
free 23:30 to 24:00"* — which is the mis-click reading, in words, to the one
reader who cannot see the marker. So the block's own sentence carries it:
`…, carrying on into the next day`. This is the one place the slice added text
that the ticket's "no label" could be read as forbidding. It is not variant C:
it is never drawn, it names a day rather than a direction, and it costs the
column no width.

**6. Not gated on the cal spanning zones, and not gated on a zone at all.** The
predicate never reads a wall clock. A Rome Friend drawing 22:00–01:00 in Rome
gets both marks today, which is the v1 defect prototype 13 §5 found underneath
the time-zone framing.

### What was not touched, deliberately

The composite (`HeatWash`), the Candidate card, the month lattice and
`day-panel.tsx` are byte-identical. A band has no identity to preserve —
`CONTEXT.md` is explicit that a band is not a run, `answerAt` answers per
segment, and marking it would double the marker density to answer a question
nobody asks of the wash.

**The phantom day needed no code.** It is a consequence of ticket 07: every
month cell is already swept against the viewer's own day. What this slice added
is a test saying so out loud, including the part that is dishonest — `peakOf` is
peak concurrency, so a day holding a 2½-hour tail at peak 3 is painted exactly
as dark as a day holding a whole evening at peak 3. Ticket 15 spent opacity and
forbade a second channel, so that is accepted, and the test is there so the next
person finds the decision instead of a bug.

### What was verified, and how

Unit tests for the rule, and the real `WeekGrid` in a browser for the pixels.

Nothing was run against the live database. For the visual check the grid was
mounted on `/design-system` over an in-memory store — a temporary edit to
`src/pages/DesignSystem.tsx`, reverted before the branch was reported, and the
route is outside both gates. The store's `draw` and `erase` were no-ops.

Four blocks on one week, in Rome, at `SLOT_PX`:

```
"You are free 22:00 to 24:00 on Tuesday 15 September, carrying on into the next day"
"You are free 00:00 to 01:00 on Wednesday 16 September, carrying on from the day before"
"You are free 19:00 to 22:00 on Thursday 17 September"
"You are free 23:30 to 24:00 on Sunday 20 September, carrying on into the next day"
```

The Tuesday block runs to the foot of its column with no bottom border, no
radius and a chevron in it; the Wednesday one is open at the top with a chevron
pointing up; the Thursday one is capped at both ends and looks exactly as it
did before this branch. The Sunday sliver is the off-screen case: the Monday it
continues into is not a column in that view, and it marks anyway.

```
npx tsc -b        clean
yarn lint         ✖ 9 problems (9 errors, 0 warnings)
yarn test         ℹ tests 278
                  ℹ pass 278
                  ℹ fail 0
```

`continuation.test.ts` is eleven of those: the run that ends at midnight and
does not mark, the run that crosses and marks on both fragments, the
mid-column run that never marks whatever the store holds, the Rome evening read
at +3:30 as a 30-minute sliver plus a head, the same evening in its own zone
splitting not at all, the 46-row and 50-row Sundays at both of their own
boundaries, and a run continuing off the visible week.

### What was left behind

- **A drag that crosses midnight shows no chevron until it commits.** Decision
  2 above. Visible for the length of one drag, and correct the instant the
  write lands.
- **A run's two fragments still have no shared identity.** Two booleans, by
  choice: the marker's job is to stop the sliver reading as a fault, and
  prototype 13 §4 settled that the Candidate card is what resolves the split.
  Nothing here pairs the fragments, names the far end or reaches for `reach`,
  which the prototype needed only for the rejected variant.
- **A run that lands whole on a day nobody drew on is still unmarked**, and
  nothing here tried. Prototype 13 §1 recorded it as *nothing to build*:
  Availability is Slot rows and there is no stored fact that a run has a home
  day.
- **The phantom day's wash still oversells it.** Accepted by the planning
  ticket; it needs a duration channel and ticket 15 forbade one.
