# 06 — Prototype: the Group dropdown in the app shell

Type: prototype
Blocked by: 05
Status: resolved

## Question

The `friens` label in `src/shell/left-pane.tsx:81` becomes a switcher. The brief
is detailed, so this prototype is mostly about whether it survives contact:

- The current Group's **name**, with a **chevron down** on the right.
- The menu, **in this order, bottom-weighted**: the Groups already joined first,
  then **"Join another via code"**, then **"Create a new friens cal"**.
- The current Group carries a **tick**.
- Each Group row has a **three dots** on the right opening a *second* dropdown:
  **rename** and **view code**.

The open questions:

1. **A nested dropdown inside a dropdown menu item.** Base UI supports submenus,
   but a three-dots trigger *inside* a menu item is not a submenu — it is a
   second trigger competing with the item's own click target, which switches
   Group. On touch especially, those two targets are millimetres apart and one of
   them navigates away. Is a submenu on hover/arrow the right pattern instead,
   or does the three-dots earn the risk?

2. **The reversed order.** Actions at the bottom is unusual and deliberate. With
   one cal the menu is a single row and two actions; with eight it is a list and
   the actions have moved. Check both.

3. **Where the header's width comes from.** `SidebarHeader` is `h-12` and the
   left pane collapses. A cal called "spiritually unemployed" is long. Truncate,
   wrap, or constrain names at creation?

4. **The collapsed and mobile cases.** v1 ticket 17 made the left sidebar a
   drawer below 768px, and v1 ticket 12 gave the shell one sheet slot. This
   dropdown lives inside the drawer there. Does opening a menu inside a sheet
   work, and where does the Group name show when the drawer is shut?

5. **The list is the same data as ticket 05's page**, rendered twice — Codes
   inline there, one level down here. Build it after 05 so the list is settled
   once, and say if the duplication starts to look like a mistake.

Prototypes live on a `prototype/` branch, not on `main`. Link it here.

## From ticket 05, which is now resolved

[05](05-join-or-create-page.md) settled the list, so §5's "same data rendered
twice" is now a concrete constraint rather than a worry:

- **The row shape is fixed**: name on the left, Code right-aligned in
  `muted-foreground`, and a **trailing copy button** that flips to a tick. The
  row is deliberately *not* one button, because a button cannot contain a button
  and a row that navigates cannot also be drag-selected.
- **That copy button is a direct challenge to the three dots.** If the Code is
  one press away on the landing page, "view code" as a menu item behind a nested
  dropdown is carrying a lot of structure for something a copy button already
  does. Consider whether the three dots can be **rename only**, which would
  dissolve §1's competing-hit-targets problem instead of solving it.
- **Do not build new dialogs.** The join dialog and the two create dialogs exist
  on branch `prototype/05-join-or-create`. "Join another via code" and "Create a
  new friens cal" open the same two flows, so the duplication §5 asks about is
  the *list*, not the actions.
- **No member count.** C proposed one and lost; the dropdown does not need it
  either, and it would be a read nothing else on the page performs.
- **The list order is unset and is now yours.** 05 used insertion order because
  three rows made it moot. This ticket renders the same list, so it settles the
  order for both surfaces.

## Answer

