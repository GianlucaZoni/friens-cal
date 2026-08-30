-- friens-cal — issue 01: the `friend` table
--
-- Paste this whole file into the Supabase SQL Editor and run it once. Re-running
-- it is safe — but note it is `create table if not exists`, so it will NOT
-- migrate a `friend` table that already exists. Changing a shipped column means
-- a new file, not an edit to this one.
--
-- What it does:
--   1. drops the provisioning smoke-test table (ticket 04's last loose end)
--   2. creates `public.friend` — a Friend's identity, per ticket 07
--   3. locks it twice, per ADR-0001: grants AND row level security
--   4. makes a blank Friend row appear whenever an auth user does
--   5. backfills a row for auth users that already exist
--
-- Vocabulary note (CONTEXT.md): the `auth.users` row is *not* the Friend. It is
-- the credential behind one. `public.friend` is the Friend.

-- ---------------------------------------------------------------------------
-- 1. The smoke test has served its purpose (ticket 04, "Still to do").
-- ---------------------------------------------------------------------------
drop table if exists public.smoke_test;

-- ---------------------------------------------------------------------------
-- 2. The Friend row.
--
-- Every identity column is NULLABLE on purpose. The trigger below creates the
-- row blank the moment an account exists, and the two-step setup flow (issue
-- 03) fills it in. Nothing anywhere then has to handle a missing Friend row —
-- only an unfinished one.
--
-- `blobatar_seed` is stored separately from `hue` and `tone` because the seed
-- governs SHAPE ALONE (ticket 11): rerolling your blob must never move your
-- colour, and renaming yourself must never move your face.
-- ---------------------------------------------------------------------------
create table if not exists public.friend (
  id            uuid primary key references auth.users (id) on delete cascade,

  display_name  text,

  blobatar_seed text,

  -- Continuous and free (ticket 11): collisions between Friends are accepted,
  -- and the blobatar's shape is what disambiguates. 0 and 360 are the same
  -- angle; both are allowed rather than inventing a rule the UI does not have.
  hue           integer   check (hue between 0 and 360),

  -- NOT a 0..1 float. blobatar resolves tone by band with
  -- `TONES.find(([edge]) => v < edge)`, so its published numbers are band UPPER
  -- EDGES. Storing 1.0 falls off the end of that find and wraps to *pastel* —
  -- the opposite end of the scale from ink. These six values are the band
  -- INTERIORS, which are the only six a client may write.
  -- (ticket 11 amendment, corrected by the ticket 18 prototype)
  tone          numeric   check (tone in (0.10, 0.28, 0.49, 0.71, 0.86, 0.96)),

  -- Ten, not fourteen. `mad`, `love`, `shy` and `sick` are excluded because
  -- they tint the palette — under them, changing your face would silently
  -- recolour your entire grid (ticket 11).
  expression    text      check (expression in (
                  'idle', 'happy', 'sad', 'surprised', 'wink',
                  'sleepy', 'smug', 'unsure', 'scared', 'thinking'
                )),

  created_at    timestamptz not null default now()
);

comment on table public.friend is
  'A Friend: the person behind an auth.users row. Created blank by '
  'on_auth_user_created, filled in by the setup flow. Email lives on '
  'auth.users and is deliberately not exposed here.';

-- ---------------------------------------------------------------------------
-- 3. LOCK 1 — GRANTS.
--
-- The project has "Automatically expose new tables" OFF, so the table is
-- unreachable until granted. The `revoke` is belt-and-braces; the `grant` is
-- what makes it reachable at all. If a query that looks obviously correct comes
-- back permission-denied, this is the first thing to check — that is the lock
-- working, not a bug.
--
-- No `insert`: Friend rows have exactly one legitimate creator, the trigger
-- below, which runs as the definer. No client bug can mint one.
-- No `delete`: Friend rows die with their auth.users row, via the cascade.
-- The `update` grant is COLUMN-SCOPED, so `id` and `created_at` are not
-- writable from the browser at all — RLS never has to defend them.
-- ---------------------------------------------------------------------------
revoke all on table public.friend from public, anon, authenticated;

grant select on table public.friend to authenticated;
grant update (display_name, blobatar_seed, hue, tone, expression)
  on table public.friend to authenticated;

-- ---------------------------------------------------------------------------
-- 4. LOCK 2 — ROW LEVEL SECURITY.
--
-- With a grant in hand, a role still only reaches the rows a policy admits.
-- "Enable automatic RLS" is ON for this project, so this is idempotent and kept
-- only so the file stands alone.
--
-- `(select auth.uid())` rather than a bare `auth.uid()` is deliberate: the
-- subquery form is evaluated once per statement instead of once per row.
-- ---------------------------------------------------------------------------
alter table public.friend enable row level security;

-- The roster needs every Friend, so reads are group-wide (ticket 07).
drop policy if exists "every Friend is readable by every Friend" on public.friend;
create policy "every Friend is readable by every Friend"
  on public.friend for select
  to authenticated
  using (true);

-- Writes are yours alone. `with check` as well as `using`, so a Friend can
-- neither edit someone else's row nor hand their own row to somebody else.
drop policy if exists "a Friend updates only their own row" on public.friend;
create policy "a Friend updates only their own row"
  on public.friend for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 5. A Friend row appears whenever an account does.
--
-- `security definer` because the trigger writes a table the signing-up role has
-- no insert grant on, and `set search_path = ''` because a definer function
-- with a searchable path is how privilege escalation gets in — hence the fully
-- schema-qualified names below.
--
-- `on conflict do nothing` keeps the backfill in section 6 and this trigger
-- from ever colliding. A failing trigger here BLOCKS SIGNUP, so it does the
-- least possible work.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.friend (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Ticket 07 §9's habit, applied here as well: a `security definer` function
-- living in an exposed schema gets its default `execute` grant to PUBLIC taken
-- away and handed back to nobody. PostgREST cannot expose a `returns trigger`
-- function anyway, so this costs nothing and removes the need to know that.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 6. Backfill.
--
-- Accounts created from the dashboard before this file ran have no Friend row,
-- and the trigger only fires on new ones.
-- ---------------------------------------------------------------------------
insert into public.friend (id)
select u.id from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Verify from a browser-shaped client:
--   node --env-file=.env scripts/verify-friend-row.mjs
-- ---------------------------------------------------------------------------
