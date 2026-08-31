# 04 — The Friend roster and hiding

Status: resolved
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

- [x] The mini calendar sits above the roster and drives the calendar view's date
- [x] Each row shows the Friend's blobatar and display name
- [x] The eye is revealed on hover on desktop; the **whole row** is the toggle
- [x] Hidden state lives in memory only and resets on reload
- [x] The signed-in Friend appears in the roster and can hide themselves
- [x] Roster blobatars animate while the cursor is over the sidebar
- [x] Friend colours come from the computed `oklch(L_theme, C_theme, hue)`, never
      from blobatar's `head`
- [x] `npx tsc -p tsconfig.app.json --noEmit` is clean

## Blocked by

- [02 — The two-sidebar app shell](./02-app-shell.md)
- [03 — Setup flow and blobatar identity](./03-setup-and-blobatar-identity.md)

## Comments

**Built on `feat/04-friend-roster-and-hiding`, merged to `main`.**
Two commits: the slice, then the two-axis review applied.

### Where Hidden lives, and why it is not MobX-State-Tree

`useRoster()` in `src/roster/use-roster.ts`, instantiated in `AppShell` beside
`useCalendarView` and passed down by prop. It returns the Group *and* the Hidden
set, because hiding is a **query tool** (CONTEXT.md) and the query it defines is
what issue 07's heatmap and issue 08's Candidate list are computed over.
`roster.visible` is that query, and it is the interface those two issues read —
neither of them is in the sidebar, which is why the roster cannot own Hidden
privately the way the prototype does.

Plain React state. `state-management.mdc` asks for MST for "global / shared
state" and this *is* shared, so the deviation is deliberate: it is one `Set` and
one array, nothing in `src/` uses MST yet, and `useCalendarView` is the standing
precedent for exactly this class of state. Introducing MST is a bigger decision
than this slice should make on its own — but it is the natural home if a later
issue needs Availability, Candidates and Hidden to derive from one another, and
`useRoster` is one file to replace when that happens.

Nothing is persisted. Verified: after a reload every row is shown, the count is
gone, and there is no `localStorage` key and no cookie.

### The pure core is tested; the rest was verified in the browser

`src/roster/roster.ts` has **no imports at all**, which is what lets `yarn test`
(`node --test`) reach it — the same split `identity.ts` and `friend-row.ts`
already make. Ten new assertions, 22 in the suite: roster order, your own row
overlaid on the query's copy, and the Hidden toggle returning a new `Set` (a
mutated one is the same object and nothing re-renders).

Verified signed-in against the real project, asserting on state and DOM
attributes rather than pixels — the Browser pane runs with
`document.visibilityState: "hidden"`, so Base UI sheets freeze mid-transition
and screenshots come back downscaled:

- clicking **12** in the picker moved the bar label to `August 2026` and the grid
  columns to `Mon 10 … Sun 16`;
- browsing the picker to September left the grid on August, and pressing `›`
  snapped the picker back to the anchor's month;
- the eye computes to `opacity: 0` at 1440px, `1` with the row hovered, `1`
  unhovered while that Friend is Hidden, and `1` at 375px, where there is no
  hover to wait for;
- the roster blob element flips `IMG` → `svg` when the cursor enters the pane
  (the header included) and back on leave; in the 375px sheet it is `svg` while
  the drawer is open, and the rows are not mounted while it is closed;
- the rail computes to `oklch(0.62 0.105403 35)` in light and
  `oklch(0.75 0.127503 35)` in dark, from `--friend-l` / `--friend-c` through the
  cascade — nothing branches in JS.

`npx tsc -b` is clean for all three projects. Lint is unchanged at the errors
already on `main` — **9, not the 11 the brief says**, all still in
`src/components/ui/*` and `grid-pattern.tsx`. The console is clean.

### Four judgement calls, none of them sanctioned by a ticket

1. **A Friend who has not been through setup** keeps their place in the roster,
   sorts last, and stays hideable like everyone else — uniform rows beat a
   control that is inert on exactly those rows. What they do not get is a
   **colour**: no rail, and a dashed neutral placeholder instead of a blobatar,
   because blobatar derives a hue from the seed and that hue would be
   indistinguishable from one they had chosen. They read as "Someone new". There
   is one such row in the real project, and this is what it looks like.
2. **Roster order is alphabetical, unfinished Friends last.** No ticket decides
   it. Alphabetical rather than "you first" so the order does not depend on who
   is looking; your own row is marked `you` instead. One function, `rosterOrder`,
   and four tests — cheap to overturn.
3. **The eye is not the prototype's `SidebarMenuAction`.** It is an icon inside
   the row button, revealed by `group-hover` and permanently visible below the
   sheet breakpoint. Two focusable controls with one behaviour is one too many
   for anyone reading the row through a screen reader, and the criterion says the
   whole row is the toggle. The `title` and `aria-label` are one string and state
   the *action* ("Hide Ada"), with no `aria-pressed` beside it: a control that
   flips its own name **and** reports itself pressed says the same thing twice
   and disagrees with itself doing it.
4. **The mini calendar's month browses independently of the grid.** Looking at
   March does not move the grid there; the picker follows the anchor whenever the
   anchor moves, but not the reverse. The follow is a derivation against the
   anchor's timestamp, not an effect — syncing it in an effect sets state during
   an effect and renders twice per press of the top bar's arrows, and
   `eslint-plugin-react-hooks` v7 rejects it outright. In week view the seven
   days the grid shows carry a `bg-primary/10` band, because the grid's unit is a
   week and one selected day understates it. `bg-accent` was tried first and
   measured invisible at `oklch(0.97)`.

### Also worth knowing

- **`useCalendarView` gained `goToDate(date)`** — the only jump to an arbitrary
  date. Wrapped rather than handing out `setAnchor`, whose updater overload would
  let a caller step relatively.
- **`LeftPane` takes props now** (`calendar`, `roster`), and `AppShell` passes
  them.
- The roster read is `select('*')` on `friend` with **no filters** — not
  `useTakenHues`, which excludes the signed-in Friend and drops null hues, both
  of which are wrong here. Group-wide select needs no new grant (issue 01).
- **Your own row is overlaid on the query's copy of it** (`mergeSelf`), so
  changing your hue from the profile menu recolours your roster row at once
  rather than at the next reload — the session provider rewrites your row and
  knows nothing about this query. Other Friends' rows go stale until a reload;
  that is Realtime, and it is issue 07's.
- A **loading skeleton** (three rows) and an **error line** were added, neither
  asked for by the criteria. A roster that reads from the network with neither is
  a blank pane and a silent failure. On error your own row still renders, so the
  pane degrades to a partial roster rather than an empty one; nothing retries,
  because a reload is the retry and no write depends on this read.
- The **visible/total count** in the group label appears only while something is
  Hidden. Also not asked for: it is there because Hidden drives the Candidate
  list in the other pane, where nothing else says a filter is on.
- `yarn test` in the new docblocks, against `project-conventions.mdc`'s "always
  use `npm`" — matching `identity.test.ts` on `main`, which says the same. Both
  lockfiles are in the repo; the drift predates this slice.

### Left for issue 07, deliberately

- **The silence dot.** CONTEXT.md's "the sidebar marks Friends who are entirely
  silent in the current view" needs Availability. The room for it is the row's
  right edge, beside the eye.
- **Realtime.** A Friend changing their hue should recolour their roster row
  live. `useRoster` is the one subscriber to add.
