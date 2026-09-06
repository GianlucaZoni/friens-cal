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
- [ ] **The bottom drawer's scroll-chained close**: at `scrollTop: 0` a downward
      swipe on the card list collapses it, a flick that *arrives* at the top
      mid-momentum does not, and the settle window that makes both true is
      measured rather than guessed

## Addition — the bottom drawer, from issues 12 and 13

Issue 12 built a bottom drawer whose only drag surface is its handle; issue 13
adds the gesture every native sheet has — **at `scrollTop: 0` a downward swipe
on the card list closes it**. That gesture has a number in it that this ticket
is the only place to settle: **how long after a fast flick reaches the top the
close stays refused.** Too short and a momentum scroll that hits the ceiling
closes the drawer under the reader's thumb; too long and a deliberate swipe feels
dead. Vaul defaults the same knob (`scrollLockTimeout`) to 500ms and its author's
own article suggests 100ms, which is the width of the uncertainty.

It is the same class of question as the one this ticket already exists for —
scripted pointer events exercise the state machine and never the compositor —
and it is why the criterion above is here rather than in issue 13.

**If it cannot be made to feel right by hand, the fallback is named**: issue 13's
`## Addition` evaluates `vaul`, which ships this behaviour, and records the cost
(it depends on `@radix-ui/react-dialog` while this repo is Base UI). Adopting it
would be a deliberate act with this ticket's measurement behind it.

## Blocked by

- [13 — Touch drawing](./13-touch-drawing.md)
