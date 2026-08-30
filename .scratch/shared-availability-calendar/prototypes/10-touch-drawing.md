# 10 — Prototype: drawing Availability by touch

Prototype run 2026-08-30. Throwaway code, deliberately.

## What I built

`src/prototypes/touch-drawing/` — one week grid, three **gesture policies**, and
a set of controls that are orthogonal to them (view Day/3-day/Week, row height
18–64px, drawing mode Linear/Multi-day, hysteresis % and model, erase toggle).
The grid is shared on purpose: the whole question is which gesture wins on the
*same* surface, so the surface has to be the constant.

- `index.tsx` + `touch-grid.tsx` + `lib.ts` — the React route. Default export
  `TouchDrawingPrototype`. Wire with
  `<Route path="/prototype/touch-drawing" element={<TouchDrawingPrototype />} />`,
  then `?variant=A|B|C`, the bar at the top, or ← / →.
- `preview.html` — a dependency-free twin, same time model and same three
  policies. **Open this one on a phone**; it needs no build step, and it prints
  a live scroll-vs-draw log for every gesture.

The switcher is at the **top**, not the house bottom-centre: on a phone the
bottom belongs to the selection sheet that is under test.

Rendering follows ticket 15 — a single-hue heatmap in the viewer's colour with
opacity proportional to the number of visible Friends free, and the viewer's own
Availability drawn as a **border and ring, never a fill**. Time model is ticket
06's, unchanged: absolute minutes from Mon 00:00, midnight not special, the
renderer splits a Range into per-day rectangles.

| | A | B | C |
|---|---|---|---|
| create | long-press ~450ms, then drag | explicit **Read / Draw / Erase** mode | tap a slot → panel → "I'm free" |
| `touch-action` on the surface | `pan-x pan-y` always | `pan-x pan-y` in Read, **`none`** in Draw/Erase | `pan-x pan-y` always |
| scroll during a draw | edge auto-scroll | edge auto-scroll | n/a — never contended |
| resize | 44px handles on selection | same | same |

### How it was measured, and what that cannot tell you

Behaviour was measured by driving `preview.html` with **scripted pointer + touch
events** (`window.__proto10.gesture(...)`), the same technique ticket 06 used.
Every number below is reproducible from that driver.

**The one thing this cannot test is the compositor.** A synthetic `touchmove`
never makes a browser scroll, so "does `preventDefault` after arming actually
beat the native scroll" is *instrumented*, not measured. The page prints the
verdict itself on a real device — the ⚠ lines in the log fire if a `touchmove`
arrives with `cancelable === false`, or if a `pointercancel` says the scroller
took the gesture. **Somebody has to open `preview.html` on an actual phone and
read those two lines.** I could not: the shared browser pane was contended by
four other agents for the whole session and real input injection was unreliable.

One test-harness bug is worth recording because it is the mirror image of a real
hazard. My scripted finger was initially pinned to *content* coordinates, so it
travelled with the grid when auto-scroll fired, and every measured range came
out wrong. A finger stays on the glass; the content moves under it. The
implementation has the same trap in reverse: if you store the drag anchor as a
pixel offset into the scrolling surface, it silently corrupts the moment
auto-scroll fires. **Store the anchor as an absolute slot index at
`pointerdown`.** Verified: a draw that ran 380px of finger travel plus 51px of
auto-scroll kept its anchor at `Wed 10:00` and committed `Wed 10:00–15:00`.

---

## 5 — Row height and the week grid at phone width ⚠️

**This is the finding that matters most, because it lands on a decision ticket
17 has just provisionally made.**

Geometry, measured, with a 44px time gutter:

| viewport | week column | 3-day column | day column |
|---|---|---|---|
| 320px | **39.4px** | 92.0px | 276px |
| 360px | **45.1px** | 105.3px | 316px |
| 375px | **47.3px** | 110.3px | 331px |
| 390px | **49.4px** | 115.3px | 346px |
| 430px | 55.1px | 128.7px | 386px |

