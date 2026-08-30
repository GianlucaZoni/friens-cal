# 12 — Prototype: the app shell, two independently-toggled sidebars

Prototype run 2026-08-30. Throwaway code, deliberately.

## What I built

`src/prototypes/app-shell/` — a working three-column shell with two panes that
toggle independently, in two forms:

- `shell.tsx` — **the fork**. `src/components/ui/sidebar.tsx` is untouched.
- `parts.tsx`, `data.ts`, `variants.tsx`, `index.tsx` — the React prototype.
  Default export `AppShellPrototype`. Wire with
  `<Route path="/prototype/app-shell" element={<AppShellPrototype />} />`,
  then `?variant=A|B|C`, or the floating bar, or ← / →.
- `dev.html` + `dev.tsx` — a throwaway Vite entry so the React version can be
  **run** without touching `src/App.tsx` or `src/pages/AppRoutes.tsx` (four
  agents were in this repo concurrently). `node_modules/.bin/vite`, then
  `http://localhost:5173/src/prototypes/app-shell/dev.html?variant=C`.
- `preview.html` — the dependency-free twin. Double-click it. Same state model,
  same keyboard handler character-for-character, same three layouts, same
  one-sheet invariant. Avatars are stand-in SVG blobs; the colour rule is real.

`npx tsc --noEmit` passes clean. Unlike ticket 06, **everything below was
measured in a real browser** — both the React shell (Vite, real base-lyra
components, real Blobatars, real `Calendar`) and the standalone twin.

Three variants, differing on exactly one axis — **where the top bar lives**:

| | A — Inset bar | B — Banner | C — Reference |
|---|---|---|---|
| bar spans | centre only | the whole window | centre + right |
| panes are full height | both | neither | left only |
| pane triggers live | at the bar's two ends | at the bar's two ends | in the top-right cluster |
| top-right cluster is flush with | the calendar's right edge | the window's right edge | the window's right edge |

The state mechanism is identical in all three. That is deliberate: it is
settled, and the variants exist to judge the layout sitting on top of it.

---

## 1 — Nested providers or a fork? **Fork.** Four reasons, not three.

Ticket 03 found three collisions. There is a fourth, and it is the one that
decides it.

1. **Keyboard.** Each `SidebarProvider` registers its own `window` keydown
   listener on the hardcoded `SIDEBAR_KEYBOARD_SHORTCUT`. Two providers = two
   listeners = one `cmd+b` toggles both. No prop remaps or disables it, so
   nesting cannot be made correct **from the outside**.
2. **The cookie.** Both write `sidebar_state`; nothing reads it back.
3. **Nested flex wrappers.** Survivable — `SidebarProvider` forwards
   `className`, so `flex-1 min-w-0` on the inner one fixes the shrink fight.
   This is the *weakest* of the four, contrary to how ticket 03 ranked it.
4. **NEW — the sheet breakpoint.** Each provider owns a private `openMobile`.
   Under nesting, **nothing prevents both sheets being open at once**: two
   stacked Base UI dialogs over a 390px screen, each with its own backdrop and
   its own focus trap. "At most one sheet" is not a rule you can enforce from
   outside; it is only expressible if **one object owns both**. That is the
   argument that settles the ticket, and it is also the answer to item 4.

### It is a *surgical* fork, not a 723-line copy

The important find: **only 5 of the sidebar's 23 exports touch the context.**
`SidebarProvider`, `Sidebar`, `SidebarTrigger`, `SidebarRail` and
`SidebarMenuButton` call `useSidebar()`. The other 18 — header, footer, content,
group, group-label, group-content, menu, menu-item, menu-action, menu-badge,
separator, inset, … — are pure presentation keyed off `data-*` attributes.

So `shell.tsx` forks the five and **re-exports the rest from
`@/components/ui/sidebar` unchanged**. Our copy is ~250 lines, and upstream
updates to everything else still land for free. `SidebarMenuButton` is forked
only because it calls `useSidebar()` for a collapsed-state tooltip we do not
have; the fork drops the tooltip branch and is 15 lines.

### The fork also puts the panes back **in flow**

The shared `Sidebar` is `position: fixed; inset-y-0` plus an in-flow spacer.
That exists to serve `variant="floating"`/`"inset"` and the off-canvas slide.
It means a top bar that is not full-height-adjacent has to be coordinated with
the sidebar by hand — **variants B and C are impossible to lay out cleanly
against it** without threading a `--shell-top` offset through the component.

Our fork is a flex column whose `width` animates `17rem → 0` with
`overflow: hidden` on the outer and a fixed-width inner. Visually the same
slide; structurally it composes with any bar arrangement. We only ever needed
`collapsible="offcanvas"`, which is the one mode this handles natively.

**Cost of the fork, stated plainly:** we own the five components. In exchange we
get one keyboard listener, one sheet slot, no cookie, and a shell that lays out.

---

## 2 — The keyboard. ⚠️ Worse than ticket 03 said. Measured, not reasoned.

Ticket 03 said `cmd+shift+b` avoids collision *by accident* and is "one
`toLowerCase()` away" from breaking. **It is already broken today**, and it has
a second bug nobody had noticed.

