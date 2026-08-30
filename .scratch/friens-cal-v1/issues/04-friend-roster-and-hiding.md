# 04 — The Friend roster and hiding

Status: ready-for-agent
Blocked by: 02, 03

## Parent

[friens-cal v1 map](../../shared-availability-calendar/map.md)

## What to build

The left sidebar's contents: a date picker above the roster of Friends, each row
a blobatar and a name with an eye that hides or shows that Friend.

**Hiding is a query tool, not a preference.** It filters the grid *and* drives
Candidate computation, and it is **ephemeral view state** — not persisted
anywhere, not even `localStorage`. Losing it on reload is correct.

**Hiding never hides Hangouts.** A Hangout always shows in full, including a
Hidden Friend's blob.

You are in the roster and are hideable like anyone else.

## Acceptance criteria

- [ ] The mini calendar sits above the roster and drives the calendar view's date
- [ ] Each row shows the Friend's blobatar and display name
- [ ] The eye is revealed on hover on desktop; the **whole row** is the toggle
- [ ] Hidden state lives in memory only and resets on reload
- [ ] The signed-in Friend appears in the roster and can hide themselves
- [ ] Roster blobatars animate while the cursor is over the sidebar
- [ ] Friend colours come from the computed `oklch(L_theme, C_theme, hue)`, never
      from blobatar's `head`
- [ ] `npx tsc -p tsconfig.app.json --noEmit` is clean

## Blocked by

- [02 — The two-sidebar app shell](./02-app-shell.md)
- [03 — Setup flow and blobatar identity](./03-setup-and-blobatar-identity.md)
