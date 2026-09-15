# 06 — Prototype: the Group dropdown in the app shell

Type: prototype
Blocked by: 05
Status: open

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
