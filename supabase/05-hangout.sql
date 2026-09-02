-- friens-cal — issue 09: the `hangout` and `hangout_participant` tables
--
-- Paste this whole file into the Supabase SQL Editor and run it once. Re-running
-- it is safe — but note the `create table if not exists`, so it will NOT migrate
-- a `hangout` table that already exists. Changing a shipped column means a new
-- file, not an edit to this one (the rule `02-availability.sql` set).
--
-- **This file is the only thing in this slice a human has to do.** Nothing in
-- the repo can reach the project with DDL rights and that is by design — `.env`
-- holds the publishable key only (ADR-0001), which is enough to read and write
-- rows under RLS and nowhere near enough to create a table.
--
-- What it does:
--   1. creates `public.hangout` — a committed range, with the exclusion
--      constraint that makes overlapping Hangouts impossible
--   2. creates `public.hangout_participant` — the stored, seeded list
--   3. locks both twice, per ADR-0001: grants AND row level security
--   4. publishes both to Realtime
--
-- Vocabulary note (CONTEXT.md): a Hangout is a **committed** record that a set
-- of Friends is meeting at a given time, created by confirming a Candidate. It
-- survives changes to the Availability that produced it. *A Candidate and a
-- Hangout look alike on screen and are entirely different things.*
--
-- Verify from a browser-shaped client, after running this:
--   node --env-file=.env scripts/verify-hangout.mjs

-- ---------------------------------------------------------------------------
-- 1. A Hangout is a RANGE, where Availability is slot rows.
--
-- The one place the two objects disagree about shape, and it is deliberate
-- (ticket 07 §6). Availability is slot rows because a run has no identity —
-- it grows, splits and vanishes as its Slots do. A Hangout is the opposite: it
-- is one continuous block by construction, it never merges, its middle is never
-- erased, and **it has to outlive the Availability underneath it**. A run
-- disappears when its Slots do; a Hangout does not.
--
-- That also makes "does this Friend cover the Hangout?" exact slot-set
-- containment rather than a range intersection — which is what the drop rule
-- (issue 10) is, and the reason the next constraint exists.
--
-- `title` is nullable and nothing writes it yet: confirming a Candidate is the
-- only way a Hangout is created in this slice, and it names nothing. The column
-- is here rather than later because the shape was settled in ticket 07 and a
-- second migration for one nullable text column is worse than an unused one.
-- ---------------------------------------------------------------------------
create table if not exists public.hangout (
  id         uuid        primary key default gen_random_uuid(),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  title      text,
  created_at timestamptz not null default now(),

  -- Half-open, non-empty. A Hangout that ends where it starts is not a plan.
  constraint hangout_ends_after_it_starts check (ends_at > starts_at),

  -- --------------------------------------------------------------------
  -- The 30-minute grid, as a constraint rather than as a convention.
  --
  -- Ticket 07 §6 attaches this to the manual time editor — force-write lets a
  -- human type arbitrary times, and off-grid bounds make coverage a *fuzzy*
  -- comparison that every downstream rule then has to qualify. The editor is
  -- issue 10's and it snaps through `slotContaining`; this is the same rule
  -- said once, structurally, so it holds for whatever writes the row.
  --
  -- Expressed against the UTC lattice, not against the group's wall clock:
  -- nothing in this schema knows about Europe/Rome, and that is what keeps the
  -- door open for per-viewer zones (`02-availability.sql` §1 makes the same
  -- point about `slot_start`). The two agree because Rome's offsets are whole
  -- hours — a Rome-aligned half hour is a UTC-aligned half hour. **A group zone
  -- with a :45 offset would break that**, and would need this rewritten rather
  -- than relaxed.
  --
  -- The spelling is deliberate and fragile. `date_part(text, interval)` is
  -- IMMUTABLE; `date_part(text, timestamptz)` is only STABLE, because for a
  -- timestamptz most fields depend on the session's TimeZone. Hence the
  -- subtraction: an interval from a fixed instant, whose total seconds are a
  -- pure function of the value.
  --
  -- Postgres does **not** refuse a STABLE function here — it enforces
  -- immutability in index expressions, not in check constraints — which is
  -- what makes the naive version dangerous rather than merely wrong. A check
  -- written as `extract(minute from starts_at) in (0, 30)` would be accepted,
  -- would pass for whoever created it, and would then admit or reject the same
  -- row depending on the connection's `TimeZone`. Do not "simplify" it.
  -- --------------------------------------------------------------------
  constraint hangout_on_the_slot_grid check (
    date_part('epoch', starts_at - '1970-01-01 00:00:00+00'::timestamptz)::bigint % 1800 = 0
    and date_part('epoch', ends_at - '1970-01-01 00:00:00+00'::timestamptz)::bigint % 1800 = 0
  ),

  -- --------------------------------------------------------------------
  -- THE EXCLUSION CONSTRAINT, which earns its keep twice.
  --
  -- **Once as the product decision.** Ticket 08 §7 forbade overlapping
  -- Hangouts outright — not "warned when they share Participants", but no two
  -- Hangouts may occupy overlapping time at all. The consequence is real and
  -- was accepted with it in view: with a single Group the calendar holds **one
  -- plan at a time**, and two disjoint subsets of Friends cannot book different
  -- things at 20:00. Coherent with "when are *we* free", and a limit.
  --
  -- **Once as the concurrency answer.** Two Friends confirming the same
  -- Candidate at the same moment is the ordinary case, not the exotic one, and
  -- this makes it resolve itself with no lock, no advisory key and no
  -- read-then-write window: the second insert is rejected by the index. The
  -- loser is then converted **client-side into a Join of the Hangout that won**
  -- (ticket 08 §8), because that was the intent. A rejection surfaced as an
  -- error would be the tool refusing to do the thing that already happened.
  --
  -- `tstzrange(starts_at, ends_at)` defaults to `[)` — half-open — so a Hangout
  -- 20:00–22:00 and one 22:00–24:00 do **not** overlap. That is the same
  -- half-open reading every Slot in the product has, and `verify-hangout.mjs`
  -- asserts it rather than trusting it: an inclusive upper bound would forbid
  -- back-to-back plans, which nobody decided.
  --
  -- Ticket 07 names `btree_gist` as the dependency and `00-provisioning.sql`
  -- installs it. Strictly, *this* constraint needs only the built-in GiST
  -- `range_ops` opclass; `btree_gist` becomes load-bearing the day a scalar
  -- column joins the key (`group_id with =`, if the single implicit Group ever
  -- becomes several). Installed either way, and not worth removing.
  -- --------------------------------------------------------------------
  constraint hangout_no_two_at_once
    exclude using gist (tstzrange(starts_at, ends_at) with &&)
);

