# 02 — The two-sidebar app shell

Status: ready-for-agent
Blocked by: 01

## Parent

[friens-cal v1 map](../../shared-availability-calendar/map.md)

## What to build

The three-column layout the whole app lives in: a left sidebar, the calendar in
the middle, a right sidebar — each toggling **independently**. Both panes hold
stubs; their contents are later issues.

shadcn's sidebar cannot do this: state lives on `SidebarProvider`, so two
sidebars under one provider toggle together. **Fork it** rather than nesting.
The decisive reason is not layout — it is that each provider owns a private
`openMobile`, so nesting makes **two simultaneous sheets representable**: two
stacked dialogs and two focus traps on a phone. Only 5 of the sidebar's 23
exports touch the context; the other 18 are presentation keyed off `data-*` and
are re-exported unchanged. See ticket 12 and the prototype at
`src/prototypes/app-shell/`.

Below 768px there is **one sheet slot** — `'left' | 'right' | null` — so a
second sheet is unrepresentable rather than merely discouraged.

Own the keyboard handler; do not inherit it. The shipped shadcn handler fires on
`⌥⌘B`, on `⌃⌘B`, and on a synthetic `key:"b", shiftKey:true`, so `⇧⌘B` already
toggles the *left* pane in any automated test.

## Acceptance criteria

- [ ] Three columns; both sidebars open by default
- [ ] `⌘B` toggles left only; `⇧⌘B` toggles right only
- [ ] The handler reads `shiftKey` explicitly, rejects other modifiers, and
      matches `key` then `code` (so a Cyrillic layout still works)
- [ ] `⇧⌘B` calls `preventDefault` so Chrome's bookmarks bar does not toggle
- [ ] Below 768px both panes leave the flow; at most one sheet can be open;
      crossing back up force-closes it
- [ ] Top bar is **variant C** — spanning the centre and right columns
- [ ] Top bar shows **month and year only**, never a day range
- [ ] Week view column headers show weekday + date number (`Mon 30`)
- [ ] Top-right cluster: blobatar menu, month/week select, Today, prev/next
- [ ] There is **no** close button inside the left sidebar
- [ ] `src/components/ui/sidebar.tsx` is left untouched; the fork lives in app code
- [ ] `npx tsc -p tsconfig.app.json --noEmit` is clean

## Blocked by

- [01 — Sign in, and your Friend row exists](./01-sign-in-and-friend-row.md)
