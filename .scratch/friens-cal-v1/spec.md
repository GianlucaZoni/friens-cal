# friens-cal v1 — build spec

A shared availability calendar for one fixed group of friends.

## Where the decisions live

This issue set is the **build**. Every decision behind it was made on the
wayfinder map at [`../shared-availability-calendar/map.md`](../shared-availability-calendar/map.md),
whose 19 resolved tickets are the reference for anything an issue here leaves
implicit. **When an issue and a decision ticket disagree, the ticket wins** —
raise it rather than guessing.

Also binding:

- [`CONTEXT.md`](../../CONTEXT.md) — the domain glossary. Friend, Availability,
  Hidden, Candidate, Hangout, Participant, Join, Left. Use these terms exactly;
  Candidate and Hangout are **not** interchangeable.
- [`docs/adr/0001`](../../docs/adr/0001-supabase-as-backend-and-auth.md) — Supabase, and the two independent locks.
- [`docs/adr/0002`](../../docs/adr/0002-cross-friend-availability-writes.md) — the one cross-Friend write.

## Where the prototypes live

Seven throwaway prototypes backed these decisions. They are kept as **primary
sources** on the branch **`prototype/wayfinder-v1`**, not on `main` — they are
not application code and would otherwise be compiled by `tsconfig.app.json`.

Issues name them by their path on that branch (`src/prototypes/<name>/`). To
read one:

    git show prototype/wayfinder-v1:src/prototypes/app-shell/shell.tsx
    git checkout prototype/wayfinder-v1 -- src/prototypes   # or check it out

Each has a `preview.html` that opens with no build step.

## Stack

Vite + React 19 SPA · shadcn `base-lyra` over `@base-ui/react` (not Radix) ·
Tailwind v4 · MobX-State-Tree · lucide · react-router 7 · Supabase
(`@supabase/supabase-js@2`, project `mvvxyzqbdkkauxkltavw`).

## Two standing traps

1. **`npx tsc --noEmit` at the repo root checks nothing** — the root tsconfig is
   a solution file with `"files": []`. The real check is
   `npx tsc -p tsconfig.app.json --noEmit`.
2. **"Automatically expose new tables" is OFF** on the Supabase project. Any
   table without an explicit `grant` returns permission-denied on queries that
   look obviously correct. That is the lock working, not a bug.

## Slices

| # | Title | Type |
| --- | --- | --- |
| 01 | Sign in, and your Friend row exists | AFK |
| 02 | The two-sidebar app shell | AFK |
| 03 | Setup flow and blobatar identity | HITL |
| 04 | The Friend roster and hiding | AFK |
| 05 | The week grid renders your Availability | AFK |
| 06 | Drawing, erasing, and the write model | AFK |
| 07 | Everyone's Availability as a heatmap | AFK |
| 08 | The Candidate list | AFK |
| 09 | Confirm a Candidate into a Hangout | AFK |
| 10 | The Hangout lifecycle | AFK |
| 11 | Month view | AFK |
| 12 | The mobile layout | AFK |
| 13 | Touch drawing | AFK |
| 14 | Allowlist and self-signup | HITL |
| 15 | Verify touch on real hardware | HITL |
