# ADR-0001: Supabase as backend and auth

**Status:** Accepted — 2026-08-29

## Context

`friens-cal` is a Vite single-page app with no server of any kind. It needs
persistent shared state (Availability, Hangouts), authentication for a fixed
allowlist of Friends, and — because two Friends coordinating at the same time is
the core use case — near-live propagation of each other's changes.

The alternatives considered:

- **Supabase** — Postgres, auth, realtime and row-level security in one
  product; the browser talks to Postgres directly with a public anon key, and
  authorization is expressed as SQL policies rather than as server code.
- **Convex** — reactive database with excellent TypeScript ergonomics, but auth
  is delegated to a second vendor (Clerk/Auth0), so a five-friend tool would
  carry two accounts, two dashboards and two billing relationships.
- **Own functions + Neon/D1** — most control, but we would be hand-writing
  session handling and password reset, which is the part of auth most worth not
  hand-writing.
- **No backend** — kills the "shared" in shared calendar.

## Decision

Use Supabase for the database, authentication and realtime. Keep the app a pure
static SPA: no edge functions unless a specific decision demands one (see
ADR-0002, which does).

Authorization is expressed as RLS policies, not as application code. This is
load-bearing: the anon key ships in the browser and is public, so a table
without a correct policy is a table anyone can read or write.

## Consequences

- The whole app stays statically hostable; there is no server to deploy or keep
  running.
- Every table needs its policies designed at the same time as its columns —
  a missing policy is a security hole, not a missing feature.
- Realtime is available for roughly the cost of subscribing, so
  live-updating the grid is not a stretch goal.
- The team is new to Supabase, so decisions that depend on its specifics
  (allowlist gating, password reset, `security definer` functions) are
  researched before they are designed. See the map's research tickets.
- Migrating away later means replacing auth and re-implementing the policy layer
  as server code — real, but tractable at this size.

## Refinements (2026-08-29, from research ticket 02)

- **Grants are a second, independent lock.** The Consequences above say "a table
  without a correct policy is a table anyone can read or write" — true but
  incomplete. New `public` tables may still be auto-granted to `anon`, and
  adding policies does not remove those grants. Every table wants
  `enable row level security` **plus** `revoke all from anon, authenticated`
  **plus** an explicit grant.
- **Key naming.** The browser key is now a **publishable key**
  (`sb_publishable_...`); the `anon` JWT key is legacy and deprecates at the end
  of 2026. The Postgres *role* keeps the name `anon`.
- **The default mail service cannot serve this project.** See ticket 13 — this
  is the one place the "no second vendor" argument above does not hold.
