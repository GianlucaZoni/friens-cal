# 13 — Prototype: a run that crosses the viewer's midnight

Type: prototype
Status: claimed

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
