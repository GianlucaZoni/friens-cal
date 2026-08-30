# 14 — What a month cell shows (prototype findings)

Prototype: `src/prototypes/month-cell/` — throwaway, fake data, no Supabase, no
drag, no persistence. Default export in `index.tsx`; the route is not wired
(another agent owns `AppRoutes.tsx`):

```tsx
import MonthCellPrototype from '@/prototypes/month-cell'
<Route path="/prototypes/month-cell" element={<MonthCellPrototype />} />
```

Four variants on one route, `?variant=A|B|C|D`, floating bottom bar, ← / →.

| | |
| --- | --- |
| **A** | the blobatar dot row, as a whole month |
| **B** | the peak-concurrency numeral over a density wash, as a whole month |
| **C** | **both, side by side, same data** — the default, and the comparison the ticket asks for |
| **D** | four probes: the twin days, the oversubscribed edge, the size ladder, the Hangout paradox |

Controls: visible Friends 3 / 5 / 8, your-own-Availability marker
(ring / underline / date pill / corner / none), dot colour (avatar / UI),
overflow (row / +N / wrap / lanes / fallback), wash meaning (coverage / peak),
Hangout treatment (blobs / marker / off), today+selected chrome, light / dark.

**Two ways to run it, and they are not equivalent:**

- `preview.html` — zero-dependency, opens over `file://`, no build step. Same
  month, same slot table, same metrics, same colour maths. **Dots are CSS
  circles**, because `@blobatar/react` cannot load from a file URL.
- `dev.html` — a second Vite entry (so `App.tsx` stayed untouched), at
  `/src/prototypes/month-cell/dev.html?variant=C` with the dev server up. This
  one renders **real blobatars**, which is the only way to judge the claim
  ticket 11's collision decision rests on: *"the blobatar shape disambiguates"*.
  It is not part of `vite build`, so it cannot ship.

Both were run in both themes at 3, 5 and 8 visible Friends. Everything below is
measured off the running prototype, not argued.

---

## The geometry, once, because everything follows from it

A 78×72 cell minus the date numeral row (17px) and 4px of padding leaves a
**70×52 body box**. Into that box:

| visible Friends (viewer included) | dot size at 78×72 |
| --- | --- |
| 3 | 18px (capped) |
| 5 | **12px** — exactly the legibility floor |
| 9 | **6px** |

Across the whole synthetic month at 8 Friends, **21 of the 34 non-empty cells
render dots below 12px.** The numeral, by contrast, is 33px at 78×72 and does
not move when a Friend is added, because it is `O(1)` in the group size.

`MIN_LEGIBLE_DOT = 12px` is my threshold, set by looking at real blobatars in
`dev.html` and asking where the face stops being a face. Below it the shape is
gone and only hue survives.

---

## Q1 — Which language, and what is month view actually asked?

### Answer: **B, the peak numeral over a density wash. And it is not close.**

The ticket frames this as identity vs density pulling in different directions.
Building it collapses the tension, because **the dot row does not deliver
identity in the sense the month view needs — it delivers the wrong fact.**

A dot means *"this Friend has Availability somewhere today."* The question a
month view is asked is *"when should we do something?"*, and that needs
Availability that **overlaps**. Those are not the same set, and the prototype
puts a day in the grid where they diverge completely:

| | Sat 5 Sep | Sun 6 Sep |
| --- | --- | --- |
| Friends with Availability | 9 | 9 |
| **dot row** | **9 dots** | **9 dots — identical** |
| peak concurrency | **1** | **9** |
| Candidates on the day | **none at all** | a full house |

On the 5th, nine people are free and not one pair overlaps. The dot row is
byte-identical to the 6th, where everybody is free at the same time. A month
built from dots advertises the emptiest day in the month exactly as loudly as
the best one. That is not "less information than the numeral" — it is *wrong
information*, and no amount of size buys it back.

Three more things break at 8 Friends, all visible in variant C:

1. **The dots stop being blobatars.** At 6px there is no shape, so ticket 11's
   collision defence — Giulia h262 / Luca h268 disambiguated by shape — does not
   apply. They read as one Friend twice, or as one Friend, depending on the
   day. This is the *same* under-reporting failure ticket 05 found in the mesh
   gradient, arriving by a different route.
2. **Per-Friend colour comes back into the grid.** Ticket 15 removed it
   deliberately. A dot row puts it back on 35 cells at once, so the week grid
   would say "opacity = how many" and the month grid would say "hue = who", in
   the same app, one keystroke apart.
