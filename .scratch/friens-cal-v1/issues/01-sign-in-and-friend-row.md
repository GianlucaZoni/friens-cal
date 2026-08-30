# 01 — Sign in, and your Friend row exists

Status: ready-for-human
Blocked by: —

## Parent

[friens-cal v1 map](../../shared-availability-calendar/map.md)

## What to build

The spine of the application, end to end: a Friend can sign in with email and
password and see their own identity rendered. Everything else is built on this.

A `friend` table holds identity, created blank by a trigger when an auth user
appears, and readable by every signed-in Friend (the roster needs it) but
writable only by its owner.

From a prototype-validated schema sketch (ticket 07, amended by 11):

```
friend   id            uuid primary key, = auth.users.id
         display_name  text
         blobatar_seed text          -- governs SHAPE only
         hue           integer       -- 0..360, continuous
         tone          numeric       -- one of six band interiors, see 03
         expression    text          -- one of ten, see 03
         created_at    timestamptz
```

Both locks from ADR-0001 apply to this and every table that follows: `revoke all
from anon, authenticated`, then explicit grants, **and** `enable row level
security` with policies. Neither alone.

The sign-in screen carries the copy decided in ticket 18 — notably **there is no
"forgot password?" link**, because ticket 13 removed password reset entirely.
There is no signup here (that is issue 14); users are created from the Supabase
dashboard for now.

## Acceptance criteria

- [ ] `friend` table exists with the columns above, `id` referencing `auth.users`
- [ ] An `on_auth_user_created` trigger inserts a blank `friend` row
- [ ] `revoke all` + explicit grants **and** RLS policies are both in place
- [ ] A Friend may read every Friend row, and update only their own
- [ ] Signing in with a dashboard-created user reaches an authenticated route
- [x] An unauthenticated visitor is sent to sign-in
- [ ] The authenticated route renders the signed-in Friend's display name
- [x] The sign-in screen has **no** password-reset affordance, and says something
      honest in its place (ticket 18 draft A)
- [ ] Signing out returns to sign-in
- [x] `npx tsc -p tsconfig.app.json --noEmit` is clean

## Blocked by

None - can start immediately

## Comments

### Built — 2026-08-30, branch `feat/01-sign-in-and-friend-row`

**Database** — `supabase/01-friend.sql`, written but **not yet applied**: nothing
in this repo can reach the project with DDL rights (no CLI link, no `psql`, no
access token — only the publishable key, which is exactly the point). It is
idempotent and does five things: drops the leftover `smoke_test` table, creates
`public.friend`, applies both ADR-0001 locks, adds the `on_auth_user_created`
trigger, and **backfills** rows for accounts that already exist — the trigger
only fires on new ones, and this issue's users come from the dashboard.

Two choices worth naming:

- **The `update` grant is column-scoped**, so `id` and `created_at` are not
  writable from the browser at all. Lock 1 defends them, and RLS never has to.
- **`tone` is checked against the six band interiors**, not `0..1` — ticket 11's
  amendment. Storing `1.0` would fall off the end of blobatar's `find` and
  render *pastel*, the opposite end of the scale from ink.

**App** — `src/lib/supabase.ts` (client, `flowType` set explicitly per ticket
13), `src/lib/database.types.ts` (hand-maintained; the project is not linked to
the CLI), `src/auth/` (session provider, the `useSession` hook, the `RequireAuth`
route gate), `src/pages/SignInPage.tsx`, `src/pages/CalendarPage.tsx`, and
`src/components/password-field.tsx` (`InputGroup`, since the registry item never
landed — ticket 18).

The template's `HomePage` and `BlankPage` are gone: `/` is now the guarded
calendar route.

### Verified

Against the live project at `localhost:5174`:

- an unauthenticated visit to `/` lands on `/sign-in`
- the sign-in screen carries ticket 18 draft A and no reset link
- a wrong-credentials sign-in makes a real round trip to Supabase and renders
  *"That email and password do not match."*
- `npx tsc -p tsconfig.app.json --noEmit` is clean; `eslint` adds no new errors
  (9 pre-existing, all in vendored `components/ui/`)

### Needs the human — three steps

1. Paste `supabase/01-friend.sql` into the Supabase SQL Editor and run it.
2. Create a Friend from **Authentication → Users** in the dashboard (there is no
   signup until issue 14), and put the address and password in `.env` as
   `FRIEND_TEST_EMAIL` / `FRIEND_TEST_PASSWORD`.
3. Run `node --env-file=.env scripts/verify-friend-row.mjs`. Each of its seven
   checks is one of the acceptance criteria above — a clean run closes the rest
   of this issue, including that a Friend can read the whole roster, update only
   their own row, and never insert one.

The remaining unticked criteria are unticked because they cannot be checked
until step 1 has run — not because anything is known to be missing.

**No account was created from here.** Signup is currently ungated (the
`before-user-created` allowlist hook is issue 14), so a script could have minted
one — that is the human's call to make, not an agent's.
