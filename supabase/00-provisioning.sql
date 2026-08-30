-- friens-cal — provisioning smoke test (ticket 04)
--
-- HISTORICAL. Already run; kept as the record of how the two locks were first
-- proved. Do not run it again — `supabase/01-friend.sql` drops the throwaway
-- table this file creates.
--
-- Paste this whole file into the Supabase SQL Editor and run it once.
-- It does two things: installs the one extension the real schema needs, and
-- creates a throwaway table that proves BOTH security locks work end to end.
--
-- Drop the table again once the smoke test passes (last line, commented out).

-- ---------------------------------------------------------------------------
-- The extension ticket 07's Hangout exclusion constraint depends on.
-- `exclude using gist (tstzrange(starts_at, ends_at) with &&)` needs btree_gist
-- to mix a range operator with ordinary btree columns.
-- ---------------------------------------------------------------------------
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- A throwaway table, to prove the two locks.
-- ---------------------------------------------------------------------------
create table public.smoke_test (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  note       text not null,
  created_at timestamptz not null default now()
);

-- Project setting: "Automatically expose new tables" is OFF, so a new table
-- has NO browser access until granted. The `revoke` below is therefore
-- belt-and-braces; the `grant` is what actually makes this table reachable.
-- Expect "permission denied" on any future table where the grant is forgotten
-- — that is the lock working, not a bug.
--
-- LOCK 1 — GRANTS. Postgres role permissions. Without a grant, the browser's
-- role cannot touch this table at all, whatever the policies say. ADR-0001
-- treats this as a second, independent lock rather than trusting RLS alone.
revoke all on public.smoke_test from anon, authenticated;
grant select, insert on public.smoke_test to authenticated;

-- Project setting: "Enable automatic RLS" is ON, so an event trigger has
-- already enabled RLS on this table. The statement below is idempotent and
-- kept so the file is self-contained.
--
-- LOCK 2 — ROW LEVEL SECURITY. With a grant in hand, a role still only sees
-- the rows a policy lets it see. Enabling RLS with no policies denies
-- everything, which is the safe default.
alter table public.smoke_test enable row level security;

create policy "read own rows"
  on public.smoke_test for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy "insert own rows"
  on public.smoke_test for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

-- `(select auth.uid())` rather than a bare `auth.uid()` is deliberate: the
-- subquery form is evaluated once per statement instead of once per row.

-- ---------------------------------------------------------------------------
-- After the smoke test passes:
--   drop table public.smoke_test;
-- ---------------------------------------------------------------------------
