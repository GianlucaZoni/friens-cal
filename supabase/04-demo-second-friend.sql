-- friens-cal — issue 07: demo data, so the heatmap has more than one Friend in it
--
-- Paste into the Supabase SQL Editor and run once. Safe to re-run: every write
-- below is either `on conflict do nothing` or guarded to touch only a row that is
-- still completely blank.
--
-- **This is demo data, not schema.** It is a separate file from `03-realtime.sql`
-- for that reason, and it is the second of the two things a human has to do in
-- this slice — for a reason that is structural rather than incidental:
--
--   `02-availability.sql`'s insert policy is
--   `with check (friend_id = (select auth.uid()))`, so a client signed in as one
--   Friend cannot write a row carrying anybody else's `friend_id`. Verified, not
--   assumed: `verify-availability.mjs` check 7 asserts exactly this and the
--   error is 42501. `.env` holds one account, so nothing in this repo can create
--   a second Friend's Availability. That is the policy working.
--
-- The alternative was to ask for a second account's credentials. This was chosen
-- instead because it needs nothing the human does not already have open, and
-- because it can be undone with one statement (bottom of the file).
--
-- ---------------------------------------------------------------------------
-- Why the data is a year out
--
-- Every instant below is in **September 2027**. Nothing in this product is ever
-- auto-deleted (ticket 01), so seeded rows live forever and the one thing that
-- must never happen is a human mistaking them for somebody's real plans. A year
-- ahead is far enough that nobody navigates there by accident, and
-- `verify-availability.mjs` already uses the same convention for its probe rows
-- for the same reason.
--
-- The cost, named: the current week's grid still shows one Friend's Availability
-- only, so the heatmap is only interesting where you go looking for it. Navigate
-- to the week of **Mon 6 September 2027**. The store's boot read is unbounded
-- above — everything from today forward, in one query — so those rows are already
-- loaded and navigating forward triggers no refetch.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Give a blank Friend row an identity, so the wash can count them.
--
-- The grid excludes Friends who have not finished setup — from the count AND
-- from the denominator — because `RequireSetup` stands between an unfinished
-- Friend and the calendar, so there is no route by which they hold a row. A
-- seeded row for a Friend with no identity would therefore be invisible.
--
-- **Guarded to ONE blank row.** A row with any of these columns already set is
-- somebody who has been through setup, or is part way through it, and this must
-- never overwrite that. `on_auth_user_created` creates the row blank (issue 01),
-- so `null` on all five is exactly "has not started" — and the `limit 1` below
-- keeps a Group with several unfinished Friends from acquiring several
-- identical ones.
--
-- The values are deliberately unremarkable and entirely overridable: the Friend
-- can change all of them from setup or the profile dropdown, and doing so is the
-- normal path. Hue 200 is picked only to sit far from hue 35, which the account
-- in `.env` currently holds, so the two are told apart in the sidebar at a
-- glance. The grid does not use it at all — the wash is the *viewer's* hue.
-- ---------------------------------------------------------------------------
update public.friend
set
  display_name = 'Demo Friend',
  blobatar_seed = 'demo-' || left(id::text, 8),
  hue = 200,
  tone = 0.49, -- `mid`, a band interior; the six legal values are in 01-friend.sql
  expression = 'happy'
where id = (
  -- **Exactly one row**, and the oldest blank one. Without the `limit`, a Group
  -- with two people mid-signup would get two Friends both called 'Demo Friend'
  -- at hue 200 — indistinguishable in the roster and in the popover, which is
  -- the one place identity is answered at all.
  select id
  from public.friend
  where display_name is null
    and blobatar_seed is null
    and hue is null
    and tone is null
    and expression is null
  order by created_at, id
  limit 1
);

