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
