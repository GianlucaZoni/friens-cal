# 04 — Provision the Supabase project and install the UI dependencies

Type: task
Status: resolved
Blocked by: —

## Question

Nothing to decide. Manual work that later tickets depend on.

1. Create the Supabase project (human — it needs an account and a dashboard).
2. Put `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` into `.env` and add them
   to `.env.example`. Confirm the anon key is understood to be **public** and
   safe to ship, because RLS is the actual protection (ADR-0001).
3. ~~Install the client, the sidebar, and Blobatar.~~ **Done during the
   prototype session.** `sidebar`, `calendar`, `dialog`, `popover`, `sheet`,
   `slider`, `tabs`, `toggle-group`, `tooltip`, `skeleton` and Blobatar
   (`avatar.tsx` + `blobatar.tsx`, from `https://blobatar.dev/r/avatar.json`)
   are all in `src/components/ui/`. No `avatar` dependency clash materialised.
   The Supabase client itself is **not** installed.
4. Verify a trivial authenticated read works end to end from the SPA.
5. **Seed the allowlist** (folded in from the map's fog). It is a table read by
   the `before-user-created` hook, so this is inserting the friends' email
   addresses, lower-cased, and knowing how to add one later. The hook's
   rejection message must be the ticket 18 copy, **not** the research doc's
   draft, which leaks whether an address is on the list.
6. Install the `btree_gist` extension — ticket 07's Hangout exclusion constraint
   needs it.

### Two corrections to item 2

- The browser key is now **`sb_publishable_...`**, not the legacy `anon` key
  (ADR-0001 amendment). Name the variable accordingly rather than
  `VITE_SUPABASE_ANON_KEY`.
- **`revoke all from anon, authenticated` plus explicit grants is a second,
  independent lock** beside RLS (ADR-0001). Enabling RLS alone is not the
  configuration this project decided on.

Also: there is **no email configuration to do** — ticket 13 removed email
entirely. Confirm Email must be **disabled**, which is safe only because the
signup hook enforces the allowlist.

## Answer

<!-- record: project ref, where credentials live, versions installed, anything
     that surprised us -->

## Answer

Provisioned and verified 2026-08-30.

| | |
| --- | --- |
| Project ref | `mvvxyzqbdkkauxkltavw` (EU region) |
| URL | `https://mvvxyzqbdkkauxkltavw.supabase.co` |
| Browser key | `sb_publishable_...`, in `.env` as `VITE_SUPABASE_PUBLISHABLE_KEY` |
| Credentials | `.env` (gitignored); `.env.example` documents the shape |
| Client | `@supabase/supabase-js@2.112.4` |
| Extension | `btree_gist` installed |

### The three project-creation security settings

Chosen so the two locks of ADR-0001 get **opposite defaults**, both failing
closed:

| Setting | | Why |
| --- | --- | --- |
| Enable Data API | **on** | supabase-js speaks to PostgREST; without it there is no browser client |
| Automatically expose new tables | **off** | this is Lock 1 (grants) handed out automatically. Leaving it on means relying on RLS alone — the single point of failure ADR-0001 rejected |
| Enable automatic RLS | **on** | Lock 2 by default. RLS on with no policies denies everything, so a half-finished table is invisible rather than wide open |

**Consequence to expect during the build:** with auto-expose off, any table
missing an explicit `grant` returns permission-denied on queries that look
obviously correct. That is the lock working, not a bug — and it will be the
first confusing thing the build hits.

### What was verified

`scripts/verify-supabase.mjs`, run against a throwaway `smoke_test` table
(`supabase/00-provisioning.sql`). Five checks, all passing:

1. **an anonymous read is refused** — the important one; a smoke test that only
   proved you can read your own rows would pass just as happily with the locks off
2. email+password sign-in works, so Confirm Email is off
3. an authenticated insert passes the `with check` policy
4. an authenticated select returns own rows only
5. the round trip works end to end from a browser-shaped client

### Still to do

- **Drop the throwaway table**: `drop table public.smoke_test;`
- **Seed the allowlist** (item 5) — deliberately deferred to the build, since it
  needs the `allowlist` table and the `before-user-created` hook, which are
  schema rather than provisioning. The hook's rejection message must be the
  ticket 18 copy, not the research doc's draft, which leaks list membership.
- The smoke-test user is `user@example.com`, a throwaway. The **real** Friends'
  addresses are what go on the allowlist.
