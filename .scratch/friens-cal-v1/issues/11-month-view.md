# 11 — Month view

Status: ready-for-agent
Blocked by: 07

## Parent

[friens-cal v1 map](../../shared-availability-calendar/map.md)

## What to build

The second calendar view. **Month is not a shrunken week** — the week composite
was prototyped at month-cell size and reads as a corrupted thumbnail. Month has
its own visual language.

At ~78×72px per cell:

| Channel | Carries |
| --- | --- |
| **Wash** in the viewer's hue, opacity ∝ **peak concurrency** | how good is this day |
| **Avatars**, overflow **wrapping**, never `+N` | who |
| **Ring** on your own Availability | am I in it |
| **Hangout marker chip** (mandatory) | something is booked |
| **Today pill**, selected-day treatment | where am I |

**No numeral.** Peak in the wash is what makes the avatars sufficient: two days
with identical avatar rows can have peak 1 and peak 9, and the wash separates
them.

**Contiguous days of your own Availability merge into one rounded rectangle** —
which is also what a click-drag across several days produces, so the gesture and
its result look like the same object.

**Drawing in month view means 00:00–24:00 for the dragged day.**

**The Hangout chip is mandatory, not decorative.** The Candidate pipeline blanks
a Hangout's slots, so a day whose whole group was free 20:00–23:00 with a
Hangout on exactly that window renders **peak 0 — the emptiest cell of the
month** — over its own best day. The chip is what stops the cell lying.

Own-Availability marking must **not** use the cell edge: it is already spoken
for four times (grid rule, today, selected, Hangout glow) and the Hangout border
wins. The today pill keeps the date numeral, so the two never contend.

Clicking a cell opens the information popover. Ticket 05's hover panel does not
transfer — it is three month columns wide with no safe direction.

Prototype: `src/prototypes/month-cell/`.

## Acceptance criteria

- [x] Month grid at realistic cell size, both themes
- [x] Wash opacity is **peak concurrency**, not coverage
- [x] Avatars wrap; no `+N`; verified at 3, 5 and 8 Friends
- [x] Avatars never render below a ~12px floor — below it, shape stops
      disambiguating and two near hues read as one Friend
- [x] Your own Availability rings, and contiguous days merge into one rectangle
- [x] Today pill and selected-day treatment, neither contending with the ring
- [x] A day fully covered by a Hangout shows the chip and is not readable as empty
- [x] Drag in month view writes 00:00–24:00 for each dragged day
- [x] Click opens the information popover
- [x] `npx tsc -p tsconfig.app.json --noEmit` is clean

## Blocked by

