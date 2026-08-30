# 01 — Sign in, and your Friend row exists

Status: resolved
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

- [x] `friend` table exists with the columns above, `id` referencing `auth.users`
- [x] An `on_auth_user_created` trigger inserts a blank `friend` row
- [x] `revoke all` + explicit grants **and** RLS policies are both in place
- [x] A Friend may read every Friend row, and update only their own
- [x] Signing in with a dashboard-created user reaches an authenticated route
- [x] An unauthenticated visitor is sent to sign-in
- [x] The authenticated route renders the signed-in Friend's display name
- [x] The sign-in screen has **no** password-reset affordance, and says something
      honest in its place (ticket 18 draft A)
- [x] Signing out returns to sign-in
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

### Closed — the database half ran

The human applied `supabase/01-friend.sql` and created two Friends from
**Authentication → Users**. `scripts/verify-friend-row.mjs` then passed all nine
checks against the live project:

```
✓ anonymous read of `friend` is refused
✓ the provisioning smoke-test table is gone
✓ signed in as friend@example.com
✓ own Friend row exists
✓ the roster returned 2 Friend row(s)
✓ own Friend row is updatable
✓ updating another Friend's row touches nothing
✓ client insert into `friend` is refused (42501)
```

Two of those are the ones worth having: **`42501` on insert** is lock 1 refusing
a grant that was never given, and **"touches nothing"** on a cross-Friend update
is RLS turning a forbidden write into a no-op rather than an error — which is
what `using` + `with check` on the same policy buys.

Then in the browser, with a real account: sign-in reaches `/`, the card renders
**Gianluca** over `friend@example.com`, and sign out returns to `/sign-in`. That
is the last four criteria, and the slice.

### One bug the run found

`FRIEND_DISPLAY_NAME` was read with `??`, and `.env.example` ships the key with
an empty value — so the first run wrote `""` into `display_name`. An empty
string is not a name. Fixed in two places: the script now uses `||`, and
`CalendarPage` treats an empty name as no name, so a blank row renders the
honest "no name yet" line instead of an empty heading.

### After review

`/code-review` against `main`, both axes. Spec found no scope creep and no
misimplementation. Applied from the two reports:

- **`revoke execute on function public.handle_new_user()`** — both axes flagged
  it independently. Ticket 07 §9 settles the `security definer`-in-an-exposed-
  schema question with a revoke/grant pattern, and only half of it was applied.
  `revoke all on table public.friend` now names `public` as well, so lock 1
  covers the pseudo-role too.
- **Sign-in failure is matched on `error.code === 'invalid_credentials'`**, not
  on the English message.
- **"Signing up is invite-only" is gone** from the sign-in footer — there are no
  invites. CONTEXT.md calls it a hand-curated allowlist, and the replacement
  echoes the line ticket 18 actually chose.
- **`FRIEND_DISPLAY_NAME`** exists because the spec axis was right that "the
  authenticated route renders the display name" was otherwise structurally
  undemonstrable in this slice.
- The SQL header no longer over-claims: re-running is safe, but
  `create table if not exists` will not migrate an existing table.

**No account was created from here.** Signup is currently ungated (the
`before-user-created` allowlist hook is issue 14), so a script could have minted
one — that is the human's call to make, not an agent's.
