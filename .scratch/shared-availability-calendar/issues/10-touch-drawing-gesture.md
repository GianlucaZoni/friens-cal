# 10 — Drawing Availability by touch

Type: prototype
Status: resolved
Blocked by: —

## Question

Mobile is fully in scope, including drawing. On a touch grid a single drag
gesture has to coexist with **scrolling** the calendar, and that conflict is the
entire problem — the desktop model (press, drag, release) is exactly what a
browser interprets as a scroll.

Prototype and resolve:

1. **The create gesture.** Long-press-then-drag, a tap-start-then-tap-end
   two-step, an explicit "draw mode" toggle, or something else. Long-press has a
   discoverability cost and a delay; two-tap is discoverable but feels clumsy;
   a mode toggle is honest but adds chrome.
2. **Scrolling.** How the grid still scrolls, both during and outside a draw.
3. **Resizing and deleting** by touch — edge handles are far below a comfortable
   touch target at 30-minute rows, so blocks probably need explicit handles that
   appear on selection.
4. **Alt+drag has no touch equivalent.** Duplicate needs a different affordance
   on mobile (a menu action on a selected block?) or is simply unavailable
   there.
5. **Row height.** A 30-minute snap on a phone-width week column may be too
   small to hit reliably. Does mobile need a different snap, a zoom, or a
   single-day view instead of a week?
6. **Haptics and feedback** — what tells the user a draw has begun.

Deliberately separate from the **mobile layout** (still fog on the map): this
ticket is about the gesture, not about where the sidebars go.

## Answer

Prototype: `src/prototypes/touch-drawing/` — three gesture policies on one
shared grid, via `?variant=A|B|C`, the top bar, or ←/→. Also `preview.html`, a
dependency-free twin with a scripted-gesture driver. Findings:
[`prototypes/10-touch-drawing.md`](../prototypes/10-touch-drawing.md).

**Caveat:** all behaviour was measured by driving `preview.html` with scripted
pointer/touch events, which exercises the state machine but **not the
compositor**. Whether `preventDefault` can still cancel a native scroll at the
moment a long-press arms is instrumented, not measured — `preview.html` prints
the verdict live on a real phone (the ⚠ lines). Someone has to open it on one.
The React twin passes `npx tsc -p tsconfig.app.json --noEmit` but has never been
rendered; there is no route for it.

1. **The create gesture — an explicit three-way mode, and a tap that reads.**
   Read (default) / Draw / Erase. In Read the grid scrolls and a **tap opens a
   slot panel**: who is free here, the Candidate marker, and "＋ I'm free" for a
   deliberate 30-minute block. In Draw one drag paints; in Erase one drag
   subtracts. No delay, and nothing has to out-race the browser's scroller —
   `touch-action` is `none` while drawing.
   **The chrome objection is already paid for**: ticket 01 put a drawing-mode
   tabbar *and* an erase toggle in the sidebar. This is that erase toggle,
   widened by one position.
   **Long-press-then-drag (built, rejected):** 450ms tax on every draw; **no
   haptic exists on iPhone** (`navigator.vibrate` is Chrome/Android only, and
   Chrome blocks the first call until the frame has been tapped), so the one
   signal that variant most needs cannot exist on half the group's phones.
   **Two-tap (superseded):** making step two a *panel* instead of a second grid
   tap is strictly better — discoverable, shows what you are about to do, and
   answers "who" on the way past.
2. **Scrolling.** Outside a draw the grid is an ordinary scroller in every
   variant (verified). Inside a draw, `touch-action: none` plus a 70px edge
   auto-scroll band — verified carrying a draw 380px of finger travel plus 51px
   of auto-scroll with the anchor holding. **Store the drag anchor as an
   absolute slot index, not a pixel offset**, or auto-scroll silently corrupts
   it — I hit exactly this bug in the test harness, in mirror image.
   **Not built:** two-finger pan inside Draw mode (`touch-action: none` kills
   the native one, so it needs hand-rolling).
3. **Resizing and deleting — explicit 44px handles on selection.** A 7px edge
   zone on a 22px row is not addressable by a finger. Handles carry
   `touch-action: none` on the knob only, so a handle drag never contends with
   the surrounding scroll. Recommended regardless of which create gesture wins.
   Measured collision: at rows **below** 44px the two handles of a 30-minute
   block overlap — show only the bottom one, or push them outside the block.
4. **Duplicate needs no new touch gesture.** Ticket 01 already promised a
   control on the selected block; on touch it is simply the only path. Built:
   **Duplicate** arms a placing state and the next tap drops the copy, merging
   on landing.
5. **Row height — 44px minimum, and the seven-column week is the real problem.**
   At 44px rows a week cell at 375px is 47×44: it clears the touch-target
   minimum with no margin and **fails below 360px width**. The cost is 8 hours
   on screen instead of 16. Tapping survives seven columns. **Drawing does not.**
   In Linear mode a **30px lateral drift at the moment of release turns a
   2-hour Availability into a 26-hour one** — and 30px is inside a normal thumb
   arc. **Ticket 01's prescribed mitigation does not work**: hysteresis measured
   from the column boundary protects you only if your finger happened to land
   mid-column (same drift: rejected from the middle, accepted from 94% across).
   Anchor-relative hysteresis is predictable and is what I built — but **no
   setting rescues linear mode at 47px columns**, because the budget cannot
   exceed a column width. At 110px columns (3-day) a 40–50px budget cleanly
   rejects drift while still allowing a deliberate crossing. Multi-day mode is
   safe at week width: the same drift adds one visible extra day's block.
