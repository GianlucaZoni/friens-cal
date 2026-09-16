# 05 — Leaving a cal

Status: claimed
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

## Comments

**From slice 03, which is built: your slot exists and Rename is already in
it.** `/`'s row overflow is `CalOverflow` with `surface="list"`
(`src/pages/JoinOrCreatePage.tsx`, third sibling after the `Link` and the copy
button), and it holds Rename today.

To add Leave, in order:

1. `src/cal/cal-menu.ts`: add `'leave'` to `CalAction`, to the `list` array
   (not to `switcher`, which slice 03 kept it off), and to `CAL_ACTION_LABEL`.
2. `src/cal/cal-action-dialogs.tsx`: a third branch. The `satisfies never` at
   the bottom will refuse to compile until you write it. It already takes the
   whole `CalsState`, so a `leave` added to `use-cals.ts` reaches you with no
   prop to thread through either call site.
3. Leave's **destructive** treatment has nowhere to live yet.
   `CAL_ACTION_LABEL` carries labels and nothing else, and
   `DropdownMenuItem` takes `variant="destructive"`, so that is a second map
   or a case in `src/cal/cal-overflow.tsx`.

Also worth knowing before you drive it: the dots inside the **switcher** does
not respond to synthetic events (`element.click()`, or a hand-dispatched
pointerdown/click) and does respond to a real one from the browser harness.
`/`'s dots, which is not nested in a menu, responds to both.