- [07 — Everyone's Availability as a heatmap](./07-heatmap.md)

## Built

`src/availability/month-grid.tsx` replaces `calendar.tsx`'s `MonthLattice` stub,
with `month.ts` (the arithmetic, tested), `use-month-gesture.ts` (the pointer),
`day-answer.ts` and `day-panel.tsx` (what a click opens). `load-state.tsx` came
out of `week-grid.tsx` because both grids need it and neither could do without
it. **No SQL** — the month writes through `useAvailability`'s existing
`draw`/`erase` and issue 10's `useEraseGuard`, and nothing about the schema came
into question, which is what the ticket said it should not.

**The prototype is not at `src/prototypes/month-cell/`** — that directory does
not exist in this repo. The measurements are in
[`prototypes/14-month-cell.md`](../../shared-availability-calendar/prototypes/14-month-cell.md),
and its reported blobatar `TONES` bug is **already fixed** in `identity.ts`
(`TONE_VALUES` holds band interiors, and `identity.test.ts` pins the reason).

### The decisions this slice had to make, not just carry

1. **The wash is raw Availability, and a Hangout day is the *darkest* cell of
   the month.** Ticket 14's `### Carried forward` says it would read as peak 0,
   the emptiest cell, because ticket 09 blanks a Hangout's Slots. Blanking is
   step 3 of the *Candidate* pipeline and nothing else renders from its output;
   the week's wash is raw `isFree` and `segmentsOf` blanks nothing. Both readings
   were defensible — *how busy is this day* against *how good is this day for a
   NEW plan* — and raw wins because it is the only one under which the two grids
   are **one sentence**: *opacity is how many of the Friends you are trying to
   meet are free at once; the week says it half hour by half hour, the month for
   the day's best half hour.* Blanking would have needed two rules for one
   channel, one keystroke apart, which is the failure ticket 14 Q6 named about
   coverage versus count. The chip stays mandatory for the **opposite** reason:
   it no longer stops the cell reading as empty, it stops it **overselling** a
   day whose best window is already spoken for. Recorded as an amendment on
   ticket 14; `month.ts` carries the argument and `heat.ts` now points at it from
   the week's side.
2. **The wash therefore shares `heat.ts` outright** — one ramp, one denominator
   (`counted.length`), one pair of per-theme numbers. It is the same measurement
   under a different *reduction*, so a second ramp would have been a second thing
   to tune and a second place to disagree. `heatFraction`'s existing degenerate
   case already renders `peak == 1` as the faintest wash, which is exactly what
   `## Decisions` asked for, and `peak == 0` paints nothing at all because
   `segmentsOf` emits no segment for a span nobody is free in.
3. **A click inspects; it does not select.** There is no selected-day state —
   **the selection IS the anchor** — so a cell click that moved it would
   re-label the bar on every out-of-month press, re-lay the grid out from under
   the press that made it, and move the week you return to, all as a side effect
   of reading. The anchor is *marked* where it falls, which is honest here in a
   way it is not next door: `mini-calendar.tsx` argues that in week view "the
   grid's unit is a week and a single selected day would understate it", and the
   month's unit is a day. The panel then carries **`Show this week`**, the one
   act that moves the anchor and changes the view together.
4. **`shownDays`, and it closes a hole rather than tidying one.** `calendar.days`
   is the anchor's *week* in both views, and `floorOfView` reads the first day it
   is handed — so a month whose lattice starts up to five weeks earlier rendered
   cells from a range Postgres had never been asked for, with `status` already
   `ready` because the floor it *was* asked for had arrived. A month of unfetched
   Availability is indistinguishable from a month nobody drew anything in, which
   is the exact confusion `LoadState` exists to prevent. `useCalendarView` now
   also exposes the view's own days, both stores read over them, and the month
   grid draws the same array — so the cells and the rows cannot disagree by
   construction. Forward navigation was never affected (the boot read is
   unbounded above); only backwards.
5. **Where the three where-am-I marks go, and it is not the cell edge.** The
   edge is spent four times over on a 78×72 box, so **the numeral row carries
   both**: today keeps its filled pill, the selected day rings that pill, and the
   two together are a filled pill *with* a ring — the third state prototype 14
   asked for. That is what freed the inner rectangle for your own Availability,
   and it is why ticket 14 kept the pill for today rather than spending it on the
   own-Availability marker the prototype recommended.
6. **The chip carries the wall clock, and it comes off the day's own Slots.**
   No title (78px cannot hold one legibly) — but the week block omits its *time*
   because its position and height already say it next to the gutter, and a month
   cell has no such geometry, so here the time is the whole of *when*. It is
   `slots[run.start].label` from `runInColumn`, so a plan that began the evening
   before reads `00:00` and there is no fourth spelling of a wall clock.
7. **Spill days are drawn in full, on a neutral ground.** Dimming them was the
   obvious thing and it is forbidden: opacity means *how many Friends are free*,
   so a faded leading week would report a smaller count for days whose rows the
   store actually holds — and the leading and trailing weeks are exactly where a
   month's edges get planned. `bg-muted/40` behind the wash is a channel nothing
   else spends.
8. **`hangout.ts` is not split.** Issue 10 named the seam and said the month was
   the moment to take it *if the month needed coverage*. It does not: the month
   reads `nameOf`, `isPast`, `isHappening` and `runInColumn`, and the coverage
   half stays behind `useEraseGuard` where issue 10 put it. Splitting on a
   consumer that does not consume it would have been a refactor with no caller
   asking for one.
9. **The gesture is its own hook, and it deliberately does not capture the
   pointer.** The week's machine is built on a `SlotAddress` and every rule in
   `gesture.ts` is about that lattice; the month's unit is a day and its selection
   is one contiguous range of them. What is shared is what is worth sharing —
   `isDrag`'s 4px and `wholeDay`'s refusal to believe in 48. The cells are real
   `<button>`s so a keyboard can reach a day, and `setPointerCapture` would have
   needed a `preventDefault` that stops a button taking focus, so move and
   release are **window listeners registered on pointerdown**. That also makes a
   drag released outside the grid commit rather than hang, which is the case
   capture was buying — and it is why the drag below could actually be *driven*.
10. **`data-month-day`, not `data-day`**, which `react-day-picker` already
    spends on all 42 cells of the mini calendar. Scoping the query to the grid's
    own ref is what makes it correct, so the rename only buys that a
    document-wide query cannot silently return somebody else's calendar. It
    already had: the first verification pass counted 105 cells.
11. **`CardDetail` gained `side`, `align` and `nativeButton`, all defaulted.**
    A month cell opens the *same* detail — ticket 16's `(hover: none)` split
    holds whether the trigger is a sidebar card or a grid cell — but its
    placement is ticket 14's ("below the whole week row"; beside a cell there is
    no safe direction) and its trigger is a **position** rather than a control,
    exactly as `SlotPopover`'s is. Three optional props beat a third arrangement.