I ran the shadcn handler verbatim in Chrome against five events:

| event | `key` | shadcn handler | our handler |
|---|---|---|---|
| real `cmd+b` | `"b"` | fires | left |
| real `cmd+shift+b` | `"B"` | does not fire ✅ | right |
| **dispatched `cmd+shift+b`** | `"b"` | **FIRES** ❌ | right |
| **`cmd+alt+b`** | `"b"` | **FIRES** ❌ | ignored |
| `ctrl+и` (Cyrillic), `code: "KeyB"` | `"и"` | does not fire ❌ | left |

Two findings ticket 03 did not have:

- **The accident already fails under programmatic dispatch.** A `KeyboardEvent`
  synthesised with `key: "b", shiftKey: true` — which is what the browser
  automation harness emits, what most e2e frameworks emit, and what some
  assistive-tech and remote-desktop paths emit — makes the shadcn handler fire.
  So today, in the shipped component, `cmd+shift+b` **already toggles the left
  sidebar** in every automated test anyone writes. The luck is thinner than
  "one `toLowerCase()`".
- **The shadcn handler fires on `cmd+alt+b` too**, and on `cmd+ctrl+b`, because
  it never checks that no *other* modifier is held. That is someone else's
  shortcut being eaten.

### The handler we own

```ts
const isShortcutKey = (e) => e.key.toLowerCase() === 'b' || e.code === 'KeyB'

window.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey)) return
  if (e.altKey) return                       // do not eat cmd+alt+b
  if (!isShortcutKey(e)) return
  e.preventDefault()
  toggle(e.shiftKey ? 'right' : 'left')      // shift is READ, not ignored
})
```

**One listener, both panes, shift read explicitly.** `key` first so a Dvorak
user gets the key they see printed; `code` as fallback so a Cyrillic or Greek
layout still works off the physical position. Verified against all five rows
above, in both the React shell and the standalone twin.

Recommendation: **own both handlers, in one place.** Two handlers that each
half-read the modifiers will disagree about what `event.key` is — that is the
same accident in a new shape.

### ⚠️ `⇧⌘B` is Chrome's "show/hide bookmarks bar"

