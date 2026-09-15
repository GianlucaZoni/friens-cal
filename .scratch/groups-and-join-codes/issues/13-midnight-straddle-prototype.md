# 13 — Prototype: a run that crosses the viewer's midnight

Type: prototype
Status: resolved

## Question

Graduated from [ticket 08](08-whose-time-zone.md), which decided the grid draws
the **viewer's** zone and created this problem in the same stroke.

A run that is one continuous evening for the Friend who drew it is **two column
fragments** for a Friend far enough east or west. Under one shared zone that
happened only to genuinely late-night plans, which is rare and arguably deserves
to look unusual. Now it happens to *every* evening Candidate viewed from far
enough away, which is the common case in the only kind of cal that made this
whole ticket worth opening.

The machinery half exists and is worth reading before drawing anything:

- v1's ticket 06 built **over-drag across midnight**, so a drag already knows
  how to produce a run that spans two columns.
- `whenOf` already spells the copy: `22:00 – 01:00 Sun`, and `insideLabel`
  already handles a container whose date differs from the card's.
- `runsOf` in `slots.ts` reassembles a run **within one day's rows**. Two
  fragments are two runs as far as the grid is concerned, and nothing above it
  knows they are the same evening.

What does not exist is anything visual. Make the ugly version and react to it.

1. **The week grid.** Does a split run need a continuation marker at the bottom
   of one column and the top of the next, or is the date in the column header
   enough? A marker has to survive the case where the run continues into a
   column that is **off screen** (a Sunday evening run in a week view), which is
   the case that makes a naive arrow lie.

2. **Does it change the composite?** The heat ramp is per slot, so the wash
   itself is already correct on both sides of midnight. The question is whether
   two adjacent washes that are one run read as one thing, or as two nights that
   happen to touch the boundary.

3. **The month cell.** `month.ts` reduces a day to its **peak** count, and
   ticket 14's cell merges contiguous days into one rectangle. A day holding
   half a run has a peak that is honest about the day and dishonest about the
   evening. Does the merge rule need to know about runs, or is that a rendering
   the month view should simply not attempt?

4. **The Candidate card.** A card for a straddling run already reads correctly
   (`Sat 6 Sep` / `22:00 – 01:00 Sun`). Check it against the grid: clicking a
   card that names one evening and highlights two columns is the moment the
   split becomes confusing rather than merely ugly.

5. **Is any of it worth building?** A legitimate outcome. The live cal is three
   Friends in one country and this is invisible to them. Ticket 08 filed this as
   a ticket rather than as fog because the question is sharp, not because the
   answer is urgent: it may sit on the frontier for a long time, and "the
   fragments are fine, the header carries the date" is a real answer.

## Staging it

The prototype needs a cross-zone scenario, which no amount of looking at the
deployed app will produce. Cheapest route is to render the grid twice side by
side from the same Availability, once in `Europe/Rome` and once in something
eight or nine hours away, since `slotsOfDay` and `whenOf` both already take the
zone as a parameter (ticket 08 §1). That also makes the answer legible to the
human without them having to imagine the far side.

Prototypes go on a `prototype/13-midnight-straddle` branch, not on `main`.

## Answer

**Variant B, and nothing else.** The week grid's own run loses its cap at a day
boundary it continues through and grows a chevron there; the composite is left
alone, the month is left alone, the Candidate card needed nothing, and it is
worth building now — for a reason that has nothing to do with time zones.

Branch `prototype/13-midnight-straddle`, commit `b2db46c`. Run it at
`/prototype/midnight-straddle`; the route is outside both gates and every byte
of data is stubbed in memory, so nothing there touches Supabase. The bar at the
bottom switches the three markers, six far zones, four views and the composite
toggle. The harness mounts the **real** `WeekGrid`, `MonthGrid` and
`CandidateCard` twice over one store — the zone is now a prop on all three,
defaulted to `GROUP_TIME_ZONE` so the app is byte-identical without it.

Two findings outrank the five questions, and the first one contradicts this
ticket's own framing.

### 1. The premise is a band of offsets, not a distance — and the case it missed is commoner

This ticket says a split "now happens to *every* evening Candidate viewed from
far enough away". Measured, that is wrong, and wrong in a way that matters for
what gets built.

A run splits only when the far viewer's midnight falls **inside** it. For a
20:00–23:30 evening that is an offset of roughly **+0:30 to +4:00** from the
drawer — Moscow, Dubai, Kolkata. Further east it does not fragment at all: at
Tokyo's +7 the whole evening is one clean 03:00–06:30 block **on the
Wednesday**. Further west it slides into the same day's afternoon. "Far enough
away" is exactly backwards; past four hours the problem stops being a split.

What replaces it is worse and no marker addresses it: at a large offset the run
lands **whole, on a day nobody drew on**. A Friend who drew Tuesday evening is
in the Wednesday column, and there is nothing to say otherwise — nor should
there be. **Availability is slot rows, not a run with a home day** (ticket 07):
the far viewer's Wednesday genuinely holds those instants, the Candidate card
genuinely reads `Wed 23 Sep`, and there is no stored fact that a marker could
render. This is recorded as *nothing to build* rather than as a new ticket,
because the question has no referent in the data.

### 2. Where it does split, it splits into a sliver

