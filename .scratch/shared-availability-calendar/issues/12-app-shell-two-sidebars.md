# 12 — The app shell: two independently-toggled sidebars

Type: prototype
Status: resolved
Blocked by: —

## Question

Ticket 01 wants a left sidebar (open by default, `cmd+b`) and a right sidebar
(`cmd+shift+b`). Ticket 03 found that shadcn's sidebar **does not support this
out of the box**: state lives on `SidebarProvider`, so two sidebars under one
provider toggle *together*. The documented multi-sidebar guidance is only about
width.

Resolve, with a working shell:

1. **Nested providers or a fork?** Nesting collides three ways — the shared
   `cmd+b` key listener fires for both, both write the same `sidebar_state`
   cookie, and the wrappers nest as flex containers that must still produce one
   correct three-column layout. Forking our copy of `sidebar.tsx` is honest and
   contained, but we then own it.
2. **The keyboard handling.** `cmd+b` is hardcoded (`event.key === "b" &&
   (metaKey || ctrlKey)`) with no prop to remap or disable. `cmd+shift+b`
   currently only avoids collision **by accident**, because the check ignores
   shift while `event.key` becomes `"B"` — one `toLowerCase()` from breaking.
   Decide whether to own both handlers explicitly rather than rely on that.
3. **Persistence.** The `sidebar_state` cookie is **write-only** — nothing reads
   it back, so it is dead code in a Vite SPA. Should open/closed persist at all
   (and if so, where), or reset to left-open on every load?
4. **The default state**, and what happens at narrow widths where the sidebar
   component switches to a `sheet` — two sheets is not a layout.
5. **Where the top bar lives** relative to the two sidebars: spanning the full
   width, or only over the calendar column? The reference screenshot has it
   over the centre and right columns only.

6. **The top-right cluster**, inherited from the fog item ticket 09 cleared:
   the current-Friend blobatar (opening a dropdown for profile and blobatar
   customisation), the month/week view select, a **Today** button, and prev /
   next arrows. Largely specified by the reference screenshot; what is open is
   its arrangement and behaviour at narrow widths.

Deliberately *not* this ticket: what goes **inside** the right sidebar
(ticket 16), and the mobile layout (still fog). This is the shell and its state
only.

## Answer

Prototype: [`prototypes/12-app-shell.md`](../prototypes/12-app-shell.md) —
code in `src/prototypes/app-shell/`. `preview.html` opens with no build step;
`dev.html` runs the React one under Vite. `npx tsc --noEmit` passes.

### 1. Fork. Not nested providers.

`src/components/ui/sidebar.tsx` is **untouched**; the fork lives in
`src/prototypes/app-shell/shell.tsx`.

Ticket 03 listed three collisions. There is a **fourth, and it is decisive**:
each `SidebarProvider` owns a private `openMobile`, so under nesting *nothing
prevents both sheets being open at once* — two stacked Base UI dialogs, two
backdrops, two focus traps, on a 390px screen. "At most one sheet" is not
enforceable from outside a component; it is only expressible if **one object
owns both panes**. The shared `cmd+b` listener is the same shape of problem
(no prop remaps or disables it). Of ticket 03's three, only the cookie and the
keyboard really bite — **nested flex wrappers are a one-class fix**
(`className="flex-1 min-w-0"` on the inner provider), and ticket 03 over-rated
them.

It is a **surgical** fork, and that is the reusable find: **only 5 of the
sidebar's 23 exports touch the context** (`SidebarProvider`, `Sidebar`,
`SidebarTrigger`, `SidebarRail`, `SidebarMenuButton`). The other 18 are pure
presentation keyed off `data-*`. So we fork five and **re-export the rest
unchanged**; our copy is ~250 lines, not 723, and upstream fixes to everything
else still land.

The fork also puts the panes **back in flow** — a flex column whose width
animates `17rem → 0` — instead of `position: fixed; inset-y-0` plus a spacer.
The fixed positioning exists for the `floating`/`inset` variants we do not use,
and it is what makes a top bar that is not full-height-adjacent need hand
coordination. In flow, all three bar layouts compose for free.