`⌘B` is free in a browser; `⇧⌘B` is not — it is Chrome's bookmarks-bar toggle
(and `⌘⇧B` is bold in several editors). `preventDefault()` does win in the page,
and it did in testing, but the choice means teaching Friends a chord their
browser also claims. **Alternatives worth ten seconds of the human's time:**
`⌘J`, `⌘.`, or `⌘\` for the right pane. Flagged, not decided.

---

## 3 — Persistence: **none.** Delete the cookie, do not replace it.

Ticket 01 says view state is "not persisted at all, not even to `localStorage`",
and it says it about hide/show — the same class of state. The `sidebar_state`
cookie is dead code here (no server component reads it in a Vite SPA) and it is
**deleted**, not reimplemented. Every load starts left-open, right-open, nothing
hidden. The prototype's state readout says `persisted: nothing` on purpose.

This is a decision the human can cheaply reverse later — it is one `useState`
initialiser — but reversing it should be a deliberate act, not an inherited
cookie write nobody meant.

---

## 4 — The sheet breakpoint. **One sheet, and it is a state slot, not a rule.**

Ticket 17 is blocked on this, so: decisively.

- Below **768px** (the same constant as `@/hooks/use-mobile`) neither pane is a
  column. Both leave the flow entirely. The layout is **one column**: bar +
  calendar, edge to edge.
- The shell state has **one sheet slot**, `sheet: 'left' | 'right' | null`.
  Opening the second closes the first. Two sheets is not merely discouraged, it
  is **unrepresentable**. Verified: `toggle('right')` while `left` was open
  leaves exactly one `.sheet` node in the DOM, `data-side="right"`.
- **Crossing the breakpoint upward force-closes the sheet.** Otherwise a dialog
  sits over a layout that has already grown its columns back.
- Because there is no keyboard below the breakpoint, **both pane triggers must
  be permanently visible in the bar**. In all three variants they are.
- The **eye icon on the Friend roster loses its hover** below the breakpoint and
  becomes permanently visible (`body.sheetmode .friend .eye { opacity: 1 }`).
  That is a shell-level fix for one of ticket 17's three hover problems; the
  grid's *who is free here* hover is still ticket 17's.

**What this ticket does NOT decide, and hands to 17:** whether a side sheet is
the right *idiom* at all. A bottom sheet for Candidates, or a tab bar, may be
better on a phone — the shell just guarantees that whatever 17 picks, only one
of them is on screen at a time and both are reachable without a keyboard.

---

## 5 — Where the top bar lives: **needs the human. Prototyped, not decided.**

This is the one question I deliberately did not close, because it is taste
against a reference screenshot and the three options are genuinely different.

- **A — Inset bar.** The bar belongs to the calendar. Both panes are full
  height, so the roster and the Candidate list run edge to edge and the mini
  calendar sits at the very top of the window. Cleanest read of "the bar
  controls the grid". Cost: the top-right cluster is flush with the *calendar's*
  right edge, not the window's, so it visually floats when the right pane is
  open — and it moves when the right pane toggles.
- **B — Banner.** One bar across the window; panes hang below it. The cluster is
  pinned to the window's corner and never moves. It is also the only variant
  with an obvious home for the product mark. Cost: the panes lose their top
  edge and read as drawers under a chrome bar — more "app", less "calendar".
- **C — Reference.** Matches the screenshot: left pane full height with its own
  header, bar spanning centre + right. The cluster is at the window corner and
  stable. The right pane's cards start below the bar, which reads as "these
  belong to the current view" — arguably wrong, since Candidates are computed
  from today forward and **do not change when you navigate the calendar**
  (ticket 09). **This is the default in the prototype** (`?variant=C`).

**My recommendation is B**, and it is a weak one: the cluster never moves, the
right pane visually detaches from the date range it does not depend on, and it
degrades to the narrow layout with the fewest moving parts. But C is what the
reference screenshot shows, and if the screenshot is a decision rather than a
sketch, C wins on that alone. Flip between them and say.

---

## 6 — The top-right cluster

Arrangement, left to right: `‹` · **Today** · `›` │ **Week / Month** │ blobatar.
Fixed — it is in the reference. What the prototype decides is the narrow
behaviour, and it does it **in CSS only** (no width measuring, no JS
breakpoints), so the same markup also works inside a sheet:

| width | behaviour |
|---|---|
| ≥ 1024px | full cluster, "Today", "Week"/"Month" written out |
| 768–1024 | "Today" keeps its word; Week/Month become **W** / **M** |
| < 768px | "Today" and the view select **leave the bar**. Today becomes tapping the date label (dotted underline); the view select moves into the blobatar menu as two checked items. `‹ ›`, the two pane triggers and the blobatar stay. |

Measured: at 375px the full cluster does not fit, and the first thing it eats is
the date range label — which is the one thing on the bar you cannot do without.
Hence the two evictions above.

The blobatar menu is Profile · Customise blobatar, per ticket 18. **Sign out is
in it in the reference and is not in this prototype** — see below.

The blobatar is `<Blobatar>` with `{ hue, tone }` passed explicitly and **no
`expression`**, per ticket 11's exclusion of the four tinting poses, and no
`animate`, per ticket 03 §5d (static `<img>`, not inline SVG).

---

## 7 — Colour, both themes

Ticket 11's rule is implemented as two CSS custom properties per theme on the
shell root, so a Friend's UI colour is literally
`oklch(var(--friend-l) var(--friend-c) <hue>)` and nothing branches in JS:

```
light   --friend-l: 0.62   --friend-c: 0.15
dark    --friend-l: 0.78   --friend-c: 0.145
```

Checked at seven hues (24, 44, 88, 148, 205, 262, 328) in both themes on the
roster rail, the roster swatch and the card stacks. **Those four numbers are a
starting point I chose, not a decision** — ticket 11 said "two constants per
theme" and did not name them. Someone should look at them against the real grid.

The theme toggle in the prototype's blobatar menu is a **prototype affordance**,
not a spec'd control. v1 has no theme switcher decision.

---

## What is stubbed, and whose it is

- **The grid** is an empty 7×24 lattice. Tickets 05 / 15 / 14 own it.
- **The right pane's cards** are placeholder rectangles carrying only the
  structure the shell owes ticket 16: pinned Hangouts in a bordered region above
  a flat Candidate list, the whole thing scrolling as one, an `everyone` tag and
  a hover 3-dots. **Ticket 16 owns the anatomy**; do not read these as a design.
- **The mini calendar** is the real base-lyra `Calendar` at
  `[--cell-size:--spacing(8)]`, which is the "shrink it for a 16rem sidebar is a
  one-variable override" claim from ticket 03 being cashed. It fits. It is also
  the tallest thing in the left pane by a wide margin — worth a look.

## Contradictions with earlier tickets

1. **⚠️ Ticket 12's own premise is wrong about ticket 01.** Ticket 12 opens with
   "Ticket 01 wants a left sidebar (open by default, `cmd+b`) and a right
   sidebar (`cmd+shift+b`)". **The string `cmd+` does not appear anywhere in
   ticket 01.** Ticket 01 has no layout section at all: it mentions "the left
   sidebar" and "the right sidebar" in passing while settling other things, and
   never states a default, a shortcut, or a bar. So the shortcuts, the
   left-open default, and the right pane's default are **unsourced** — they
   have never actually been decided by anyone. That matters because it means
   `⇧⌘B` is not a constraint to honour, it is a proposal to accept or replace
   (see the Chrome collision above).
2. **Ticket 03 under-rated the sheet collision and over-rated the flex nesting.**
   Nested flex wrappers are a one-class fix; two independent `openMobile`
   booleans are not fixable from outside the component. The ranking should be
   inverted in anyone's head who read ticket 03 and not this.
3. **Ticket 03's "`cmd+shift+b` does not currently trigger `cmd+b`" is true only
   of hardware keypresses.** Under dispatched events it does. See §2.
4. **Ticket 01's "Confirmed Hangouts pin ... until the day of the Hangout"** was
   already corrected by ticket 09 to *when they end*; the stub honours 09.