comment on table public.hangout is
  'A committed record that a set of Friends is meeting at a given time, created '
  'by confirming a Candidate. Unlike Availability it IS a range, with a start '
  'and an end of its own — that is what lets it outlive the Availability '
  'underneath it. No two may overlap (ticket 08 §7), enforced by the exclusion '
  'constraint rather than by any client.';

-- ---------------------------------------------------------------------------
-- 2. `hangout_participant` — three states out of two facts.
--
--   row + `left_at` null  = Participant
--   row + `left_at` set   = Left, sticky forever
--   no row                = never joined, or auto-dropped -> eligible for "Join?"
--
-- No enum and no second table (ticket 07 §2). The list is **stored and seeded
-- at confirmation**, and it moves in one direction on its own: removing
-- Availability that covered the Hangout drops you, but adding Availability
-- never adds you. Getting in is always a deliberate act.
--
-- `on delete cascade` on both sides. The `hangout` side is what makes
-- cancellation a single `delete` (issue 10) — and see §4 for the reason that
-- works with **no delete grant** on this table.
-- ---------------------------------------------------------------------------
create table if not exists public.hangout_participant (
  hangout_id uuid        not null references public.hangout (id) on delete cascade,
  friend_id  uuid        not null references public.friend (id)  on delete cascade,
  left_at    timestamptz,

  primary key (hangout_id, friend_id)
);

comment on table public.hangout_participant is
  'A Friend on a Hangout. Row + null left_at = Participant; row + left_at = '
  'Left, which outranks Availability permanently; no row = never joined or '
  'auto-dropped. Seeded at confirmation.';

