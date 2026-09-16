-- friens-cal — groups issue 01, file 4 of 4: Realtime moves to broadcast, on
-- private per-cal topics
--
-- Paste this whole file into the Supabase SQL Editor and run it once, **after
-- `10-lifecycle-per-cal.sql` and before the client deploys**. It is idempotent —
-- `create or replace function`, every trigger and policy is dropped before it is
-- created, and each `alter publication … drop table` is guarded by a check on
-- `pg_publication_tables`.
--
-- **It rides the same outage as `09-per-cal.sql`, and this is the half that
-- decides how long the outage is.** The moment the three tables leave the
-- publication, a deployed client is subscribed to a firehose that has stopped
-- and has not yet learned to listen anywhere else. It does not error; it goes
-- quiet. Deploy the client immediately after this.
--
-- It **supersedes in part** `03-realtime.sql` and `05-hangout.sql` §5, which
-- published these three tables. `friend` stays exactly as those files left it.
--
-- What it does:
--   1. why the publication drop is the load-bearing half, and not the triggers
--   2. one trigger function, three triggers, two topics
--   3. the `realtime.messages` policy — `select` only, and why an insert policy
--      would be a forgery machine
--   4. the three `alter publication … drop table` statements
--
-- Decided in [ADR-0004](../docs/adr/0004-broadcast-for-cal-scoped-realtime.md).
-- Read it before changing anything here: the publication drop is the part of
-- this slice that is hard to reverse.
--
-- Verify from a browser-shaped client, after running this:
--   node --env-file=.env scripts/verify-realtime.mjs
--
-- Rehearse the whole sequence locally first: `supabase/README.md`.

-- ---------------------------------------------------------------------------
-- 1. WHY THIS FILE EXISTS, WHICH IS NOT THE REASON IT LOOKS LIKE.
--
-- `03-realtime.sql` §3 reasoned the Realtime DELETE exemption away: RLS is not
-- applied to delete events, but `availability`'s read policy was `using (true)`,
-- so a delete event "carried nothing a `select` would not have handed over". It
-- also wrote down the rule it was relying on: **do not publish a table whose
-- READS are restricted.** `09-per-cal.sql` restricted the reads on three of the
-- four published tables, so the footing is gone.
--
-- **And the leak was the smaller half.** The worse problem is on INSERT, where
-- RLS is working exactly as designed. A Friend in cal A and cal B legitimately
-- passes the read policy for both, so their cal-B inserts arrive at a client
-- showing cal A — and the client store is keyed `slotKey(friendId, slotStart)`
-- with no cal in it, so **cal B's Saturday paints onto cal A's grid**. No policy
-- can prevent that, now or ever: the subscriber is authorised to read both rows
-- and the store cannot tell them apart. The multi-cal Friend is the entire point
-- of this effort and is exactly who breaks.
--
-- **Removing the tables from the publication is the only thing that actually
-- closes the hole.** The delete exemption is a property of the publication, not
-- of our client. Anyone holding the publishable key can open a
-- `postgres_changes` subscription and receive every delete on a published
-- table, whatever our hooks do. So the decision is really "drop them, and
-- therefore broadcast", not "broadcast, and optionally drop them".
--
-- **Understand what §4 forecloses.** There is no `postgres_changes` fallback for
-- these three tables afterwards. If broadcast misbehaves in production, the way
-- back is a migration, not a client change.
--
-- **`friend` is excluded deliberately, not overlooked.** Its reads are still
-- `using (true)` because identity is global (CONTEXT.md), so `03-realtime.sql`'s
-- original reasoning holds for it word for word. The product therefore runs two
-- Realtime mechanisms at once, on purpose, and a reader will notice — which is
-- ADR-0004's main reason to exist.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 2. ONE FUNCTION, THREE TRIGGERS, TWO TOPICS.
--
-- `cal:<id>:availability` and `cal:<id>:hangouts`, mapping one-to-one onto the
-- two hooks that consume them. `useAvailability` owns one channel;
-- `useHangouts` already carries `hangout` and `hangout_participant` on a single
-- channel, so those two tables share a topic. Sharing one topic between two
-- hooks would need a shared channel provider, because supabase-js discourages
-- two channels on one topic, and the hooks' independence is how this codebase
-- is built.
--
-- **The topic suffix is a trigger argument rather than three near-identical
-- functions.** `tg_argv[0]` puts the whole topic vocabulary in the three
-- `create trigger` statements below, where it can be read at once, instead of
-- in three bodies that would drift.
--
-- **Every one of the three tables carries `cal_id`**, including the redundant
-- one `09-per-cal.sql` §4 gave `hangout_participant`, so the topic comes
-- straight off the row with no join. The column added to collapse a policy is
-- what makes these triggers trivial.
--
-- `NEW` is null on a delete, so the cal is read off whichever of the two rows
-- exists. Passing both records to `realtime.broadcast_changes` is the
-- documented shape and is safe on all three operations; reading `NEW.cal_id`
-- unconditionally would not be.
--
-- **Per-row, and the cost is named rather than discovered.** Leaving a cal
-- cascades every Availability row you hold in it in one statement, so a Friend
-- with six months of drawn Slots becomes thousands of messages, retained three
-- days in `realtime.messages`. Correct — the remaining Members' grids should
-- empty out — and fine at nine Friends. It is the first number to look at if
-- that table ever gets big. The alternative, a statement-level trigger with a
-- hand-rolled aggregate payload, trades a supported helper for a bespoke one
-- and a different client fold.
--
-- **A Realtime hiccup cannot block a draw**, which is worth knowing before
-- somebody wraps this in defensive code. `realtime.send` catches everything and
-- raises a WARNING rather than an error, so a failed broadcast leaves the write
-- committed and the event missing — the same shape as the read-then-subscribe
-- gap the client already lives with, repaired by the next read.
--
-- `security definer` because the trigger writes `realtime.messages`, which the
-- calling role may insert into only through this path. Revoked from every
-- browser role: it is reached by the trigger machinery, not by `supabase.rpc()`,
-- which is the same distinction `06-hangout-lifecycle.sql` §3 draws — so
-- ADR-0003's four conditions have nothing to say about it and the audited set
-- is still exactly three.
-- ---------------------------------------------------------------------------
create or replace function public.broadcast_row_to_cal_topic()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cal uuid;
begin
  if tg_op = 'DELETE' then
    cal := old.cal_id;
  else
    cal := new.cal_id;
  end if;

  /*
   * The payload `realtime.broadcast_changes` builds, so the client's handlers
   * can be read against it:
   *
   *   { "operation": "INSERT" | "UPDATE" | "DELETE",
   *     "record":     the new row, or null on a delete,
   *     "old_record": the old row, or null on an insert,
   *     "schema":     "public",
   *     "table":      "availability" | "hangout" | "hangout_participant" }
   *
   * The event name is `tg_op`, which is what the client subscribes to with
   * `.on('broadcast', { event: 'INSERT' }, …)`.
   *
   * One consequence worth stating, because it is the opposite of what
   * `postgres_changes` offered: the payload is whatever this trigger sends, so
   * a **delete carries the whole `OLD` row, `cal_id` included**. The client can
   * audit. It should not need to, and nothing downstream is written as if it
   * does, but under a `postgres_changes` filter the option did not exist at all.
   */
  perform realtime.broadcast_changes(
    'cal:' || cal::text || ':' || tg_argv[0],
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );

  return null;
