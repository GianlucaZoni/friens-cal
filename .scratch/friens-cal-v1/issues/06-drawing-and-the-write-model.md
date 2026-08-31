# 06 — Drawing, erasing, and the write model

Status: done
Blocked by: 05

## Parent

[friens-cal v1 map](../../shared-availability-calendar/map.md)

## What to build

Drawing your Availability by dragging on the week grid, erasing it, and the
optimistic write model underneath both.

**A bare click does not create.** Click (desktop) opens the slot popover; only a
**drag** writes. The 4px threshold survives as the drag/click discriminator.
This reverses ticket 06's click-to-create, and it is what makes ticket 01's
"no undo, no reset" tolerable — no stray click can write.

**Two drawing modes**, offered as a "Drawing mode:" tabbar:

- **Linear** (default) — true linear time, **no column lock**. A drag runs
  continuously across midnight, which is what makes crossing days an ordinary
  drag. Its hazard is a *release-position* hazard, not a mid-drag one: the draft
  recomputes anchor→pointer on every move, so a transient excursion self-corrects
  and only where the finger lifts commits. Mitigate with **anchor-relative**
  hysteresis (40–50px), never boundary-relative — measured, boundary-relative
  protects you only if the anchor happened to land mid-column.
- **Multi-day** — the rectangle geometry.

**Erase** is a drag starting *inside* an existing block, behind a toggle in the
left sidebar. Deleting the middle of a range is confirmed unacceptable and is
not a route.

**⌥+drag duplicates**, as an accelerator only — the discoverable route is a
control on the selected block.

### The write model (ticket 19)

**Paint optimistically with no pending treatment.** A pending state cannot be
reduced opacity: ticket 15 spent opacity on *how many Friends are free*, so a
faded block reads as "fewer people". Only if a write is outstanding after ~400ms
show anything, and then in a channel the grid does not own.

**One `insert` per gesture, never chunked** — PostgREST sends multi-row inserts
as one statement in one transaction, so partial failure is unreachable. Use
`on conflict do nothing`: drawing across the edge of existing Availability is
the most ordinary action in the app, and the unique constraint makes it a no-op.
That also makes **retry idempotent**.

**On failure: two automatic retries with backoff, then revert and toast.** The
toast must **name the range** ("couldn't save Thu 20:00–23:00") — once reverted
there is no trace on screen and no undo stack. The erase path is symmetric and
safe for the same reason: deleting an absent row is also a no-op.

**Offline**: detect it, show a persistent banner, and let writes still attempt
and fail through the path above. Do not block on `navigator.onLine` — it lies
often enough to lock people out of a working connection. **No offline queue.**

## Acceptance criteria

- [x] Drag creates Availability, snapped to 30-minute slots
- [x] A click with no movement opens the popover and writes nothing
- [x] "Drawing mode:" tabbar with Linear (default) and Multi-day
- [x] Linear crosses midnight in one continuous drag
- [x] Anchor-relative hysteresis, verified from a mid-column *and* a
      94%-across anchor with the same drift
- [x] Erase drag starting inside a block, behind a sidebar toggle
- [x] ⌥+drag duplicates; a visible control does the same thing
- [x] Escape aborts a drag; merging feedback is live mid-drag
- [x] **No undo, no reset** anywhere
- [x] One insert per gesture with `on conflict do nothing`
- [x] Two auto-retries, then revert plus a toast naming the range, with Retry
- [x] Offline banner; writes still attempt
- [x] `npx tsc -p tsconfig.app.json --noEmit` is clean

## Blocked by

- [05 — The week grid renders your Availability](./05-week-grid.md)

## Built

`src/availability/` gains five files and the grid gains a pointer:

- **`gesture.ts`** — the drag as arithmetic, pure and tested. Nothing here is
  decided by a component, because two of its rules are *measurements*.
- **`write-model.ts`** — what happens between a gesture ending and its rows
  landing: the retry count, and the copy that names a range the write lost.
- **`use-draw-gesture.ts`** — the state machine. Draft, popover, placing.
- **`use-drawing-tools.ts`** + **`drawing-controls.tsx`** — the tabbar and the
  erase toggle, in the left pane where ticket 01 put them.
- **`slot-popover.tsx`** — the shell of what a click opens.

Plus `src/components/ui/toast.tsx` (the base-lyra distribution — the repo had no
toast at all), `src/shell/offline-banner.tsx`, `src/hooks/use-online.ts`, and a
`Saving…` chip in the top bar.

### The two rules that are measurements, not choices

**Hysteresis is anchor-relative at 45px.** Ticket 01 recorded a
boundary-relative budget as the mitigation and ticket 10 then measured it dead.
Its experiment, reproduced on the real grid at 122px columns with the drafts read
mid-drag:

| anchor | drift | draft |
| --- | --- | --- |
| mid-column | 30px | `Thu 15:00–17:30` |
| **94% across** | 30px | `Thu 15:00–17:30` — **the same** |
| 94% across | 60px | `Thu 15:00–24:00` + `Fri 00:00–17:30` |

