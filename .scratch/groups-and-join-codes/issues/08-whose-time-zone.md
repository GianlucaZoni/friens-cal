# 08 — Whose time zone does the grid draw?

Type: grilling
Status: resolved

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

## From ticket 04, which is now resolved

[04](04-group-schema-and-migration.md) added the column and deliberately left it
unread.

- **`cal.time_zone` exists**: `text not null default 'Europe/Rome'`, checked
  against `pg_timezone_names` so a typo fails at write time rather than at
  render time.
- **The client's `GROUP_TIME_ZONE` constant is still the only thing the grid
  reads.** Ticket 04 refused to replace it, because doing so would decide this
  ticket by implementation. Whether the grid draws the cal's zone or the
  viewer's is still entirely open here.

## Answer

**The grid draws the viewer's zone, and the cal loses its clock entirely.**
Both halves are against this session's recommendation, and the second falls out
of the first: once every Friend's grid is their own, nothing is left that ever
asks what the cal means by Saturday, and `cal.time_zone` turns out to have no
reader at all. Ticket 01 kept the column on the grounds that "either way the
column is not wasted". Under this answer it is.

Three things were measured rather than reasoned about, and two of them moved the
outcome.

### 1. Per-viewer formatting is not a cost, because it is already built

§1 called formatting "nearly free". It is closer to done. The zone is a
**parameter** on every function that renders one: `slotsOfDay`, `whenOf`,
`describeSlots`, `floorOfView`, `wholeDay`, `slotContaining`, `useSlotClock`,
and the five the retime dialog spends (`dateValueOf`, `startChoices`,
`endChoices`, `sameClockOn`, `todayValue`). `GROUP_TIME_ZONE` appears at roughly
twenty sites and is only ever passed through. v1 wrote the seam it said it was
not building, and the switch is one hook plus twenty import lines.

### 2. A hybrid already ships, and nobody chose it

`startOfDayInZone` (`src/availability/slots.ts:73`) reads the **viewer's device
civil date** with `getFullYear`/`getMonth`/`getDate` and reinterprets it in the
cal's zone. So the split this ticket exists to settle is already half made:
*which* dates are on screen has always come from the device, and only *what
instants a date covers* came from Rome. Its comment names the case on purpose
("a viewer east of Rome would otherwise see the 24th") for a v1 where it could
not arise.

The seam is visible where the two disagree. On a device whose civil date runs
ahead of Rome's, **Today** lands on a column Rome has not reached, and
`useSlotClock(GROUP_TIME_ZONE)`'s now-line sits on a day the grid is not
drawing. This answer closes that by making both halves the viewer's, which is
worth saying plainly: (b) is not only the more honest position, it is the only
one of the three that is internally consistent with what is deployed. Position
(a) would have required *changing* `startOfDayInZone` to read the instant, not
leaving it alone.

### 3. Slot rows are pinned to the absolute half-hour grid

This was a caveat under (a) and is a defect under (b). Overlap is exact-instant
matching: the timeline is `slotsOfDay(day, zone).map((s) => s.start)` and
held-ness is `keys.has(slotKey(friendId, instant))`. Two Friends drawing on
their own local-midnight grids, in zones whose offsets differ by a non-multiple
of thirty minutes, produce **disjoint instant sets**. The overlap count is zero,
no Candidate ever appears, and nothing raises. At the database it is worse than
silent: `hangout_on_the_slot_grid` already pins Hangouts to
`epoch % 1800 = 0`, an absolute UTC grid, so the one path out of that state
fails a check constraint.

**Slots are therefore the `epoch % 1800 = 0` instants**, and a day's first row
is the first such instant at or after local midnight. For every whole-hour and
half-hour zone, which is Europe, the Americas, India and nearly everywhere
anyone in this cal will stand, this is byte-identical to today. A `:45` zone
(Kathmandu, Chatham, Eucla) gets a gutter reading `00:15, 00:45` instead of a
product that silently never works. That trade is not close.

**`availability.slot_start` gains the constraint `hangout` already has.** Ticket
04 did not give it one, because under a single zone the client could not produce
an off-grid instant. Now it can, so the invariant stops being a property of the
client and becomes a property of the table. This appends to resolved ticket 04
and lands in its file `09`.

### 4. A Friend's zone is a mirror, not a setting

`public.friend` gains `time_zone`, and its contract is narrow enough to be worth
stating as a rule: **the grid never reads it.** The grid reads the live device
(`Intl.DateTimeFormat().resolvedOptions().timeZone`) on every render, so
travelling just works and there is no staleness to reconcile. The column is
written from that same value on sign-in and app load, and it exists for exactly
two readers, both of them other people:

- **The roster**, which shows it only when it differs from yours, as a relative
  offset (`8h ahead`). Relative rather than absolute because the question it
  answers is "why is Bea never free in my evening", and `GMT+9` makes you do the
  arithmetic yourself. A single-country cal, which is every cal today, shows
  nothing new.
- **The suppression rule in §6**, which needs to know whether the cal spans
  zones at all.

No picker, no settings row, no edit path. This is the one place the human's
original ask ("read the time zone from the device") lands literally, and it
lands on the Friend rather than on the cal.

`CONTEXT.md` gains nothing for this. A mirror of a device setting is not a
domain term.

### 5. `cal.time_zone` is dropped before it is ever written

`supabase/` stops at `07-allowlist.sql`. Ticket 04's files `08`–`10` are
specified and not yet written, so the column exists only on paper and removing
it edits a spec rather than a migration. It was worth going to look: under (a)
this would have been a live column with a backfill.

