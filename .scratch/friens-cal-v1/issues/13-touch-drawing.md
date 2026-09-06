# 13 — Touch drawing

Status: ready-for-agent
Blocked by: 06, 12

## Parent

[friens-cal v1 map](../../shared-availability-calendar/map.md)

## What to build

Drawing Availability with a finger. The problem is that a press-drag-release is
exactly what a browser reads as a scroll.

**A tap reads** — it opens the slot popover (who is free, plus a create action).
**Long-press-then-drag creates**, with edge auto-scroll.

**Long-press arming is what makes swipe-paging safe**: before the press fires, a
horizontal gesture pages to the next block of days and a vertical one scrolls;
after arming, the drag draws. The scroll-versus-draw conflict is resolved by the
two behaviours together, not by either alone.

**The arming signal is visual and not under the finger** — an inset ring around
the surface while armed, the draft rectangle, and a time/duration tag placed
**above** the draft, turning red in Erase. `navigator.vibrate` does not exist on
iOS Safari, so haptics cannot be the signal.

**Linear stays the default and the seven-column week stays**, over a measured
objection: at 47px columns a 30px lateral drift at release turns a 2-hour
Availability into a 26-hour one, and no hysteresis budget can exceed a column
width. Two things make this acceptable — the **view selector** gives an escape
to 3-day (110px), where a 40–50px anchor-relative budget measurably works, and
**creation is deliberate**, behind a long-press.

**Store the drag anchor as an absolute slot index, not a pixel offset**, or edge
auto-scroll silently corrupts it.

**Resize needs explicit ~44px handles on selection** — a 7px edge zone on a 22px
row is not addressable. Put `touch-action: none` on the knob only.

**Duplicate needs no new gesture** — the existing control arms a "tap to drop".

Prototype: `src/prototypes/touch-drawing/`.

## Acceptance criteria

- [x] Tap opens the popover and never writes
- [x] Long-press-then-drag creates, with a visible arming signal not under the finger
- [x] Horizontal swipe before arming pages by the current view's block; vertical scrolls
- [x] After arming, neither scrolls
- [x] Edge auto-scroll extends a draft without corrupting the anchor
- [x] Anchor is stored as a slot index
- [x] Selection shows ~44px resize handles; `touch-action: none` on the knob only
- [x] Erase works by touch and is distinguishable while armed
- [x] Day / 3-day / week / month all drawable, and 3-day uses the working hysteresis budget
- [x] `npx tsc -p tsconfig.app.json --noEmit` is clean

## Blocked by

- [06 — Drawing, erasing, and the write model](./06-drawing-and-the-write-model.md)
- [12 — The mobile layout](./12-mobile-layout.md)

## Addition — the bottom drawer's scroll-chained close (from issue 12)

Issue 12 built the bottom drawer and left one gesture undone, deliberately.
**Swiping down on the drawer's list does nothing.** The handle drags both ways
and a tap on it toggles, but at `scrollTop: 0` a downward swipe on the cards is
inert, where every native sheet on both platforms would take it as *close*.

That is this ticket's, not 12's, and for a reason that is the whole of why 12
stopped: **it makes the drawer body a drag surface**. Today the drawer owns an
18px strip with `touch-action: none` on it and nothing else, and the calendar
keeps its default touch behaviour entirely — which is the only reason this
ticket can reason about long-press-then-draw without negotiating with the
drawer. Adding body-drag is a second arbitration between a scroll and a drag on
the same pixels, which is the problem this ticket already exists to solve once.

### The rule

**A drag on the drawer body may start only while the scroller is at the top**,
and it must stay refused for a moment after the scroller *arrives* there — or a
fast flick that hits the top mid-momentum turns into a close nobody asked for.
Vaul's author states the same algorithm for the same reason (*"a `shouldDrag`
function that doesn't allow you to drag unless you are scrolled to the top …
very similar to how native drawers work on iOS"*, plus a short timeout because
*"scrolling can be fast on mobile devices"*). Vaul ships it as
`scrollLockTimeout`, defaulted to 500ms; its article suggests 100ms. Ship a
starting number here and let **[issue 15](./15-verify-touch-on-hardware.md)**
settle it: a settle window is a compositor-and-thumb measurement, and 15 is the
ticket that owns real hardware. This ticket's own verification is synthetic
pointers, which exercise the state machine and not the flick.

