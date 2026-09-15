# 05 — Leaving a cal

Status: ready-for-agent
Blocked by: 02, 03

## Parent

[friens-cal — many Groups, joined by Code](../../groups-and-join-codes/map.md)

## What to build

The client half of leaving. The database half ships in slice 01 — a
`before delete on membership` trigger, not a fourth RPC, so ADR-0003's audited
set stays at three.

**Left, not dropped.** A dropped Participant is indistinguishable from one who
never joined, so the sidebar would **re-offer them the plan they walked out of**
the moment they rejoin and draw. Leaving marks you Left on every Hangout in that
cal that has not yet happened; the ones that already happened keep you as a
Participant, because a past Hangout is a record of who was there and leaving
says nothing about where you were.

**The dialog names every Hangout** it will mark you Left on, says the past is
safe, and **shows the Code** — leaving is the moment the Code becomes
unreachable to you, so it is the last chance to keep it.

**Rejoin needs nothing new.** It is unconditional and writes the Availability to
cover the range, exactly as Join does.

**The control lives on `/`**, in the list row's overflow menu, alongside Rename.
It is deliberately not on the shell's dropdown (slice 03). Leaving routes you
out of `/g/:id` back to `/`.

## Acceptance criteria

- [ ] Leave is reachable from the row's overflow on `/` and not from the shell
      dropdown
- [ ] The dialog names every future Hangout you will be marked Left on, states
      that past ones keep you, and shows the Code
- [ ] Leaving marks you Left on future Hangouts in that cal and leaves past ones
      holding your name
- [ ] Your Availability in that cal is gone and your Availability elsewhere is
      untouched
- [ ] Leaving routes you to `/` and the cal is no longer in your list
- [ ] Rejoining by Code works, and Rejoin on a Hangout writes the covering
      Availability
- [ ] A Hangout whose last Participant leaves is auto-cancelled if it has not
      happened yet
- [ ] `npx tsc -b` is clean, `yarn test` passes, lint unchanged at nine

## Blocked by

- [02 — Join or create a cal at `/`](./02-join-or-create.md)
- [03 — The cal dropdown in the app shell](./03-cal-dropdown.md)
