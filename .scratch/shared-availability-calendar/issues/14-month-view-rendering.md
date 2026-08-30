# 14 — What a month cell shows

Type: prototype
Status: resolved
Blocked by: —

## Question

Ticket 05 established that the week view's composite **does not survive being
shrunk**: in a 78×72px month cell the segment barcode reads as a corrupted
thumbnail, and a whole-cell composite communicates nothing. Month view needs its
own visual language, not a scaled-down week.

The two candidates from ticket 05, both **non-composites**:

- **A row of blobatar dots** — who is free that day, identity preserved, no
  time information at all.
- **A peak-concurrency numeral over a density wash** — "4" over a shaded cell:
  how many Friends were free at the best moment, plus a rough sense of how much
  of the day it covers.

To resolve:

1. Which of the two, or a combination — and what is actually being asked of
   month view? Is it "who is around this month" (identity) or "where are the
   good days" (density)? Those pull in different directions.
2. **Overflow.** Eight Friends will not fit as dots in one cell. +N, or drop to
   the numeral above a threshold?
3. **Drawing in month view** still means 00:00–24:00 for the dragged day
   (ticket 01). What does the viewer's *own* Availability look like in a cell
   that is otherwise showing aggregate — and does the own-block occlusion
   problem from ticket 15 recur here in a smaller, worse form?
4. **Hangouts in a month cell** — participant blobs and a glowing border were
   specified for the grid. Does that survive at this size, or does a Hangout
   become a single marker?
5. Does the month cell need a **hover panel** like the week view's, and does
   that make the missing touch equivalent worse?

Blocked by ticket 15 because the colour model and the own-block treatment
settled there decide what a cell has to work with.

## Answer

Prototype: `src/prototypes/month-cell/` (variants switch via `?variant=A|B|C|D`,
the bottom bar, or ←/→). Findings:
[`prototypes/14-month-cell.md`](../prototypes/14-month-cell.md).

**Status stays `claimed`** — the recommendation below is mine; the decisions in
*Needs the human* are not.

Built: a full month grid at 78×72px with **both** candidate languages side by
side on the same synthetic data at 3, 5 and 8 Friends, in both themes, plus
four probes for the failure modes. Two ways to run it — `preview.html` opens
over `file://` with no build step; `dev.html` is a second Vite entry (so
`App.tsx` stayed untouched) that renders **real blobatars**, which is the only
way to test ticket 11's "the blobatar shape disambiguates" at this size.

### 1. Which language — **the peak numeral over a density wash (B).**

Not on taste, and not on legibility. **The dot row answers the wrong
question.** A dot means "this Friend has Availability today"; the month view is
asked "when should we do something", which needs Availability that *overlaps*.
The prototype puts both cases on screen: Sat 5 and Sun 6 have the same nine
Friends free and **identical dot rows** — and peak concurrency 1 versus 9. On
the 5th there is no Candidate at all. A dot-row month advertises the emptiest
day exactly as loudly as the best one.

Size only finishes it off. In a 78×72 cell the body box is 70×52, so nine
people get **6px dots** — no shape, so hue alone, so the h262/h268 collision
reads as one Friend, which is ticket 05's under-reporting failure arriving by a
new route. **21 of the month's 34 non-empty cells** fall below the 12px floor at
8 Friends. The numeral is 33px and does not move when a Friend is added.

What B gives up, plainly: **you cannot tell who from a month cell.** That is
consistent with ticket 15, which already made *who* a hover-only answer.

### 2. Overflow — **the question dissolves.** Nothing overflows in B.

All four strategies are built and measured at 9 people in 70×52: `row` → 6px;
`+N` → 4 dots and "+5"; `lanes` → 6px with stable position (ticket 05's
rejected barcode, time axis removed); `wrap` → 3 rows of 3 at **16px**, legible,
and consuming the body box *exactly* (3×16 + 2×2 = 52px) so nothing else fits,
with dot positions that change per day so a column cannot be scanned.