end;
$$;

revoke all on function public.broadcast_row_to_cal_topic() from public, anon, authenticated;

comment on function public.broadcast_row_to_cal_topic() is
  'Sends one row change to its cal''s private topic, whose suffix is the '
  'trigger''s own argument. The three tables it serves all carry cal_id, so the '
  'topic comes off the row with no join.';

drop trigger if exists availability_broadcasts on public.availability;
create trigger availability_broadcasts
  after insert or update or delete on public.availability
  for each row
  execute function public.broadcast_row_to_cal_topic('availability');

drop trigger if exists hangout_broadcasts on public.hangout;
create trigger hangout_broadcasts
  after insert or update or delete on public.hangout
  for each row
  execute function public.broadcast_row_to_cal_topic('hangouts');

drop trigger if exists hangout_participant_broadcasts on public.hangout_participant;
create trigger hangout_participant_broadcasts
  after insert or update or delete on public.hangout_participant
  for each row
  execute function public.broadcast_row_to_cal_topic('hangouts');

-- ---------------------------------------------------------------------------
-- 3. THE POLICY, AND WHY IT GRANTS `select` AND NOTHING ELSE.
--
-- Under broadcast a delete is a message on a topic a policy had to authorise,
-- using the same `private.my_cal_ids()` helper as every other policy in the
-- schema. The boundary lives where this project keeps its other boundaries —
-- which is the third of ADR-0004's three reasons and the one that decided it.
-- Under a `postgres_changes` filter the boundary would have been a string in a
-- hook, with nothing downstream able to detect its absence.
--
-- **`select` only. Never add an insert policy here.** `authenticated` already
-- holds an `insert` GRANT on `realtime.messages` — Supabase ships it that way —
-- so RLS with no insert policy is the only thing making the triggers the sole
-- writer. A Friend able to insert on these topics could forge events into a cal
-- they belong to and paint rows on other people's grids that do not exist in
-- the database. This is ADR-0003's rule in another costume: the caller never
-- says who.
--
-- It is written down because an insert policy is exactly the kind of thing
-- added later to enable typing indicators, by somebody who does not notice what
-- else it enables.
--
-- **The topic is parsed as text, not cast.** `split_part(…, ':', 2)::uuid` would
-- raise `22P02` on any malformed topic anybody chose to join, and an exception
-- inside a policy is not a refusal, it is an error. Comparing the segment
-- against the ids as text cannot throw.
--
-- The third segment is deliberately not checked. A Member may read any topic in
-- a cal they are in; with no insert policy there is nothing on an unused topic
-- to read.
--
-- **This policy authorises a channel JOIN, not a row.** It never compares
-- `messages.topic` against `realtime.topic()`, and neither does Supabase's own
-- example: Realtime sets `realtime.topic()` to the topic being joined and asks
-- whether this role may have it, then delivers by topic itself. There is no
-- Data API path to these rows to worry about either — `realtime` is not one of
-- the project's Exposed schemas, the same setting that keeps `private`
-- unreachable.
--
-- **One boundary that leans on a route change, recorded rather than relied on.**
-- Channel authorization is cached for the life of the connection, unlike
-- `postgres_changes`, which re-evaluates per event. A Friend who leaves a cal
-- while connected would keep receiving its messages until they reconnect. In
-- practice Leave routes them out of `/g/:id` and the channel unmounts. Joining
-- is unaffected: a new topic is a fresh channel join and re-runs this policy.
-- ---------------------------------------------------------------------------
drop policy if exists "a Member reads their cal's broadcasts" on realtime.messages;
create policy "a Member reads their cal's broadcasts"
  on realtime.messages for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and split_part(realtime.topic(), ':', 1) = 'cal'
    and split_part(realtime.topic(), ':', 2) in (
      select mine.id::text from private.my_cal_ids() as mine (id)
    )
  );

