# 07 — The grid draws the viewer's time zone

Status: ready-for-agent
Blocked by: 01

## Parent

[friens-cal — many Groups, joined by Code](../../groups-and-join-codes/map.md)

## What to build

Every Friend's grid is drawn in **their own** zone. A cal has no clock of its
own, and `cal.time_zone` was dropped before it was ever written — once every
grid is its own, nothing asks what the cal means by Saturday.

**A hybrid already ships and nobody chose it.** `startOfDayInZone` has always
read the *device's* civil date and only reinterpreted it in Rome, so per-viewer
is the only position consistent with what is deployed. This slice finishes a
move that was half-made by accident.

**A Friend's zone is a mirror of the device, not a setting.** Written on
sign-in, never editable, and read only by other people: the roster shows
`8h ahead` beside a Friend whose zone differs from yours. `friend.time_zone`
ships in slice 01's `09-per-cal.sql`.

**Slots are pinned to the absolute grid.** Overlap is exact-instant matching, so
a `:45` zone would silently produce no Candidates at all and then fail
`hangout_on_the_slot_grid` on confirm. `availability.slot_start` gains the
`epoch % 1800 = 0` check that `hangout` already carries — also in slice 01.

**A time string names its frame as `GMT+2`, never `CEST`.** `Intl`'s `short`
token is locale-*inverted*: `en-GB` gives Rome `CEST` and New York `GMT-4`,
`en-US` gives the reverse. And the frame is shown **only when the cal actually
spans zones**, so every cal today shows nothing.

DST needs nothing built beyond what v1 already does — the row count still comes
from the zone, and which day is short is now a fact about the viewer rather than
about the cal, so one week can hold two different short days.

The glossary already carries this: **Group** lost its clock, **Slot** became an
instant, and **Availability** gained the write side.

## Acceptance criteria

- [ ] A Friend's `time_zone` is written on sign-in and updates if their device
      zone changes
- [ ] The grid renders in the viewer's own zone, and two browsers in different
      zones read different wall clocks off the same drawn Slot
- [ ] The roster shows an offset beside a Friend whose zone differs, and nothing
      when it does not
- [ ] Time strings render as `GMT+2`, and only when the cal spans zones
- [ ] A Candidate computed in one zone is byte-identical in the other
- [ ] The DST week still derives its row count from the viewer's zone, and two
      Friends can have their short day on different dates in one week
- [ ] `npx tsc -b` is clean, `yarn test` passes, lint unchanged at nine

## Blocked by

- [01 — The cutover](./01-the-cutover.md)
