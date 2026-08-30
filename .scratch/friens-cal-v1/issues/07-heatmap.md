# 07 — Everyone's Availability as a heatmap

Status: ready-for-agent
Blocked by: 04, 06

## Parent

[friens-cal v1 map](../../shared-availability-calendar/map.md)

## What to build

The grid stops being yours and becomes the group's. Every non-Hidden Friend's
Availability composes into a heatmap, live over Realtime.

**One hue — the viewer's own — with opacity proportional to how many visible
Friends are free in that slot.** Not a mesh gradient of everyone's colours: that
was prototyped and it dies at 6–8 Friends, and near-identical hues under-report
the count. Opacity is monotonic in the count, so adding a Friend always *adds*
information.

**Your own Availability is a border and a ring, not a solid fill** — a solid
block occludes the density underneath it.

**Per-Friend colour is therefore absent from the grid entirely.** The grid
answers *how many*; **who** is answered only by opening the slot popover. That
popover is now load-bearing, not a nicety.

Realtime honours RLS. Slots are keyed by `(friend_id, slot_start)` — their
natural key — so an optimistic row and its Realtime echo are **the same row**
and the echo is a no-op. Do **not** filter out your own session's events: that
would break your own second device.

## Acceptance criteria

- [ ] A boundary sweep segments the day into runs of `{start, end, friendIds[]}`
- [ ] Column renders as a single-hue wash in the viewer's colour, opacity ∝ the
      number of visible Friends free
- [ ] The viewer's own Availability is a border + ring, and does not occlude
- [ ] Hiding a Friend removes them from the wash immediately
- [ ] Clicking a slot opens a popover listing the free Friends by blobatar
- [ ] A Realtime insert from another Friend appears without a reload
- [ ] Your own write's Realtime echo causes no flicker and no duplicate
- [ ] The opacity ramp is tuned separately for light and dark
- [ ] `npx tsc -p tsconfig.app.json --noEmit` is clean

## Blocked by

- [04 — The Friend roster and hiding](./04-friend-roster-and-hiding.md)
- [06 — Drawing, erasing, and the write model](./06-drawing-and-the-write-model.md)
