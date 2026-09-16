# 03 — The cal dropdown in the app shell

Status: done
Blocked by: 02

## Parent

[friens-cal — many Groups, joined by Code](../../groups-and-join-codes/map.md)

## What to build

Switching cals from inside one. A prototype exists on
`prototype/06-group-dropdown`, and the three-dots overflow **survived** against
a pure switcher with no row controls — the work went into making it hittable
rather than into replacing it.

**The measurement that decides the build.** At `icon-xs` the dots is 24x24 in a
40-tall row: 5.8% of its area, 12px of horizontal slack, and a click 16px left
of centre driven at 375px **switched cal instead**. `-my-2 h-10 w-9` makes it 34
wide by the row's full height, killing the vertical miss entirely, and costs
about one character of visible name.

It needs **three propagation guards** — `pointerdown`, `click`, `keydown` —
because Base UI menus act on the press rather than on the click.

**Two surfaces, two menus, overlapping on rename.** The dropdown's dots holds
Rename and View code. `/`'s overflow holds Leave and Rename. The sentence to
build to is *the dropdown's menu is the shortcut, `/` is the complete set*.
Leave stays off the dropdown.

**A cost recorded rather than solved: the dots cannot be reached by keyboard.**
`Tab` closes the menu and `ArrowRight` does nothing. Both escapes were tried and
both fail for structural reasons — a submenu trigger *is* the item, so the row
would stop switching, and two items in one row breaks the one-dimensional arrow
model. Do not re-litigate this in the build; record it if you touch it.

**Three details settled before the prototype ran**: the list is alphabetical on
both surfaces, names cap at 40 characters where they are typed, and the phone
bar gets **no cal name** — with the drawer shut, *which cal am I in* is answered
by the Friends on the grid.

The menu stays pinned to the trigger's width rather than growing to fit. A menu
inside the sheet is a non-issue: it portals above the sheet's focus trap and
positions correctly.

## Acceptance criteria

- [x] The shell has a cal switcher listing the Friend's cals alphabetically
- [x] Selecting one routes to its `/g/:id`
- [x] The three-dots target is the row's full height and ~34px wide, and a click
      16px left of its centre at 375px opens the menu rather than switching cal
- [x] The dots menu holds Rename and View code, and not Leave
- [x] Opening the menu does not switch cal via `pointerdown`, `click` or
      `keydown`
- [x] The menu is pinned to the trigger's width and works inside the phone sheet
- [x] The phone bar shows no cal name
- [x] Renaming caps at 40 characters
- [x] `npx tsc -b` is clean, `yarn test` passes, lint unchanged at nine

## Blocked by

- [02 — Join or create a cal at `/`](./02-join-or-create.md)

## Built

Two pure modules, five components, and three files edited. New in `src/cal/`:
`cal-menu.ts` (+ test, which menu holds what), `cal-overflow.tsx` (the three
dots), `cal-action-dialogs.tsx` (the dispatcher), `rename-dialog.tsx`,
`code-dialog.tsx` and `cal-switcher.tsx`. `cals.ts` gains `renameTo` (+ six
tests), `use-cals.ts` gains `rename`, `use-current-cal.ts` and
`current-cal-provider.tsx` gain the fold that keeps the cal on screen current.
`left-pane.tsx` puts the switcher in the header, `JoinOrCreatePage.tsx` fills
the slot slice 02 left in the row, and `shell.tsx` turns the phone drawer's
own close button off.

**Everything below was driven against the local rehearsal stack with `00`-`13`
applied**, signed in as a real account at 1280x860 and at 375x812. The live
project was never touched.

### The decisions this slice had to make

1. **The wordmark stays and the switcher takes the rest of the header.** The
   prototype replaced it, and the prototype was drawn before slice 02 made the
   wordmark the route to `/`. `/` is the only place the Codes are and, from
   ticket 05, the only place Leave is, so a switcher filling the header would
   leave the complete set of cals reachable by typing an address and by nothing
   else. Measured cost: the trigger is 201px rather than the prototype's 247,
   so a 40-character name shows about 25 characters instead of 31.