6. **Haptics and feedback — visual, and not under the finger.** No Vibration API
   on iOS Safari. Built: an inset ring around the whole surface while armed, the
   draft rectangle, and a time/duration tag placed **above** the draft, turning
   red in Erase. Mid-gesture that tag is worth more than the toolbar state,
   which is behind the thumb.

**Correction to ticket 06:** "one sideways twitch produces a 30-hour range" is
overstated. The draft recomputes anchor→pointer every move, so a transient
excursion that returns self-corrects; only where the finger **lifts** commits.

**Where this ticket and 17 stop being separable:** after ticket 15 the hover
panel is the *only* way to answer "who is free", and touch has no hover. The
only gesture that can carry it is a tap on the grid — which is also the only
gesture cheap enough to create with. Whoever decides what a tap means has
decided both tickets. I have assigned tap to *read*.

### Needs the human

1. **Which create gesture ships.** Recommended: the Read/Draw/Erase mode, with
   Read-tap opening the slot panel. Long-press is built and rejected.
2. **What mobile does about Linear drift** — pick one: (a) column-lock linear
   drags on touch only, which quietly restores ticket 06's rejected geometry and
   loses cross-midnight-by-drag on phones; (b) default the phone to Multi-day;
   (c) default the phone to 3-day, where hysteresis measurably works; (d) no
   drag-to-create on a phone at all. This is reversible-by-design per ticket 17,
   and my evidence says seven columns plus Linear is the combination that fails.
3. **May the Read/Draw/Erase control live persistently on the phone grid?**
   Ticket 01 put this chrome in the left sidebar; on a phone that is a sheet, and
   a mode you must open a sheet to change will not get used. This is a claim on
   ticket 17's real estate.
4. **Does a tap on the grid mean "who is free" or "create"?** The single most
   consequential call here, and it belongs to 10 and 17 jointly.
5. **May creating on a phone be deliberate-but-slower?** The panel route is two
   taps plus an optional handle drag. Long ranges are much worse that way, which
   is why I kept a Draw mode alongside it rather than shipping the panel alone.
6. **Given "no undo and no reset" (ticket 01), is a mis-drawn range acceptable
   on touch?** Every mis-tap writes, targets are 47px wide, and Erase is itself
   a drag that can slip. If not, touch needs either a confirm step or a
   short-lived "undo that" affordance — which reopens 01's no-undo decision.
7. **Two-finger pan inside Draw mode: build it, or accept edge auto-scroll
   only?** Not built either way.
8. **Verify on real hardware.** `preview.html` must be opened on an actual
   phone — ideally one iPhone and one Android — to settle the compositor
   question and to feel the 44px row against a real thumb.

## Decisions

**Touch** — a **tap reads**, opening the slot popover (the Friends free there,
plus a create action). **Long-press-then-drag creates**, with edge auto-scroll.
No Read/Draw/Erase mode is needed for the read/draw split; the erase toggle from
ticket 01 remains.

**Desktop** — a **click opens the same popover**, with the same information and
avatars. **Click-and-drag draws.**

> This **reverses ticket 06**, which made a click with no movement create a
> 30-minute block above a 4px threshold. A bare click now reads instead of
> writing. The 4px threshold survives as the drag/click discriminator.

**Linear stays the default, and the seven-column week stays on the phone**, over
the prototype's measured objection. A **day / 3-day / week selector** ships, and
**swiping pages** to the previous or next block of days.

### The two overrides, and why they are safer than when measured

1. **Long-press was built and rejected** by the prototype — a 450ms tax per draw,
   and `navigator.vibrate` does not exist on iOS Safari, so the arming signal it
   most needs is unavailable to half the group. Accepted anyway, and the
   prototype already built the mitigation: the arming signal is **visual and not
   under the finger** — an inset ring around the surface while armed, the draft
   rectangle, and a time/duration tag placed *above* the draft. That works on
   both platforms; haptics never would have.
2. **Linear at 47px columns** measured a 30px lateral drift at release turning a
   2-hour Availability into a 26-hour one, with no hysteresis setting able to
   rescue it. Accepted, with two mitigations that did not exist when it was
   measured: the **view selector gives an escape to 3-day (110px)**, where
   anchor-relative hysteresis measurably works with a 40–50px budget; and
   **creation is now deliberate**, behind a long-press, so drift only threatens
   ranges the user meant to draw.

### Two consequences of the combination

- **Long-press arming is what makes swipe-paging safe.** Before the press fires,
  a horizontal gesture pages and a vertical one scrolls; after arming, the drag
  draws. The scroll-versus-draw conflict this ticket opened with is resolved by
  the two decisions together, not by either alone.
- **The no-undo hazard largely dissolves.** Item 6 asked whether a mis-drawn
  range is tolerable given ticket 01's no-undo. Under these semantics **neither a
  stray tap nor a stray click writes anything** — creating requires a deliberate
  long-press or a deliberate drag. Only the erase drag can still slip.

### Still open

**Verification on real hardware.** All measurements came from scripted pointer
events, which exercise the state machine but not the compositor — so "can
`preventDefault` cancel a native scroll once a long-press arms" is instrumented,
not measured. `preview.html` prints the verdict live. One iPhone and one Android
run needed, and it matters more now that long-press is the create gesture.
