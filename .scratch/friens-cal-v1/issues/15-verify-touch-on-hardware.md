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

## Ready — what issue 13 shipped, and where to read the answers

Issue 13 landed on 6 September 2026. Two things were built **for this ticket**
rather than for the feature, so that the run is a reading rather than a
judgement.

**1. The `preventDefault` question prints itself.** `touch.ts`'s
`reportCompositorLoss` writes one `console.warn` per reason per page load, and
only when the design has failed:

```
[touch] the scroller took an armed draw (uncancelable-touchmove): phase live.
        This is issue 15’s gate — preventDefault did not win.
[touch] the scroller took an armed draw (pointercancel): armed draw cancelled.
```

The first line is the gate. It fires when a `touchmove` arrives with
`cancelable === false` after a long-press has armed, which is the browser saying
it had already committed the gesture to a scroll. **If that line does not appear
after a dozen deliberate long-press-and-drag draws on each phone, the claim is
confirmed.** The second line is weaker evidence: a `pointercancel` mid-draw is
also what an incoming call or a system edge gesture does, so read it with the
first rather than on its own. Both were checked to fire correctly under
synthesised events — what cannot be synthesised is the race.

The design's own reason for expecting to win is worth having in hand while
testing it: arming requires the finger to have stayed inside a 10px circle for
450ms, so no scroll has begun by the time the draft appears. The failure to
watch for is therefore the *drift* case — a thumb that creeps 8px while holding,
then drags.

**2. The settle window is one constant with one name.** `SETTLE_MS` in
`src/shell/drawer.ts`, shipped at **250ms**, with the argument for that value
written beside it: 100ms is shorter than the gap between two flicks of one
motion, 500ms reads as a dead control, and the two failures cost differently.
Change the number, reload, feel it again — nothing else reads it. What to try to
break: flick the card list hard so momentum carries it into the ceiling, and
keep flicking. The drawer must not close under the thumb. Then, deliberately,
scroll to the top and swipe down. That must close it and must not feel dead.

**3. What synthetic pointers already settled**, so the hardware run does not
have to re-prove it: all four views draw, arm and page; the anchor survives
441px of edge auto-scroll; the 3-day hysteresis budget rejects 30px of drift
from an anchor 94% across a column and accepts 60px; the scroll-chained close
arms at the top and only at the top. Issue 13's `### Verified in the browser`
has the numbers. What none of it touches is the compositor and the thumb, which
is this ticket.