2. **The phone drawer's own close button had to go**, and finding it was the
   only surprise in the slice. `SheetContent` renders an X at `top-3 right-3`
   by default; the pane's header was a centred wordmark, so nobody had met it.
   It sits exactly where the switcher's chevron now is, and a press meant for
   the menu closed the drawer. Ticket 12 decision 5 had already written down
   that this pane has no close button, so `showCloseButton={false}` enacts a
   decision rather than making one. The backdrop and Escape still close it.
3. **A rename is a plain update, not a fourth RPC.** `08` §5 grants
   `update (name)` on `cal` with a Member-scoped policy, so the grant is the
   audit and ADR-0003's set stays at three. `maybeSingle` for the same reason
   the provider's read uses it: a non-Member updates no rows, and that is an
   empty result rather than an error.
4. **The rename folds into two pieces of state, and `useCals` does both.** The
   list is one; the cal on screen is the other, and it is a different read
   (slice 02 decision 1, which this slice did not reopen). `useCals` reads
   `CurrentCalContext` through `useContext` rather than `useCurrentCal`, so it
   works on `/` where there is no provider, and the provider ignores a row for
   any other cal. The alternative was every call site remembering to update
   both, and the one that forgets leaves the shell saying the old name while
   the Friend who just typed the new one is looking at it.
5. **`renameTo` refuses three drafts, and the third is the one that earns its
   keep**: empty after trimming, longer than the cap, and *the name it already
   has*. That last one is what makes the Rename button say whether pressing it
   would do anything, and the common near-miss is an added trailing space.
6. **The dots is widened on the switcher and not on `/`.** The measurement that
   decides it is about a button inside a menu item that navigates. Nothing on
   `/`'s row swallows a near miss, the row is 36 tall rather than 40, and a
   40-tall control beside a 24-tall copy button would set the height of the row
   it is the least important thing in. So `/` gets a plain `icon-xs`, matching
   the copy button beside it.
7. **The dialogs take the whole `CalsState`.** Ticket 05 then adds Leave as a
   branch in `CalActionDialogs` and three lines in `cal-menu.ts`, and touches
   neither call site. The `satisfies never` in the dispatcher is what makes the
   missing branch a compile error rather than a blank dialog.

### The measurement, and why the ticket's number reads 34

`offsetWidth`/`offsetHeight` on the dots, inside the menu, in the drawer at
375px: **36 x 40**, in a menu row measuring 40 tall. The whole row height, and
the glyph did not move.

The ticket says ~34, and 34 is what `getBoundingClientRect` reads while the
popup's `zoom-in-95` enter animation is stopped at its first frame, which is
what a browser pane running hidden does to every Base UI popup: 36 x 0.95 =
34.2, 40 x 0.95 = 38. The prototype's 34 and this build's 36 are the same
target measured two ways. Measure the layout box.

The hit test at 375px, inside the sheet, on a row that is not the current cal:
`elementFromPoint` returns the dots at the centre, at 16, 17 and 18px left of
it (18 being half its width), and at both the top and the bottom edge of the
row. **No vertical miss is available inside the row at all.** Then driven for
real: a trusted click 16 CSS px left of centre opened the Rename / View code
menu, `location.pathname` did not change and the header still read *climbing
crew*.

Worth knowing for the next agent: **synthetic events do not open the nested
menu**. `dots.click()` and a hand-dispatched pointerdown/pointerup/click both
leave `aria-expanded="false"`, with nothing prevented. The harness's own click
opens it first time. The repo's note that every grid drag is drivable by
synthetic pointers does not extend to a Base UI menu trigger.

### What else was driven

- **The menu is pinned to the trigger**: popup 201px against a 201px trigger on
  desktop, 210 against 210 in the drawer. Names truncate in the list as in the
  header.
