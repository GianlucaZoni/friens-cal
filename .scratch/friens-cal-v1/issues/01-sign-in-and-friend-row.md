# 01 — Sign in, and your Friend row exists

Status: ready-for-agent
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
- [ ] An unauthenticated visitor is sent to sign-in
- [ ] The authenticated route renders the signed-in Friend's display name
- [ ] The sign-in screen has **no** password-reset affordance, and says something
      honest in its place (ticket 18 draft A)
- [ ] Signing out returns to sign-in
- [ ] `npx tsc -p tsconfig.app.json --noEmit` is clean

## Blocked by

None - can start immediately
