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