3. **Avatar tones become unusable again.** With the dot rendered in the
   *avatar* colour, Elena (`pale neutral`, l .90) vanishes on a light calendar
   and Teo (`ink`, l .34) vanishes on a dark one. Ticket 11 declared this
   dissolved, and its fix — "a subtle ring in the theme's border colour" —
   is a 1px ring on a 6px dot, i.e. a third of the mark. Flip **dots** to `ui`
   and they come back, at the cost of the dot no longer being the person's
   avatar at all: it is a colour chip, and then it is not identity either.

What B gives up is real and should be said plainly: **you cannot tell who from
a month cell.** You get *how many at best*, *how much of the day*, and nothing
else until you open the day. Given the above, that is a trade, not a loss.

### The one thing worth stealing from A

At **3 Friends** the dot row is genuinely good — 18px blobatars, faces legible,
and with a group that small "who" and "how many" are nearly the same question.
The prototype has `overflow: 'fallback'` (dots up to 5, numeral above) so this
can be seen. **I recommend against shipping it**, because a rendering that
changes *kind* when someone unhides a Friend teaches the reader nothing stable,
and the group is 6–9 people, so the dot mode would almost never be the one on
screen. One language, all the time.

---

## Q2 — Overflow. Answer: **the question dissolves; nothing overflows in B.**

For completeness, all four strategies are implemented and measured at 9 people
in a 70×52 box:

| strategy | result | verdict |
| --- | --- | --- |
| `row` — one row, shrink to fit | 6px dots | dead |
| `plusN` — shrink to 12px, then truncate | 4 dots + "+5" | shows less than half the group and still needs the reader to count |
| `wrap` — 3 rows of 3 | **16px dots** — legible! | fills the body box *exactly*: 3×16 + 2×2 = 52px. Zero room left for the own-Availability marker, a Hangout, or anything else. And the row composition changes per day, so a Friend moves position between cells and scanning a column is impossible. |
| `lanes` — one fixed lane per Friend, empty lanes reserved | 6px, always | position is finally stable, and it is ticket 05's rejected barcode with the time axis removed |

`wrap` is the interesting near-miss: it is the only one that keeps dots
legible, and it wins by spending the entire cell. Worth flipping to in the
prototype to see how close the dot row gets to working, and how nothing else
then fits.

---

## Q3 — Your own Availability. **Answer: the occlusion problem does not recur. Ticket 15's *fix* does not transfer.**

This was the failure mode I was told to hunt for, and the honest report is that
it is not the one that is there.

**The occlusion itself is genuinely gone.** Ticket 15's reasoning holds: a
border and a ring sit at the edge, the wash and the numeral stay visible
through the middle, and nothing you want to read is covered. Item 3's literal
question — *does the own-block occlusion problem recur in a smaller, worse
form* — is **no**.

What replaces it is worse in a different way, and it is two separate problems.

### 3a. The edge is already spoken for, four times over

In the week grid a column's edge was free, which is what made "border + ring"
affordable. A month cell's edge already carries:

- the grid rule between days,
- **today**,
- the **selected** day,
- a **Hangout**'s glowing multi-colour border.

Variant D's second probe stacks these one at a time on the same 78×72 cell. By
the fifth card there are four concentric rings on a 72px-tall box: the viewer's
2px purple ring, its 2px translucent halo, the grey selection ring outside it,
and a Hangout border over the top. **The Hangout border wins and the viewer's
own marker becomes invisible** — which is precisely backwards, since a Hangout
day is a day you especially want to know whether you are free around.

### 3b. Month view makes your own Availability the *majority* case

This is the one I did not expect and it is bigger than 3a.

In a week column your own blocks are a minority of the surface. In a month, the
viewer has drawn Availability on **28 of 35 days** in the synthetic data — and
that is deliberately unremarkable behaviour, not a stress case. Ticket 01's
month drag writes 00:00–24:00 for a whole day at a stroke, so real use will be
*more* saturated, not less.

The result, visible immediately in variant C: **the month grid is a wall of
purple rings.** The own-Availability marker fires on 80% of cells, so it stops
distinguishing anything and becomes the dominant graphic in a view whose job is
to show aggregate density. It out-shouts the wash it is supposed to sit beside.

A marker that is on 80% of the time is not a marker.

### The three alternatives that are in the prototype

