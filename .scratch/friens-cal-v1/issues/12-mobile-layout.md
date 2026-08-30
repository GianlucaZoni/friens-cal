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

- [ ] Top bar as above; the chevron opens a date navigator, not month view
- [ ] Left drawer holds view selector, drawing mode, erase toggle and roster
- [ ] Roster eyes are permanently visible on touch; the row is the toggle
- [ ] Bottom drawer peeks with the labelled card, and drags out to full height
- [ ] Peek label is "Upcoming" when a Hangout has not ended, else "Best Candidate"
- [ ] Opening the left drawer collapses the bottom drawer to peek
- [ ] Only one sheet can be open at a time
- [ ] Month view renders on mobile without avatars
- [ ] Tapping a Candidate or Hangout card opens a detail sheet with all actions
- [ ] Retime and cancel dialogs are usable at 390px
- [ ] Verified at 375px and 390px, both themes
- [ ] `npx tsc -p tsconfig.app.json --noEmit` is clean

## Blocked by

- [08 — The Candidate list](./08-candidate-list.md)
- [11 — Month view](./11-month-view.md)