The scroller is `RightPane`'s own `SidebarContent`, and it is `overflow-y-auto`
only while the drawer is out — at the peek it is `overflow-hidden` and there is
one card, so the rule has nothing to arbitrate there and a downward swipe at the
peek must keep doing nothing rather than becoming a second close.

### Acceptance criteria (added to this ticket's own)

- [x] At `scrollTop: 0`, a downward swipe on the drawer's body collapses it to
      the peek; anywhere else in the scroll range the same swipe scrolls
- [x] Arriving at the top mid-flick does not arm the close until a measured
      settle window has passed
- [x] The handle keeps working in both directions regardless of scroll position
- [x] Nothing new gets `touch-action: none` outside the drawer

### Vaul or `Sheet`? — evaluated, and the answer is neither, for now

**`Sheet` is still out, and issue 12's stated reason needs one correction.**
That slice wrote that *"every one of modal, backdrop and focus trap is wrong"*.
Base UI's `Dialog.Root` in fact takes `modal?: boolean | 'trap-focus'`, and
`false` means *"user interaction with the rest of the document is allowed"* — no
focus trap, no scroll lock, no pointer blocking outside. So a non-modal sheet is
representable and that half of the argument was imprecise. What actually
disqualifies it is unchanged and is the other half: a Dialog is **open or
closed**, and this surface is never absent, has three states, and has to be
*dragged*. Held permanently open with `modal={false}` and the backdrop removed,
`Sheet` would contribute a portal and an `aria-labelledby` — both of which the
current `<aside aria-label>` gives more directly — and every line of the drag
would still be ours.