-- ---------------------------------------------------------------------------
-- The index the key does not give us — ticket 07 §11's leading-column trap,
-- for the second time in this schema.
--
-- The primary key indexes `(hangout_id, friend_id)`, so it answers "who is on
-- this Hangout" and says nothing about "which Hangouts is this Friend on".
-- That second question is the one the drop trigger asks (issue 10), once per
-- Friend whose Availability just shrank.
-- ---------------------------------------------------------------------------
create index if not exists hangout_participant_friend_id_idx
  on public.hangout_participant (friend_id);

-- ---------------------------------------------------------------------------
-- And the index on `hangout` that the exclusion constraint does not give us.
--
-- The constraint builds a **GiST index on an expression** —
-- `tstzrange(starts_at, ends_at)` — which answers "does anything overlap this
-- range" and nothing else. It cannot serve a plain comparison on either
-- column, because neither column is in it.
--
-- Both reads in the client are plain comparisons on `ends_at`: the boot read
-- is `ends_at >= floor` (a Hangout that started before the window and has not
-- finished is the one case where filtering on `starts_at` would lose a row),
-- and the losing confirm's lookup for the winner is `ends_at > candidate.start`
-- crossed with `starts_at < candidate.end`. One index on `ends_at` is the
-- selective half of both.
--
-- Not `starts_at` as well, and that is the deliberate half: the boot read
-- *orders* by it, but only after the filter above has cut the table down to the
-- plans that have not finished — and the exclusion constraint bounds that hard,
-- since the calendar holds one plan at a time. Sorting a handful of rows is
-- cheaper than a second index to maintain on every confirm. Small data today
-- (ticket 07 §11); the query shape should still be deliberate.
-- ---------------------------------------------------------------------------
create index if not exists hangout_ends_at_idx
  on public.hangout (ends_at);

-- ---------------------------------------------------------------------------
-- 3. `hangout` — LOCK 1 (grants) and LOCK 2 (RLS).
--
-- Flat trust, and it is ticket 01's decision rather than a shortcut: **anyone
-- may confirm, edit or cancel any Hangout.** There is no owner column because
-- there is no owner. Five friends deciding when to get pizza do not need an
-- authorization model, and a `created_by` would invite one.
--
-- All four grants, including the two nothing in this slice uses. `update` is
-- issue 10's retime and `delete` is its cancel; ticket 07 §8 settled the policy
-- set as a whole, and this file is where that set is written. Withholding them
-- now would mean a second migration to add a permission that was already
-- decided — and, worse, would read to the next person as a decision.
-- ---------------------------------------------------------------------------
revoke all on table public.hangout from public, anon, authenticated;

grant select, insert, update, delete on table public.hangout to authenticated;

alter table public.hangout enable row level security;

-- Every Friend sees every Hangout, Participant or not. That is the whole of
-- "a confirmed Hangout shows on everyone's calendar" — and it is also why
-- **hiding never hides a Hangout**: hiding is a client-side query tool over the
-- roster, and nothing here knows the word.
drop policy if exists "every Friend reads every Hangout" on public.hangout;
create policy "every Friend reads every Hangout"
  on public.hangout for select
  to authenticated
  using (true);

-- `with check (true)`, not `(select auth.uid()) is not null`: `to authenticated`
-- already carries that, and a redundant predicate reads as a rule.
drop policy if exists "any Friend confirms a Hangout" on public.hangout;
create policy "any Friend confirms a Hangout"
  on public.hangout for insert
  to authenticated
  with check (true);

-- Issue 10's retime. `with check` as well as `using`, because a policy with
-- only `using` admits the row on the way out and says nothing about the row on
-- the way in — the trap ADR-0002's refinements flag for `availability`.
drop policy if exists "any Friend retimes a Hangout" on public.hangout;
create policy "any Friend retimes a Hangout"
  on public.hangout for update
  to authenticated
  using (true)
  with check (true);