**Variant A, against the recommendation, with its hit target rebuilt.** Branch
`prototype/06-group-dropdown`, commits `ce74050` (the two variants) and
`ad05ab5` (A's widened target). Run it at
`/prototype/group-switcher?variant=A`; the route is outside both gates and every
byte is stubbed, so nothing there touches Supabase.

Two variants rather than 05's three, because the disagreement is one axis: does
a row in the menu carry a menu of its own. **A** the brief taken literally,
three dots per row holding rename and view-code; **C** a pure switcher, no row
controls at all, every act of managing a cal moved to `/`. The cal count
(1 / 3 / 8) is a control on the prototype bar rather than a third variant, since
§2's "check both" is a volume question.

Four things were settled by grilling before a line was written, so the prototype
did not re-litigate them: the list is **alphabetical, case-insensitive** on both
surfaces; names are **capped at 40 characters where they are typed**;
truncation in the header is the fallback, not the plan; and the phone bar gets
**no cal name** — ticket 17 already measured that a fourth control group does not
fit at 375px.

### The five questions, settled

1. **The three dots earns the risk, and it is a judgement made with the cost in
   view rather than around it.** C was built precisely so the comparison was
   real, and it lost. The finding that argued hardest against A stands anyway
   and is recorded below as an accepted cost.

   What the prototype changed is the target. At `icon-xs` the dots is **24×24 in
   a 40-tall row**: 5.8% of the row's area, **12px of horizontal slack**, and 8px
   of vertical slack either side — a press 13px above the glyph switches cal.
   Driven for real at 375px, a click 16 CSS px left of the centre moved the
   header from _spiritually unemployed_ to _uni leftovers_. `-my-2 h-10 w-9`
   claws back the row's own `py-2` and makes the target **34 wide by the row's
   full height**: 14.6% of the area, 17px of horizontal slack, and **no vertical
   miss available inside the row at all**. It costs about one character of name
   and the glyph does not move.

   It also needs **three propagation guards, not one** — `pointerdown`, `click`
   _and_ `keydown` — because Base UI's menus act on the press rather than the
   release. Without all three, pressing the dots also switches cal.

2. **The reversed order holds at both ends.** At one cal the menu is a single
   row, a rule and two actions, and the actions are not buried because there is
   nothing to bury them under. At eight it is a list and the actions have moved
   down, which is the case the inversion was chosen for. Nothing to change.

3. **Truncate, and cap at creation.** `min-w-0` plus `truncate` with a
   `shrink-0` chevron does it, and **`min-w-0` is the load-bearing half**: a flex
   child's default `min-width` is `auto`, so `truncate` alone leaves the name at
   its intrinsic width and pushes the chevron out of the pane instead of
   clipping the text. A 38-character name shows 27 of them in the header — about
   a third lost — which is the argument for the **40-character cap** rather than
   letting it ride. The cap is enforced where the name is typed, hard.

4. **A menu inside the sheet is a non-issue, and the missing name is the real
   finding.** Base UI's Menu portals above the sheet's own focus trap, positions
   correctly, and the backdrop does not eat the press: at 375px the 256px menu
   opens inside the 281px drawer and behaves exactly as it does on desktop. With
   the drawer **shut**, the bar reads `▤ · September 2026 · Today · ◍` and the
   cal's name is nowhere on screen. Accepted: with a handful of cals ever,
   _which cal am I in_ is answered on a phone by the Friends on the grid, and
   the alternative was evicting a control that is needed on every screen in
   favour of one needed when you change cals.

5. **The duplication is fine, and the list order is now set for both.** The
   order is **alphabetical, case-insensitive** (`localeCompare` with
   `sensitivity: 'base'`, so an uppercase or accented name sorts where a reader
   expects). Most-recently-visited is disqualified in a switcher specifically —
   the list reorders itself under the finger about to press it. Insertion order
   is invisible, because neither surface shows a join date. This settles 05's
   handoff for `/` as well.

### The cost A carries, permanently

**The three dots is unreachable by keyboard, and nothing fixes it in place.**
With the menu open, `Tab` closes the whole menu and throws focus out of it, and
`ArrowRight` does nothing — a button nested inside a `Menu.Item` is skipped by
the composite roving focus. Both were driven, not inferred. The escapes were
looked for and all fail: a **submenu** is keyboard-reachable but a
`SubmenuTrigger` _is_ the item, so the row would stop switching cal, which is A
dismantled rather than A fixed; and **two items side by side in one visual row**
breaks the arrow model, because Base UI's menu is one-dimensional.

So the dropdown's menu is a **pointer-only shortcut**, and the keyboard path has
to live somewhere else — which is the next section.

### Ticket 10's §8 handoff, answered: two surfaces, two menus, overlapping on rename

[10](10-leaving-a-group.md) put **Leave** in a trailing overflow on `/`'s row and
refused to decide whether the two surfaces carry two different menus. With A
winning, they do, and they **overlap on rename**:

- the dropdown's dots holds **Rename** and **View code** — the shortcut, from
  inside the cal;
- `/`'s trailing overflow holds **Leave** and **Rename** — the complete set.

View-code already had a keyboard path on `/` (05's copy button). Rename had none
anywhere, and the alternative was renaming a cal being impossible without a
mouse or a touchscreen, which is a different class of thing from an untidy
menu. Nobody meets both menus in the same minute. **Leave stays off the
dropdown** — 10 settled that and nothing here reopens it.

The build sentence: **the dropdown's menu is the shortcut, `/` is the complete
set.**

### Three notes the build needs

- **The menu is pinned to the trigger's width** and stays that way.
  `DropdownMenuContent` carries `w-(--anchor-width)`, so the popup is exactly
  the header trigger's ~247px and long names truncate in the list as well as in
  the header. Overriding to `w-auto min-w-(--anchor-width)` was considered and
  refused: a menu that changes width with its contents makes the 8-cal case jump
  out over the grid, the header shows the full name once you have picked, and on
  a phone 247px is already most of the drawer so growing is not on offer.
- **`/`'s row is now carrying four things** — name-and-Code as one target, the
  copy button, and an overflow holding Leave and Rename. 05 fought to stop that
  row being a single control; this is the third addition to it. Worth a look
  when the build gets there, not a reason to move anything now.
- **The screen-reader pass 05 owed is still owed**, and A makes it sharper
  rather than softer: `aria-label` on the dots is `More for <cal name>`, and the
  control it labels cannot be reached by the keyboard that a screen reader
  drives.

`CONTEXT.md` needed no change, and that was checked rather than assumed — the
switcher introduces no term, and renaming was already a Member's right under
**Member**.

### Why C lost, kept because it is the reasoning

C proposed a clean split — _this menu answers which cal am I in, `/` answers what
cals am I in_ — and it dissolved §1 instead of solving it. It lost on the cost
of the split: renaming the cal you are standing in becomes two navigations away
from it, out to `/` and back, for the one act you are most likely to want while
looking at the thing you are renaming. Its argument survives in a smaller form,
as the overlap above.

### A note on the branch

This ticket's prototype was built while another session was working ticket 13 in
the same working tree, and that session's `git add -A` swept all seven files and
the route into its own `proto(13)` commit. No history was rewritten. The clean
branch **`prototype/06-group-dropdown`** was built from `main` in a temporary
worktree and holds this prototype and nothing else; `prototype/06-group-switcher`
is not it, despite the name.