| row height | a day is | hours on a 700px grid | screens to scan one day |
|---|---|---|---|
| 22px (ticket 06's desktop value) | 1056px | 15.9 | 1.5 |
| 32px | 1536px | 10.9 | 2.2 |
| **44px** | 2112px | **8.0** | 3.0 |
| 56px | 2688px | 6.3 | 3.8 |

**Tapping survives the seven-column week.** At 44px rows a week cell is
47×44 at 375px — it clears the 44×44 minimum target, with no margin, and it
**fails below 360px width**. Rows must be ≥44px; the desktop's 22px is not a
touch target under any view. The cost is real but acceptable: 8 hours on screen
instead of 16, three screens to scan a day.

**Drawing does not survive it.** Linear mode, week view, a three-row vertical
drag with a lateral drift at the moment of release:

| lateral drift at release | hyst 0 | anchor 50% (23.6px) | edge 50%, start mid-column | edge 50%, start 94% across |
|---|---|---|---|---|
| 10px | ✅ 10:00–12:00 | ✅ | ✅ | ✅ |
| 20px | ✅ | ✅ | ✅ | ✅ |
| 30px | ❌ **Wed 10:00 → Thu 12:00** | ❌ | ✅ | ❌ |
| 45px | ❌ **Wed 10:00 → Thu 12:00** | ❌ | ✅ | ❌ |

A 30px lateral drift turns a two-hour Availability into a **26-hour** one. Thirty
pixels is nothing — it is well inside the arc a thumb makes swiping down a phone.

Two things fall out of that table.

**Ticket 01's hysteresis, read the obvious way, does not work.** "The pointer
must travel meaningfully into the next day" measured *from the column boundary*
(the `edge` model) protects you only if your finger happened to land in the
middle of a column. Land near a boundary and the budget is already spent: the
same 30px drift is rejected from mid-column and accepted from 94% across. Its
protection is luck. Measuring the budget in absolute px **from the anchor** (the
`anchor` model) is predictable — the same budget wherever you start — and is what
I built as the default.

**But no hysteresis setting rescues linear mode at 47px columns**, because the
budget cannot exceed one column width and a column is narrower than the drift you
are trying to reject. At **110px columns (3-day)** it works cleanly: an anchor
budget of 36–45% (40–50px) rejected both 30px and 45px of drift, while a
deliberate 115px sideways move still crossed the day boundary as intended.

**Multi-day mode is safe at week width.** The same 30px and 45px drift produced
`Wed 10:00–12:00 | Thu 10:00–12:00` — one extra day's block. Visible, bounded,
erasable. Linear's failure mode is a silent 26-hour range; multi-day's is an
obvious extra rectangle.

One correction to ticket 06 while I am here: **"one sideways twitch produces a
30-hour range" is overstated.** The draft recomputes anchor→pointer on every
move, so a transient excursion that comes back before you lift self-corrects —
measured, a full sinusoidal 40px arc that returned to the anchor column committed
the correct range. It is where your finger **lifts** that commits. The thumb arc
is dangerous because it *ends* displaced, not because it passes through.

### What this means for ticket 17's provisional "keep seven columns"

The seven-column week survives tapping and survives multi-day drawing. It does
**not** survive linear drag-to-create, which is ticket 01's default. Four ways
out, none of them mine to pick:

1. Keep 7 columns; **column-lock linear drags on touch only** — which quietly
   gives touch back ticket 06's rejected geometry, and loses cross-midnight by
   drag on mobile.
2. Keep 7 columns; **default the phone to Multi-day**.
3. **Default the phone to 3-day**, where anchor hysteresis measurably works.
   This is the fallback 17 said was reversible.
4. **Don't offer drag-to-create on a phone at all** — see variant C, whose
   gestures have no lateral component and which is therefore immune by
   construction.

---

## 1 — The create gesture

**Recommendation: ship B's explicit mode as the create gesture, and make
Read-mode tap open C's panel. Reject A.** The two are not really rival variants
— they compose into one design, described at the bottom of this section.

**A — long-press then drag. Rejected.** It works: measured, a drag with no hold
draws nothing and the browser keeps the gesture; a 520ms hold arms and then
draws; arming and releasing without moving makes exactly one 30-minute block
(`Thu 19:00–19:30`), which is the touch equivalent of ticket 06's click-no-move
rule. Three things kill it:

- **450ms on every single draw**, paid before you learn whether you aimed right.
- **There is no haptic on iPhone.** `navigator.vibrate` is Chrome/Android only;
  Safari has never shipped the Vibration API. A is the variant that most needs a
  non-visual "you are drawing now" signal, because your fingertip is covering the
  pixels that just changed — and on half the group's phones that signal cannot
  exist. Even on Android it is not free: Chrome logged *"Blocked call to
  navigator.vibrate because user hasn't tapped on the frame or any embedded frame
  yet"*, so the first buzz of a session can be dropped.
- It depends entirely on the unverified compositor question above. A's whole
  premise is that `preventDefault` on a non-passive `touchmove` can still cancel
  the scroll at the moment of arming. That should hold — arming requires the
  finger to be still, so no scroll has begun — but it is the single point of
  failure and it is the one thing I could not measure.

**B — explicit Read / Draw / Erase mode. Recommended.** Measured: in Read a
700ms hold-and-drag draws nothing; in Draw a plain drag with **no hold at all**
draws immediately (`Wed 10:00–11:30`); in Erase the same drag inside the
08:00–22:00 monolith cut it to `Wed 08:00–13:00 | Wed 14:30–22:00`. No delay, no
ambiguity, no reliance on beating the compositor — in Draw the surface is
`touch-action: none` and one finger simply cannot scroll it.

The usual objection is "a mode toggle is honest but adds chrome". **That chrome
is already bought.** Ticket 01 put a "Drawing mode:" tabbar *and* an erase-drag
toggle in the left sidebar. Read/Draw/Erase is that erase toggle, widened by one
position. It is not new furniture.

Its real cost is that Draw mode owns the finger, so you cannot scroll to a
different time without leaving the mode. Edge auto-scroll covers extending a draw
past the viewport and works (70px band, speed proportional to overshoot,
measured above), but it eats 140px of a 700px grid and is fiddly with a thumb.
**Two-finger pan inside Draw mode was not built** — `touch-action: none` kills
the native one, so it would have to be implemented by hand. Flagged, not solved.

**C — tap a slot → panel → handles. Recommended as the *read* path, not as the
only create path.** Measured: no drag on the surface can draw anything, at any
hold duration; a tap creates nothing either — it opens a panel. The panel names
the slot, lists **who else is free** with their colours, marks it as a Candidate
when `2 × friends > group size` (ticket 09's rule), and offers "＋ I'm free",
which lands a 30-minute block, selected, with handles.

C is completely immune to the drift problem in section 5, because none of its
gestures have a lateral component: a tap is a point, and a handle drag is
vertical inside one column. It is also the only variant that answers "who is
free" at all.

But it is slow for the thing people actually draw. "I'm free Saturday 14:00–22:00"
costs tap + panel + a 704px handle drag across three screens. B does it in one
drag.

### The synthesis

They are the same UI:

- **Read** (default) — the grid scrolls; a tap opens C's panel: *who is free
  here*, plus "＋ I'm free" for a deliberate 30-minute block.
- **Draw** — one drag paints. Linear/Multi-day applies here and only here.
- **Erase** — one drag subtracts.

Long-range drawing gets one gesture, reading gets a tap, the touch-hover hole
gets filled, and nothing depends on out-racing the compositor.

## 2 — Scrolling

Measured `touch-action` per state: `pan-x pan-y` everywhere except B's Draw and
Erase, where it is `none`.

- Outside a draw, the grid is an ordinary scroller in every variant. Verified in
  A (quick drag → *"moved 26px before 450ms → the browser keeps the gesture"*),
  in B/Read, and in C (*"SCROLLED 0px in 857ms — nothing drawn"* on a 900ms
  hold-and-drag).
- During a draw, edge auto-scroll extends the range past the viewport. Verified:
  380px of finger travel plus 51px of auto-scroll, anchor held.
- **Unbuilt and unresolved:** two-finger pan while in Draw mode, and what
  happens on a `pointercancel` mid-draw (the prototype discards the draft; on a
  phone an incoming call or a system gesture will do this eventually).

## 3 — Resizing and deleting

**Edge resize by touch needs explicit handles, and they work.** On selection the
block grows two handles, each a **44px-tall hit area** centred on its edge with a
34×14 visible knob, carrying `touch-action: none` **on the knob only** — so a
handle drag never contends with the scroll even though the grid around it scrolls
freely. This is variant-independent and I recommend it whichever create gesture
wins; it is the only part of the desktop model that has no touch equivalent at
all (a 7px edge zone on a 22px row is not addressable by a finger).

One measured collision: at 44px rows a 30-minute block is 44px tall and its two
handles span exactly `[start−22, start+22]` and `[start+22, start+66]` — they
abut. Below 44px rows they **overlap**, and the top handle wins the hit test.
Fix: on a 30-minute block show only the bottom handle, or push the handles
outside the block.

**Delete** is an explicit button in the selection sheet. Note what ticket 01's
"no undo, no reset" means here: delete is one tap and there is no way back except
redrawing. On desktop that is survivable; on a phone, where the target is 47px
wide, it is a live risk.

## 4 — Duplicate

**Alt+drag has no touch equivalent and does not need one.** Ticket 01 already
settled that the discoverable path is "a control on the selected block or the
3-dots menu"; on touch that control is simply the *only* path. Built and
verified: **Duplicate** in the selection sheet arms a placing state, and the next
tap on the grid drops a copy of the same duration there, merging on landing.

So touch needs no new gesture for duplication — it needs the control ticket 01
already promised to exist. Untested, exactly as in ticket 06: 01's "a Friend may
only duplicate **their own** Availability", because this is still a single-Friend
prototype.

## 6 — Haptics and feedback

- **`navigator.vibrate` does not exist on iOS Safari** and never has. Any design
  whose "you are now drawing" signal is a buzz is an Android-only design.
- On Android it is still gated: Chrome refuses the call until the frame has had
  a user tap, and logs it. The first arming of a session can be silent.
- Therefore the feedback has to be **visual, and not under the finger**. Built:
  an inset ring around the whole surface while armed (visible around a thumb),
  the draft rectangle itself, and a time/duration tag positioned **above** the
  draft so the hand does not cover it.
- The tag reads `10:00–12:00 · 2h` while drawing and turns red with `erase` in
  Erase mode. That is the only thing distinguishing the two modes mid-gesture,
  and it is worth more than the toolbar state, which is off-screen behind the
  thumb.

---

## Tried and rejected

- **Long-press-to-arm as the shipped gesture (A).** 450ms tax on every draw, no
  haptic on iPhone, and it is the only design that has to win a race against the
  browser's scroller.
- **Hysteresis measured from the column boundary.** Its protection depends on
  where inside the column the finger landed; a drag begun near an edge has none.
  Replaced with an anchor-relative budget in absolute px.
- **Hysteresis as a rescue for linear mode at week width.** The budget cannot
  exceed a column and the column is 47px. Not fixable by tuning.
- **Tap-on-empty-grid meaning "create".** It is the only gesture available for
  "who is free here", which after ticket 15 is the only way to answer *who* at
  all. Creation moved behind a mode or a panel button so the tap stays a read.
- **Two-tap (tap start slot, tap end slot).** Superseded by C: making step 2 a
  panel rather than a second grid tap is strictly better — it is discoverable,
  it shows what you are about to do, and it answers "who" on the way past.
- **A hover chip explaining the gesture** (ticket 06's mitigation). Cannot exist
  on touch at all.

## Contradicts or extends settled scope

1. **Ticket 01's Linear default is not safe at phone week-view width.** Measured:
   30px of lateral drift at release turns a 2-hour range into a 26-hour one. Needs
   one of the four decisions in section 5.
2. **Ticket 01's prescribed mitigation — "hysteresis at the column boundary" —
   does not work as written**, and cannot be made to work at 47px columns by any
   parameter value.
3. **Ticket 01's erase toggle should become a three-way Read / Draw / Erase
   control on touch**, and it **cannot live in the left sidebar** on a phone —
   a mode you must open a sheet to change is not a mode you will use. That is a
   claim on ticket 17's real estate.
4. **"No undo and no reset" costs more on touch than on desktop.** Every mis-tap
   writes, targets are 47px wide, and Erase is itself a drag that can slip.
5. **Ticket 09/15's hover panel is the only answer to "who is free", and touch
   has no hover.** This prototype assigns it to a Read-mode tap. That is the
   point where tickets 10 and 17 stop being separable: whoever decides what a tap
   on the grid means has decided both.
6. **Ticket 06's "one sideways twitch produces a 30-hour range" is overstated.**
   Transient excursions self-correct; only the release position commits.
7. **Ticket 01's "a Friend may only duplicate their own Availability" is still
   untested** — single-Friend prototype, same gap as ticket 06.
8. The React twin compiles clean under `npx tsc -p tsconfig.app.json --noEmit`,
   but like ticket 06's it has **never been rendered** — there is no route for it
   and `AppRoutes.tsx` was off-limits. Every behavioural claim above comes from
   `preview.html`.
