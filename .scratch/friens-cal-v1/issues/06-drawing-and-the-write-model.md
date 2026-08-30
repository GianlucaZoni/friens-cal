# 06 — Drawing, erasing, and the write model

Status: ready-for-agent
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

- [ ] Drag creates Availability, snapped to 30-minute slots
- [ ] A click with no movement opens the popover and writes nothing
- [ ] "Drawing mode:" tabbar with Linear (default) and Multi-day
- [ ] Linear crosses midnight in one continuous drag
- [ ] Anchor-relative hysteresis, verified from a mid-column *and* a
      94%-across anchor with the same drift
- [ ] Erase drag starting inside a block, behind a sidebar toggle
- [ ] ⌥+drag duplicates; a visible control does the same thing
- [ ] Escape aborts a drag; merging feedback is live mid-drag
- [ ] **No undo, no reset** anywhere
- [ ] One insert per gesture with `on conflict do nothing`
- [ ] Two auto-retries, then revert plus a toast naming the range, with Retry
- [ ] Offline banner; writes still attempt
- [ ] `npx tsc -p tsconfig.app.json --noEmit` is clean

## Blocked by

- [05 — The week grid renders your Availability](./05-week-grid.md)
