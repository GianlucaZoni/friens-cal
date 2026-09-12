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

- [x] `preventDefault` cancels the native scroll once armed — confirmed on iOS
      *(iOS Simulator, real WebKit on the real compositor, 12 Sep 2026. Never
      fired once across eight armed gestures, with a control proving the same
      surface scrolls without a hold. A real iPhone is still on the run sheet.)*
- [ ] Same confirmed on Android *(no device and no emulator available; run sheet §A)*
- [ ] A 44px row is reliably hittable with a thumb on both *(not answerable
      with synthesised touches; run sheet §B)*
- [x] Swipe-paging and long-press-to-draw do not misfire into each other
      *(both directions, iOS only; run sheet §C for Android)*
- [x] Edge auto-scroll behaves on a real touchscreen *(790pt of auto-scroll
      under a parked finger, anchor held; iOS only, run sheet §D for Android)*
- [x] Findings recorded; if `preventDefault` loses, issue 13 is reopened
      *(it won; issue 13 stands)*
- [ ] **The bottom drawer's scroll-chained close**: at `scrollTop: 0` a downward
      swipe on the card list collapses it, a flick that *arrives* at the top
      mid-momentum does not, and the settle window that makes both true is
      measured rather than guessed *(first two clauses confirmed on iOS, and
      the timer arm is live — `away.current` does get updated by off-main-thread
      momentum scrolling, which was the real risk. The **value** is not
      measured: two injected gestures cannot be put less than ~1s apart and the
      window is 250ms. `SETTLE_MS` left at 250. Run sheet §E.)*

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

## Findings, iOS Simulator, 12 September 2026

iPhone 17 (402x874pt), iOS 26.5, Mobile Safari, the dev build at
`localhost:5174`. Touches were injected through the simulator's HID layer, so
unlike every measurement behind issue 13 they crossed the real compositor. What
that still does not cover has its own section at the bottom.

Geometry first, because it confirms two of issue 13's numbers on a second
device width: rows measured **88pt per hour**, so `TOUCH_SLOT_PX` is 44 exactly;
week columns are **51.6pt** at 402pt wide, against issue 13's 47.9pt at 375pt.

### The gate: `preventDefault` won, and the control says so

**`uncancelable-touchmove` never fired.** Not once, across every gesture below,
with the page freshly loaded each time.

That only means something with a control, so here it is: **the same surface,
dragged with no hold at all, scrolls.** A 225pt upward flick with no long-press
ran the grid from 00-05 to 07-12, and inertia carried it well past the finger
travel. The browser wants that gesture. An armed draw takes it away.

Eight armed gestures, chosen to attack different parts of the claim rather than
to repeat one easy case:

| # | What it tested | Result |
|---|---|---|
| 1 | **Drift case.** 8.6pt of creep during the hold, then a 131pt drag | Drew Wed 9 03:00-05:00. Scroller did not move |
| 2 | Drift at the slop boundary, 9.2pt, drawing upward | Drew Mon 7 08:00-09:30 |
| 3 | Over-slop drift, 17.5pt, vertically dominant | Did **not** arm. Grid scrolled, no draft. Correct |
| 4 | Horizontal drag after arming, 130pt | Drew Tue 15 05:00 to Fri 18 05:30. Week label unchanged |
| 5 | 2.85s of continuous armed dragging | Drew Fri 11 01:00-05:00 |
| 6 | 2s parked in the bottom edge band | Drew Sat 12 01:00-14:30, see below |
| 7 | Month view, its own gesture hook | Drew 22-24 as one merged rectangle |
| 8 | Month view, arm with a 450ms hold | Armed, nothing to draw |

The drift case is the one the design is actually exposed to, and it is the one
that passed first. A thumb inside the 10pt circle for 450ms leaves no scroll
started, so there is nothing for the compositor to have committed to yet. That
is the argument `TOUCH_SLOP_PX` makes, and on real WebKit it holds.

**Issue 13 is not reopened.**

### `pointercancel` fired twice, and both times it was the harness

Two armed draws were cancelled mid-gesture, no draft committed, and on one of
them the browser took over and scrolled the grid. That looks exactly like the
failure this ticket exists to catch.

It was not. Both cancelled gestures had parked the finger at an **identical
repeated coordinate** for about two seconds. A synthetic path that repeats one
point emits no HID events at all, and the touch gets dropped. Re-running the
same gesture with **1pt of jitter** during the dwell, which is what a thumb
resting on glass actually does, produced no cancel at all.

The readout called this correctly at the time, because it prints the two reasons
differently: `pointercancel` reads *NOT the gate on its own*. Read on the
suffix alone the two lines are identical, and this run would have reopened issue
13 over an artefact of the test rig.