### 3. Your own Availability — **the occlusion problem does NOT recur. Ticket 15's fix does not transfer.**

Ticket 15's reasoning holds: border and ring sit at the edge, the wash and
numeral stay readable through the middle. Nothing is occluded. But the fix
fails here for two other reasons.

**The edge is spoken for four times over** — grid rule, today, selected day, and
a Hangout's glowing border. Stacked on one 78×72 box that is four concentric
rings, and the Hangout border wins, so your own marker vanishes on exactly the
days you most want it.

**And month view makes your own Availability the majority case.** The viewer has
Availability on **28 of 35 days** in the synthetic month — unremarkable
behaviour, and ticket 01's whole-day month drag will make real use *more*
saturated. The grid becomes a wall of purple rings: the marker fires on 80% of
cells, stops distinguishing anything, and out-shouts the density it sits beside.
A marker that is on 80% of the time is not a marker.

Recommended instead: **your own Availability on the date numeral** (a filled
pill in your colour), leaving the edge free. It adds no new mark to a cell with
no room for one. The underline variant is the runner-up and carries more
information (how much of the day you own), but collides with the bottom edge.

### 4. Hangouts — **a marker chip, and it is mandatory, not decorative.**

**Ticket 09 blanks a Hangout's slots for everyone**, so a Hangout day's peak
collapses. Sat 26 — the whole group free 20:00–23:00, Hangout on exactly that
window — renders as an **empty cell**, peak 0 where the day underneath is peak
9. Without a marker, language B lies about its own best day.

Participant blobs + glowing border do not survive: six Participants get 9px
dots, and the glow **bleeds onto the neighbouring days**, because month cells
share their edges and a week block does not. A marker chip costs 11px of the
cell; "Pizza" fits, "Aperitivo da Giulia" truncates to about 11 characters.

### 5. Hover panel — **yes, but not the week view's, and touch is now a conflict.**

At 8 Friends the panel is ~290px × 240px — **three month columns** — and a month
grid has no gutter and is compared in two dimensions, so ticket 05's "beside the
column, never overlapping" has no safe direction. Either the panel becomes a
**persistent right-sidebar inspector** (ticket 16) or it opens below the week
row.

Touch got worse, not equal: ticket 01 makes dragging a day in month view draw
00:00–24:00, so **inspect and draw are the same 78×72 rectangle.** In the week
view a tap target could be carved out of a tall column; here there is nothing to
carve.

### Contradicts settled decisions

- **Ticket 15's own-block treatment does not transfer** (item 3 above).
- **A dot row would put per-Friend colour back in the grid**, which ticket 15
  removed on purpose — week and month would disagree about what colour encodes.
- **Ticket 11's "the blobatar shape disambiguates" has a ~12px floor.** True in
  the sidebar, the panel and a Hangout card; false in any grid cell at group
  size. Its blobatar contrast fix ("a subtle ring in the theme's border colour")
  has the same floor — 1px on a 6px dot is a third of the mark.
- **Ticket 09 and ticket 14 have an undeclared dependency**: blanking makes a
  Hangout marker load-bearing in month view.
- **Ticket 01's "participants' blobs and a glowing border" is a week-view spec**,
  not a grid-wide one — the glow needs air the month grid does not have.
- **Ticket 05's hover-panel placement rule does not transfer.**
- **Found bug, affects ticket 18 and any code reading blobatar tones:**
  blobatar 2.7.0's `TONES` numbers are band **upper edges**, resolved as
  `find(([edge]) => v < edge) ?? TONES[0]`. Storing the table numbers addresses
  the wrong swatch — `0.62` is *deep* not *mid*, `1.0` wraps to *pastel* not
  *ink*. Ticket 05's prototype and this one both had it wrong, which silently
  disarmed the two contrast landmines they were built to show. Fixed here;
  `TONE_VALUES` in `color.ts` has the band interiors to store.

### Needs the human