-- Issue 10's cancel, which is a **hard delete** (ticket 08 §3): the row and its
-- participants go, the title is unrecoverable, and the other Friends learn of
-- it by noticing an absence. A tombstone with undo was recommended and the
-- human chose this with the trade-off in front of them.
drop policy if exists "any Friend cancels a Hangout" on public.hangout;
create policy "any Friend cancels a Hangout"
  on public.hangout for delete
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 4. `hangout_participant` — LOCK 1 (grants).
--
-- `select`, `insert`, and a COLUMN-SCOPED `update (left_at)`. Deliberately
-- **no `delete`**.
--
-- **The column-scoped update** is `01-friend.sql`'s instinct applied again:
-- `left_at` is the only thing on this row that is not the key, so scoping the
-- grant to it means `hangout_id` and `friend_id` cannot be touched at all and
-- RLS never has to be right about defending them. Without it, a `using`-only
-- update policy would let a Friend move their own row onto somebody else's
-- Hangout.
--
-- **No delete grant** is ticket 07 §8's "deletes happen only via the drop
-- trigger". Leaving is `left_at`, not a delete — Left has to outrank
-- Availability *forever*, and a deleted row is indistinguishable from never
-- having joined, which would make the next overlapping Availability re-offer
-- "Join?" to somebody who walked out.
--
-- Two things still remove rows, and neither needs the grant:
--
--   * `on delete cascade` from `hangout`, which is how cancellation takes the
--     participants with it. Referential actions run inside the system rather
--     than as the calling role, and RLS is not applied to them either.
--   * the drop trigger (issue 10), which runs `security definer` for exactly
--     this reason.
-- ---------------------------------------------------------------------------
revoke all on table public.hangout_participant from public, anon, authenticated;

grant select, insert on table public.hangout_participant to authenticated;
grant update (left_at) on table public.hangout_participant to authenticated;

alter table public.hangout_participant enable row level security;

-- Read by all. A Hangout renders with its Participants' faces on every Friend's
-- grid, so this is group-wide for the same reason `availability`'s is.
drop policy if exists "every Friend reads every Participant" on public.hangout_participant;
create policy "every Friend reads every Participant"
  on public.hangout_participant for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- WHO MAY INSERT A PARTICIPANT ROW — the question ticket 07 §8 did not answer.
--
-- §8 gives this table "read by all; you may set your own `left_at`; deletes
-- happen only via the drop trigger" and never says who may **insert**. It has
-- to be answered here, because **confirming seeds rows for other Friends**:
-- that is what "Participants are stored and seeded at confirmation from the
-- Candidate's Friend set" means.
--
-- Flat trust: `with check (true)`. The reasoning, recorded because the opposite
-- choice was live and is the one this project already made once.
--
-- The narrow alternative was a policy admitting a row for Friend X only if X
-- already holds Availability covering the whole Hangout — ADR-0002's shape,
-- applied here. It is satisfiable by confirm (a Candidate's Friends are free
-- throughout it by construction) and it was rejected on four counts:
--
--   1. **It guards the wrong thing.** ADR-0002's hole is narrow because
--      Availability is a Friend's own statement *about themselves*, and one
--      Friend editing another's calendar is the single exception in the
--      product. A Participant list is a group fact about a group plan, and
--      ticket 01 already hands every Hangout action — confirm, retime, cancel —
--      to everybody. Locking the insert while `delete` on `hangout` is
--      `using (true)` would be a fence beside an open gate: anyone can already
--      hard-delete the whole plan.
--   2. **It converts a benign race into a permission error.** A Friend whose
--      Availability was erased between the sidebar's scan and the click would
--      make the confirm fail with `42501` instead of creating the Hangout. The
--      product's answer to "you are not free after all" is the drop rule, not
--      a refusal — and the drop rule is a *trigger*, so it repairs this on the
--      next edit.
--   3. **It needs a helper function in an exposed schema.** Slot-set
--      containment is not a policy expression; it is a `generate_series` over
--      the range. Ticket 07 §9 closed the `security definer`-in-an-exposed-
--      schema question by judgement, for **one** audited RPC that takes one
--      argument. Spending that judgement a second time on a policy helper —
--      which is precisely the shape Supabase's caution is about — is the wrong
--      way round.
--   4. **A wrong row is already recoverable.** Being added to a plan you did
--      not ask for is not a data loss; it is a Hangout you can Leave. And
--      nothing here writes Availability, so nothing here can make you look free
--      when you are not: that is the boundary ADR-0002 actually draws.
--
-- If flat trust is ever regretted, the narrow version is a policy change and
-- nothing else — no column, no client change. The reverse is not true, which is
-- the same asymmetry ADR-0002 weighed in the other direction, for the other
-- table, on purpose.
-- ---------------------------------------------------------------------------
drop policy if exists "any Friend seeds a Participant" on public.hangout_participant;
create policy "any Friend seeds a Participant"
  on public.hangout_participant for insert
  to authenticated
  with check (true);

