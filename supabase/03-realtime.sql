-- friens-cal — issue 07: publish `availability` and `friend` to Realtime
--
-- Paste this whole file into the Supabase SQL Editor and run it once. Re-running
-- it is safe: `alter publication ... add table` errors if the table is already a
-- member, so each statement is wrapped in a guard that checks
-- `pg_publication_tables` first.
--
-- **This file is the only thing in this slice a human has to do.** Nothing in
-- the repo can reach the project with DDL rights and that is by design — `.env`
-- holds the publishable key only (ADR-0001), which is enough to read and write
-- rows under RLS and nowhere near enough to alter a publication.
--
-- Without it the heatmap still renders and drawing still works. What does not
-- work is the one thing this slice is for: a Friend's edit reaching another
-- Friend's screen without a reload. The subscription subscribes successfully,
-- the table emits nothing, and there is no error anywhere — which is why
-- `scripts/verify-realtime.mjs` exists and why it is the acceptance check.
--
-- Verify from a browser-shaped client, after running this:
--   node --env-file=.env scripts/verify-realtime.mjs

-- ---------------------------------------------------------------------------
-- 1. What a publication is, and why a table is silent without one.
--
-- A publication is Postgres's own list of tables whose changes get streamed to
-- replicas. Supabase Realtime is a subscriber to the `supabase_realtime`
-- publication, so a table that is not a member produces no events at all — the
-- client's `.subscribe()` still reports SUBSCRIBED, because the channel is fine;
-- it is the firehose that is empty.
--
-- Dashboard equivalent: Database → Publications → `supabase_realtime`.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'availability'
  ) then
    alter publication supabase_realtime add table public.availability;
  end if;
end $$;

-- `friend` too, and it is not a nicety in this slice. The heatmap counts the
-- Friends the viewer is trying to meet, so a Friend the roster has not heard
-- about is a Friend whose Availability arrives over Realtime and is then NOT
-- counted — the grid would under-report by one, silently, until a reload. It
-- also means a Friend changing their hue recolours their sidebar row live, which
-- ticket 11 asked for ("propagating over Realtime like any other row").
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'friend'
  ) then
    alter publication supabase_realtime add table public.friend;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. `replica identity full` is NOT set, and that is a decision.
--
-- Realtime sends only `new` values by default; `old` values on UPDATE and DELETE
-- require `replica identity full`, which makes Postgres write the entire old row
-- into the WAL on every change.
--
-- **`availability` does not need it, and the reason is structural.** The default
-- replica identity is the table's PRIMARY KEY, and here the primary key IS the
-- whole row: `(friend_id, slot_start)` and nothing else (02-availability.sql
-- spells it as the key precisely because it is the row's identity). So a DELETE
-- payload already carries exactly the key the client's store is keyed on. There
-- is nothing `full` would add except write amplification.
--
-- The one thing it *would* buy is filtering DELETE events server-side — the
-- documented limitation is that delete events escape a subscription `filter`
-- unless replica identity is `full`. The client subscribes UNFILTERED and
-- filters in the browser (ticket 02 §6.4: there is no filter expression for
-- "rows overlapping the visible week", and one built from two column
-- comparisons would need the channel torn down on every calendar navigation).
-- So that limitation is not reachable here either.
--
-- `friend` does not need it for the same practical reason: the client folds a
-- row in by `id`, and `id` is the primary key, so it is present on a delete.
--
-- If a future table's Realtime consumer ever needs to know what a value USED to
-- be, that is the moment to revisit this — and it is a moment worth noticing,
-- because `full` is a write-path cost paid on every statement.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 3. RLS on the stream, and the one documented hole.
--
-- Realtime authorizes every event against every subscriber — with 100
-- subscribers, one write runs 100 authorization checks — so the stream is gated
-- by each table's `select` policy. RLS on with no policy means you receive
-- nothing. Both tables here have a group-wide `using (true)` read policy, so
-- every Friend legitimately receives every event.
--
-- **The hole, quoting Supabase's own caution: "RLS policies are not applied to
-- DELETE statements, because there is no way for Postgres to verify that a user
-- has access to a deleted record."** So every subscriber sees every delete on
-- these tables, whatever the policies say.
--
-- **For friens-cal this leaks nothing, and that is worth writing down so nobody
-- later reads the hole as a leak.** Availability is readable by every
-- authenticated Friend anyway — the read policy is `using (true)`, because the
-- entire product is a count over other people's rows — so a delete event carries
-- nothing a `select` would not have handed over. Same for `friend`, whose rows
-- are group-readable by issue 01's policy and which does not expose email.
--
-- The rule to remember is the general one, not this instance: **do not publish a
-- table whose READS are restricted** and expect delete events to stay inside
-- those restrictions. `allowlist` is the table in this project that must never
-- be published — it has no browser access at all, and a delete event would be
-- the one way an email on it could reach a browser.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Confirm the membership (this part is readable from the SQL Editor only):
--
--   select schemaname, tablename
--   from pg_publication_tables
--   where pubname = 'supabase_realtime'
--   order by tablename;
--
-- Expect `public.availability` and `public.friend`.
--
-- And that replica identity is still the default:
--
--   select relname, relreplident
--   from pg_class
--   where relname in ('availability', 'friend');
--
-- Expect `d` (default) for both, not `f` (full).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Then paste `04-demo-second-friend.sql`.
--
-- The heatmap is invisible with one Friend's rows — every wash sits at the same
-- strength and there is no count to compare. That file gives the second Friend
-- in the roster something to be free for, a year out so it cannot be mistaken
-- for real data. It is demo data and it is separate from this file for exactly
-- that reason: this one is schema, that one is not.
-- ---------------------------------------------------------------------------