1. **Confirm the month language is the numeral, and that "who" leaves the month
   cell entirely.** This finishes what ticket 15 started: per-Friend colour is
   then absent from *both* grids and ticket 01's "recognise your friends without
   a legend" is fully retired, not just narrowed.
2. **What the wash's opacity means — coverage or count.** Ticket 14's wording
   says *coverage*; ticket 15 settled the week grid as *count*. One channel,
   two meanings, one keystroke apart. Tue 22 in the prototype separates them:
   peak 2, coverage 54% — darkest cell in the month under one reading, lightest
   under the other. I recommend **coverage** (the numeral already carries the
   count), and the cost is naming the divergence deliberately.
3. **How your own Availability is marked, given it is true ~80% of days.** Date
   pill (my recommendation), underline, corner, or nothing at all — and if the
   date pill, how **today** is then drawn, since it currently owns that pill.
   Genuinely arguable that the month cell should not mark it at all.
4. **Whether a Hangout day shows a title.** The chip truncates at ~11
   characters. Options: truncate, show only a dot, or drop the title and let
   the right sidebar carry it.
5. **Where the day inspector lives** — right sidebar (couples ticket 14 to
   ticket 16) or an expanding week row. This one also decides the touch story,
   so it should not be deferred.
6. **The touch conflict.** Tap-to-inspect and drag-to-draw on the same
   rectangle. Long-press, an explicit mode, or "tap selects, drag draws". Ticket
   01 has mobile fully in scope and none of the three has been designed.
7. **`peak == 1` rendering.** Currently a small muted "1", because a day whose
   best moment holds one Friend has no Candidate. Alternative: render nothing at
   all. Affects how empty a quiet month looks.
8. **Whether the dot row survives anywhere.** At 3 Friends it is genuinely good
   (18px, faces legible). I recommend *not* switching language by Friend count —
   a rendering that changes kind when someone unhides a Friend teaches nothing
   stable — but that is a call, not a fact.

## Decisions

**Neither language alone — a synthesis of both.**

| Channel | Carries |
| --- | --- |
| **Wash** in the viewer's hue, opacity ∝ **peak concurrency** | *how good is this day* |
| **Avatars** (not abstract dots), overflow **wrapping** rather than `+N` | *who* |
| **Ring** on the viewer's own Availability | *am I in it* |
| **Hangout marker chip** (mandatory) | *something is already booked* |
| **Today pill**, and the selected-day treatment | *where am I* |

**No numeral, anywhere.**

This is worth stating as a synthesis rather than a rejection. The prototype's
decisive argument against the dot row was that two days with **identical dot
rows** can have peak concurrency 1 and 9 — dots answer the wrong question.
**The wash answers it.** Carrying peak in the wash and identity in the avatars
gives the cell both, which neither pure language had. The numeral becomes
redundant once the wash is peak rather than coverage.

**Contiguous days merge into one rounded rectangle.** The viewer's own
Availability across adjacent days renders as a single spanning shape rather than
per-cell marks — which is also what a click-drag across several days produces,
so the gesture and its result look like the same object.

**A click on a cell opens the information popover** — the same popover ticket 10
put on a week-grid click. Ticket 05's hover panel does not transfer (it is three
month columns wide, with no safe direction), and the click route is the one that
also works on touch.

Resolved along the way:

- **Own-Availability marking does not use the cell edge**, which is already
  spoken for four times (grid rule, today, selected, Hangout glow — and the
  Hangout border wins). The ring is an inner treatment; the **today pill keeps
  the date numeral**, so the two never contend.
- **`peak == 1`** renders as the faintest wash plus a single avatar. Nothing
  special.
- **A Hangout chip carries no title in the cell** — 78px cannot hold one
  legibly. The title lives in the popover.
- The **coverage strip is cut**. Ticket 05 was right that it is a nub.

### Carried forward

Ticket 09's blanking still means a Hangout day would read as **peak 0 — the
emptiest cell of the month — over its own best day**. The Hangout chip is what
prevents that, which is why it is mandatory rather than decorative. Recorded as
an amendment on ticket 09.
