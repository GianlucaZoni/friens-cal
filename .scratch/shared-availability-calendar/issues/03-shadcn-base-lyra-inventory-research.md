# 03 — What the base-lyra / Base UI shadcn distribution actually ships

Type: research
Status: resolved
Blocked by: —

## Question

This repo is on shadcn style `base-lyra` with `@base-ui/react`, not Radix. Most
shadcn knowledge in the wild assumes Radix, so establish what is really
available before any UI ticket designs against it.

1. **Sidebar.** Does the `sidebar` component/block exist in this distribution?
   Does it support **two** sidebars (left and right) simultaneously, and what
   are its open/closed state APIs? The `--sidebar-*` theme tokens are already in
   `src/index.css`, which suggests yes — confirm.
2. **Keyboard shortcuts.** The default is `cmd+b`. What is the supported way to
   bind a *second* sidebar to `cmd+shift+b` — configuration, or our own handler?
3. **Calendar.** Is there a `calendar` component here, what does it wrap
   (`react-day-picker`?), and is it suitable for the small month widget at the
   top of the left sidebar? Note it is only needed as a **date picker**, not as
   the main grid — the week/month grid is custom.
4. **Blobatar's dependency.** The registry item at
   `https://blobatar.dev/r/avatar.json` declares a registry dependency on shadcn
   `avatar`. Does that resolve correctly under `base-lyra`, or does it pull a
   Radix-based `avatar` that conflicts? Check before anyone runs the install.
5. **Blobatar's options.** From `blobatar.dev/docs`: the exact valid values for
   `palette` and `expression`, and whether a palette exposes its colours
   programmatically — v1 derives each Friend's block colour from their palette,
   so we need to be able to *read* those colours, not just render an avatar.
6. Confirm `dropdown-menu`, `select`, `popover`, `tooltip` and `dialog` are
   present (all already exist in `src/components/ui/` or are installable).

## Notes

Item 5 is the one that can quietly invalidate a decision: if palettes do not
expose their colours, "block colour derives from palette" needs rethinking, and
that reopens part of ticket 01. Flag it loudly if so.

Capture findings as a Markdown file in the repo and link it from this ticket.

## Context

Findings: [`research/base-lyra-component-inventory.md`](../research/base-lyra-component-inventory.md)

## Answer

Full findings: [`research/base-lyra-component-inventory.md`](../research/base-lyra-component-inventory.md).

1. **Sidebar** exists for `base-lyra` (deps `button`, `input`, `separator`,
   `sheet`, `skeleton`, `tooltip`, `use-mobile`). `side="left"` and
   `side="right"` both render, **but state is per-`SidebarProvider`** — two
   sidebars under one provider toggle *together*. Independent toggling needs
   nested providers (colliding on the shared `cmd+b` listener, the shared
   `sidebar_state` cookie, and nested flex wrappers) or a fork. The docs only
   discuss multiple sidebars in terms of width. The cookie is **write-only** —
   nothing reads it back, so it is dead code in a Vite SPA. → ticket 12.
2. **Keyboard**: no prop, no config. `SIDEBAR_KEYBOARD_SHORTCUT = "b"` with a
   `useEffect` matching `event.key === "b" && (metaKey || ctrlKey)`. Remapping
   or disabling means editing our copy. `cmd+shift+b` is our own handler — and
   it only fails to collide by accident, because the modifier check ignores
   shift while `event.key` becomes `"B"`. One `toLowerCase()` away from a bug.
3. **Calendar** exists, wraps `react-day-picker` (not Base UI) + `date-fns`.
   Fine as the sidebar month picker (`mode="single"`, sizes off one
   `--cell-size`). `@latest` resolves to 10.0.1, which still exports
   `getDefaultClassNames` and `DayButton` — unverified by typecheck; 9.14.0 is
   the fallback. No separate `date-picker` item for this style.
4. **No Radix conflict.** Blobatar's bare `avatar` dependency resolves against
   `components.json`'s style, and `base-lyra`'s avatar imports
   `@base-ui/react/avatar`. Safe order: `npx shadcn@latest add avatar`, confirm
   the import is `@base-ui/react/avatar`, then add the Blobatar registry URL
   **without `--overwrite`**. Different targets (`avatar.tsx` vs
   `blobatar.tsx`), so nothing clobbers. → feeds ticket 04.
5. **Palette colours are readable — but ticket 01's wording is wrong.** See the
   correction on ticket 01 and the new ticket 11.
6. **All five confirmed**, all Base UI. `dropdown-menu` and `select` already
   installed; `popover`, `tooltip`, `dialog` installable, plus `sheet`,
   `skeleton`, `use-mobile`, `scroll-area`, `toggle-group`.

**Two incidental finds**, both from Blobatar's own registry: `password-field`
(covers the signup/reset form v1 now needs) and `presence-avatar` (a blobatar
with a presence dot — close to the "silence is marked" muted dot from 01).

**Constraint for every UI ticket**: raw `base-lyra` registry payloads contain
`import { IconPlaceholder } from "@/app/(create)/components/icon-placeholder"`,
which the CLI substitutes for real lucide icons at install time. Components
**cannot be hand-copied** from the registry JSON — the CLI has to do it.
