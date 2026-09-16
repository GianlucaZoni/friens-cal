-- friens-cal — groups issue 01, file 2 of 4: `cal_id` through every table that
-- holds a statement about time
--
-- Paste this whole file into the Supabase SQL Editor and run it once, **after
-- `08-cal-and-membership.sql`**. It is idempotent — `add column if not exists`,
-- `drop constraint if exists` before every `add constraint`, `create index if
-- not exists`, and every policy is dropped before it is created.
--
-- ===========================================================================
-- THIS IS THE FILE THAT BEGINS THE OUTAGE. READ THIS PARAGRAPH FIRST.
--
-- From the moment the `availability` primary key widens, **every draw and every
-- Join in the deployed client fails**. PostgREST's `onConflict:
-- 'friend_id,slot_start'` needs a unique constraint of exactly those columns,
-- and no such constraint can survive per-cal Availability: permitting the same
-- Friend and the same Slot in two cals is the entire point of this effort.
--
-- A nullable `cal_id` with a default papers over the column and not over the
-- key, so there is no staged version of this that keeps the running client
-- working. Groups ticket 04 §8 weighed the four-step sequence with a deploy in
-- the middle and rejected it: three Friends, one cal, and the failure mode is a
-- tab showing an error until it is reloaded.
--
-- **So: run this, run `10` and `11`, deploy the client, and tell the three
-- people to reload.** `11-realtime-per-cal.sql` has to land in the same window
-- for the mirror-image reason — it drops three tables from the Realtime
-- publication, and a deployed client is otherwise subscribed to a firehose that
-- has stopped and has not yet learned to listen anywhere else.
-- ===========================================================================
--
-- What it does:
--   1. the one cal, named "spiritually unemployed", with every Friend in it
--   2. `availability` — the column, the backfill, the new key, the foreign key
--      to `membership`, the index correction, and the Slot-grid check
--   3. `hangout` — the column, the per-cal exclusion constraint, and the
--      `unique (id, cal_id)` that makes the next section's promise keepable
--   4. `hangout_participant` — the redundant `cal_id` that cannot disagree with
--      its Hangout's
--   5. every rewritten policy on all three, plus `friend.time_zone`
--
-- Verify from a browser-shaped client, after running this and `10` and `11`:
--   node --env-file=.env scripts/verify-realtime.mjs
--
-- Rehearse the whole sequence locally first: `supabase/README.md`.

-- ---------------------------------------------------------------------------
-- 1. THE ONE CAL, AND EVERYBODY IN IT.
--
-- Named by the human. Every existing Friend becomes a Member, and every row in
-- the three tables below is backfilled to it, so the product after the cutover
-- behaves exactly as it did before: one cal, everyone in it, nothing new
-- visible.
--
-- **The Code is minted rather than written down here.** `private.new_cal_code()`
-- is the same generator `create_cal` uses, so the first cal's Code comes from
-- the same thirty characters as every later one, and this file does not put a
-- real cal's Code in the repository. Read it back afterwards with the query at
-- the bottom of this section, and paste it into the group chat — after the
-- client deploys, `/` shows it on the row.
--
-- The retry loop is `create_cal`'s, for the reason given there: a `select` that
-- checks whether a Code is taken and then inserts it has a race window in it,
-- and catching `unique_violation` has none.
--
-- Guarded on the name so that re-running the file cannot make a second cal. The
-- name is not unique in the schema — two Friends may legitimately name their
-- cals the same thing — so this guard is about this file's own idempotence and
-- nothing more.
-- ---------------------------------------------------------------------------
do $$
declare
  the_cal uuid;
  attempt integer := 0;
begin
  -- `order by created_at limit 1`: a cal's name is not unique, and a Friend
  -- may legitimately `create_cal('spiritually unemployed')` after the cutover.
  -- Without the limit a re-run of this file would pass this block and then
  -- fail two sections down with `21000 more than one row returned by a
  -- subquery`, halfway through the outage. The oldest row is the seeded one.
  select c.id into the_cal
    from public.cal c
   where c.name = 'spiritually unemployed'
   order by c.created_at
   limit 1;

  if the_cal is null then
    loop
      attempt := attempt + 1;
      begin
        insert into public.cal (name, code)
        values ('spiritually unemployed', private.new_cal_code())
        returning id into the_cal;
        exit;
      exception when unique_violation then
        if attempt >= 10 then
          raise;
        end if;
      end;
    end loop;
  end if;

  -- Every Friend, including any who signed up and never finished setup: they
  -- have a `friend` row, so they had Availability they could draw, so they
  -- belong in the cal that now owns it.
  insert into public.membership (cal_id, friend_id)
  select the_cal, f.id
    from public.friend f
  on conflict (cal_id, friend_id) do nothing;
end $$;

-- The one cal, by name, for the three backfills below. Spelled out each time
-- rather than held in a variable: a `do` block cannot hand a value to the plain
-- DDL statements that follow it, and a temporary table to carry one uuid would
-- be more machinery than the repetition costs.

-- ---------------------------------------------------------------------------
-- 2. `availability` — the table this migration is really about.
--
-- Vocabulary note (CONTEXT.md): Availability is now *(group, friend, slot)*. "A
-- Friend free on Saturday in two Groups has said so twice, and a Friend who is
-- busy in one Group is silent rather than unavailable in the other."
--
-- The column lands nullable, is backfilled, and only then becomes `not null` —
-- the one ordering in this file that is not a preference. A `not null` column
-- cannot be added to a table with rows in it unless it carries a default, and a
-- default here would be a value for rows created *later* to inherit, which is
-- exactly what must not happen once there is more than one cal.
-- ---------------------------------------------------------------------------
alter table public.availability
  add column if not exists cal_id uuid;

update public.availability
   set cal_id = (select c.id from public.cal c where c.name = 'spiritually unemployed'
                  order by c.created_at limit 1)
 where cal_id is null;

alter table public.availability
  alter column cal_id set not null;

-- ---------------------------------------------------------------------------
-- The key, widened.
--
-- `(cal_id, friend_id, slot_start)`, and this is the statement that breaks the
-- deployed client. It is still the whole row and still the row's identity, for
-- the reason `02-availability.sql` spelled the key that way in the first place:
-- there is nothing else in the row, and a surrogate id would be a second way to
-- name a row that already has a name.
--
-- **The client's store keeps its two-part key.** `slotKey(friendId, slotStart)`
-- and the flat `Set` in `slots.ts` are untouched, because one cal is on screen
-- at a time and `cal_id` is supplied at the query boundary instead. v1 ticket
-- 19's optimistic-write property survives intact: a repeated fetch is still
-- free, and the echo of your own insert still lands on the same key.
-- ---------------------------------------------------------------------------
alter table public.availability
  drop constraint if exists availability_pkey;

alter table public.availability
  add constraint availability_pkey primary key (cal_id, friend_id, slot_start);

-- ---------------------------------------------------------------------------
-- And the reference moves from `friend` to `membership`, which buys two things
-- that would otherwise be a policy's job or nobody's.
--
--   * **You cannot hold Availability in a cal you are not in.** Structural,
--     rather than enforced by a `with check` that has to stay correct.
--   * **Leaving a cal erases your Availability in it, by cascade.** Which is
--     exactly what leaving does (CONTEXT.md), for free.
--
-- The referenced columns are `membership`'s own primary key, so this needs no
-- new index.
--
-- **The `friend` cascade is not lost, it is one hop longer.** Deleting a Friend
-- cascades their `membership` rows, which cascade their Availability. Worth
-- checking before this looks like a regression.
-- ---------------------------------------------------------------------------
alter table public.availability
  drop constraint if exists availability_friend_id_fkey;

alter table public.availability
  drop constraint if exists availability_membership_fkey;

alter table public.availability
  add constraint availability_membership_fkey
  foreign key (cal_id, friend_id)
  references public.membership (cal_id, friend_id) on delete cascade;

-- ---------------------------------------------------------------------------
-- The index correction — v1 ticket 07 §11's leading-column trap, for the fourth
-- time in this schema.
--
-- `availability_slot_start_idx` was `(slot_start)` because the Candidate scan
-- was "every Friend, today forward" with no other filter. That scan is now
-- per-cal, so `slot_start` alone no longer leads anything the query asks for.
-- ---------------------------------------------------------------------------
drop index if exists public.availability_slot_start_idx;

create index if not exists availability_cal_id_slot_start_idx
  on public.availability (cal_id, slot_start);

-- ---------------------------------------------------------------------------
-- The Slot grid, as a constraint rather than as a client promise.
--
-- `hangout` has carried this since `05-hangout.sql` §1 and `availability` did
-- not need it: under one shared zone the client could not produce an off-grid
-- instant, so the invariant was a property of `slotsOfDay`. Per-viewer
-- rendering (groups ticket 08) makes it producible — a viewer in a `:45` zone
-- drawing on their own local-midnight grid writes instants no European Friend's
-- timeline contains, overlap counts zero, and **no Candidate ever appears**.
-- Nothing errors. That is the failure this line prevents.
--
-- The spelling is `05-hangout.sql`'s, deliberately and fragilely. `date_part(
-- text, interval)` is IMMUTABLE; `date_part(text, timestamptz)` is only STABLE,
-- because for a `timestamptz` most fields depend on the session's TimeZone.
-- Postgres does **not** refuse a STABLE function in a check constraint, so the
-- naive `extract(minute from slot_start) in (0, 30)` is accepted, passes for
-- whoever wrote it, and then admits or rejects the same row depending on the
-- connection. Do not "simplify" it.
--
-- **If this statement fails with `23514`, there are off-grid rows.** Find them
-- before doing anything else:
--
--   select friend_id, slot_start from public.availability
--    where date_part('epoch', slot_start - '1970-01-01 00:00:00+00'::timestamptz)::bigint % 1800 <> 0;
--
-- v1 only ever wrote Rome-aligned half hours, and Rome's offsets are whole
-- hours, so a Rome-aligned half hour is a UTC-aligned half hour. Expect none.
-- ---------------------------------------------------------------------------
alter table public.availability
  drop constraint if exists availability_on_the_slot_grid;

alter table public.availability
  add constraint availability_on_the_slot_grid check (
    date_part('epoch', slot_start - '1970-01-01 00:00:00+00'::timestamptz)::bigint % 1800 = 0
  );

-- ---------------------------------------------------------------------------
-- 3. `hangout` — the column, and the constraint v1 predicted this day for.
-- ---------------------------------------------------------------------------
alter table public.hangout
  add column if not exists cal_id uuid;

update public.hangout
   set cal_id = (select c.id from public.cal c where c.name = 'spiritually unemployed'
                  order by c.created_at limit 1)
 where cal_id is null;

alter table public.hangout
  alter column cal_id set not null;

-- No `on delete` action, which is the honest spelling of "a cal is never
-- deleted" (`08-cal-and-membership.sql` §2 withholds the grant and the policy):
-- the default `no action` means that if anybody ever reaches for one from the
-- SQL Editor, the Hangouts in it refuse rather than vanishing quietly.
alter table public.hangout
  drop constraint if exists hangout_cal_id_fkey;

alter table public.hangout
  add constraint hangout_cal_id_fkey
  foreign key (cal_id) references public.cal (id);

-- ---------------------------------------------------------------------------
-- The exclusion constraint, per cal.
--
-- `05-hangout.sql` §1 said `btree_gist` "becomes load-bearing the day a scalar
-- column joins the key (`group_id with =`, if the single implicit Group ever
-- becomes several)". This is that day, and the extension has been installed
-- since `00-provisioning.sql`.
--
-- What it now means, which is a product change rather than a mechanical one:
-- **the calendar holds one plan at a time per cal**, not one plan at a time.
-- Two cals may book the same evening; the same cal still may not. Groups ticket
-- 09 leaned on this when it refused to make double-booking a *block* — a
-- cross-cal block would need a cross-cal constraint, which is precisely the
-- coupling per-Group Availability exists to remove. The warning is a mark on
-- the Candidate, and it lives in the client.
--
-- `tstzrange(starts_at, ends_at)` still defaults to `[)`, so a Hangout
-- 20:00–22:00 and one 22:00–24:00 still do not overlap.
-- ---------------------------------------------------------------------------
alter table public.hangout
  drop constraint if exists hangout_no_two_at_once;

alter table public.hangout
  add constraint hangout_no_two_at_once
  exclude using gist (cal_id with =, tstzrange(starts_at, ends_at) with &&);

-- ---------------------------------------------------------------------------
-- `unique (id, cal_id)` — redundant on its face, and the whole of §4's promise.
--
-- `id` is already unique, so this constraint adds nothing about `hangout`. What
-- it adds is a *referencable* pair: a foreign key must point at a unique
-- constraint, and `hangout_participant`'s `cal_id` can only be stopped from
-- disagreeing with its Hangout's by referencing both columns together.
--
-- Same instinct as `02-availability.sql` withholding the `update` grant so RLS
-- never has to be right about `friend_id`: make the wrong state
-- unrepresentable rather than merely unlikely.
-- ---------------------------------------------------------------------------
-- **Added if absent rather than dropped and re-added**, which is the one place
-- in this file that breaks the pattern. §4's foreign key points at this
-- constraint's index, so a re-run that dropped it would be refused (`2BP01`,
-- "other objects depend on it") or, with `cascade`, would quietly take the
-- foreign key with it and leave the table looking fine. Found by running this
-- file twice, which is what `supabase/README.md` is for.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.hangout'::regclass
       and conname  = 'hangout_id_cal_id_key'
  ) then
    alter table public.hangout
      add constraint hangout_id_cal_id_key unique (id, cal_id);
  end if;
end $$;

-- A plain btree on `cal_id`, which the exclusion constraint does not give us.
-- That constraint builds a GiST index whose leading column *is* `cal_id`, and
-- groups ticket 02 could not confirm that GiST satisfies the performance
-- guide's "index your policy filter column" — the guide's wording is "only when
-- it comes first in a `btree` index", which reads as excluding GiST. Cheap
-- insurance, as they said.
create index if not exists hangout_cal_id_idx
  on public.hangout (cal_id);

-- ---------------------------------------------------------------------------
-- 4. `hangout_participant` — one redundant column, and it cannot lie.
--
-- Groups ticket 02 asked for `cal_id` here so the policy collapses to the same
-- shape as everything else instead of being a per-row correlated join through
-- `hangout`, which the performance guide says to rewrite. The composite foreign
-- key below is the price of the redundancy and it is worth paying.
--
-- **It deliberately does NOT cascade from `membership`.** `friend_id` still
-- references `friend`. Availability is a statement about the future and leaves
-- with you; a Participant row is a record that you were there, and deleting it
-- rewrites history to make the schema tidier. CONTEXT.md is explicit that a
-- past Hangout "keeps you as a Participant: a past Hangout is a record of who
-- was there, and leaving a Group says nothing about where you were."
--
-- Keeping that promise takes one more thing, and it is not here: the drop
-- trigger would reach back through the Availability cascade and delete those
-- rows anyway. `10-lifecycle-per-cal.sql` §2 is the predicate that stops it.
-- ---------------------------------------------------------------------------
alter table public.hangout_participant
  add column if not exists cal_id uuid;

-- From its Hangout, not from the cal by name. The two agree today because there
-- is one cal; taking it from the parent row is the statement that stays true.
update public.hangout_participant p
   set cal_id = h.cal_id
  from public.hangout h
 where h.id = p.hangout_id
   and p.cal_id is null;

alter table public.hangout_participant
  alter column cal_id set not null;

-- The single-column foreign key goes, replaced by the composite one. Keeping
-- both would mean two constraints checking overlapping things, and the narrower
-- one is the one that is wrong.
--
-- `on delete cascade` carries over and is load-bearing: it is how cancelling a
-- Hangout takes its Participants with it, on a table with **no delete grant at
-- all** (`05-hangout.sql` §4). Referential actions run inside the system rather
-- than as the calling role.
alter table public.hangout_participant
  drop constraint if exists hangout_participant_hangout_id_fkey;

alter table public.hangout_participant
  drop constraint if exists hangout_participant_hangout_fkey;

alter table public.hangout_participant
  add constraint hangout_participant_hangout_fkey
  foreign key (hangout_id, cal_id)
  references public.hangout (id, cal_id) on delete cascade;

-- The leading-column trap a fifth time. The primary key is
-- `(hangout_id, friend_id)` and the policy filters on `cal_id`, which leads
-- nothing. Groups ticket 04 §6 named two index corrections and not this one;
-- it is the same insurance as `hangout_cal_id_idx` above, one table over.
create index if not exists hangout_participant_cal_id_idx
  on public.hangout_participant (cal_id);

-- ---------------------------------------------------------------------------
-- 5. EVERY POLICY, REWRITTEN.
--
-- The shape is the same everywhere and that is the point of having one helper:
-- `cal_id in (select private.my_cal_ids())`. `(select …)` around the call is
-- what lets the optimizer run it once per statement rather than once per row —
-- on a table that takes sixteen-row inserts, that is the difference worth
-- having.
--
-- The grants do not move. Every one of these tables already holds exactly the
-- verbs it needs, and widening a grant here would be a second decision
-- smuggled in beside a policy rewrite.
-- ---------------------------------------------------------------------------

-- `availability` reads were `using (true)` and are now the cal's. This is the
-- line that makes `03-realtime.sql`'s rule bite — *do not publish a table whose
-- READS are restricted* — and `11-realtime-per-cal.sql` is the answer to it.
drop policy if exists "every Friend reads all Availability" on public.availability;
drop policy if exists "a Member reads their cal's Availability" on public.availability;
create policy "a Member reads their cal's Availability"
  on public.availability for select
  to authenticated
  using (cal_id in (select private.my_cal_ids()));

-- Writes are yours alone, in a cal you are in. **The second half is already
-- structural** — the foreign key to `membership` refuses a row in a cal you are
-- not in, whatever a policy says. It is written anyway, because the two produce
-- different failures: without it a client bug arrives as `23503` from a
-- constraint, and with it as `42501` from the layer that is actually supposed
-- to be answering "may I". ADR-0002's refinement is what makes the first half
-- non-negotiable: without `with check`, a Friend could insert a row carrying
-- somebody else's `friend_id` and paint their calendar.
drop policy if exists "a Friend draws only their own Availability" on public.availability;
create policy "a Friend draws only their own Availability"
  on public.availability for insert
  to authenticated
  with check (
    friend_id = (select auth.uid())
    and cal_id in (select private.my_cal_ids())
  );

drop policy if exists "a Friend erases only their own Availability" on public.availability;
create policy "a Friend erases only their own Availability"
  on public.availability for delete
  to authenticated
  using (
    friend_id = (select auth.uid())
    and cal_id in (select private.my_cal_ids())
  );

-- No update policy and no update grant, unchanged from `02-availability.sql`.
-- The row is three columns now and all three are the key.

-- `hangout`: flat trust, **inside the cal**. `05-hangout.sql` §3's "anyone may
-- confirm, edit or cancel any Hangout" is unchanged in substance — there is
-- still no owner column and no Member outranks another — it is now scoped to
-- the Members of the cal the plan is in, which is what "the unit of privacy as
-- well as of grouping" means (CONTEXT.md).
drop policy if exists "every Friend reads every Hangout" on public.hangout;
drop policy if exists "a Member reads their cal's Hangouts" on public.hangout;
create policy "a Member reads their cal's Hangouts"
  on public.hangout for select
  to authenticated
  using (cal_id in (select private.my_cal_ids()));

drop policy if exists "any Friend confirms a Hangout" on public.hangout;
drop policy if exists "any Member confirms a Hangout in their cal" on public.hangout;
create policy "any Member confirms a Hangout in their cal"
  on public.hangout for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and cal_id in (select private.my_cal_ids())
  );

-- `using` and `with check` both, and both carry the cal: `using` admits the row
-- on the way out and says nothing about the row on the way in.
--
-- **What neither can say is that `cal_id` must not change at all.** The grant on
-- this table is table-wide (`05-hangout.sql` §3), so a Friend in two cals
-- passes both halves while moving a plan from one to the other, and a policy
-- cannot compare the old row against the new. `10-lifecycle-per-cal.sql` §1
-- pins it in the `before update` trigger that already pins `created_by`, which
-- is the one place that sees both rows.
drop policy if exists "any Friend edits a Hangout, in their own name" on public.hangout;
drop policy if exists "any Member edits a Hangout in their cal, in their own name" on public.hangout;
create policy "any Member edits a Hangout in their cal, in their own name"
  on public.hangout for update
  to authenticated
  using (cal_id in (select private.my_cal_ids()))
  with check (
    edited_by = (select auth.uid())
    and cal_id in (select private.my_cal_ids())
  );

drop policy if exists "any Friend cancels a Hangout" on public.hangout;
drop policy if exists "any Member cancels a Hangout in their cal" on public.hangout;
create policy "any Member cancels a Hangout in their cal"
  on public.hangout for delete
  to authenticated
  using (cal_id in (select private.my_cal_ids()));

-- `hangout_participant`: the same three, through its own `cal_id` rather than
-- through a join to `hangout`. That column is the whole reason these read like
-- every other policy in the file.
drop policy if exists "every Friend reads every Participant" on public.hangout_participant;
drop policy if exists "a Member reads their cal's Participants" on public.hangout_participant;
create policy "a Member reads their cal's Participants"
  on public.hangout_participant for select
  to authenticated
  using (cal_id in (select private.my_cal_ids()));

-- Flat trust again, and `05-hangout.sql` §4's long argument for it stands word
-- for word — confirming seeds rows for other Friends, so a narrow policy would
-- be a fence beside an open gate. What the cal adds is that the gate is now
-- inside a boundary, and the boundary has to hold on BOTH columns.
--
-- The second clause is new and it is not optional. Inside one implicit Group
-- every Friend was a Member, so "any friend_id" and "any Member" were the same
-- set. With many cals they are not: without it a Member of cal A could seed a
-- Friend who is not in cal A onto a cal-A Hangout, and that Friend could
-- neither see the row (the select policy is cal-scoped) nor clear it (the
-- update policy needs the same scope), and 10-lifecycle-per-cal.sql's drop
-- trigger would never remove it (it only drops current Members). A Participant
-- must be a Member of the cal at the moment they are seeded. Later they may
-- leave; that is what `left_at` and the membership trigger are for, and it is
-- why this is a policy rather than a foreign key to `membership`, which would
-- cascade a departure straight through the cal's past Hangouts.
drop policy if exists "any Friend seeds a Participant" on public.hangout_participant;
drop policy if exists "any Member seeds a Participant in their cal" on public.hangout_participant;
create policy "any Member seeds a Participant in their cal"
  on public.hangout_participant for insert
  to authenticated
  with check (
    cal_id in (select private.my_cal_ids())
    and exists (
      select 1
        from public.membership m
       where m.cal_id    = hangout_participant.cal_id
         and m.friend_id = hangout_participant.friend_id
    )
  );

-- Your own `left_at`, in a cal you are in. The grant is column-scoped to
-- `left_at`, so `cal_id` cannot be written from a browser at all and this
-- policy never has to defend it.
drop policy if exists "a Friend leaves only their own Hangout" on public.hangout_participant;
create policy "a Friend leaves only their own Hangout"
  on public.hangout_participant for update
  to authenticated
  using (
    friend_id = (select auth.uid())
    and cal_id in (select private.my_cal_ids())
  )
  with check (
    friend_id = (select auth.uid())
    and cal_id in (select private.my_cal_ids())
  );

-- ---------------------------------------------------------------------------
-- `friend` KEEPS `using (true)`, AND THAT IS A DECISION THIS FILE MAKES BY NOT
-- WRITING ANYTHING.
--
-- Groups ticket 02 proposed a second helper so `friend` reads are co-member
-- scoped. Ticket 04 §9 reversed it on two grounds:
--
--   * **The domain says identity is global.** CONTEXT.md: "A Friend is one
--     person everywhere. Their name, face and colour do not vary from Group to
--     Group." What is per-cal is the *statements*, not the *people*.
--   * **And scoping opens a hole.** A Friend who leaves a cal keeps their
--     Participant rows on its past Hangouts. Under co-member scoping their
--     `friend` row stops being readable, and that card renders a Participant
--     with no name and no face.
--
-- The cost, named exactly: an authenticated Friend can enumerate the names and
-- blobatars of everyone holding an account. No email — `01-friend.sql` keeps
-- that on `auth.users` deliberately — and **no cal membership**, because
-- `membership` is scoped. It tells you Marco exists. It never tells you which
-- cals he is in.
--
-- The sidebar is scoped by a `membership` read in the client instead, which is
-- a later slice's job (`12-cal-members-topic.sql`).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 6. `friend.time_zone` — a mirror of a device, and the grid never reads it.
--
-- Written from `Intl.DateTimeFormat().resolvedOptions().timeZone` on sign-in
-- and app load. The grid reads the live device on every render instead, so
-- travelling just works and there is no staleness to reconcile. This column
-- exists for two readers, both of them *other people*: the roster, which shows
-- `8h ahead` beside a Friend whose zone differs from yours, and the rule that
-- decides whether a time string needs to name its frame at all.
--
-- Nullable, because a Friend who has not signed in since the cutover has not
-- mirrored anything yet, and every reader has to render that case rather than
-- invent a zone for them.
--
-- **No check constraint, and it is not an omission.** The obvious one is
-- `time_zone in (select name from pg_timezone_names)` and Postgres refuses it
-- outright: a check constraint may not contain a subquery (`0A000`). Groups
-- ticket 04 §11 specified exactly that check for the `cal.time_zone` column it
-- later deleted, so the column being dropped saved a migration that could not
-- have run. An invalid zone is caught where it is used, by `Intl` throwing a
-- `RangeError` in the browser that wrote it.
-- ---------------------------------------------------------------------------
alter table public.friend
  add column if not exists time_zone text;

comment on column public.friend.time_zone is
  'A mirror of the device''s IANA zone, written on sign-in. The grid never '
  'reads it — it reads the live device — so this is only ever read by OTHER '
  'Friends: the roster offset, and whether a time string names its frame.';

-- The column-scoped update grant gains one column. `01-friend.sql` §3's
-- reasoning is unchanged: with the grant scoped, `id` and `created_at` are
-- still not writable from the browser at all and RLS never has to defend them.
grant update (time_zone) on table public.friend to authenticated;

-- ---------------------------------------------------------------------------
-- Deliberately NOT here.
--
--   * **`allowlist.invited_by`.** Groups ticket 04 §12 listed "the `allowlist`
--     attribution" as part of this file, and groups ticket 07 later resolved
--     that the column never existed and that inviting is its own slice. It
--     ships in `13-invite.sql`, with the `insert` grant that contradicts
--     `07-allowlist.sql`'s prose and the comment ADR-0003 condition 4 requires
--     beside it. Two files adding the same column is worse than one file adding
--     it late.
--
--   * **The lifecycle functions.** `drop_participants_losing_coverage` and
--     `retime_hangout` are blind to which cal a row is in, and from the moment
--     this file runs that blindness is a live bug in both directions. They are
--     `10-lifecycle-per-cal.sql`, which is the very next thing to paste.
--
--   * **Realtime.** `11-realtime-per-cal.sql`, and it has to land in this same
--     window. Until it does, `availability`, `hangout` and `hangout_participant`
--     are still in the `supabase_realtime` publication with restricted reads,
--     which is the case `03-realtime.sql` §3 warns about by name.
--
-- Read the new cal's Code back, which is the one thing here a human needs:
--
--   select id, name, code from public.cal;
--
-- And confirm the backfill left nothing behind:
--
--   select count(*) from public.availability where cal_id is null;   -- 0
--   select count(*) from public.hangout where cal_id is null;        -- 0
--   select count(*) from public.membership;                          -- one per Friend
-- ---------------------------------------------------------------------------
