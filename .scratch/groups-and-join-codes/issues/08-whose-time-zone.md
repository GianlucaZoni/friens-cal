# 08 — Whose time zone does the grid draw?

Type: grilling
Status: open

## Question

The human asked for the time zone to be read from the device. Ticket 01 split
that into two separable things and settled only one: the Group gets a
`time_zone` column, which is what the Group *means* by Saturday. This ticket
settles the other — what the viewer's grid actually draws.

`GROUP_TIME_ZONE` is a constant in `src/shell/use-calendar-view.ts`, currently
`Europe/Rome`, read by the grid, the Candidate cards, the drop dialog and the
month view.

The v1 map ruled per-viewer rendering out of scope, and its reason was good:
"Is Saturday 9pm his Saturday or mine is where all the confusion lives." But it
ruled it out when there was one Group in one city. A Group is now a named row
and a cal of friends split across two countries is representable.

1. **What it actually costs.** Everything is stored as `timestamptz`, true
   instants, so *formatting* per viewer is nearly free. The expense is the **day
   column boundary**: a day starts at midnight somewhere. If the viewer's zone
   draws the columns, then a viewer in London and a viewer in Rome have Saturday
   columns covering different instants, they draw Availability into different
   instants when they both drag "Saturday evening", and a Candidate that is one
   run for one of them can straddle two columns for the other.

2. **The three positions.** Draw the Group's zone for everyone (the column is
   the whole answer, and a Friend abroad sees the cal in the cal's time, which
   is arguably what they want when planning with people at home). Draw the
   viewer's zone (honest about where each person is, at the cost above). Or draw
   the Group's zone and *annotate* when the viewer's differs, which is a third
   thing and possibly the worst of both.

3. **DST.** v1's ticket 07 built the grid from the zone so DST days render 46
   and 50 rows, and `CONTEXT.md` says so in the Slot definition: "twice a year
   that zone gives a day twenty-three hours or twenty-five". Two zones means two
   different days are short, and a week can contain both. Whichever position
   wins has to survive that week.

4. **Copy.** Candidate cards say things like "Saturday evening" (`when.ts`), and
   Hangout times appear in the drop dialog and the month view. If rendering goes
   per viewer, every one of those strings becomes viewer-relative, including the
   ones a Friend screenshots into the group chat.

5. **Does this even need deciding now?** The column exists either way. If the
   answer is "the Group's zone, and per-viewer is a later effort", that is a
   legitimate outcome and cheaper than it looks — but it should be decided, not
   defaulted into by the constant staying where it is.
