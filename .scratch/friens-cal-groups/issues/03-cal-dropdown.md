# 03 — The cal dropdown in the app shell

Status: ready-for-agent
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

- [ ] The shell has a cal switcher listing the Friend's cals alphabetically
- [ ] Selecting one routes to its `/g/:id`
- [ ] The three-dots target is the row's full height and ~34px wide, and a click
      16px left of its centre at 375px opens the menu rather than switching cal
- [ ] The dots menu holds Rename and View code, and not Leave
- [ ] Opening the menu does not switch cal via `pointerdown`, `click` or
      `keydown`
- [ ] The menu is pinned to the trigger's width and works inside the phone sheet
- [ ] The phone bar shows no cal name
- [ ] Renaming caps at 40 characters
- [ ] `npx tsc -b` is clean, `yarn test` passes, lint unchanged at nine

## Blocked by

- [02 — Join or create a cal at `/`](./02-join-or-create.md)