### Edge auto-scroll, and the anchor

Test 6 above is the criterion. Finger parked in the bottom band with 1pt of
jitter: the grid ran **00-05 to 09-14, about 790pt**, under a finger that never
moved, the anchor held at 01:00, and the draft grew to 14:30 and committed as
one run. `preventDefault` kept winning through two seconds of that, while the
scroller was being moved programmatically underneath it.

### Swipe-paging and long-press do not misfire into each other

Both directions, on real touch. A 112pt leftward swipe with no hold paged Mon
7-Sun 13 to Mon 14-Sun 20 and left the vertical scroll where it was. A 130pt
horizontal drag *after* arming drew across four columns and left the week label
alone (test 4).

### The drawer

Two of the three clauses are measured. The third is not, and cannot be from
here.

- **At the top, at rest, a downward swipe collapses it.** Confirmed. Note that
  `snapOf` is distance-based, so the drag has to pass the halfway point; a 210pt
  swipe springs back to `full` and only a ~370pt one closes.
- **A flick that arrives at the top mid-momentum does not close it.** The
  `scrollTop` half is confirmed directly: a hard downward flick from the bottom
  of the list was refused as a close and the scroller coasted all the way to the
  ceiling with the drawer still open.
- **The timer half is live, and this was the real risk.** iOS momentum scrolling
  runs off the main thread, so `away.current` could plausibly never be updated
  during the coast, which would leave `sinceAwayFromTop` reading `Infinity`
  exactly when the guard is needed. It does update. Widening `SETTLE_MS` to
  5000ms refused the identical swipe that closes the drawer at 250ms, and a
  fresh page load (where `away` is `-Infinity`) closed it at either value. The
  `scroll` listener fires during the coast.

**`SETTLE_MS` is unchanged at 250, because nothing here justifies moving it.**
The value cannot be bisected with this rig: two injected gestures cannot be put
less than about a second apart, and the window is 250ms. Choosing between 100,
250 and 500 is a thumb-cadence question, and it goes to the phones.

### One observation I could not explain

Once, with the window widened to 5000ms, a deliberate swipe was refused about
7 seconds after the coast ended, when it should have been allowed. It did not
reproduce: the same sequence with a 12 second wait closed the drawer, including
with an intervening refused swipe. Recorded because it happened, not because it
is a finding. If the drawer ever feels locked out on a real phone, start here.

### Two pieces of instrumentation this run added

Both are dead unless the URL asks for them, and both exist because a phone
cannot be handed a Web Inspector.

- **`?touchlog`** puts issue 13's instrument on the glass. WebKit does not send
  JS console output to the device log (checked: a probe page logging every
  second produced zero hits across 14,642 lines of `log stream`), so the one
  line this whole ticket turns on was invisible on the device it had to be read
  on. `onCompositorLoss` in `touch.ts` plus `CompositorLossReadout`.
- **`?drawerfill=N`** puts N placeholder rows in the drawer's scroller. With one
  Friend there are no Candidates and no Hangouts, so the scroller does not
  exist, `scrollTop` is always 0 and the momentum case cannot be produced at
  all. Issue 13 injected 900px of filler through the inspector; this is the same
  trick reachable by URL.

### What the simulator cannot answer, and did not

- **Android.** Nothing. No device, no emulator.
- **Whether 44pt is comfortable under a thumb.** Its touches are synthesised;
  the row clears the 44x44 minimum arithmetically and that is all this says.
- **The `SETTLE_MS` value**, per above.
- **A real iPhone.** The simulator is real WebKit on the real compositor, but it
  is not a real digitiser, and the drift case is precisely about what a real
  digitiser reports.

### The database

Every row written during this run was erased. September 2026 is empty again, as
it was at 12:19. No other month was written to.

## Run sheet, for the two phones

One iPhone and one Android, each next to a laptop on the same network. Serve
with `yarn dev --host` and use the LAN address.

**Open the app at `/?touchlog&drawerfill=30`.** The strip at the top must read
`issue 15 - loaded HH:MM:SS - nothing lost yet`. If it does not, the rest of
this sheet proves nothing.

### The one rule that will otherwise waste the run

`reportCompositorLoss` fires **once per reason per page load**. After any
warning appears you must do a **full reload**, not a pull-to-refresh into a
warm page, before that reason can print again. The pill's timestamp is how you
check: if it has not changed, you have not reloaded.

### A: the gate (both phones)

A dozen deliberate long-press-and-drag draws on the week grid. **Make at least
half of them the drift case**: let the thumb creep a few millimetres while
holding, then drag. A clean centred long-press proves the easy half and the
simulator already proved that one.