| treatment | what it costs |
| --- | --- |
| **ring** (ticket 15, transplanted) | 4px of the cell on every side; loses to a Hangout; on 80% of cells |
| **underline** — a bar along the bottom, width ∝ fraction of the day you own | leaves the edge free, survives next to a Hangout, and carries *more* information than the ring did (a whole-day drag looks different from an evening). Collides with the coverage strip, which also lives on the bottom edge. |
| **date pill** — the date numeral itself filled in your colour | costs nothing new, reads instantly, is immune to the Hangout border. But it re-uses the pill that marks **today**, so today-and-you-are-free needs a third state. |
| **corner** — a 9px triangle top-right | cheapest, quietest, and easy to miss entirely |

My recommendation is the **date pill**, with today distinguished by weight
rather than by a second pill. It is the only one that adds zero new marks to a
cell that has no room for any. But see *Needs the human* — this trades against
how today is drawn, which is not mine to decide.

---

## Q4 — Hangouts in a month cell. **Answer: a marker, and it is mandatory, not decorative.**

Both treatments are built. The finding is not about which looks better.

**Ticket 09 blanks a Hangout's slots for everyone.** Feed that through a peak
numeral and the arithmetic is brutal:

| day | what the cell says | the day underneath |
| --- | --- | --- |
| Sat 26 Sep — the whole group free 20:00–23:00, Hangout on exactly that window | **blank** (peak 0) | **peak 9** |
| Wed 9 Sep — "Aperitivo da Giulia", 6 Participants | peak 5 | peak 7 |

The best day of the month renders as an **empty cell**. Language B cannot
survive without a Hangout marker, because without one it actively lies about
its own best day. This is a hard dependency between ticket 09 and ticket 14
that neither ticket names.

(Language A is immune: Availability still exists underneath a Hangout, so the
dot row is unchanged either way. It is the one place the dot row wins, and it
wins by not knowing about the Hangout at all.)

On the two treatments:

