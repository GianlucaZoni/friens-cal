# 02 — The two-sidebar app shell

Status: resolved
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

- [x] Three columns; both sidebars open by default
- [x] `⌘B` toggles left only; `⇧⌘B` toggles right only
- [x] The handler reads `shiftKey` explicitly, rejects other modifiers, and
      matches `key` then `code` (so a Cyrillic layout still works)
- [x] `⇧⌘B` calls `preventDefault` so Chrome's bookmarks bar does not toggle
- [x] Below 768px both panes leave the flow; at most one sheet can be open;
      crossing back up force-closes it
- [x] Top bar is **variant C** — spanning the centre and right columns
- [x] Top bar shows **month and year only**, never a day range
- [x] Week view column headers show weekday + date number (`Mon 30`)
- [x] Top-right cluster: blobatar menu, month/week select, Today, prev/next
- [x] There is **no** close button inside the left sidebar
- [x] `src/components/ui/sidebar.tsx` is left untouched; the fork lives in app code
- [x] `npx tsc -p tsconfig.app.json --noEmit` is clean

## Blocked by

- [01 — Sign in, and your Friend row exists](./01-sign-in-and-friend-row.md)

## Comments

### Built

`src/shell/`. The fork is `shell.tsx` + `shell-context.ts`; `src/components/ui/sidebar.tsx`
is untouched. Of the sidebar's 23 exports, 5 touch the context — four of those
are forked, `SidebarRail` is dropped (this shell has no rail), `SidebarInset` is
replaced by `ShellInset`, and the remaining **17** are re-exported unchanged.

`shortcutPane` is a pure function, deliberately: every one of the three bugs in
the shipped handler is a missing line in a function that size.

Verified in a real browser rather than reasoned about, because the whole point
of this handler is that synthetic events lie:

| | result |
| --- | --- |
| real `⌘B` / `⇧⌘B` | left only / right only |
| synthetic `{key:'b', shiftKey:true}` and `{key:'B', …}` | right, `defaultPrevented` |
| `⌥⌘B`, `⌃⌘B`, bare `b` | ignored, `defaultPrevented === false` |
| `⌃и` with `code:'KeyB'` | left |
| below 768px | zero in-flow panes; opening one sheet closes the other |

**Two things this environment could not exercise**, stated rather than claimed:
the browser pane runs hidden, so `document.visibilityState` is `hidden`, rAF is
throttled, and Base UI's transition state machine freezes mid-flight — the sheet
*state* was verified, the sheet *animation* was not. And under its viewport
emulation neither `resize` nor a matchMedia `change` ever fires, so
**force-closing the sheet when the width crosses back up is unverified** (the
logic is a four-line sync). Both want thirty seconds in a visible window.

### After review

`/code-review` against `main`, both axes. Applied:

- **The export count was wrong** — "re-export the other 18" when 17 are
  re-exported. Both axes found it independently. The comment now names which
  five touch the context and what happened to each.
- **The right pane is no longer called "Candidates".** It holds pinned Hangouts
  too, and CONTEXT.md is explicit that a Candidate and a Hangout are entirely
  different things; the sheet title and the trigger tooltip said otherwise. It
  is "Candidates and Hangouts" until someone names it properly.
- **The out-of-month wash in the month stub is gone.** Ticket 14 spends the wash
  on peak concurrency; a stub that spends it first on "not this month" pre-empts
  issue 11.
- **Week headers are `EEE d` at every width.** They briefly dropped to a single
  letter below 768 — an undecided call made in code, against decision 6, which
  says "the three-letter weekday" and names no exception. Issue 12 owns the
  phone.
- **The date label is a `span` above the breakpoint and a `button` below**, not
  one button with `pointer-events-none`. That shape was reachable by keyboard
  and inert to the mouse, so keyboard users had two Today controls and mouse
  users had none.
- Repeated `side === 'left' ? …` switches collapsed into one `PANE` record,
  which also stopped the sr-only text saying "left panel" while the tooltip said
  "Friends"; `WEEK_STARTS_ON` is exported rather than restated as a bare `1`;
  `defaultOpen` dropped, because decision 3 is a decision and not a knob.
- **A real bug, found in the browser, not by either axis**: `DropdownMenuLabel`
  is Base UI's `Menu.GroupLabel` and throws `MenuGroupRootContext is missing`
  outside a `Menu.Group`. The prototype has the same latent fault.

Kept, against the reviews, with reasons:

- **`ShellMenuButton` has no call site.** It is the guard rail: left out, the
  shared `SidebarMenuButton` is neither forked nor re-exported, and issue 04
  imports the one that calls `useSidebar()` and throws under this provider.
- **The breakpoint effect duplicates `useIsMobile`.** That hook returns `false`
  until its first effect runs, which would render three columns for a frame on a
  phone; this one reads the query synchronously and also clears the sheet.

### Answered by the human, on merge

- **The right pane is the Hangouts pane.** "Events as Hangouts, or Candidates
  for Hangouts." So the name is a **topic, not a type**: the pane's title is the
  one place the two words sit under one, and inside it they stay apart in their
  own regions, which is what CONTEXT.md actually forbids collapsing. Replaces
  the placeholder "Candidates and Hangouts".
- **`⇧⌘B` is settled.** The Chrome bookmarks-bar collision was checked in a
  real browser and is a non-issue; `preventDefault` wins. Decision 2 stands with
  nothing left hanging off it.
- Shell verified visually by the human at merge, which closes the two checks the
  hidden browser pane could not run (sheet animation, and force-closing the
  sheet on crossing the breakpoint upward).

### Still open

- **"Pinned" is load-bearing vocabulary that CONTEXT.md does not define.**
  Tickets 09 and 16 both use it. Worth a glossary entry.
