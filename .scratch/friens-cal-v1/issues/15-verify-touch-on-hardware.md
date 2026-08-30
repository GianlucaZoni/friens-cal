# 15 — Verify touch on real hardware

Status: ready-for-human
Blocked by: 13

## Parent

[friens-cal v1 map](../../shared-availability-calendar/map.md)

## What to build

Nothing. This closes the **one claim in the whole plan that rests on scripted
events rather than a real compositor**, and it matters because long-press is the
create gesture.

Every touch measurement behind issue 13 came from synthesised pointer events.
Those exercise the state machine but not the compositor, so one question is
**instrumented but unmeasured**: *can `preventDefault` still cancel a native
scroll once a long-press arms?* If it cannot, the create gesture fights the
browser and issue 13's design needs revisiting — so this is a gate, not a
formality.

Run on **one iPhone and one Android**, on the real build.

The iOS Simulator gets you **half** of this: it runs real Mobile Safari on real
WebKit, so the `preventDefault` question is genuinely testable there. It cannot
tell you whether a 44px row is comfortable under an actual thumb, because its
touches are synthesised. Use it to narrow the question, not to close it.

## Acceptance criteria

- [ ] `preventDefault` cancels the native scroll once armed — confirmed on iOS
- [ ] Same confirmed on Android
- [ ] A 44px row is reliably hittable with a thumb on both
- [ ] Swipe-paging and long-press-to-draw do not misfire into each other
- [ ] Edge auto-scroll behaves on a real touchscreen
- [ ] Findings recorded; if `preventDefault` loses, issue 13 is reopened

## Blocked by

- [13 — Touch drawing](./13-touch-drawing.md)