- **Participant blobs + glowing border** (ticket 01's grid spec) does not
  survive. Four participants get 15px dots; six get 9px. And the glow has
  nowhere to go: month cells **share their edges**, so a `0 0 9px` bloom lands
  on the neighbouring days and the grid reads as smudged rather than as one day
  being special. A week block floats in a column with air around it; a month
  cell does not. The border strips themselves are fine — they read as
  multi-colour at 2px — it is the glow that fails.
- **A single marker chip** (dot + truncated title along the bottom) works, and
  costs 11px of the cell. "Pizza" fits. "Aperitivo da Giulia" truncates to
  **"Aperitivo da …"** — about 11 characters at 8px. Whether that is acceptable
  is a copy decision, not a rendering one.

Recommendation: **the marker chip in month view, blobs and glow reserved for
week view**, where there is room. Which means ticket 01's "participants' blobs
and a glowing border" is a *week-view* spec, not a grid-wide one.

---

## Q5 — Hover panel. **Answer: it needs one, the week view's placement does not transfer, and touch is now a hard conflict rather than a gap.**

The panel is implemented (click a cell in A, B or C).

**Placement.** Ticket 05 settled the week panel as fixed, anchored beside the
day *column*, never overlapping, because you compare vertically. In a month
grid you compare in **two dimensions**, and the seven columns are flush with no
gutter. At 8 Friends the panel is ~290px tall and 240px wide — **three month
columns** — so anchoring it beside the cell covers exactly the neighbouring
days you are comparing against. There is no direction that is safe.

The two workable options, neither of which is a small change:

- The panel becomes a **persistent inspector in the right sidebar** (ticket 16's
  territory) rather than a floating panel — the month cell selects, the sidebar
  answers.
- The panel opens **below the whole week row**, pushing the rows beneath it
  down. Costs a reflow on hover, so it probably has to be click, not hover.

**Touch is worse than a gap now.** Ticket 05 recorded "no touch equivalent
exists" as a hole. In month view it is a **collision**: ticket 01 says dragging
a day in month view draws 00:00–24:00 for that day, so *the whole 78×72
rectangle is already the draw target*. Inspect and draw are the same pixels.
In the week view a tap-target could at least be carved out of a tall column;
here there is nothing to carve. Long-press, a mode toggle, or "tap selects and
the sidebar answers, drag draws" — all three are designs nobody has done.

---

## Q6 (not asked, but the prototype forced it) — what does the wash's opacity mean?

Ticket 14 describes the wash as *"how much of the day it covers"*. Ticket 15
settled that in the **week grid**, opacity is *"how many visible Friends are
free in that slot"*. Both are one visual channel — opacity of the viewer's hue
— and they cannot both be right, or the same ink means two different things one
keystroke apart.

The `wash` toggle switches between them. Tue 22 Sep is built to separate them:
two Friends free for most of the day — **peak 2, coverage 54%**. Under
`coverage` it is one of the darkest cells in the month; under `peak` it is one
of the lightest. Both readings are defensible and they disagree completely.

My recommendation: **`coverage`**, because the numeral already carries the
count and a channel that repeats the numeral wastes it. The cost is naming it —
the month wash and the week heatmap are then *different measures wearing the
same colour*, and that has to be deliberate rather than accidental.

The coverage strip along the bottom is also in the prototype, and ticket 05 was
right about it: at 4px tall and as little as 4px wide it is a nub you have to
go looking for. **Cut it** — the wash already carries coverage; the strip is
the same fact twice, badly.

---

## Things that contradict or complicate settled decisions

1. **Ticket 15's own-block treatment does not transfer to month view.** Border
   and ring solved occlusion in a week column whose edge was free. A month
   cell's edge is contested by the grid rule, today, selection and a Hangout,
   and — the bigger problem — **the viewer has Availability on ~80% of days**,
   so the marker fires almost everywhere and stops meaning anything. Month view
   needs its *own* own-Availability treatment. → decision below.
2. **A dot row would re-introduce per-Friend colour into the grid, which ticket
   15 deliberately removed.** Not a detail: it would make month and week
   disagree about what colour encodes.
3. **Ticket 11's "the blobatar shape disambiguates" has a size floor, and 78×72
   is below it at group size.** At 6px there is no shape. The collision
   decision is still fine — but only in places where a blobatar is rendered at
   ≥12px, which is the sidebar, the hover panel and the Hangout card. It is not
   a property the grid can lean on at any size.
4. **Ticket 11's blobatar contrast fix ("a subtle ring in the theme's border
   colour") has the same floor.** A 1px ring on a 6px dot is a third of the
   mark. Any UI that shrinks a blobatar below ~12px is outside what ticket 11
   guaranteed.
5. **Ticket 09's Hangout blanking makes a Hangout day render as the emptiest
   day of the month.** A Hangout marker in month view is load-bearing, not
   decorative. Ticket 09 and ticket 14 have a dependency neither states.
6. **Ticket 01's "participants' blobs and a glowing border" does not survive at
   month size.** The glow bleeds onto adjacent cells because month cells share
   edges. Read it as a week-view spec.
7. **Ticket 05's hover-panel placement rule does not transfer.** "Beside the
   column, never overlapping" assumed vertical comparison and a free margin.
   A month grid has neither.
8. **Touch in month view is a conflict, not a gap.** Draw-the-whole-day and
   inspect-the-day are the same rectangle. Ticket 01 has mobile fully in scope.
9. **A found bug, not a design finding, but it affects any code that reads
   blobatar tones.** blobatar 2.7.0's `TONES` numbers are band **upper edges**,
   resolved with `find(([edge]) => v < edge) ?? TONES[0]`. Storing the table
   numbers themselves addresses the wrong swatch — `0.62` is *deep*, not *mid*,
   and `1.0` wraps to *pastel*, not *ink*. Ticket 05's prototype used a
   nearest-number lookup and this one did too until it was caught, which means
   **both prototypes were rendering the wrong tone for every Friend**, and the
   two contrast landmines they were built to demonstrate (Elena `pale neutral`,
   Teo `ink`) were disarmed. Fixed here; `TONE_VALUES` in `color.ts` holds the
   band interiors to store. Worth carrying into ticket 18's setup flow.

---

## What I would build

A month cell that is **one numeral over one wash, and nothing else by default**:

- **Peak concurrency** as the numeral, `peak < 2` demoted to a small muted
  glyph because a day whose best moment holds one Friend contains no Candidate
  and should not advertise itself as a day.
- **Opacity ∝ coverage**, in the viewer's own hue on ticket 15's ramp, tuned
  twice. No coverage strip.
- **Your own Availability on the date numeral**, not on the edge — the edge
  belongs to today, selection and Hangouts, and your own Availability is too
  common in month view to spend an edge on.
- **A Hangout as a marker chip**, mandatory, because ticket 09's blanking
  otherwise renders the best day of the month blank.
- **No per-Friend colour anywhere in the cell.** Who is answered by selecting
  the day, the same as in the week view.
- **Selecting a day feeds the right sidebar** rather than opening a floating
  panel, which also gives touch a story for free.

The dot row is worth keeping in the prototype as the thing that was tried, and
worth showing the human at 3 Friends where it genuinely reads — but it answers
a question the month view is not asking, and at 8 Friends it answers nothing.