The ugly version is uglier than the ticket predicted. Kolkata, +3:30: Tuesday's
20:00–23:30 becomes **one 30-minute block at the bottom of Tuesday** plus three
hours at the top of Wednesday. At `SLOT_PX` the sliver is 20px tall with a
rounded cap on both edges, and it reads as a mis-click rather than as the start
of an evening. The two fragments sit ~960px apart in the scroller, so **no
scroll position shows both**, which is the whole of why the ugly version had to
be built rather than reasoned about.

That sliver is what settles Q1 against `none`. It is not merely unusual-looking;
it is an artefact that looks like a bug in the drawing.

### The five questions, settled

**1 — The week grid. Open edge and a chevron (B).** The block drops its border
and its radius on the edge it continues through, and a 10px chevron sits in the
boundary. `C`, which adds the words (`to 03:00 Wed`), lost on two counts: the
label **truncates to `to …` at week-column width** — ~33px, which is exactly the
width where splits are commonest — and the Candidate card two inches to the
right already spells the crossing correctly, so the words would be the second
telling.

**The off-screen case dissolved rather than being solved.** This ticket feared
"a marker that has to survive the run continuing into a column that is off
screen", and the fear was of a *naive arrow*. A chevron pointing **down** is not
an arrow at a column: *there is more below the bottom of this day* is true
whether or not the next column is drawn. The lie was in the rightward spelling
nobody built.

One thing the build must carry, because it is the only part that is not obvious:
**continuation is asked of the store, not of the columns on screen.** `edges` in
`DayColumn` probes `isFree(viewer.id, firstSlot − SLOT_MS)` and
`isFree(viewer.id, lastSlot + SLOT_MS)`. A marker derived from the neighbouring
*column* cannot exist for the last column of the view, which is the Sunday case
this ticket opened on.

**2 — The composite is left alone.** A band has no identity to preserve. Nobody
clicks one, `answerAt` answers per **segment** and not per band, and
`CONTEXT.md` is explicit that a band is not a run — it is a stretch where
anybody is free. Marking it would double the marker density on the grid to
answer a question no reader asks of the wash. Built as a toggle and switched
off.

**3 — The month should not attempt it, and the phantom day is accepted.** This
ticket asked whether the merge rule needs to know about runs. It does not: the
merge rule is not what is wrong. What the harness found is that the far
viewer's month holds **one more day than the drawer's** — Rome's merged
rectangle covers 22–24 and 26–27, Kolkata's covers those *and 28*, alone in the
next row, holding nothing but the 2½-hour tail of Sunday's evening.

That day is not a rendering artefact. It really does hold Availability in that
viewer's calendar. What is dishonest is the wash: `peakOf` is **peak
concurrency**, so a day holding 2½ hours at peak 3 is painted exactly as dark as
a day holding a whole evening at peak 3. Fixing that needs a duration channel,
and **ticket 15 spent opacity and forbade a second one**. So it is left, the
chip and the day panel tell the truth on tap, and the phantom day is recorded as
accepted rather than shrugged at.

**4 — The Candidate card needed nothing, and it is the authority.** Measured
rather than assumed: `scanCandidates` runs on instants, so **both panes hold
byte-identical windows in identical rank order** and only the words move. The
same Candidate reads `Tue 22 Sep / 20:00 – 20:30` in Rome and
`Tue 22 Sep / 23:30 – 24:00` in Kolkata; a straddling one reads
`Sun 27 Sep / 23:30 – 02:30 Mon`. `whenOf`'s crossing spelling and
`insideLabel`'s differing-date case were both already correct, which is ticket
08 §1's "the switch is one hook plus twenty import lines" holding for a second
time.

So the reading order is settled the other way round from how this ticket framed
it: the card is not the thing that becomes confusing next to a split grid, it is
the thing that **resolves** the split grid. The chevron's job is only to stop
the sliver reading as a fault.

**5 — Worth building, and the reason is not time zones.** The marker is not
gated on the cal spanning zones the way ticket 08 §6's `GMT+2` suffix is,
because **the split already ships**: a Rome Friend drawing 22:00–01:00 today
gets the same two fragments and the same uncapped edge. Ticket 08 filed this as
a consequence of per-viewer rendering; it is really a defect v1 has had since
over-drag across midnight was built, which per-viewer rendering merely makes
common. That makes it the one piece here that pays for itself before anybody
travels — and it is small: an `edges` memo, two booleans per run, four
directional insets in place of one spread ring, and a chevron.

### Carried forward to the build

- The run's ring becomes **four directional `inset` shadows** rather than
  `inset 0 0 0 2px`, so an open edge can drop its own bar. With both edges
  capped it is the same two pixels.
- `edges` probes the **store**, one slot either side, and `reach` is only needed
  for the rejected `named` variant — the shipped marker needs the two booleans
  and nothing else.
- The prototype's `timeZone` prop on `WeekGrid`, `MonthGrid` and `CandidateCard`
  is the shape ticket 08 §1 predicted, and is throwaway here only in the sense
  that the build will thread the viewer's zone through the same three seams.
- `useMonthGesture` was deliberately **not** threaded. §3's question is about
  reading a month cell; drawing one still writes the near zone's day boundaries
  in the prototype, and the build has to fix that as part of ticket 08's switch,
  not this one.

### State of the checks

`yarn typecheck` clean. `yarn lint` **9 errors**, all pre-existing. `yarn test`
untouched — nothing here has a test, which is correct for a throwaway.