Escape cleared all three and nothing was written. A boundary-relative budget
accepts the middle row; that is the whole finding.

It applies in **Linear only**, on the review's prompting. Ticket 10 found
Multi-day "safe at week width", and spending the budget there costs something
instead — crossing a column *is* that gesture, and at the 57px columns of a
1024px window with both panes open, 45px would refuse a deliberate two-day
rectangle. Measured: the same 30px drift from a 94%-across anchor stays put in
Linear and follows into the next column in Multi-day.

**Linear walks the concatenated columns**, because a day is 46, 48 or 50 Slots.
Verified on the real DST week: `Sat 23:30 → Sun 00:00` across the 25-hour
Sunday's own gutter, and a drag out of a 46-row day resuming at the next day's
row 0.

### Multi-day is a wall-clock rectangle, not a row-offset one

"The same hours on every day crossed" is a statement about clocks, and on a DST
week clocks and row offsets part company: the 25-hour Sunday holds 20:00 at row
42 while its neighbour holds it at row 40. Selecting by **label** gives every day
the hours you drew — and gives that Sunday *both* of its 02:00s when the window
covers them, which is correct, because both hours happened. The spring Sunday
gets neither, for the same reason.

### The DST hit-test, which is the thing most likely to have shipped broken

The odd day of a DST week carries its own hour gutter, so **the columns are not
evenly spaced**. Measured at 1024px with both panes open: columns are 57.3px,
column 5 ends at 655.7 and column 6 starts at 695.7. `(x - 312) / 57.3` at column
6's right edge is **7.58** — a column that does not exist. Hit-testing the actual
`[data-column]` elements returned `Sunday 19:00–21:00`. Header offsets were 0 on
all seven columns at 1440px and at 1024px, on an ordinary week and on both DST
shapes.

### The write model, measured end to end

- One gesture of 8 Slots across midnight → **one POST**, 8 rows,
  `Prefer: resolution=ignore-duplicates`, `on_conflict=friend_id,slot_start`.
- Only the **delta** is painted, written and reverted: drawing across the edge of
  an existing block POSTed 2 rows, and redrawing what you already hold issued no
  request at all.
- Forced failure: the block painted at +120ms with no treatment on it; `Saving…`
  appeared in the top bar at +620ms; **three attempts** with gaps of 929ms and
  1999ms; the block reverted; the toast read
  `Couldn't save Thu 20:00–23:00` with the error and a `Retry`. Retry re-drew it,
  it landed, and the toast closed.
- Erase is symmetric down to the retry: the block vanished, three DELETEs, the
  block **re-appeared**, and the toast read `Couldn't erase Mon 18:00–19:00`.
- Offline: the banner appears on the `offline` event and the write still attempts
  — and succeeded, the network being up, which is exactly why nothing gates on
  `navigator.onLine`.

### One bug found only by driving the real browser

Opening the popover on `pointerup` mounts it mid-gesture, and the `click` the
browser dispatches next is an **outside press** as far as Base UI is concerned.
Measured: `afterPointerUp: 1, afterMouseUp: 1, afterClick: 0` — the popover
opened and closed inside every single click. It now decides on pointerup, where
`moved` is known, and *mounts* on click.

### Three judgement calls, named so they can be overruled

1. **`Erase block` in the popover is an addition.** The issue only requires
   Duplicate to have a visible twin. Erasing a whole run otherwise means dragging
   its entire length, and ticket 06's prototype valued getting whole-block delete
   "for free"; this is the same bargain made visible. Delete the button if that
   is unwanted — nothing else depends on it.
2. **Touch is ignored rather than half-built.** The gesture accepts `mouse` and
   `pen` only, so the grid still scrolls under a finger and issue 13 inherits an
   empty seam instead of a wrong one.
3. **The draft has no fill, only a dashed outline.** Opacity in this grid means
   *how many Friends are free* (ticket 15) and issue 07 has not spent it yet, so
   the draft borrows no channel it would have to give back.

### State of the checks

`npx tsc -b` clean for all three projects, `yarn test` 85 passing (46 from issue
05, 39 new across `gesture.test.ts` and `write-model.test.ts`), and `yarn lint`
unchanged at the 9 errors already on `main`. A fresh tab logs nothing.

**No SQL and no paste.** `supabase/02-availability.sql` was already enough:
`select, insert, delete` and deliberately no `update`, which is what
`on conflict do nothing` needs and what `on conflict do update` would have been
refused by.

### Left behind, deliberately

Verification drew extra Availability for the test Friend on the current week and
on the week of 19–25 Oct 2026. `scripts/verify-availability.mjs` was re-run and
its three canonical runs are back, but it only ever adds, so those extras are
still there. Nothing in this slice deletes on its own (ticket 01: nothing is ever
auto-deleted), so clearing them is a deliberate act somebody should choose.