### 2. Own both handlers. One listener. ⚠️ Worse than ticket 03 found.

Measured in a browser, not reasoned:

- **The accident is already broken.** A `KeyboardEvent` dispatched with
  `key: "b", shiftKey: true` — what test harnesses and some assistive-tech
  paths emit — **makes the shipped shadcn handler fire**. So `⇧⌘B` already
  toggles the *left* sidebar in any automated test. Not "one `toLowerCase()`
  away"; already there.
- **The shadcn handler also fires on `⌥⌘B`** (and `⌃⌘B`), because it never
  checks that no *other* modifier is held.

Ours: one `window` listener, `shift` read explicitly, `altKey` rejected,
`event.key.toLowerCase() === 'b' || event.code === 'KeyB'` so Cyrillic/Greek
layouts work off physical position and Dvorak works off the printed key.
Verified: `⌘B` → left only, `⇧⌘B` → right only, in both the React shell and the
standalone twin.

### 3. Persistence: none. The cookie is deleted, not replaced.

Ticket 01 says view state is ephemeral, "not even to `localStorage`". Every load
is left-open, right-open, nothing Hidden. The prototype's state readout says
`persisted: nothing` on purpose.

### 4. The sheet breakpoint — decisive, because ticket 17 is waiting.

Below **768px** neither pane is a column; both leave the flow. One column: bar
plus calendar, edge to edge. The shell holds **one sheet slot**
(`sheet: 'left' | 'right' | null`), so **a second sheet is unrepresentable**,
not merely discouraged — verified in the DOM. Crossing the breakpoint upward
force-closes it. Both pane triggers are permanently visible in the bar at every
width, because there is no keyboard down there. The roster's eye icon drops its
hover requirement below the breakpoint.

Ticket 17 still owns whether a **side** sheet is the right idiom (a bottom sheet
or a tab bar may beat it); the shell only guarantees one-at-a-time and
keyboard-free reachability.

### 5. Where the top bar lives — **prototyped, not decided.** See below.

Three variants: **A** bar over the centre only (both panes full height), **B** a
full-width banner (cluster never moves), **C** the reference — left pane full
height, bar spanning centre + right. `?variant=A|B|C`, C is the default.

### 6. The top-right cluster