-- ---------------------------------------------------------------------------
-- 2. The Availability, as slot rows.
--
-- One row per half hour (ticket 07) — `generate_series` over a 30-minute step is
-- the same thing the client's `slotRun` does, said in SQL. Ranges are half open:
-- the series stops one step short of the end, so 20:00–22:00 is four rows and the
-- 22:00 slot is not one of them.
--
-- Times are written as a plain timestamp `at time zone 'Europe/Rome'`, which is
-- the group time zone (`GROUP_TIME_ZONE`). That yields a true `timestamptz`
-- instant, which is what the column holds and what the client keys on — writing
-- a bare literal would store whatever the SQL Editor's session zone happens to
-- be, and the wall clock on the grid would be an hour out.
--
-- Three shapes, chosen to exercise the whole opacity ramp rather than to look
-- plausible:
--
--   Mon 6 Sep  — a STAIRCASE. Each Friend starts an hour later than the last and
--                everybody runs to 23:00, so the column carries a count that
--                climbs: one Friend at the top, all of them at the bottom, with a
--                hard segment boundary at every hour. This is the case that
--                proves the boundary sweep cuts where the SET changes.
--   Wed 8 Sep  — a FULL HOUSE, 20:00–22:00. Every Friend, so the wash is at the
--                top of the ramp and the popover lists everyone.
--   Fri 10 Sep — ONE Friend alone, 10:00–13:00, at the floor of the ramp. The
--                thing that must stay visible in both themes: a lone Friend is
--                the most ordinary mark on the grid.
-- ---------------------------------------------------------------------------

-- Mon 6 Sep — the staircase.
--
-- `row_number()` gives each Friend a 0-based position, and the start time is
-- pushed forward by that many hours. With two Friends that is 18:00 and 19:00; it
-- keeps working as the Group grows, and a Group large enough to reach 23:00
-- simply contributes nothing for the Friends past it (an empty series, not an
-- error).
with ordered as (
  select
    id,
    row_number() over (order by created_at, id) - 1 as position
  from public.friend
  -- Only Friends the grid can count. Same predicate as `identityOf`.
  where display_name is not null
    and blobatar_seed is not null
    and hue is not null
    and tone is not null
    and expression is not null
)
insert into public.availability (friend_id, slot_start)
select
  ordered.id,
  slot
from ordered
cross join generate_series(
  (timestamp '2027-09-06 18:00' at time zone 'Europe/Rome') + ordered.position * interval '1 hour',
  (timestamp '2027-09-06 23:00' at time zone 'Europe/Rome') - interval '30 minutes',
  interval '30 minutes'
) as slot
on conflict (friend_id, slot_start) do nothing;

-- Wed 8 Sep — the full house.
insert into public.availability (friend_id, slot_start)
select
  friend.id,
  slot
from public.friend
cross join generate_series(
  timestamp '2027-09-08 20:00' at time zone 'Europe/Rome',
  (timestamp '2027-09-08 22:00' at time zone 'Europe/Rome') - interval '30 minutes',
  interval '30 minutes'
) as slot
where friend.display_name is not null
  and friend.blobatar_seed is not null
  and friend.hue is not null
  and friend.tone is not null
  and friend.expression is not null
on conflict (friend_id, slot_start) do nothing;

-- Fri 10 Sep — one Friend alone, at the floor of the ramp.
with ordered as (
  select
    id,
    row_number() over (order by created_at, id) as position
  from public.friend
  where display_name is not null
    and blobatar_seed is not null
    and hue is not null
    and tone is not null
    and expression is not null
)
insert into public.availability (friend_id, slot_start)
select
  ordered.id,
  slot
from ordered
cross join generate_series(
  timestamp '2027-09-10 10:00' at time zone 'Europe/Rome',
  (timestamp '2027-09-10 13:00' at time zone 'Europe/Rome') - interval '30 minutes',
  interval '30 minutes'
) as slot
where ordered.position = 1
on conflict (friend_id, slot_start) do nothing;

-- ---------------------------------------------------------------------------
-- Confirm what landed:
--
--   select slot_start, count(*) as free
--   from public.availability
--   where slot_start >= (timestamp '2027-09-06 00:00' at time zone 'Europe/Rome')
--     and slot_start <  (timestamp '2027-09-13 00:00' at time zone 'Europe/Rome')
--   group by slot_start
--   order by slot_start;
--
-- Expect counts of 1 and 2 on Monday, 2 throughout Wednesday's window, and 1 on
-- Friday — with a group of two Friends.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- To undo, when the real group has real data and this is in the way:
--
--   delete from public.availability
--   where slot_start >= (timestamp '2027-09-01 00:00' at time zone 'Europe/Rome')
--     and slot_start <  (timestamp '2027-10-01 00:00' at time zone 'Europe/Rome');
--
-- Section 1's identity is left alone by that, deliberately — by the time anybody
-- runs it, the Friend has probably set their own name and colour, and this
-- statement has no way to tell the seeded values from ones they chose.
-- ---------------------------------------------------------------------------