- **Inside the phone sheet it portals above the focus trap and positions
  itself**: the switcher's popup opens at x=58 inside a 281px drawer, and the
  dots menu flips to the left rather than running off a 375px screen.
- **The phone bar carries no cal name**: it reads `▤ · September 2026 ⌄ ·
  Today · ◍` at 375px, before and after the drawer is opened.
- **Rename from the switcher**: 56 characters typed, 40 kept. The trigger, the
  menu row and `/` all show the new name with no reload, and the row moves to
  its new alphabetical place. **Rename from `/`'s row** does the same to the
  list in place.
- **Rename is disabled until the draft differs** from the name in the field.
- **View code** shows the Code with the copy button, over the drawer, and
  survives both menus closing.
- **The two doors are slice 02's dialogs**: created a cal from the switcher,
  which opened the name dialog, then the Code dialog, then routed into it.
  The drawer closed itself on the way, which is the provider's remount and not
  code in the switcher.
- **The current cal is marked** with a tick and `aria-current="true"`.
- **Leave is on neither menu**, by test and on screen.
- One Escape closes both menus and returns focus to the switcher's trigger.
  Tab walks the menu items and never lands on the dots, which is the cost
  below, still true in this build.

### The cost this carries, recorded rather than solved

**The three dots cannot be reached by keyboard.** It is written in
`cal-overflow.tsx`, in the ticket's own terms, with both failed escapes (a
`SubmenuTrigger` *is* the item, so the row would stop switching; two items in
one visual row breaks Base UI's one-dimensional arrow model). The keyboard
path for Rename is `/`, which is the other half of the two-surface split and
the reason Rename is on both menus.

### Checks

```
$ npx tsc -b
(clean)

$ yarn test
ℹ tests 345
ℹ pass 345
ℹ fail 0

$ yarn lint
✖ 9 problems (9 errors, 0 warnings)
```

44 of those 345 are new, in `src/cal/cal-menu.test.ts` and the six appended to
`src/cal/cals.test.ts`.

### What this leaves behind

- **A rename in another tab is still invisible.** `cal` has no broadcast
  trigger, so hearing about one means a new migration for a name read in a
  dropdown and a dialog title. The name you see is the name as of your last
  read, and the next navigation corrects it. `use-cals.ts` says so where the
  Realtime paragraph is.
- **The switcher's loading and error lines are not live regions.**
  `DropdownMenuLabel` is Base UI's `GroupLabel`, which is the group's
  `aria-labelledby` rather than something a screen reader announces when it
  changes. `/` says the same two things properly. It belongs on the
  screen-reader pass slice 02 still owes, which this slice makes sharper: the
  dots is labelled `More for <name>` and cannot be reached by the keyboard a
  screen reader drives.
- **`/`'s row now carries four things** and ticket 05 adds a fifth item to the
  menu on the end of it. Groups ticket 06 flagged that as worth a look when the
  build got there. It is still legible at 375px, but it is now the row's
  fourth control.
- **The cal list is read twice on a cal screen**, from slice 09 onward: the
  switcher calls `useCals` and so does `useElsewhere`. Two reads of a handful
  of rows, and one visible consequence: they are separate hook instances, so a
  rename in the switcher does not reach `useElsewhere`'s `namesById` and a
  clash warning keeps naming the old cal until the next navigation. Both are
  one hook lifted into `AppShell` by whoever is next in that file. Slice 03
  did not do it, to stay out of `app-shell.tsx` while slice 09 was building.
- **A cal called "g03 sandbox" is on the rehearsal stack** and cannot be
  removed, because `cal` has no delete grant (`08` §5). It was made to avoid
  renaming a cal another session was using.

### Left for after the cutover

Nothing. Every criterion is ticked and every one was driven against a local
stack rather than described. None of them needed the cutover, and no SQL was
written by this slice.

The live migration is still slice 01's: `08` to `13` are unrun against the
live project, so nothing on this branch can work there until a human runs them.
