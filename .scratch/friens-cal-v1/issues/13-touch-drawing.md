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

- [ ] Tap opens the popover and never writes
- [ ] Long-press-then-drag creates, with a visible arming signal not under the finger
- [ ] Horizontal swipe before arming pages by the current view's block; vertical scrolls
- [ ] After arming, neither scrolls
- [ ] Edge auto-scroll extends a draft without corrupting the anchor
- [ ] Anchor is stored as a slot index
- [ ] Selection shows ~44px resize handles; `touch-action: none` on the knob only
- [ ] Erase works by touch and is distinguishable while armed
- [ ] Day / 3-day / week / month all drawable, and 3-day uses the working hysteresis budget
- [ ] `npx tsc -p tsconfig.app.json --noEmit` is clean

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
`scrollLockTimeout`, defaulted to 500ms; its article suggests 100ms. Pick by
measurement on the real hardware this ticket already owes a run on.

The scroller is `RightPane`'s own `SidebarContent`, and it is `overflow-y-auto`
only while the drawer is out — at the peek it is `overflow-hidden` and there is
one card, so the rule has nothing to arbitrate there and a downward swipe at the
peek must keep doing nothing rather than becoming a second close.

### Acceptance criteria (added to this ticket's own)

- [ ] At `scrollTop: 0`, a downward swipe on the drawer's body collapses it to
      the peek; anywhere else in the scroll range the same swipe scrolls
- [ ] Arriving at the top mid-flick does not arm the close until a measured
      settle window has passed
- [ ] The handle keeps working in both directions regardless of scroll position
- [ ] Nothing new gets `touch-action: none` outside the drawer

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
named fallback if the hand-rolled version does not survive this ticket's
real-hardware run — which is the one thing no library and no synthetic pointer
can settle for us, and which this ticket already owed. Adopting it then would be
a deliberate act with a measurement behind it, rather than a dependency taken on
a guess.