Watch the strip. A **red** line reading `GATE FAILED - uncancelable-touchmove`
means `preventDefault` lost and **issue 13 is reopened**.

A line reading `pointercancel` is **not** that, on its own. It is also what an
incoming call and a system edge gesture do. Note it, note what else was
happening, and keep going.

Also do a few drags with **no** hold, to confirm the grid still scrolls. If it
does not, the gesture is eating everything and that is its own bug.

### B: is 44pt comfortable (both phones)

The simulator cannot answer this and it is the main reason a human is holding
the phone. Two things:

- Tap thirty consecutive half-hour slots down one column, at speed, holding the
  phone one-handed. Count the misses. A miss is landing in the wrong 30-minute
  slot, not missing the column.
- Do it on the **3-day** view as well, where columns are 112pt at 375pt wide,
  and in the **week** view, where they are 48pt. Say which one stops being
  usable, and on which phone.

### C: paging against drawing (both phones)

Swipe sideways to page. Long-press then drag sideways to draw across days.
Neither should ever do the other's job. Then do the ambiguous one deliberately:
a swipe that starts horizontal and droops downward as it goes.

### D: edge auto-scroll (both phones)

Start a draw, drag to the bottom 70pt of the grid, and hold. The grid should
scroll under your finger and the draft should keep growing from where it
started. Watch for the anchor jumping.

### E: the settle window (both phones), the one number to bring back

This is the measurement. `SETTLE_MS` is in `src/shell/drawer.ts` and **nothing
else reads it**, so changing it and reloading is the whole loop. The nine tests
over `mayChainClose` and `bodySwipe` import the constant, so they follow
whatever you set.

At **250** (as shipped):

1. Open the drawer to full. Flick the card list hard so momentum carries it up
   into the ceiling, and **flick again immediately**, the way you would scrolling
   a long list. The drawer must not close under your thumb. Repeat until you
   are bored, then a few more.
2. Scroll to the top, pause, and swipe down deliberately. It must close, and it
   must not feel dead.

If (1) ever closes it, the number is too short. If (2) feels unresponsive, it is
too long. Try **100** and **500** and say which of the three you would ship.
The costs are not symmetric: a missed close costs one more swipe, a spurious
close costs the reader their place, which argues for the longer end of whatever
you find.

If it cannot be made to feel right, the fallback is named and costed in issue
13's `## Addition`: `vaul` ships this behaviour and depends on
`@radix-ui/react-dialog` while this repo is Base UI. Adopting it is a decision
to take with this measurement in hand.

### What to bring back

The `SETTLE_MS` you would ship and why. The miss count from B on each phone, and
the narrowest column that still works. Whether the red line ever appeared, on
which phone, and doing what.

## Addendum: the Erase toggle was working, and looked like it was not

Raised during the run as a suspected touch bug, and it is not one. Chased on
12 September 2026 and the behaviour is correct: with Erase on, an armed drag
inside a block took `02:30-04:30` out of a `02:00-04:30` run on the first
attempt.

What is real is that **the control gave no usable sign of its own state**, which
is how a verification run came to read it as broken.

`toggleVariants` tints a pressed toggle `bg-muted`. In the light theme that is
`oklch(0.97 0 0)` sitting on an `oklch(0.985 0 0)` sidebar: **1.5% of lightness
at zero chroma**. It then uses that *same* `bg-muted` for `hover:`, so on a
desktop an un-pressed toggle under the cursor is pixel-identical to a pressed
one. (`aria-pressed` does match, so the state was always announced correctly to
a screen reader. The `data-[state=on]:` in the same class list is Radix's
convention and never matches Base UI, which sets `data-pressed`. Harmless here,
but it is dead weight in a shadcn-generated file.)

The Erase toggle now paints itself `--destructive` when it is on, which is
already the colour of an erase drag everywhere else it appears (issue 13's armed
ring and draft tag). Measured off the rasterised tokens: white on the light
theme's red is **4.78:1**, white on dark's much lighter red is **2.89:1**, so
the dark branch uses the near-black `--background` instead at **6.85:1**.

Scoped to this one control rather than to `toggleVariants`, because it is the
only bare `<Toggle>` in the app and it is the only mode where a drag takes
something away. Everything else is `ToggleGroup`.

**For the run sheet**: §A through §E are unaffected. The only change is that
"tap Erase" is now obvious rather than a leap of faith.

**Noticed while there, not actioned**: nothing in the app ever adds `.dark` to
the document. The dark tokens are fully defined and issue 13 checked them, but
there is no theme toggle, so dark mode is currently unreachable at runtime.