-- ---------------------------------------------------------------------------
-- 4. AND THE THREE TABLES LEAVE THE PUBLICATION.
--
-- The load-bearing half. Everything above this point changes what *our* client
-- subscribes to; these three statements change what anybody's can.
--
-- Guarded because `alter publication … drop table` errors if the table is not a
-- member, which is what a second run of this file would find.
--
-- **`friend` is not here.** It stays published and stays on `postgres_changes`,
-- table-wide, and narrowing it would break a case a later slice depends on: it
-- is the only path by which a brand-new account reaches an already-running
-- client, and the roster's members topic would otherwise announce a Member
-- whose name nobody holds.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'availability'
  ) then
    alter publication supabase_realtime drop table public.availability;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'hangout'
  ) then
    alter publication supabase_realtime drop table public.hangout;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'hangout_participant'
  ) then
    alter publication supabase_realtime drop table public.hangout_participant;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Confirm the membership (readable from the SQL Editor only — a publishable key
-- cannot reach `pg_publication_tables`, which is why the verify script tests
-- behaviour rather than configuration):
--
--   select schemaname, tablename
--   from pg_publication_tables
--   where pubname = 'supabase_realtime'
--   order by tablename;
--
-- Expect exactly one row: `public.friend`.
--
-- Then deploy the client, and run:
--   node --env-file=.env scripts/verify-realtime.mjs
--
-- ---------------------------------------------------------------------------
-- Deliberately NOT here.
--
--   * **`membership` gains no trigger and joins no topic.** The roster's
--     `cal:<id>:members` is a later slice's file (`12-cal-members-topic.sql`),
--     and nothing joins that topic until its client ships. Note that §1's first
--     reason does not apply to it at all: `membership` is a new table and was
--     never published, so nothing is being closed there — it is a choice about
--     how to add liveness to a table that had none.
--
--   * **`replica identity full`.** Irrelevant to a trigger that reads `OLD` in
--     full regardless, and it was listed as a cost of this option by two
--     earlier tickets. It is not one.
--
--   * **`setAuth()` anywhere in the client.** `@supabase/supabase-js@2.112.4`
--     already calls it on connect and on every auth event, which is what makes
--     a private channel join carry the Friend's token. Also listed as a cost;
--     also not one.
--
--   * **`broadcast: { replay: { since, limit } }`.** Allowed on private
--     channels only, which these now are, so the three-day retention is a
--     replay buffer for the gap between a hook's read and its subscription.
--     Unused for now, deliberately: choosing `since` after a reconnect is a
--     client state question with no bearing on the security decision.
-- ---------------------------------------------------------------------------