### Verified in the browser, driving the real UI at 1440×900

- **The lattice.** 35 cells, `Mon 31 Aug` → `Sun 4 Oct` for September 2026, and
  five equal rows (164.7px × 4 + 163.7 for the one with no bottom border, which
  the overlays' percentages depend on).
- **The wash is the shared ramp, arithmetically.** Fri 4 Sep paints
  `oklch(0.62 0.105403 275)` at opacity **0.31**, which is
  `heatFraction(2, 3) = 0.5` through `HEAT_ALPHA.light` — `0.14 + (0.48−0.14)×0.5`.
  In dark it becomes `oklch(0.75 0.127503 275)` at **0.27**, the dark pair's
  answer to the same fraction. **Nothing in the month asks which theme is on**;
  the cascade does it, which is the invariant `heat.ts` and `ui-colour.ts` were
  built for and which the month inherited by reusing them.
- **The avatars, at the prototype's own cell size.** With the cell forced to
  78×72, 3 → one row, 5 → one row of five, **8 → two rows of five, still 12px
  each**, and the Hangout chip still 4px off the cell's bottom edge in all three.
  Wrapping, never shrinking, never `+N`, never below the floor. At the width the
  grid actually renders (128px) all eight fit on one row.
- **One rectangle across seven days.** The whole first week is the viewer's, and
  it draws as a **single** box at `left 275, width 890` in a row of `left 272,
  width 896` — inset 3px each side, `inset-y-[3px]`, bordered in the viewer's
  hue with the same `inset 0 0 0 2px` ring the week block uses.
- **Today and selected, on the numeral.** Wed 2 Sep's pill is 17×17,
  `bg-primary` with near-white text **and** a 1px `foreground/50` ring — the
  filled-pill-with-ring third state, in a cell whose own Availability marker is
  elsewhere.
- **The chip, and the name it does not carry.** Fri 4 Sep reads `⚲ 12:30`, and
  the panel names it `goopy · Fri 4 Sep · 12:30 – 20:00`. That closes the
  obligation issue 09 left on this ticket and issue 10 restated — *"a cell size
  where a name may not fit at all"*. It fits in the panel.
- **The panel opens below the week row**, at `top 245` under a row ending at
  `241`, carrying `2 free at once · 6 windows`, the Hangout, six windows with
  20px faces (`alt` on each, so the name is reachable — well clear of the 12px
  floor, which is where ticket 11's shape defence actually holds), and the three
  actions. The last window on Sat 5 Sep reads `22:00–24:00`, which is
  `closingLabel` rather than a range running backwards.
- **The tri-state on the two writes.** Fri 4 Sep offers both (`some`); after an
  erase it offered only `I'm free all day` (`none`).
- **The drag, actually driven** — the wall issues 08, 09 and 10 all hit, walked
  round by not capturing the pointer. `Sun 20 → Mon 21 Sep` mid-drag drew **two**
  dashed rectangles, one per row, which is the row-boundary case; release wrote
  **exactly 96 rows**, `2026-09-19T22:00Z` through `2026-09-21T21:30Z`, and
  `Tue 22` was untouched. With the Erase toggle on, the same drag drew both
  rectangles in the destructive colour and took all 96 back.
- **And the DST day, against Postgres.** A drag on `Sun 25 Oct 2026` wrote
  **50 rows**, with `02:00 GMT+2` *and* `02:00 GMT+1` both present and the day
  closing at `23:30 GMT+1`. That is the acceptance criterion's real content: a
  hardcoded 48 writes an hour that does not exist in March and misses one here.
  The erase drag removed exactly those 50.
- **Issue 10's gate, from the month.** `Erase this day` on a day carrying a
  Hangout the viewer is a Participant of raised the plural dialog, singular:
  *"Erase this availability? It is holding you on a confirmed hangout. Erasing it
  drops you from: Hangout / Sat 5 Sep · 12:00 – 15:30"*, with no auto-cancel line
  because somebody else was on it. **`Keep it` wrote nothing** — 15 Slots still
  held afterwards. This is the dialog issue 10 could only read rather than press,
  and a whole-day erase is the worst case it exists for.
- **The fetch hole, closed and observed.** Navigating October → September →
  August → July issued reads at `2026-07-26T22:00Z` and `2026-06-28T22:00Z` —
  Mon 27 July and Mon 29 June, the **first cells of the August and July
  lattices**, not the anchor's Mondays. September needed no read at all, because
  its lattice opens on the boot floor. Before the fix those leading weeks had
  nothing behind them.
- Console clean, in both themes. No Base UI trigger warning either, which is
  `nativeButton={false}` arriving where `SlotPopover` already needed it.

### One thing worth recording about how this was verified

The dev server talks to the **live** project and the demo data is the only copy.
Pressing `Erase this day` on Fri 4 Sep to see whether the drop dialog would fire
**erased the viewer's whole day**, because the viewer is not a Participant on
`goopy` — the gate was right and there was nothing to warn about. It was
reconstructed exactly (`12:00–15:30` and `18:00–22:00`, derived from the panel's
six windows and their counts, cross-checked against the two Candidates the
sidebar had shown), and the repair itself went wrong once because `.env`'s
`FRIEND_TEST_EMAIL` is **Gianluca** while the browser session is **UserTwo**;
`02-availability.sql` makes inserts self-only, so the fix was to reach the app's
own authenticated client with `await import('/src/lib/supabase.ts')`. Everything
after that used issue 10's **confirm → verify → cancel** round trip, which ends
byte-identical. The database is back to two Hangouts (`goopy`, `Coffee`) and
every range touched is back to its prior rows.

### State of the checks

`npx tsc -b` clean for all three projects. `yarn test` **186 passing** — 172 from
issue 10 plus 14 in a new `month.test.ts`, which pins the lattice's row count at
four, five and six rows, the 46/48/50-Slot whole-day stroke, peak concurrency
against ticket 14's decisive pair (nine free with no overlap versus nine free
together), and the drag's span across a row boundary. `yarn lint` unchanged at the
9 errors already on `main`, all in `src/components/ui/` and
`src/components/grid-pattern.tsx`. `verify-hangout.mjs` 28 checks and
`verify-hangout-lifecycle.mjs` 35, both green and both re-run after the browser
work. `verify-availability.mjs` was **deliberately not re-run**: it ends by
seeding demo rows, and this slice changed no SQL and no write path, so it had
nothing to prove and something to cost.

### Left behind

- **The month drag is mouse and pen only**, like the week's. Issue 13 owns touch,
  and ticket 14's conflict is real and undesigned: tap-to-inspect and
  drag-to-draw are the same rectangle with nothing to carve a target out of. The
  panel's `I'm free all day` / `Erase this day` are the interim, so touch can
  write a day even though it cannot drag one — and they are the discoverable
  route on desktop regardless, per ticket 01's standing correction.
- **Mid-drag a cell can say "nobody free · you are free"**, because `mine` folds
  the draft in and `peak` deliberately does not — the week grid makes the same
  split, so that a draft never paints into the channel that means *how many*. It
  resolves on commit. Worth a look if the aria-label ever gets read aloud
  mid-gesture.
- **A cell clips its avatars before it clips the chip**, by construction
  (`overflow-hidden` on the faces, `shrink-0` and `mt-auto` on the chip). At
  eight Friends in a cell shorter than ~80px some faces are lost, and the panel
  is what restores them. That is the mandate encoded in the layout, but it does
  mean *who* is the channel that degrades first at small sizes — issue 12's
  mobile layout is where that gets tested for real.
- **35 or 42 tab stops.** Every cell is a real button, which is what gives the
  month a keyboard route the week grid has never had. A roving `tabindex` over
  the `grid`/`gridcell` roles would be the next step and no ticket asks for one.

## Review pass

Both axes of `/code-review` against `main`. Four findings acted on, three
answered, one tested and **rejected**.

### Acted on

1. **A false claim in a doc comment, and it was the load-bearing kind.**
   `month.ts` said *"a whole-day stroke is therefore the largest single write in
   the product: 50 rows in one statement"*. It is not: `finish` flatMaps a drag's
   whole span into **one** `availability.draw`, so a week is ~336 rows and a
   drag across the lattice ~2000. Corrected, and the correction is worth more
   than the number — one statement in one transaction is what makes partial
   failure unreachable, and it is the size of that statement that makes the
   erase side's gate load-bearing rather than polite. `use-month-gesture.ts`'s
   `requestErase` note said "48 Slots against every Hangout that day", using the
   literal 48 its own module forbids and under-counting a multi-day drag.
2. **`## What to build` in *this ticket* is now false where it says a Hangout day
   "renders peak 0 — the emptiest cell of the month".** The amendment had landed
   on ticket 14 only. The house convention is append-only and the later section
   wins, so that paragraph stays where it is — but it is the ticket's *contract*
   text, a reader hits it first, and "the later section wins" is a weak defence
   against a sentence that reads as a requirement. **Superseded by decision 1
   above**: the wash is raw Availability, a Hangout day is the darkest cell, and
   the chip is mandatory for the opposite reason.
3. **Ticket 15's consequence is retired here, and nothing said so.** Its live
   answer is unqualified — *"per-Friend colour no longer appears in the grid at
   all"* — and this cell puts eight faces on 35 days. The reconciliation was
   reasoned and then not written down, which is the same as not having it.
   `month-grid.tsx` now carries it: what ticket 15 removed was colour as an
   **encoding**, and that is still gone from both grids (hue carries no number
   anywhere; opacity does). What the avatars carry is identity by **shape**
   first, which is why `## Decisions` says *"avatars (not abstract dots)"* and
   why a dot row is the thing its own `### Contradicts settled decisions`
   rejects — a dot is colour standing in for a person, and at 6px it collapses
   into exactly the h262/h268 collision. So the two grids do not disagree about
   what colour encodes; they differ about *where identity is shown*, and the
   ~12px floor is the whole of what keeps this from being the dot row.
4. **One body, two entry points.** `windowsOf` and `slot-answer.ts`'s `answerAt`
   held the segment→window mapping twice, comment included. `windowOf` is now
   the shared unit and `answerAt` is built from it — a `SlotAnswer` *is* the
   window containing the clicked Slot. The `closingLabel` half is exactly the
   kind of rule that gets fixed in one copy and left wrong in the other. Also:
   one spelling of a column's share of a row (`columns()`), `BookedHere` and
   `Segment[]` named rather than spelled inline, `labelOf(cell, …)` taking the
   cell it is about, and `MonthCell` taking the gesture's two handlers rather
   than the whole object — which is the destructure-first convention the same
   file argues for twice above it.

### Tested and rejected

**"`AVATAR` is exactly 12px, the measured failure threshold; the prototype's
wrap measurement was 16px."** A fair reading, and following it makes the cell
worse. Both sizes were measured in a **78×80 cell carrying a Hangout chip** —
the tightest the grid renders:

| | 3 | 5 | 8 | 9 |
| --- | --- | --- | --- | --- |
| **12px** | 1 row | 1 row of 5 | 2 rows | 2 rows, **nothing clipped** |
| **16px** | 1 row | 2 rows | 3 rows, **2 faces lost** | 3 rows, 3 lost |

16px buys a third more mark and pays by dropping people from the cell — `+N`
without the N, which is worse than what wrapping was chosen over. The prototype
said so about its own number: three rows of three at 16px consumes the body box
exactly, *"zero room left for the own-Availability marker, a Hangout, or anything
else"*. It reached 16px by spending the whole cell, and this cell has a mandatory
chip in it. 12px is the largest size at which the **whole group** still fits.
The measurement is now in `AVATAR`'s comment so the next reader does not have to
re-run it.

That also corrects this ticket's own `### Left behind`, which said faces are
clipped "at eight Friends in a cell shorter than ~80px". They are not: at 12px
nothing is clipped at nine, and the row's `min-h-20` **is** 80px, so clipping
needs a group of eleven or more. The degradation order still stands (faces give
way before the chip) — it is just not reachable at the stated group size.

### Answered, not changed

- **"Nothing in month view can select a day", against the criterion *"today pill
  and selected-day treatment"*.** True, and it is decision 3: the selection *is*
  the anchor, so the treatment marks the anchor and a click no longer moves it.
  What is drawn satisfies the criterion; what the criterion assumed — a
  selection separate from the anchor — is state this app does not have and that
  ticket 12 decided against having.
- **Scope beyond the ten criteria: `I'm free all day`, `Erase this day`, and
  `Show this week`.** Named as added rather than presented as required. The two
  writes are ticket 01's standing correction (a gesture may be the accelerator,
  it may not be the only route) applied to a gesture that is mouse-and-pen only,
  so without them the month is readable on a phone and unwritable on one — and
  the erase is what made issue 10's gate verifiable from this view at all.
  `Show this week` is the counterpart of decision 3, which the ticket forced by
  asking for a selected-day treatment with no mechanism to select. All three are
  reversible and none of them is on the critical path of an acceptance criterion.
- **`'draw' | 'erase' | 'read'` branched at three sites** was flagged as possible
  Repeated Switches. Left alone: the three ask different questions — which kind
  a press starts, whether a move does anything, and what a release commits — and
  a map keyed by kind would put three unrelated answers behind one lookup.

`npx tsc -b` clean, `yarn test` 186 passing, `yarn lint` unchanged at the 9
pre-existing errors.