The reader hunt came up empty. Candidate computation runs on instants. Every
date string goes through `whenOf(start, end, zone)`, which now takes the
viewer's. `floorOfView` is a per-viewer floor, and two viewers disagreeing about
it is harmless because it is a floor. The month lattice is the viewer's
calendar. A Hangout is a stored range rendered per viewer. The only job left
standing was the shared statement, the screenshot pasted into the group chat,
and a surviving column would have made that **worse** rather than better: a
canonical cal time that nobody's grid draws is a third clock, and a reader
could not tell whether `Sat 20:00` was the sender's frame or the cal's. The
honest fix is for the string to name its own frame, which is §6.

So `create_cal` keeps the one argument ADR-0003 gave it, and never grows the
second this session expected to recommend.

### 6. When a time string names its zone, and how

Measured, and it killed the obvious spelling. `Intl`'s
`timeZoneName: 'short'` is **locale-dependent and inverted**: under `en-GB` Rome
renders `CEST` and New York renders `GMT-4`; under `en-US` Rome renders `GMT+2`
and New York renders `EDT`. Two Friends in the same room with different browser
locales would see different markers on the same string. `shortOffset` is uniform
across both locales and every zone checked, `:45` ones included (`GMT+5:45`).

- **When.** Only when at least one other Member's mirrored zone differs from
  yours. That reuses §4's column and needs no new data, and it means every cal
  in existence today shows no zone markers anywhere. The feature is invisible
  until it is needed, which is the only version of it that does not tax the
  common case.
- **Where.** On `whenOf`'s `range`, which is one function feeding the Candidate
  card, Hangout card, Hangout detail, drop dialog, retime dialog and day panel,
  so every string a person copies as text carries its frame. Plus the **grid
  gutter header**, because a screenshot of the grid carries no `whenOf` string
  at all. **Not** `describeSlots`: the "2 blocks from Mon 20:00" toast is gone
  in four seconds and nobody screenshots it.
- **How.** `GMT+2`. A card reads `Sat 6 Sep` / `20:00 – 23:00 GMT+2` in a
  cross-zone cal and `20:00 – 23:00` in every cal today.

The city spelling (`20:00 – 23:00 Rome`, from the IANA id's last segment) reads
better and matches the roster's human idiom. It was rejected on three counts:
it breaks on `America/Argentina/Buenos_Aires`, it carries a political liability
on the handful of ids that disagree with the current name of the place, and it
cannot tell summer from winter.

One inconsistency is **accepted rather than hidden**: the roster says `8h ahead`
and the card says `GMT+2`, two offset idioms in one product. They answer
different questions, and collapsing them would make the roster say `GMT+9`,
which is the version that forces arithmetic on the reader.

### 7. DST needed nothing built, and that was checked

`slotsOfDay` derives its row count from two midnights in whichever zone it is
handed, so 46/48/50 already works for any zone with no change. The cross-viewer
effect is real and benign: for the two or three weeks EU and US clocks sit
apart, a run one Friend sees as `20:00–23:00` every evening reads to the other
as `14:00–17:00` and then `15:00–18:00`. Nothing breaks once §3 pins the
alignment, and a zone that shifts by thirty minutes (Lord Howe) stays on the
grid.

The retime dialog's `sameClockOn` was checked too, and is **unchanged by this
answer**: "same wall clock, different day" has always preserved the retimer's
clock, and every other Friend's has always moved by whatever their own zone
does in between. That is true under (a) as well. It looked like a new hazard and
is not one.

What DST did break is the glossary, which is §8.

### 8. What this reverses, and what it edits

Three reversals, recorded as reversals because each was settled deliberately:

- **The v1 map's Out of scope**, "Per-viewer timezone rendering", whose reason
  was "is Saturday 9pm his Saturday or mine is where all the confusion lives".
  That reason was correct for one group in one city and is what the `Group`
  entry in `CONTEXT.md` now answers directly: there is no his-or-mine, because
  there is no third clock either of them is being measured against. This is the
  **second** v1 out-of-scope line this effort reverses, after multiple groups.
- **Ticket 01's Time zone section**, which split the question in two and kept
  both halves. The split was right; the claim that both halves have a reader was
  not.
- **Ticket 04 §11**, `cal.time_zone`, which was careful to add the column
  without reading it precisely so that this ticket stayed open. That discipline
  is why dropping it is free.

`CONTEXT.md` is edited in three places, and the edits are the whole of what (b)
means:

- **Group** loses "A Group keeps one fixed time zone" and gains "A Group has no
  clock of its own", with the reason spelled out.
- **Slot** gains "A Slot is an instant, not a wall clock", and its day-length
  sentence now says which day is short is a fact about the **viewer**, that two
  Friends can have their short day on different dates, and that one week can
  hold both.
- **Availability** gains the write side: drawing happens in the drawer's zone
  and nothing is ever translated, because there is nothing to translate into.

No ADR. This is hard to reverse and it was a real trade-off, but it is not
surprising without context once `CONTEXT.md` says what it now says, and the
glossary is the better home for it than a decision record: the whole content of
the decision is what the words mean.

### Still open

**A run that crosses midnight is two column fragments**, and for a Friend
several zones away that is now every evening Candidate rather than only genuinely
late-night plans. The machinery half exists (ticket 06's over-drag across
midnight, `whenOf`'s `22:00 – 01:00 Sun` spelling), but there is no visual
continuation between the bottom of one column and the top of the next, and the
month cell has no answer for a day holding half a run. Filed as
[13](13-midnight-straddle-prototype.md), a prototype rather than a grill,
because whether a split run needs a marker is settled by making the ugly version
and looking at it.