`‹ · Today · ›` │ `Week / Month` │ blobatar — arrangement fixed by the
screenshot. Narrow behaviour is decided and is **CSS only**, so it also works
inside a sheet: at 768–1024 Week/Month become **W**/**M**; below 768 "Today" and
the view select leave the bar entirely — Today becomes tapping the date label,
the view select moves into the blobatar menu. Measured: at 375px the full
cluster does not fit and the first casualty is the date range label, which is
the one thing you cannot do without.

---

### Needs the human

1. **Which bar layout — A, B or C?** The only question I deliberately left
   open; it is taste against a reference screenshot. My weak preference is **B**
   (the cluster never moves; the right pane visually detaches from a date range
   it does not depend on, since Candidates ignore calendar navigation per ticket
   09). **C** wins on fidelity if the screenshot is a decision rather than a
   sketch. Flip between them.
2. **⚠️ `⇧⌘B` is Chrome's show/hide-bookmarks-bar shortcut.** `preventDefault()`
   does win, and did in testing, but we would be teaching Friends a chord their
   browser also claims. `⌘J`, `⌘.` or `⌘\` are free. Related: **ticket 01 never
   actually says `cmd+b`** (see 4 below), so this is a proposal to accept, not a
   constraint to honour.
3. **Should the right pane be open by default?** Ticket 01 does not say. The
   prototype opens both. Open-by-default is defensible (Candidates are the point
   of the product); closed-by-default gives the grid the whole window.
4. **⚠️ Ticket 12's premise misattributes to ticket 01.** The string `cmd+` does
   not appear anywhere in ticket 01, and ticket 01 has no layout section at all
   — it mentions the two sidebars only in passing. **The shortcuts, the
   left-open default and the bar have never been decided by anyone.** They need
   deciding here rather than being inherited.
5. **The four colour constants.** Ticket 11 said "two constants per theme" and
   named none. I chose `L 0.62 / C 0.15` light and `L 0.78 / C 0.145` dark and
   checked seven hues in both themes. Someone should look at them against the
   real grid heatmap before they become load-bearing.
6. **Sign out.** The reference has it in the blobatar menu; ticket 18 does not
   mention it and neither does the prototype. Where does it live?
7. **Does the mini calendar earn its height?** It is the real base-lyra
   `Calendar` at `[--cell-size:--spacing(8)]` and it fits a 17rem pane, but it
   is by far the tallest thing in the left pane and pushes the roster down.

## Correction to the prototype's finding 4

The prototype reports that `cmd+b` / `cmd+shift+b` "have never been decided by
anyone" because those strings appear nowhere in ticket 01. **The first half is
correct; the conclusion is not.** Both shortcuts, and the left-open default,
come from the human's original brief, verbatim:

> the layout of the application should use the left sidebar shadcn layout (by
> default open, cmd+b closes/opens the left one, cmd+shift+b closes/opens the
> right one)

What the prototype actually found is a **gap in the map**: ticket 01's grill
covered scope and never covered layout, so the brief's layout requirements were
never recorded in any ticket. They are now in the map's Notes under **Layout
given**.

So `cmd+shift+b` is a **decision to revisit in light of the Chrome
bookmarks-bar collision**, not an unsourced assumption to fill in.

## Decisions

1. **Top bar: variant C** — the reference screenshot's arrangement, spanning the
   centre and right columns. Chosen against the prototype's weak preference for
   B. The cost B was avoiding stands and is accepted: the bar spans the right
   pane, which visually implies the Candidate list responds to date navigation.
   **It does not** — ticket 09 decoupled Candidates from the calendar view
   entirely. The screenshot was a decision, not a sketch.
2. **Keep `⌘B` for the left sidebar and `⇧⌘B` for the right**, as briefed,
   accepting the Chrome bookmarks-bar collision. `preventDefault()` is measured
   to win. The handler must still be owned rather than inherited: read `shiftKey`
   explicitly, reject `altKey` and `ctrlKey`+`metaKey` combinations, and match
   `key` then `code` — the shipped shadcn handler fires on `⌥⌘B`, on `⌃⌘B`, and
   on a synthetic `key:"b", shiftKey:true`, so `⇧⌘B` already toggles the *left*
   pane in any automated test.
3. **Both sidebars open by default.**
4. **Keep the mini calendar** in the left sidebar.
5. **Remove the close-sidebar button from inside the left sidebar.** The
   `ShellTrigger` in the top bar is the only toggle; a second control inside the
   pane it closes is redundant.
6. **The top bar's range label shows month and year only** — never a day range.
   In **week view the column headers gain the date number after the three-letter
   weekday** (`Mon 30`), which is where day-level precision belongs.
7. **The fork stands**, for the reason the prototype found rather than the one
   ticket 03 predicted: each `SidebarProvider` owns a private `openMobile`, so
   nesting makes **two simultaneous sheets representable** — two stacked dialogs
   and two focus traps on a phone. Only 5 of the sidebar's 23 exports touch the
   context, so ~250 lines are owned, not 723. The nested-flex collision ticket 03
   worried about is a one-class fix and was over-rated.
8. **Sheet breakpoint: one sheet slot**, `'left' | 'right' | null`. A second
   sheet is unrepresentable, not merely discouraged. Below 768px both panes leave
   the flow entirely. → this is what unblocked ticket 17.
9. **Avatar animation** (with ticket 18): the roster blobatars in the left
   sidebar animate **while the cursor is over the sidebar**, and on mobile
   **while the drawer is open**. The current Friend's blobatar in the top-right
   cluster animates **always**.
