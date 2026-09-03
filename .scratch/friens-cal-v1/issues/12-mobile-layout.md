# 12 — The mobile layout

Status: ready-for-agent
Blocked by: 08, 11

## Parent

[friens-cal v1 map](../../shared-availability-calendar/map.md)

## What to build

What the application *is* on a phone. Mobile is fully in scope; this is the
layout, not the gesture (issue 13).

**Top bar** — left: the **sidebar icon** (not a hamburger), opening the left
sidebar as a drawer. Centre: **month + year** with a chevron opening a
**calendar navigator** for jumping to other dates. Right: **Today** and the
current Friend's blobatar.

**Left drawer** (the shell's mobile sheet) — the view selector
(day / 3-day / week / month), the drawing-mode and erase controls, and the
Friend roster with **always-visible** eye toggles.

**Bottom drawer** — the right sidebar's contents, permanently **peeking** and
draggable out to full height. The peek shows **one labelled card**:

- **"Upcoming"** with the nearest Hangout that has not yet ended, or
- **"Best Candidate"** with the first element of the Candidate list, or
- whichever of the three empty states applies.

**Month view ships on mobile without avatars.** At ~50×60px a cell would put
wrapped avatars below the 12px floor — dropping them removes the floor rather
than fighting it, and costs nothing because tap already answers *who*.

**Opening the left drawer collapses the bottom drawer to its peek.** The shell
allows one sheet slot below 768px; two draggable surfaces open at once on a
375px screen means two competing drag targets and two focus traps.

**The phone is a first-class editor** — drawing, confirming, retiming and
cancelling all reach it, so issue 10's two dialogs must work at 390px.

**Card controls on touch**: none on the card. **Tapping a card opens a detail
sheet** holding every action — Confirm for a Candidate, cancel and edit-times
for a Hangout. This subsumes the 3-dots and keeps the rule that a bare tap never
writes.

## Acceptance criteria

- [x] Top bar as above; the chevron opens a date navigator, not month view
- [x] Left drawer holds view selector, drawing mode, erase toggle and roster
- [x] Roster eyes are permanently visible on touch; the row is the toggle
- [x] Bottom drawer peeks with the labelled card, and drags out to full height
- [x] Peek label is "Upcoming" when a Hangout has not ended, else "Best Candidate"
- [x] Opening the left drawer collapses the bottom drawer to peek
- [x] Only one sheet can be open at a time
- [x] Month view renders on mobile without avatars
- [x] Tapping a Candidate or Hangout card opens a detail sheet with all actions
- [x] Retime and cancel dialogs are usable at 390px
- [x] Verified at 375px and 390px, both themes
- [x] `npx tsc -p tsconfig.app.json --noEmit` is clean

## Blocked by

- [08 — The Candidate list](./08-candidate-list.md)
- [11 — Month view](./11-month-view.md)

## Built

`src/shell/view.ts` (the four views' arithmetic, tested), `view-selector.tsx`
(one control, two placements), `peek.ts` (what the drawer's peek chooses,
tested) and `drawer.ts` (its geometry, tested) are the new modules. The bottom
drawer itself lives in `shell.tsx` beside the fork it changes; everything else
is rewiring. **No SQL**, as issue 11 predicted for its successor.

### The decisions this slice had to make, not just carry

1. **Day and 3-day are built, and they are `WeekGrid` with fewer days.** The
   ticket's `## What to build` asks for a four-option selector and none of its
   twelve criteria says day or 3-day must *render*; issue 13's criteria say all
   four must be **drawable**. Shipping a two-option selector would have handed 13
   a blocker on the exact thing that makes its own answer acceptable — its
   measured objection is that at a phone's 47px week columns *"no hysteresis
   budget can exceed a column width"*, and the two things it offers against that
   are a deliberate long-press and *"the view selector gives an escape to 3-day
   (110px)"*. So the escape hatch is the load-bearing half, and it is built.
   **Measured at 375px: the 3-day columns are 112px** and the day view's single
   column is 335px — 13's number, confirmed in the app rather than in a
   prototype. `WeekGrid` needed no change at all: it derives its columns, the
   shared hour gutter, the DST odd-day's own gutter and the gesture's
   hit-testing from `days` alone.
2. **Three arrays became one, and it closes issue 11's hole by construction.**
   `useCalendarView` handed out `days` (always the anchor's week), `monthDays`
   and `shownDays`, because `days` had two jobs: the week grid's columns *and*
   the stores' range. That is what opened the fetch hole issue 11 closed — the
   month lattice starts up to five weeks earlier and `floorOfView` reads the
   first day it is handed. With four views there is no reading under which "the
   anchor's week" is the right answer to anything, so `daysOf(view, anchor)`
   answers the one question all three fields were circling. Issue 11's fix stays
   correct; what goes is the second thing somebody had to keep in step.
3. **The bottom drawer is not a `Sheet`, and the shell's invariant is
   *narrowed* rather than worked around.** `SheetContent` is Base UI's `Dialog`:
   modal, backdrop, focus trap, absent by default — and the ticket wants the
   right pane's contents *"permanently peeking"* with the grid live behind them.
   `vaul` is not a dependency and `src/components/ui/` has no drawer, so this is
   the one genuinely new mechanism in the slice. Ticket 12 decision **8** made
   `sheet: Pane | null` so a second sheet was **unrepresentable** (decision 7 is
   the fork itself, which that invariant is the reason for); issue 12 makes it
   `'left' | null`, which says something stronger:

   > **At most one modal surface, and the bottom drawer is not one.**

   A right-side sheet is no longer something this shell can be asked for — the
   compiler enforces it, and `ShellSidebar`'s sheet branch writes `'left'` out
   rather than reading `side`. The drawer sits outside the slot because it is
   outside the class of thing the slot governs: never absent, three states
   rather than two, and no focus trap to compete with. `AppShellProvider` pads
   its own bottom by `DRAWER_PEEK`, so the peek sits in **reserved** space and
   only the part dragged out over it covers the calendar — a drawer that simply
   overlaid would permanently hide 120px of grid on the screen with least of it.
4. **`⇧⌘B` still means *show me the Hangouts pane*.** Below the breakpoint that
   pane is the drawer, so `toggle('right')` toggles peek/full rather than
   becoming a shortcut for nothing, and `ShellTrigger`'s `aria-expanded` reads
   the drawer when it is the surface in play. The trigger is **not** in the
   phone's bar — ticket 12's *prototype* §4 asked for both triggers to be
   permanently visible because both panes were sheets and a sheet without a
   trigger is unreachable; its live `## Decisions` never restates that, so this
   is a finding being honoured rather than a decision overturned. A drawer that
   is already on screen with its own grab handle is not unreachable.
5. **The drag does not capture the pointer, and `touch-action: none` is on the
   handle only.** `use-month-gesture.ts`'s argument applies twice over here:
   window listeners registered on pointerdown make a drag released outside the
   element commit rather than hang, they leave the handle a real `<button>` a
   keyboard can reach, and — issue 11's third consequence — they are the reason
   the drag could actually be *driven* in verification rather than described.
   The `touch-action` decision was taken **with issue 13 in mind rather than
   after it**: the drawer's drag target is an 18px strip with a grip in it, the
   calendar keeps its default touch behaviour entirely, and the two gestures
   never share a surface. That is the same rule 13 states for its own resize
   knobs.
6. **The handle's click handler is keyboard-only, via `event.detail`.** A tap
   fires pointerdown, pointerup and then `click`, so the pointer path and the
   click path toggled in the same frame and cancelled out — caught in the
   browser, not in review. A latch (*"this click came from a pointer"*) works
   until a gesture ends in `pointercancel` and never sends the click that would
   clear it, and then the **next keyboard press** is swallowed. `detail` is the
   discriminator the DOM already has: it counts clicks for a real press and is 0
   for one the keyboard produced. Verified both ways.
7. **The phone's bar is a different bar, and it reverses three live
   decisions rather than quietly dropping them.** Ticket 12 decision 6 made the
   narrow behaviour CSS-only by evicting controls: Today became the date label,
   and the view select moved into the blobatar menu. Ticket 17 gives the phone
   somewhere else to put them, so **Today comes back as its own control** (and
   the label loses the dotted underline, because an underlined label that no
   longer responds is worse than a plain one), **the view select moves into the
   left drawer** rather than the account menu, and **a chevron appears** that
   nothing had before. Each of those comments was amended where it stands.
8. **`‹ ›` leave the phone's bar, and that costs something for one slice.** The
   ticket names three groups; the prototype measured that a fourth does not fit
   at 375px and that *"the first thing it eats is the date range label, which is
   the one thing on the bar you cannot do without"*. So until issue 13's
   horizontal swipe lands, moving a week on a phone is *open the navigator, tap a
   day* rather than one press. Nothing is unreachable — the navigator is a full
   month with its own arrows — but it is two taps instead of one, deliberately,
   and 13 is what pays it back. `goPrevious`/`goNext` already step by the current
   view's block, which is exactly what 13's swipe needs to call.
9. **The navigator is `MiniCalendar`, not a third date surface.** It is the only
   control in the app that jumps to an arbitrary date, and it carries the
   argument about the browsed-month-versus-anchor split being *a derivation, not
   an effect*; a second implementation would be a second place to get that
   wrong. It gained one prop, `onPicked`, because a popover has to close on the
   press that moved the anchor and a sidebar does not. Its `inView` band now
   marks **every non-month view** rather than only the week — `view === 'month' ?
   {} : { inView: days }` — which is one case rather than a case per view, and
   the month is the exception in the honest direction: the picker below is
   already a month, so marking all 42 lattice cells would say *everything* rather
   than *here*, and the anchor's own mark is what answers it (issue 11 decision
   3, from the other side).
10. **The mini calendar leaves the left drawer on a phone**, and the view
    selector takes its place. Ticket 17 lists the drawer's contents and the
    picker is not among them, for a reason one level up: the bar's chevron opens
    that same picker, so a copy in the drawer would be the second of two, one of
    them behind a drawer you have to open first. Ticket 12 decision 4 (*keep the
    mini calendar in the left sidebar*) is about the desktop pane and stands
    there untouched. It is the same shape as decision 6 one level up: controls
    move between the bar and the pane as the width changes, and it is the *pair*
    that has to stay complete.
11. **"Only one sheet at a time" is a claim about the two panes, and it now
    holds by construction.** A card detail is a different object: issue 10 built
    it as a bottom `Sheet` on the `(hover: none)` path and it has coexisted with
    the left drawer ever since. Tapping the peek's card therefore puts a modal
    sheet over a non-modal drawer, which is one focus trap, not two — and below
    the breakpoint the shell's slot can now only ever hold `'left'`, so the
    criterion is stronger than it was rather than merely still true.
12. **The mobile month drops the avatars as a prop, not a fork** — `faces`,
    defaulting to `true`, decided by `isSheet` because the argument is about cell
    *width* and not about the pointer (trap 9's question: width or hover). The
    cell's `aria-label` still names everyone, so nothing is lost to a screen
    reader at all; **verified live**, on a cell drawing no faces:
    *"Thursday 3 September · 2 free at once — Gianluca, UserTwo · you are free ·
    Hangout at 12:00 · today · selected"*. See the correction below, which is
    about the measurement rather than the decision.
13. **The peek is one real card, and the same card.** `HangoutCard` or
    `CandidateCard`, with the same detail sheet behind a tap — so the peek is a
    window onto the list rather than a summary of it, and confirming the best
    Candidate is reachable without dragging anything. "Nearest" is computed as
    the earliest `startsAt` among the unended set rather than taken off the head
    of the store's array: the store reads `.order('starts_at')`, but a realtime
    insert arrives wherever it arrives, and the peek is the one place where being
    one card wrong is being *entirely* wrong — there is no second card under it
    to correct the impression.

### Verified in the browser, driving the real UI at 375×812 and 390×844

- **The bar, at 375.** Sidebar icon · `Aug – Sep 2026 ⌄` · `Today` · blobatar.
  The chevron opens the navigator as a popover carrying the real mini calendar
  with its own `‹ ›`; picking 12 August closed it, moved the anchor and relabelled
  the bar to `August 2026` in one press.
- **The left drawer** holds `View: Day / 3 days / Week / Month`, `Drawing mode:
  Linear / Multi-day`, `Erase`, and the roster with **the eye visible on all
  three rows** — which is ticket 12 decision 8 already shipped, not rebuilt.
- **The drawer's three states, driven by synthetic pointers.** From the peek at
  120px, a drag up tracked the finger 1:1 through 160 → 280 → 440 → 600 with
  `data-drawer="dragging"` throughout, and released to **690px = 85% of 812**.
  Dragged back down 80px it returned to 600 and snapped *back* to full (still
  above the 405px midpoint); dragged down 400 it went to 290 and snapped to peek.
- **A tap toggles exactly once.** Pointer pair plus the browser's own
  `detail: 1` click → peek→full, one transition. A `detail: 0` click (keyboard,
  and what `element.click()` produces) → one transition the other way.
- **The cross-surface rule.** Drawer at `full`/690 → open the left drawer →
  `peek`/120, with exactly one sheet in the DOM.
- **Crossing the breakpoint, live and both ways.** 800px with the right pane
  *collapsed* → narrow to 375: two columns become one left sheet plus a
  `bottom:peek` drawer at 120px with the shell reserving `padding-bottom: 120px`.
  Drag the drawer out to 690 → widen to 1200: no drawer, no sheet, padding back
  to 0, panes back to `left:expanded` / `right:collapsed`.
- **The peek's card, and its ordering rule.** `UPCOMING · goopy · Fri 4 Sep ·
  12:30 – 20:00`. After confirming a Candidate for Thu 3 Sep the peek switched
  to the **nearer** plan — `UPCOMING · Hangout · Thu 3 Sep · 12:00 – 15:30` —
  which is `peekOf`'s earliest-start rule in the app.
- **A tap on the peek card opens the detail over the drawer**: one
  `data-side="bottom"` sheet, carrying the editable name and Save, the time with
  `Change the time…`, Gianluca's face, `edited by UserTwo · Wed 2 Sep, 19:05`,
  `Join`, and `Cancel this hangout…`. Every action ticket 16 named, on a phone.
- **The dialogs at 375.** Retime: **343×403 at top 205**, the consequence
  sentence above the controls, `Day` full width and `From`/`To` side by side at
  ~150px each, the confirm correctly disabled while nothing has moved. Cancel:
  **320×205**, destructive action first, `Keep it` below.
- **The drop dialog, including the case that made me change it.** With one
  Hangout it is 320×233. With **twenty** `<li>`s injected into the live list it
  caps at 780px inside 812, the list scrolls (579 of 792), and *both buttons stay
  fully on screen* — which is what the new `max-h` plus the scrolling `<ul>` buy.
  Before the change an unbounded list ran off both ends of a dialog centred with
  `-translate-y-1/2` and took the buttons with it: the one dialog in the product
  whose whole job is to be read before it is answered, unanswerable.
- **`Keep it` wrote nothing** — 15 Slots still held on the Thursday afterwards,
  which is issue 10's gate re-proved from the phone.
- **The month without faces.** 35 cells at 375×812, `img` count in the grid
  **0**, wash present, merged own-Availability rectangles, the today pill on 3,
  and the chip `⚲ 12:30` on Fri 4. In August 2026 — six lattice rows — 42 cells,
  still zero faces.
- **Both themes.** The drawer's ground is `oklch(0.985 0 0)` light and
  `oklch(0.205 0 0)` dark, which is `bg-sidebar` in both: nothing in the new code
  asks which theme is on.
- **The desktop, unbroken.** At 1440 the bar reads `Aug – Sep 2026 · Today · Day
  · 3 days · Week · Month · Toggle Friends · Toggle Hangouts` with both panes
  expanded, no drawer and no bottom padding. At **800px** — the tightest desktop
  width there is — the cluster is 378px, the label 118px and not truncated, the
  bar does not scroll, and the views abbreviate to `D / 3D / W / M`.
- The database is back to two Hangouts (`goopy`, `Coffee`) and every range
  touched is back to its prior rows. Console clean on a fresh tab in both themes.

### A correction to ticket 17's measurement, not to its decision

Ticket 17 drops the mobile month's avatars because *"a ~50×60 phone cell puts
wrapped avatars below the 12px floor"*. **The width is right and the height is
not.** Measured at 375×812: **54×122** for a five-row month and **54×102** for a
six-row one, because the rows are `flex-1 basis-0` and fill whatever height the
inset has. At 102px of height nine 12px faces would in fact fit vertically.

The decision stands, and it does not need the height to. At **54px wide** a
wrapped row holds three faces, so the whole group is three stacked rows of three
in a column narrower than a thumb — and the channel is *who*, which `AVATAR`'s
own table says is only worth spending pixels on while a face is still a face.
The height measured here is also the *best* case: it is what a 812px viewport
with nothing else on it gives, and it shrinks with the address bar, a smaller
phone, or anything the inset has to share. What the ticket got right is the
conclusion and the width; what it assumed is a cell height this layout does not
produce, and the number should not be re-quoted as measured.

### Left behind

- **The peek's other two branches are unit-tested, not pressed.** `peekOf`'s
  choice is pinned by five tests and the Hangout branch was driven live, but the
  *Best Candidate* and *empty state* renderings were not: both require the
  pinned region to be empty, and the demo project has an unended Hangout in it
  that nothing short of cancelling `goopy` would remove — which does not restore
  byte-identically (a new id, and no way to put `edited_at` back). Both branches
  draw components already verified elsewhere on this screen.
- **The peek's height is a constant, and it clips.** 120px holds a Hangout card
  comfortably; a Candidate card with two rows of wrapped faces is taller and the
  overflow is hidden. Sizing to content instead would move the grid's bottom edge
  every time the roster changed, which is worse — but it does mean a large group
  loses a face row *in the peek only*, and the card is one tap from a sheet that
  shows all of them.
- **Nothing on the phone pages by one gesture.** Issue 13 owns the swipe; see
  decision 8 for what it costs until then.
- **The month's day panel is the only writer on a phone.** `use-month-gesture`
  still ignores touch pointers and `useDrawGesture` never saw one, so `I'm free
  all day` / `Erase this day` remain the interim issue 11 named. Unchanged by
  this slice, and 13's.
- **`useIsMobile` is still unused and still effect-based.** Three answers to *is
  this a phone* is two too many; this slice added none and used the two
  synchronous ones (`isSheet` for width, `useHoverPointer` for pointer). Deleting
  the third is somebody's tidy-up and no ticket asks for one.

### State of the checks

`npx tsc -b` clean for all three projects. `yarn test` **212 passing** — 186 from
issue 11 plus 26 new: 14 in `view.test.ts` (which days each view draws, the four
block sizes, the month step's clamp at 31 January, and the label's three
straddle cases), 5 in `peek.test.ts` and 7 in `drawer.test.ts`. `yarn lint`
unchanged at the 9 pre-existing errors in `src/components/ui/` and
`grid-pattern.tsx`. `verify-hangout.mjs` 28 checks and `verify-hangout-lifecycle.mjs`
35, both green and both re-run after the browser work. `verify-availability.mjs`
deliberately not re-run: it ends by seeding demo rows, and this slice changed no
SQL and no write path.

## Review pass

Both axes of `/code-review` against `main`. Four findings acted on, two answered,
and one that both axes found independently.

### Acted on

1. **The drawer's full height was two numbers in two units, and both reviewers
   found it.** `drawer.ts` said outright *"two places have to agree about one
   number"* and then the resting height was a CSS class `h-[85svh]` while
   `dragTo` and `snapOf` clamped and snapped against
   `fullHeightOf(window.innerHeight)`. Those agree on a desktop, which is why
   the verification pass measured 690 = 0.85 × 812 and saw nothing wrong. On a
   phone they do not: `svh` is the **small** viewport — the height with the
   address bar showing — and `innerHeight` is whatever the bar is doing right
   now, so with the bar retracted the drag ceiling sits *above* the height the
   drawer actually rests at and a release near the top snaps to `full` and then
   visibly shrinks. Now one number, in `innerHeight`, held in state and synced
   on `resize`: it drives the style at both resting heights and the arithmetic,
   and the class is gone. `innerHeight` is the right one of the two because the
   drawer is `fixed` and the viewport is what it is positioned against.
2. **The window listeners had no unmount teardown**, against a convention
   `use-month-gesture.ts` sets explicitly — and the reason bites harder here,
   because **the shell itself unmounts this component mid-drag**. Crossing the
   breakpoint upward stops `ShellSidebar` rendering a drawer at all, which is
   exactly what rotating a phone with a finger down does. `release` is now a ref
   the unmount effect calls, following that file's shape.
3. **The tap path read `drawer` out of a closure captured at pointerdown**, and
   three things can move it underneath a press: the breakpoint sync, `setSheet`
   (the collapse rule), and `⇧⌘B`. The functional setter is not reachable — the
   context types `setDrawer` as `(state) => void` — so the fix is better than
   the one that was available: the toggle's target now comes from
   `snapOf(startHeight, full)`, a **measured** start height, which cannot go
   stale at all.
4. **No `pointerId` filter**, where `use-month-gesture.ts` has one. A second
   finger on the handle registered a second listener set whose release toggled
   in the opposite direction and cancelled the first. Now a drag in flight
   refuses a new pointerdown, and move/up are filtered by id.
5. **Two documentation errors and one stale claim**, all in the diff's own blast
   radius. `month-grid.tsx` still called the lattice `calendar.shownDays`, the
   field this slice deleted. And two citations above were wrong: the one-sheet
   slot is ticket 12 decision **8**, not 7 (7 is the fork, which the invariant is
   the *reason* for), and *"both pane triggers permanently visible"* comes from
   ticket 12's **prototype** §4 rather than its live `## Decisions` — so removing
   the right one from the phone's bar is a finding being honoured, not a
   decision overturned. Both corrected in place.
6. **Smells, taken.** `DrawerPeek` was hand-unpacking twelve props out of stores
   the caller holds intact — `roster` and `hangouts` now travel whole, which is
   right for a component private to this file even though `CandidateList` next
   door deliberately takes them unpacked (it is shared, and knowing about stores
   is not its business). `friendsIn` was duplicated from `candidate-list.tsx`
   into the peek and is now shared, which matters because the peek draws **the
   same `CandidateCard`** and the `undefined` that flatMap guards against is not
   a case worth two answers. It ended up in `use-candidates.ts` rather than
   where it started: exporting a plain function from a `.tsx` file that also
   exports components costs fast refresh, which is a lint error in this repo —
   the gate went to 10 and caught it. And `'Hangouts'` appeared twice as a
   label; `peekLabel` says it once, and says *why* the two cases share a word.

### Answered, not changed

- **Scope: day and 3-day render, and `drop-dialog.tsx` was hardened.** Both are
  beyond the literal twelve criteria and both are named as such rather than
  presented as required. The views are decision 1 above — issue 13's criteria
  make them load-bearing and its own hysteresis answer depends on 3-day
  existing. The drop dialog is the second of *"issue 10's two dialogs"* the trap
  list names; the criterion says "retime and cancel", and the erase-side plural
  dialog is a third one that fails at 390px in the same way and for the same
  reason, so fixing one and leaving the other would have been reading the
  criterion rather than the problem.
- **AC11 is partial in one corner, and `### Left behind` already says where.**
  The peek's *Best Candidate* and empty-state renderings were unit-tested and
  not driven at either width, because both need the pinned region empty and the
  demo project holds an unended Hangout that only cancelling `goopy` would
  remove — which does not restore byte-identically.

### The four fixes, re-driven in the browser

- **One number.** Expanded at a viewport of 812 → **690**; at 900 → **765**; at
  640 → **544**. Each is 0.85 of that viewport, and the last was measured on a
  drawer that was *already open* when the viewport changed — so the resting
  height follows the window rather than sitting where the arithmetic disagrees
  with it.
- **The second finger is refused.** Mid-drag at 620px, a second `pointerId`'s
  move did not move the height and its release did not settle the drawer; the
  state stayed `dragging` until the **first** pointer released, then snapped to
  690.
- **Unmount mid-drag is clean.** A drag left at 420px, then the viewport widened
  past the breakpoint: the drawer unmounted, the panes came back as columns, and
  `pointermove` / `pointerup` dispatched at the window afterwards produced
  nothing — no console error, no leaked handler writing into a dead tree.
- **The tap still toggles exactly once**, from the measured start height: at
  full it went to 120 and `peek`.

`npx tsc -b` clean, `yarn test` 212 passing, `yarn lint` back to the 9
pre-existing errors. Console clean at every step.