**Vaul fits the shape and costs a second dialog library.** It has precisely the
parts that are missing: `snapPoints` / `activeSnapPoint` for peek-and-full,
`handleOnly` for what we do today, `scrollLockTimeout` and `data-vaul-no-drag`
for the rule above, `modal={false}` and `dismissible={false}` for a surface that
never closes, and `repositionInputs` for the mobile keyboard nobody has thought
about yet. It is real, it is 8.6k stars, it is not archived — and it is quiet:
1.1.2, last push October 2025, 162 open issues. The bug that would have decided
it against outright (*"Drawer doesn't close with scrollable content and modal
set to false"*, #168) is **closed**.

The cost is structural rather than about vaul's quality: **`vaul` depends on
`@radix-ui/react-dialog`, and this repo is Base UI**. Every other overlay here —
`Sheet`, `Dialog`, `AlertDialog`, `Popover`, `DropdownMenu`, `Select`, `Tooltip`
— is `@base-ui/react`, and the drawer is not a leaf: `CardDetail` opens a Base
UI Sheet **inside** it on every card tap. A Radix drawer containing a Base UI
dialog means two focus-management systems, two portal implementations and two
outside-click policies having to agree on a 375px screen. That is the same
hazard ticket 12 forked the sidebar to make unrepresentable — *"two stacked
dialogs, two backdrops, two focus traps"* — arriving by a new route.

**So: hand-roll it here.** The algorithm above is two sentences and the surface
is already ours; the drag it extends is ~70 lines in `BottomDrawer`. Vaul is the
named fallback if the hand-rolled version does not survive
**[issue 15](./15-verify-touch-on-hardware.md)** — the hardware gate, which now
carries a criterion for this gesture. Adopting it then would be a deliberate act
with a measurement behind it, rather than a dependency taken on a guess.

### Decided

The human took this recommendation on 6 September 2026: **hand-roll the
scroll-chained close in this ticket, with vaul as the named fallback behind
issue 15's measurement.** Recorded here rather than left as a proposal, because
the next agent to open this file should build it rather than re-open the
question.

## Built

`src/availability/touch.ts` (the finger's arithmetic, `@/`-free and tested) is
the one new module. Everything else is the two existing gestures growing a
second pointer type: `use-draw-gesture.ts`, `use-month-gesture.ts`,
`week-grid.tsx`, and `shell.tsx`'s `BottomDrawer` for the `## Addition`.
`drawer.ts` gains the scroll-chained close's two rules. **No SQL**, and no new
write path — a finger reaches `availability.draw` and `useEraseGuard` by the
same route a mouse does.

`Prototype: src/prototypes/touch-drawing/` above is a **dead reference** — that
directory does not exist in this repo, exactly as issue 11 found for
`month-cell`. The real findings are
[`prototypes/10-touch-drawing.md`](../../shared-availability-calendar/prototypes/10-touch-drawing.md),
and every number below that is attributed to a prototype came from there.

### The decisions this slice had to make, not just carry

1. **The week grid's `setPointerCapture` is gone, and that is what made this
   ticket verifiable instead of described.** It was there so that later events
   retargeted to the column a drag began on; `use-month-gesture.ts` and issue
   12's `BottomDrawer` had already argued the other way twice, and long-press
   arming settles it — **window listeners registered on pointerdown** give the
   same "a drag released outside the element commits rather than hangs"
   guarantee, and there is no capture to lose. The consequence issue 11 named is
   the one that mattered here: `setPointerCapture` **throws for a synthetic
   pointer**, which is the wall issues 08, 09 and 10 all hit, and day / 3-day /
   week are all `WeekGrid`. With it gone, all four views were driven from the
   console. Only `onClick` is still React's on that surface, because that is
   where the popover mounts.
2. **One machine, one difference, and the difference is a `Phase`.** A mouse
   press is `live` immediately; a finger's is `holding` until either it moves or
   `ARM_MS` passes, and then it is `live`, `paging`, or nobody's. Every other
   rule — the anchor, the 4px threshold, the hysteresis, the erase convention,
   the commit — is the code that was already there. The alternative was a second
   gesture beside the first, and the correctness argument for this grid is about
   one lattice.
3. **The two grids share `touch.ts` and nothing else.** `use-month-gesture.ts`
   opens by explaining why it is not `useDrawGesture` with a flag, and that
   still holds: a `SlotAddress` and a day index are different coordinate
   systems. But a verdict about a 12px move is the same verdict on both, and so
   is 450ms. What is shared is what has no opinion about the lattice.
4. **The row height became a custom property rather than a threaded number.**
   `--slot` is set once on the grid's root — 20px with a mouse, 44px under a
   finger — and every row and positioned block reads it through the cascade, the
   shape `--sidebar-width` already has. Threading a pixel value would have put
   one number in five components and two helpers, which is the mistake issue
   12's review pass caught in the drawer's own height. `SlotPopover` takes a
   `box` instead of `top`/`height` for the same reason: it no longer needs to
   know which of the two is in force. **The gesture reads neither number** — it
   divides each column's measured height by that column's own row count, so the
   46-row and 50-row days stayed right and the whole switch cost
   `use-draw-gesture.ts` nothing.
5. **A resize is a draw or an erase of the *difference*, never a new range.**
   Extending draws the rows that appear; shrinking erases the rows that go —
   through the same `requestErase` gate as everything else, because shrinking a
   block off a Hangout costs exactly what erasing it does. That is why the
   handles needed no new draft kind and no new merge rule: the column's existing
   `held || inDraft` / `held && !inDraft` already draws both, so the union
   updates live and the commit is what you were looking at. A block never
   shrinks below one Slot; deleting one is `Erase block` in the popover, which
   is a control rather than the end of a drag.
6. **The draft's tag moved above the draft, which is a correction to issue 06.**
   That slice put it inside the run's first row, reasoning that the grid is a
   scroller and a tag above would be clipped. Ticket 10 §6 asks for above, for a
   reason the desktop does not have: the hand is on the glass and every pixel
   between the anchor and the finger is under it. The clipping objection is
   answered rather than overruled — `max(0px, …)` clamps the tag into the column,
   so a draft starting on row 0 gets its tag over its own first row instead of
   outside the scroller — and it now carries the **duration** as well, which is
   the number a range does not give you by inspection.
7. **The arming signal a thumb cannot cover is an inset ring on the scroller**,
   in the viewer's own colour for a draw and `--destructive` for an erase. So
   mid-gesture the surface says *which* of the two is armed, which the toolbar
   cannot: on a phone the toolbar is behind the left drawer.
8. **The duplicate's drop moved from pointerdown to the press that stays
   still**, on every pointer type. A mouse cannot get the old rule wrong and a
   finger cannot get it right: with a copy armed, every attempt to scroll the
   grid would have written one. Verified below, because it is the one behaviour
   change in this slice that a desktop user could notice.
9. **`touch-action: none` is on exactly two things in the product**, and the
   census below is in the browser rather than in this paragraph: issue 12's
   drawer handle, and this ticket's resize knobs, which its own `## What to
   build` asks for by name. The armed draw beats the scroller by
   `preventDefault` on a non-passive `touchmove` instead — variant A's premise,
   and **issue 15's gate**.
10. **There is no rule about the compositor, there is an instrument.**
    `reportCompositorLoss` warns once per reason per page load when a
    `touchmove` arrives with `cancelable === false` while armed, or when a
    `pointercancel` takes an armed draw. Prototype 10 printed the same verdict
    into a page of its own and nobody could open it on a phone; this prints it
    into the console of the real build, which is where issue 15 can read it. It
    fires only when the design has failed, so "console clean" is still a claim.
11. **The settle window is 250ms and the number says it is a starting number.**
    Vaul defaults `scrollLockTimeout` to 500ms and its author's article suggests
    100ms; that five-fold gap is the whole uncertainty and arithmetic cannot
    close it. 250 is argued rather than split: 100ms is shorter than the gap
    between two flicks of one motion, so the second flick would close the drawer
    instead of scrolling it; 500ms is long enough that a deliberate swipe right
    after reaching the top reads as a dead control. The two failures cost
    differently — a missed close costs one more swipe, a spurious close costs
    the reader their place — which argues for the longer end of whatever issue
    15 measures.
12. **Selection is a touch-only concept, and the handles are an accelerator.**
    A mouse resizes by drawing over a block or erasing part of it; a finger has
    neither, which is prototype 10 §3's *"the only part of the desktop model
    that has no touch equivalent at all"*. So a touch write leaves its block
    selected and the two 44px knobs appear on the `(hover: none)` path only —
    which also sidesteps the measured collision the prototype found, since at
    44px rows a 30-minute block's two handles abut exactly rather than
    overlapping. They are `aria-hidden`: ticket 01's standing correction is that
    a gesture may be the accelerator and may not be the only route, and the
    routes here are the popover's `I'm free` / `Erase block`, reachable from the
    tap. See `### Left behind` for what that does not cover.
13. **The month's touch drag is `## What to build`'s fourth view, and ticket
    14's conflict is not closed by it.** Tap-to-inspect and drag-to-draw are
    still the same rectangle — measured at **54×122** at 375px, which is issue
    12's correction confirmed again — and what makes it tolerable is 450ms of
    stillness plus the fact that neither a tap nor a swipe can write.
    `DayPanel`'s `I'm free all day` / `Erase this day` **stay**, exactly as
    trap 4 requires. Arming a month cell and releasing without moving commits
    *that day, all day*, because the unit of that grid is the day and ticket 01
    says a month drag means 00:00–24:00 for each day crossed.

### Verified in the browser, driving the real UI at 375×812

Every gesture below was synthesised as `PointerEvent`s with
`pointerType: 'touch'` and dispatched at the app — no capture in the path, so
they land. Geometry first, because three of the plan's numbers were predictions:

- **Week columns 47.9px**, 48 rows × 44px = 2112px, in a 614px scroller: eight
  hours on screen and 3.4 screens to scan a day. Prototype 10 predicted 47.3px
  and 8.0 hours. **3-day columns 111.7px** and **the day view's single column
  335px**, both issue 12's measurements again. **Month cells 54×122.**
- **A tap reads.** `Mon 31 Aug · 02:00–02:30`, *"You haven't marked this"*,
  `＋ I'm free` — and the row count went 105 → **105**. The popover fits at
  375px; Base UI shifts it in.
- **Nothing arms before 450ms.** At 200ms into a press: no ring, no tag. At
  550ms: the ring is `oklab(… / 0.75) 0 0 0 3px inset` and the tag reads
  `02:00–02:30 · 30m` — the arm-with-no-move draft is exactly one 30-minute
  block. Dragged four rows: `02:00–04:30 · 2h30`, and the commit was those five
  Slots and no others.
- **A pre-arm vertical swipe is handed back.** After a 120px upward swipe, no
  ring and no draft **600ms later** — the arming timer was cancelled, not
  merely outrun.
- **A pre-arm horizontal swipe pages, by the view's own block.** `Aug – Sep
  2026` → `September 2026` on −90px, back on +100px, and **no change** on −35px.
  In the day view: `Sun 6` → `Mon 7`. In the month: `September 2026` →
  `October 2026` → back, which is `addMonths` and not 30 days. No panel opened
  from a swipe that began and ended on one cell.
- **After arming, neither happens.** A 132px *horizontal* move on an armed drag
  drew across into the next column and left the label untouched.
- **The hysteresis budget, on prototype 10's own failing case.** Anchored **94%
  across** a 3-day column with **30px** of lateral drift at release: the draft
  stayed in the anchor's column and committed `02:00–04:30` on one day. The same
  anchor with **60px**: it crossed, and the draft rendered as one continuous
  linear range — `02:00–24:00 · 22h` plus `00:00–04:30 · 4h30` on the next day.
  A boundary-relative budget accepts the first from that anchor; this one does
  not, which is the whole of ticket 01's mitigation being replaced.
- **Edge auto-scroll, with the anchor holding.** The finger was parked at a
  fixed client y inside the bottom band and **never moved again**. The scroller
  ran 0 → 98 → **441px** under it while the draft grew `02:00–02:30` →
  `02:00–08:00` → `02:00–12:00`, and the commit was **20 contiguous Slots
  starting at the anchor**. That is the pixel-anchor corruption prototype 10 hit
  in mirror image, not reproduced.
- **Erase by touch, distinguishable while armed.** With the toggle on, the ring
  is `oklch(0.58 0.22 27)` rather than the viewer's hue and the tag reads
  `02:00–02:30 · 30m erase` in the same red. An armed erase drag with
  auto-scroll took `02:00–13:30` back out, through `useEraseGuard` — no dialog,
  correctly, because nothing on that day was holding a Hangout.
- **The month drawable.** 200ms: no draft. 550ms: one whole-day draft. Dragged
  across three cells: still **one** rectangle, which is issue 11's merge rule.
  Released: **144 rows** = 3 × 48. Erased by the same gesture with the toggle
  on, and the range came back byte-identical.
- **The handles.** 44px hit area, 47px wide, `touch-action: none`, a 34×14 knob;
  the top one at the run's first row boundary and the bottom one at its last.
  Bottom handle down 132px → draft `04:30–06:30 · 2h`, four rows added. Back up
  132px → `05:30–06:30 · 1h erase`, two rows removed, no dialog. Both times the
  knobs re-seated on the new edges, and they hide while a gesture is in flight.
- **Duplicate by tap-to-drop, and the hazard decision 8 closes.** `Duplicate`
  armed, then a vertical swipe: **nothing written**. Then a tap: a five-Slot
  copy landed at the tapped Slot and the armed state cleared.
- **The instrument fires.** A `touchmove` dispatched while *holding* is not
  cancelled — the scroll is still the browser's. Once armed, a cancelable one
  **is** cancelled, and an uncancelable one produced exactly one console line:
  *"[touch] the scroller took an armed draw (uncancelable-touchmove): phase
  live. This is issue 15's gate — preventDefault did not win."*
- **The drawer's scroll-chained close.** From `full`/690 at `scrollTop: 0`, a
  downward swipe on the cards tracked the finger (690 → 670 → 360,
  `data-drawer="dragging"`) and released to `peek`/120. At `scrollTop: 300` the
  same swipe left the drawer at 690 and never entered `dragging`. With the
  scroller made scrollable by injecting 900px of filler — issue 12's technique
  on the drop dialog — a swipe beginning **~10ms after** the scroller arrived at
  its top did **not** arm the close; the identical swipe **300ms later** did.
  At the peek a downward swipe on the body does nothing at all.
- **The handle is untouched.** Tap → `peek`, tap → `full`. Dragged from the
  peek: 622 while `dragging`, released to 690 = 0.85 × 812.
- **The `touch-action: none` census.** Every element in the document, computed:
  **one** — the drawer's `Collapse Hangouts` handle. With a block selected, the
  two knobs join it, inside their grid column.
- **A card tap in the drawer still opens its detail**, a close drag does not
  open the card it ended on, and the tap *after* a close drag opens it again —
  see below.
- **The desktop, unbroken.** At 1440×900: rows back to **20px** (960/48),
  120px columns, both panes expanded, no drawer, and **no handles**. A mouse
  drag with no hold at all drafted `02:00–04:30 · 2h30` immediately and
  committed it; a bare click opened the popover and `Erase block` took it away.
- **Both themes.** The ring is the viewer's hue or `--destructive`, the knob is
  `friendColour` with a `border-background` ring; in dark the drawer's ground is
  still `oklch(0.205 0 0)`. Nothing in the new code asks which theme is on.
- **Console clean** throughout, apart from the one `[touch]` line the instrument
  was deliberately made to emit.
- **The database is back where it started.** Every write went to Slots the
  viewer did not hold, and the 31 Aug – 6 Sep range compares **byte-identical**
  to the snapshot taken before any of it (105 rows, the same 105 timestamps);
  8 Sep – 4 Oct likewise (624). 7 and 8 September are empty again. Both
  Hangouts untouched.

### One thing the browser caught, which review would not have

**A latch cleared only by the event it is waiting for swallows the next
gesture.** The close drag sets a flag so the `click` the browser sends afterwards
does not open the card the finger let go on — and after a close drag that
produced no click, the flag stood, and the *following* tap on a card opened
nothing. `use-month-gesture.ts` states this exact hazard about its own `dragged`
flag; the fix is the same one it uses, which is to clear the flag at the start of
every press rather than only on the event that consumes it.

### Left behind

- **The compositor question is still issue 15's, and nothing here narrows it.**
  A synthetic `touchmove` is cancelable by construction, so "preventDefault
  wins" was verified as a *mechanism* and not as a race. That is why the
  instrument exists rather than a claim.
- **Two-finger pan inside an armed draw is not built**, as prototype 10 flagged.
  Edge auto-scroll covers extending a draft past the viewport; nothing covers
  "scroll somewhere else without letting go".
- **No edge auto-scroll in the month, and none is missing** — the lattice is
  five or six `flex-1 basis-0` rows filling the inset, so on a phone there is
  nothing to scroll.
- **The handles have no keyboard or screen-reader route**, and neither does the
  create gesture. A finger with VoiceOver can read the grid, open the popover,
  land a 30-minute block and erase a run; it cannot set a length. That gap is
  the create gesture's, not the handles', and closing it means a control that
  names a duration — which no ticket asks for yet.
- **Escape does not clear the selection while a popover is open**: Base UI takes
  the key first. With nothing else open it does. The selection is cleared by the
  next press anywhere on the grid regardless, which is the route that matters on
  a touch screen.
- **A draft crossing midnight shows one tag per per-day rectangle**, so a
  26-hour linear range is labelled twice — each rectangle naming itself. That is
  the renderer's existing per-run contract rather than something new, and the
  two labels are both true.
- **The week view's own drift hazard is unchanged and unfixable by tuning**, as
  issue 10 decided: at 47.9px columns no anchor budget can exceed a column
  width. The escape hatch is the view selector, and the 3-day measurement above
  is what makes that a real answer rather than a hope.
- **44px rows fail below 360px viewport width**, prototype 10's finding, still
  true and still not designed for. At 375px a week cell is 47.9×44 with no
  margin.

### State of the checks

`npx tsc -b` clean for all three projects. `yarn test` **237 passing** — 212
from issue 12 plus 25 new: 16 in `touch.test.ts` (the three pre-arm verdicts and
the thumb-arc case, the paging commit distance and its direction, the edge
band's proportional speed and its cap, the duration label including the 25-hour
day) and 9 added to `drawer.test.ts` (both halves of `mayChainClose`, including
the overscrolled negative `scrollTop`, and `bodySwipe`'s four cases).
`yarn lint` unchanged at the **9** pre-existing errors in `src/components/ui/`
and `grid-pattern.tsx` — `touch.ts` is a plain module and every helper this
slice added to a `.tsx` file is a component. `verify-hangout.mjs` **28** checks
and `verify-hangout-lifecycle.mjs` **35**, both green and both re-run after the
browser work. `verify-availability.mjs` deliberately not re-run: it ends by
seeding demo rows, and this slice changed no SQL and no write path.