-- Your own `left_at`, and only your own — ticket 07 §8, verbatim. `using`
-- admits the row you are updating; `with check` admits the row you are
-- producing. Both, so the column grant is not the only thing standing between
-- a Friend and somebody else's row.
--
-- This is also issue 10's re-Join: clearing `left_at` back to null is an update
-- of your own row (ticket 08 §9 — from the Hangout's 3-dots, never offered
-- automatically, because the tool does not suggest rejoining something you
-- walked out of).
drop policy if exists "a Friend leaves only their own Hangout" on public.hangout_participant;
create policy "a Friend leaves only their own Hangout"
  on public.hangout_participant for update
  to authenticated
  using (friend_id = (select auth.uid()))
  with check (friend_id = (select auth.uid()));

-- No delete policy, on purpose — see §4. With no grant either, RLS never has to
-- be right about it.

-- ---------------------------------------------------------------------------
-- 5. Realtime.
--
-- `03-realtime.sql` explains what a publication is and why a table outside one
-- is silent while `.subscribe()` still reports SUBSCRIBED. The same guards
-- here, for the same reason: `alter publication ... add table` errors if the
-- table is already a member.
--
-- **`replica identity full` is not set, and for both tables the reasoning is
-- `03-realtime.sql`'s**: the default replica identity is the primary key, and a
-- DELETE payload carrying the primary key is exactly what the client's store is
-- keyed on — `hangout.id`, and `(hangout_id, friend_id)` on the participants.
-- There is nothing `full` would add except write amplification.
--
-- **The documented hole applies and leaks nothing.** RLS is not applied to
-- DELETE events, so every subscriber sees every delete on these tables. Both
-- read policies above are `using (true)`, so a delete event carries nothing a
-- `select` would not have handed over. The rule to remember is the general one:
-- do not publish a table whose READS are restricted. `allowlist` is still the
-- table in this project that must never be published.
--
-- Why it matters here rather than being a nicety: the exclusion constraint
-- resolves the confirm race in the database, but only the losing client learns
-- about it from its own error. Every *other* Friend's screen finds out the
-- Hangout exists from this stream — and a Hangout blanks its Slots out of their
-- Candidate list, so without it their sidebar keeps offering a window that is
-- already booked.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'hangout'
  ) then
    alter publication supabase_realtime add table public.hangout;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'hangout_participant'
  ) then
    alter publication supabase_realtime add table public.hangout_participant;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Deliberately NOT here, and one of them is a trap worth naming.
--
-- Issue 10 owns the lifecycle: the strict-drop trigger, the "Join?" prompt,
-- Leave, re-Join, the retime RPC, cancel, and the Past freeze. Two of those are
-- database objects and neither can be written yet without guessing at the shape
-- of the thing above it:
--
--   * the statement-level `after delete on availability` DROP TRIGGER, with a
--     transition table so it fires once per delete rather than once per slot —
--     which also has to **auto-cancel a Hangout whose last Participant leaves
--     or is dropped** (ticket 07's amendment), since the trigger can empty a
--     Hangout with nobody clicking anything; and
--
--   * ADR-0002's `security definer` extend RPC, whose one argument is a hangout
--     id and whose `search_path = ''` / `revoke ... from public, anon` /
--     `grant ... to authenticated` shape is settled. **Ticket 07 §9's judgement
--     about `security definer` in an exposed schema belongs in the migration
--     that writes it**, not here, so the next reader finds the reasoning beside
--     the function they were about to "fix".
--
-- **The trap: confirming needs neither, and nothing about it should reach for
-- the RPC.** Retime and Join write Availability for other Friends, which is
-- what ADR-0002 exists for. Confirm does not, and cannot need to — a Candidate
-- is *by definition* a run in which every one of its Friends already holds
-- Availability at every Slot. That is what makes confirm the simple one of the
-- three, and it is why this whole slice writes exactly two things: one `hangout`
-- row and one `hangout_participant` row per Friend.
-- ---------------------------------------------------------------------------
