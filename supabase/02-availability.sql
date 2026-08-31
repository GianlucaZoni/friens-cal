-- friens-cal — issue 05: the `availability` table
--
-- Paste this whole file into the Supabase SQL Editor and run it once. Re-running
-- it is safe — but note it is `create table if not exists`, so it will NOT
-- migrate an `availability` table that already exists. Changing a shipped column
-- means a new file, not an edit to this one.
--
-- What it does:
--   1. creates `public.availability` — one row per half hour a Friend is free
--   2. indexes the today-forward scan, which the key does not cover
--   3. locks it twice, per ADR-0001: grants AND row level security
--
-- Vocabulary note (CONTEXT.md): Availability is a statement by one Friend that
-- they are free. It has no title, no participants and no invite state — those
-- belong to a Hangout. It is **binary**: a slot is drawn or it is not.

-- ---------------------------------------------------------------------------
-- 1. Availability is SLOT ROWS, not ranges.
--
-- One row per (Friend, half hour). A continuous Availability is a run of
-- adjacent slots, reassembled at render time and nowhere else (ticket 07 §1).
-- This is the decision the whole product rests on, and it buys four things:
--
--   * merging stops existing — drawing the same slot twice is a no-op, so
--     there is no invariant for two of a Friend's devices to race over;
--   * overlap counting becomes `count(*) ... group by slot_start`;
--   * the key below makes concurrent writes safe for free; and
--   * ADR-0002's cross-Friend extend RPC becomes STRUCTURALLY incapable of
--     shortening anyone, because it can only ever run `insert`.
--
-- The cost, accepted openly: ~16 rows and 16 realtime events for an 8-hour
-- drag.
--
-- `timestamptz` is a true instant, stored UTC. The wall clock a Friend sees is
-- applied at render time in one fixed group time zone (Europe/Rome, a constant
-- in app code — see `GROUP_TIME_ZONE`). Nothing here knows about that zone, and
-- that is what keeps the door open for per-viewer zones later.
--
-- The primary key IS ticket 07's `unique (friend_id, slot_start)`: the same
-- unique index, plus `not null` on both columns for free. It is spelled as the
-- key because it genuinely is the row's identity — there is nothing else in the
-- row, the client keys its optimistic writes by it (ticket 19), and a surrogate
-- id would be a second way to name a row that already has a name.
-- ---------------------------------------------------------------------------
create table if not exists public.availability (
  friend_id  uuid        not null references public.friend (id) on delete cascade,
  slot_start timestamptz not null,

  primary key (friend_id, slot_start)
);

comment on table public.availability is
  'One row per half hour a Friend is free. Slot rows, not ranges (ticket 07): '
  'merging does not exist here, it happens at render time. Binary — a row is '
  'presence, and its absence is silence, not a claim of being busy.';

-- ---------------------------------------------------------------------------
-- 2. The index the key does not give us.
--
-- The Candidate scan is "every Friend, today forward" — it filters on
-- `slot_start` with no `friend_id`, and a composite key indexes its LEADING
-- column only (ticket 07 §11). Without this, that query is a sequential scan.
-- Small data today; the query shape should still be deliberate.
-- ---------------------------------------------------------------------------
create index if not exists availability_slot_start_idx
  on public.availability (slot_start);

-- ---------------------------------------------------------------------------
-- 3. LOCK 1 — GRANTS.
--
-- The project has "Automatically expose new tables" OFF, so the table is
-- unreachable until granted. If a query that looks obviously correct comes back
-- permission-denied, this is the first thing to check — that is the lock
-- working, not a bug.
--
-- `select`, `insert`, `delete`, and deliberately **no `update`**. There is
-- nothing on this row to update: it is two columns, both of them the key, and
-- changing either one is not an edit but a different row. Editing Availability
-- is drawing (insert) and erasing (delete), which is also what makes the erase
-- path idempotent and safe to retry (ticket 19).
--
-- Withholding the grant is the stronger half of that. An update POLICY would
-- have to defend `friend_id` with a `with check`, or a Friend could reassign a
-- slot to somebody else; with no grant at all, RLS never has to be right about
-- it. Same instinct as `friend`'s column-scoped update grant (01-friend.sql).
-- ---------------------------------------------------------------------------
revoke all on table public.availability from public, anon, authenticated;

grant select, insert, delete on table public.availability to authenticated;

-- ---------------------------------------------------------------------------
-- 4. LOCK 2 — ROW LEVEL SECURITY.
--
-- With a grant in hand, a role still only reaches the rows a policy admits.
--
-- `(select auth.uid())` rather than a bare `auth.uid()` is deliberate: the
-- subquery form is evaluated once per statement instead of once per row, which
-- on a table that takes sixteen-row inserts is the difference worth having.
-- ---------------------------------------------------------------------------
alter table public.availability enable row level security;

-- Reads are group-wide. The whole product is the composite of everyone's
-- Availability — the heatmap, the Candidate scan and the silence dot are all
-- counts over other people's rows (ticket 07 §8).
drop policy if exists "every Friend reads all Availability" on public.availability;
create policy "every Friend reads all Availability"
  on public.availability for select
  to authenticated
  using (true);

-- Writes are yours alone. `with check` is what makes that true on the way IN:
-- without it a Friend could insert a row carrying somebody else's `friend_id`
-- and paint their calendar.
drop policy if exists "a Friend draws only their own Availability" on public.availability;
create policy "a Friend draws only their own Availability"
  on public.availability for insert
  to authenticated
  with check (friend_id = (select auth.uid()));

-- And erases only their own. RLS turns a forbidden delete into a no-op rather
-- than an error, which is the shape `verify-availability.mjs` asserts.
drop policy if exists "a Friend erases only their own Availability" on public.availability;
create policy "a Friend erases only their own Availability"
  on public.availability for delete
  to authenticated
  using (friend_id = (select auth.uid()));

-- No update policy, on purpose — see section 3. If one is ever added, its
-- `with check` is load-bearing and not optional: `using` alone would let a
-- Friend hand one of their own slots to somebody else.

-- ---------------------------------------------------------------------------
-- Deliberately NOT here.
--
-- Ticket 07 puts two more pieces of behaviour in the database, and both of them
-- are about Hangouts, which do not exist yet:
--
--   * the statement-level `after delete on availability` DROP TRIGGER, which
--     removes a Participant who no longer covers their Hangout; and
--   * ADR-0002's `security definer` extend RPC.
--
-- They arrive with `hangout` (issues 09 and 10). Writing them now would mean a
-- trigger referencing a table that is not there.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Verify from a browser-shaped client:
--   node --env-file=.env scripts/verify-availability.mjs
-- ---------------------------------------------------------------------------
