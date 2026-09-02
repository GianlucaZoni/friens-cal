-- friens-cal — issue 10: the Hangout lifecycle, in the database
--
-- Paste this whole file into the Supabase SQL Editor and run it once. It is
-- idempotent — `add column if not exists`, `create or replace function`, and
-- every trigger and policy is dropped before it is created.
--
-- **A new file rather than an edit to `05-hangout.sql`**, which is the rule
-- `02-availability.sql` set and `05-hangout.sql` restates: 05 is shipped and has
-- been run, so changing a shipped column means a migration, not a rewrite of
-- history. 05's closing section names the two database objects it deliberately
-- left behind, and §3 and §4 below are them.
--
-- **This file is the only thing in this slice a human has to do.** Nothing in
-- the repo can reach the project with DDL rights and that is by design — `.env`
-- holds the publishable key only (ADR-0001).
--
-- What it does:
--   1. adds the three provenance columns to `hangout`, and re-writes the two
--      policies that make them mean anything
--   2. stamps `edited_at` from a trigger and makes `created_by` immutable —
--      the two things no `with check` can say
--   3. THE DROP TRIGGER — statement-level, with a transition table — and the
--      auto-cancel that comes with it, from a second trigger on Leave
--   4. ADR-0002's extend RPC, which is also the retime
--
-- Verify from a browser-shaped client, after running this:
--   node --env-file=.env scripts/verify-hangout-lifecycle.mjs
--
-- And re-run `verify-hangout.mjs`, which this file changes the contract of: §1's
-- insert policy makes a `hangout` insert without `created_by` fail.

-- ---------------------------------------------------------------------------
-- 1. PROVENANCE — `created_by`, `edited_by`, `edited_at`.
--
-- **This does not reverse flat trust, and the distinction is the whole
-- section.** `05-hangout.sql` §3 says "there is no owner column because there
-- is no owner", and that sentence is about **permission**: it stands. Every
-- policy below is still `using (true)` and anybody may still retime, rename or
-- cancel anything (ticket 01).
--
-- These columns record who *did* act, and they gate nothing. They earn their
-- place precisely *because* of flat trust rather than despite it: anyone may
-- move anyone's plan, there are no notifications in v1 (ticket 13), and ticket
-- 08 §3 accepts that "the other Friends learn of it by noticing an absence". In
-- that product, the only thing that can answer *who moved this* is a column
-- that wrote it down. Ownership would answer *who is allowed to*, which is a
-- question this product has deliberately refused to ask.
--
-- **`edited_by`, not `retimed_by`** — decided by the human against ticket 07's
-- own recommendation, and the mechanical argument is the decisive one:
--
--   an RLS policy cannot express "if `starts_at` changed, then the mark must be
--   set", because `with check` sees only the new row and `using` only the old.
--
-- So a retime-specific mark could not be *enforced* by the policy that has to
-- exist anyway — a rename would either be forced to claim a retime it did not
-- perform, or the `with check` would have to go and the column would become
-- decorative, which is the exact failure this section is written to avoid.
-- Policing it would have taken a trigger, for a distinction the card is not
-- trying to draw. With `edited_by`, **every** update to `hangout` is an edit,
-- one policy holds, and there is nothing to exempt.
--
-- `edited_by` non-null **is** ticket 08 §1's "edited" mark. Not a separate
-- boolean beside it: two columns that can contradict each other would surface
-- as a card claiming an edit by nobody.
--
-- **Nullable**, because the Hangouts confirmed before this migration have no
-- author and backfilling one would be inventing a fact — every reader has to
-- render the missing case rather than assume it away.
--
-- **`on delete set null`, never `cascade`.** Cascading would delete the
-- *Hangout* when a Friend's row goes, and the plan still happened. Null then
-- reads honestly as "confirmed by somebody no longer in the Group".
-- ---------------------------------------------------------------------------
alter table public.hangout
  add column if not exists created_by uuid references public.friend (id) on delete set null;

alter table public.hangout
  add column if not exists edited_by uuid references public.friend (id) on delete set null;

alter table public.hangout
  add column if not exists edited_at timestamptz;

comment on column public.hangout.created_by is
  'Who confirmed it. Provenance, not ownership — every policy on this table is '
  'still using (true). Null for a Hangout confirmed before this migration, or '
  'whose Friend row is gone.';

comment on column public.hangout.edited_by is
  'Who last changed it — a retime OR a rename. Non-null IS ticket 08 §1''s '
  '"edited" mark; there is no separate boolean, so the two facts cannot '
  'disagree.';

-- ---------------------------------------------------------------------------
-- The `with check`, or the columns are decorative.
--
-- **A column recording who did something, which anybody may set to anybody,
-- records nothing.** With a table-wide grant and `using (true)`, any Friend
-- could write somebody else's id into either column. This is ADR-0002's
-- refinement — *"`with check` is load-bearing"* — applied to a second table for
-- the same reason.
--
-- `auth.uid()` reads the **JWT claim** rather than the role, which is what
-- makes it still the calling Friend inside §4's `security definer` function —
-- so the RPC can set `edited_by` honestly rather than having to be trusted to.
--
-- `(select auth.uid())` rather than a bare call: the subquery form is evaluated
-- once per statement instead of once per row (`02-availability.sql` §4).
--
-- **This breaks a client that does not send the column**, on purpose and in the
-- same slice: `performConfirm` in `use-hangouts.ts` inserted `{starts_at,
-- ends_at}` and nothing else, and every confirm would fail with `42501` from
-- the moment this runs. The column and the write change together.
-- ---------------------------------------------------------------------------
drop policy if exists "any Friend confirms a Hangout" on public.hangout;
create policy "any Friend confirms a Hangout"
  on public.hangout for insert
  to authenticated
  with check (created_by = (select auth.uid()));

-- One policy for **every** update — retime, rename, and anything later. There
-- is nothing to exempt and nothing to compare across the old row and the new,
-- which is the whole argument for `edited_by` over `retimed_by`.
--
-- `using (true)` is unchanged: anybody may still change anybody's Hangout. What
-- this adds is that they cannot do it in somebody else's name.
-- Two drops, because this one is a **rename** as well as a rewrite: the policy
-- `05-hangout.sql` created is called "any Friend retimes a Hangout", and that
-- name stopped being true the moment a rename started setting the same mark.
-- Without the second drop this file is not re-runnable.
drop policy if exists "any Friend retimes a Hangout" on public.hangout;
drop policy if exists "any Friend edits a Hangout, in their own name" on public.hangout;
create policy "any Friend edits a Hangout, in their own name" on public.hangout
  for update
  to authenticated
  using (true)
  with check (edited_by = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. What the policies above cannot say, said in one `before update` trigger.
--
-- Two facts, and each is a thing `with check` is structurally unable to
-- express, for the same reason §1 gives: **a policy sees one row, never both.**
--
-- ## `edited_at` is stamped by the database, not by a browser
--
-- The alternative was for the client to send `new Date().toISOString()` beside
-- `edited_by`. It is one line shorter and it puts a **client's clock** into a
-- provenance record: a Friend whose laptop is an hour out records an edit an
-- hour out, and the detail sheet reads *"edited in three hours"*. `created_at`
-- is already a server `default now()`, and this is the same fact one column
-- over.
--
-- It also spares §4 from setting it: the RPC updates the row like anything else
-- and this fires underneath it, so there is exactly one expression in the
-- schema that decides when an edit happened.
--
-- ## `created_by` is immutable, which the policies leave open
--
-- §1's two `with check`s are ticket 07's amendment in full, and between them
-- they leave one hole: an `update` that sets `edited_by` to the caller **and**
-- `created_by` to somebody else satisfies both. A Friend could reassign
-- authorship of a plan, honestly signing the edit that did it. The grant on
-- this table is table-wide (`05-hangout.sql` §3), so nothing else stops them.
--
-- No policy can, either. "`created_by` must not change" is a comparison of the
-- old row against the new, which is precisely the expression `with check`
-- cannot contain — the same wall that made `edited_by` the right mark rather
-- than `retimed_by`. So it is said here instead, in the one place that can see
-- both: whatever an update proposes, `created_by` keeps the value it was
-- inserted with.
--
-- **This is not a permission.** It gates nobody: every Friend may still retime,
-- rename and cancel every Hangout. It only means the record of who confirmed it
-- says what it did when it was written, which is the entire point of a
-- provenance column and was otherwise a claim rather than a fact.
--
-- ## `security invoker` (the default), not `definer`
--
-- It needs no rights at all — it sets fields on the row already being written.
-- A `security definer` here would be a privilege nothing asked for.
--
-- `set search_path = ''` regardless, so a schema on the caller's path cannot
-- shadow anything this reads. `now()` is `pg_catalog`, which is always searched
-- first whatever the setting says.
-- ---------------------------------------------------------------------------
create or replace function public.stamp_hangout_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.edited_at := now();
  new.created_by := old.created_by;
  return new;
end;
$$;

drop trigger if exists hangout_stamp_edited_at on public.hangout;
drop trigger if exists hangout_stamp_edit on public.hangout;
create trigger hangout_stamp_edit
  before update on public.hangout
  for each row
  execute function public.stamp_hangout_edit();

-- ---------------------------------------------------------------------------
-- 3. THE DROP TRIGGER, and the auto-cancel that has to come with it.
--
-- Ticket 07 §7: **the drop rule is strict** — *any* loss of coverage drops the
-- Participant. Ticket 07 §3: it **lives in the database**, because it must hold
-- whatever deleted the Slots (another device, a script, the dashboard), and it
-- is **statement-level with a transition table** so it fires once per delete
-- rather than once per slot. An eight-hour erase is one statement here, not
-- sixteen.
--
-- ## Why it is `security definer`, and why that is not the ticket 07 §9 question
--
-- `hangout_participant` has **no delete grant at all** (`05-hangout.sql` §4) —
-- that is what makes "Left is `left_at`, not a delete" true, since a deleted row
-- is indistinguishable from never having joined and would let the next
-- overlapping Availability re-offer "Join?" to somebody who walked out. This
-- trigger is the only thing in the product that may remove a row, and it drops
-- **other Friends'** rows as readily as yours. So it runs as the owner.
--
-- That is a different question from ticket 07 §9's, which is about an *RPC* in
-- an exposed schema — see §4, where the reasoning belongs. A trigger function
-- is not callable as a statement worth making: it is reached only by the
-- referential machinery, and it is revoked below anyway.
--
-- ## Coverage is exact slot-set containment, and the client says the same thing
--
-- `generate_series` over the Hangout's range, and a row required at every step.
-- Not `count(*) >= expected`, which is the cheap version and is fooled by an
-- off-grid row inside the range — `availability.slot_start` carries no grid
-- constraint of its own, only `hangout` does (`05-hangout.sql` §1).
--
-- **`hangout.ts`'s `slotStartsOf` + `holds` is this expression, in TypeScript**,
-- and it has to stay that way: ticket 08 §10's dialog names every Hangout a
-- pending erase will drop you from, *before* the delete, so if the two
-- definitions drift the dialog lies about what you are about to lose. Ticket 07
-- §7 calls that dialog "the only thing standing between a mis-click and
-- silently leaving a plan"; a lying dialog is worse than none.
--
-- ## The scan is narrowed by the transition table, and the answer is not
--
-- The trigger is `after delete`, so the rows are already gone: the coverage
-- test below reads the **post-delete** state of `availability` and needs the
-- transition table only to know which `(Hangout, Friend)` pairs are worth
-- asking about — the ones where a deleted Slot fell inside a Hangout the Friend
-- is on. A pair the erase did not touch cannot have changed answer.
--
-- The client's predicate makes the same restriction for the same reason, and it
-- is load-bearing rather than an optimisation: a Participant who *already* did
-- not cover their Hangout is left alone until they erase inside its range,
-- which is the only reading under which the two agree.
--
-- ## Left Friends are not dropped
--
-- `left_at is null` in the scan. Left outranks Availability permanently
-- (`CONTEXT.md`), so erasing the Availability under a Hangout you already left
-- changes nothing — and dropping the row would turn a deliberate Left back into
-- "never joined", which is the state that gets re-offered "Join?".
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The auto-cancel, factored out because **two paths reach it**.
--
-- Ticket 08 §4: an empty Hangout auto-cancels, *whether the last Participant
-- left or was dropped*. Those are two different statements on two different
-- tables — an `availability` delete and a `hangout_participant` update — so
-- this is called from two triggers rather than written twice. Ticket 07's
-- amendment is explicit that the UI path is not sufficient, because the drop
-- trigger can empty a Hangout with nobody clicking anything.
--
-- **Past Hangouts are exempt, and that is derived rather than invented.**
-- Ticket 08 §6: a Past Hangout is uneditable — *no join, no retime, no cancel*
-- — and an auto-cancel is a cancel. It also stays "forever", and ticket 01
-- settles that nothing in this product is ever auto-deleted. So tidying up last
-- month's Availability cannot erase last month's plans. The **drop** stays
-- strict either way, because ticket 07 §7 makes it strict without qualification
-- — so a Past Hangout can end up with no Participants on it, which the grid and
-- the card already render ("nobody on it"). That is the honest picture: the plan
-- happened, and nobody is on the record as having been there.
--
-- `security definer` because its callers are, and because it deletes a
-- `hangout` row on behalf of whoever's erase emptied it. Revoked from every
-- browser role: it is an implementation detail of the two triggers, not an RPC.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_empty_hangouts(hangout_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.hangout h
   where h.id = any (coalesce(hangout_ids, '{}'::uuid[]))
     and h.ends_at > now()
     and not exists (
       select 1
         from public.hangout_participant p
        where p.hangout_id = h.id
          and p.left_at is null
     );
$$;

revoke all on function public.cancel_empty_hangouts(uuid[]) from public, anon, authenticated;

comment on function public.cancel_empty_hangouts(uuid[]) is
  'Ticket 08 §4''s auto-cancel. Called by both lifecycle triggers — a drop and '
  'a Leave are different statements on different tables. Past Hangouts are '
  'exempt: ticket 08 §6 makes them uneditable, and an auto-cancel is a cancel.';

create or replace function public.drop_participants_losing_coverage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  emptied uuid[];
begin
  with suspect as (
    -- The pairs the erase could have changed the answer for: this Friend is on
    -- this Hangout, and one of the Slots they just deleted fell inside it.
    select distinct p.hangout_id, p.friend_id, h.starts_at, h.ends_at
      from public.hangout_participant p
      join public.hangout h
        on h.id = p.hangout_id
      join erased e
        on e.friend_id = p.friend_id
       and e.slot_start >= h.starts_at
       and e.slot_start <  h.ends_at
     where p.left_at is null
  ),
  uncovered as (
    -- Exact slot-set containment, against the post-delete table. `[)` — the
    -- last step is `ends_at - 30 minutes`, matching `tstzrange`'s default bound
    -- and the client's `slotStartsOf`.
    select s.hangout_id, s.friend_id
      from suspect s
     where exists (
       select 1
         from pg_catalog.generate_series(
                s.starts_at,
                s.ends_at - interval '30 minutes',
                interval '30 minutes'
              ) as g(slot)
        where not exists (
          select 1
            from public.availability a
           where a.friend_id = s.friend_id
             and a.slot_start = g.slot
        )
     )
  ),
  dropped as (
    delete from public.hangout_participant p
     using uncovered u
     where p.hangout_id = u.hangout_id
       and p.friend_id  = u.friend_id
    returning p.hangout_id
  )
  select array_agg(distinct d.hangout_id) into emptied from dropped d;

  perform public.cancel_empty_hangouts(emptied);
  return null;
end;
$$;

revoke all on function public.drop_participants_losing_coverage() from public, anon, authenticated;

comment on function public.drop_participants_losing_coverage() is
  'Ticket 07 §7''s strict drop. Statement-level with a transition table so an '
  'eight-hour erase is one statement, not sixteen. security definer because '
  'hangout_participant has no delete grant at all — this is the only thing '
  'that may remove a row.';

drop trigger if exists availability_drops_participants on public.availability;
create trigger availability_drops_participants
  after delete on public.availability
  referencing old table as erased
  for each statement
  execute function public.drop_participants_losing_coverage();

-- ---------------------------------------------------------------------------
-- And the other half of ticket 08 §4: the last Participant **leaving**.
--
-- Leave is an `update` setting `left_at` (`05-hangout.sql` §4), which the drop
-- trigger above cannot see — it watches `availability`. So the same auto-cancel
-- hangs off `hangout_participant` too.
--
-- It fires on re-Join as well, where `left_at` goes back to null. Nothing
-- happens then, because the Hangout is not empty — which is cheaper than
-- a `when` clause that would have to be right about a transition table.
--
-- `security definer` for the delete on `hangout`: the browser does hold that
-- grant, but the trigger is reached by a Friend updating **their own** row and
-- the row it removes is the group's. Running as the owner is what makes the two
-- callers of `cancel_empty_hangouts` identical rather than nearly identical.
-- ---------------------------------------------------------------------------
create or replace function public.autocancel_after_leaving()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  touched uuid[];
begin
  select array_agg(distinct c.hangout_id) into touched from changed c;
  perform public.cancel_empty_hangouts(touched);
  return null;
end;
$$;

revoke all on function public.autocancel_after_leaving() from public, anon, authenticated;

drop trigger if exists hangout_participant_autocancels on public.hangout_participant;
create trigger hangout_participant_autocancels
  after update on public.hangout_participant
  referencing new table as changed
  for each statement
  execute function public.autocancel_after_leaving();

-- ---------------------------------------------------------------------------
-- 4. ADR-0002's ONE NARROW HOLE — the retime.
--
-- This is the single place in the product where one Friend writes another
-- Friend's Availability. ADR-0002 chose it over flat trust: Availability stays
-- self-write-only at the RLS layer, and exactly one audited server-side
-- function may **extend** it — never shorten, never delete.
--
-- ## Ticket 07 §9's judgement, written here on purpose
--
-- Supabase's RLS guide says *"never create a `security definer` function in a
-- schema listed under Exposed schemas"* — yet `supabase.rpc()` requires exactly
-- that. ADR-0002's refinements flag it as an **unresolved sharp edge** and
-- forbid assuming a carve-out. Ticket 07 §9 resolved it as a judgement, and
-- `05-hangout.sql` deliberately did not carry the reasoning so that it would
-- land here, beside the function somebody is about to "fix":
--
--   The danger the caution describes is a privileged helper **callable with
--   arbitrary arguments** — a policy helper, which is the shape the docs are
--   written about. This function derives its participants from a stored row,
--   sets `search_path = ''`, and is revoked from `public` and `anon` before
--   being granted to `authenticated`. The docs state no carve-out. **This is a
--   judgement, recorded as one.**
--
-- ## Why "may extend, never shorten" is a fact and not a rule
--
-- Availability is **slot rows** (ticket 07 §1). So the only thing this function
-- can do to somebody else's calendar is `insert` — there is no update to make
-- and no delete written. Shortening is not forbidden here; it is unspeakable.
-- That is the property slot rows were chosen for, and it is why the body below
-- has no defensive check about it.
--
-- Extensions are **never reverted** (ADR-0002). Moving a Hangout shorter, or
-- cancelling it, leaves the Slots behind. That is the recorded cost of not
-- putting provenance on Availability rows.
--
-- ## The signature — a deliberate departure from ADR-0002's refinement
--
-- ADR-0002 refines: *the RPC takes exactly one argument, the hangout id*, and
-- *"deriving the participants and the time range from the stored hangout row is
-- the entire reason the hole is narrow."* This takes three, and the ADR carries
-- an amendment saying so. The reason is a chicken-and-egg that one argument
-- cannot resolve:
--
--   * **RPC then update** extends everyone to the range the Hangout is
--     *leaving*, which is the one range they already covered. Useless.
--   * **Update then RPC** is two statements outside a transaction (PostgREST
--     cannot span them, ADR-0001). If the RPC fails, the Hangout has moved to a
--     time nobody covers — and **the drop trigger will not repair it**, because
--     it only fires on an `availability` delete. Compensating client-side is
--     what issue 09 did for a failed Participant seed, and it does not work
--     here: the compensating `update` back can itself be refused by the
--     exclusion constraint if somebody took the old window in between.
--
-- So the move and the extension happen in **one statement, in one
-- transaction**, and the range is an argument because the caller is the one
-- choosing it.
--
-- **It is not the `(friend_id, start, end)` signature the ADR rejected**, and
-- the difference is not cosmetic. That signature is "write any Friend's
-- calendar anywhere", behind a safer-looking name. This one still derives
-- **who** from the stored row — the Participants of this Hangout, `left_at`
-- null — and the range it writes is, by the time it returns, *the Hangout's own
-- range*, because the same statement put it there. The invariant ADR-0002
-- bought survives: nothing this function writes is Availability that some
-- Hangout does not actually cover.
--
-- ## What it does NOT check, and why
--
-- **Not the Past freeze.** Ticket 08 §6 makes a Past Hangout uneditable, and
-- the client enforces it — but a check here would be `05-hangout.sql` §4's
-- rejected shape: *a fence beside an open gate*, since `update` on `hangout` is
-- `using (true)` and any client can move a Past Hangout without coming through
-- here at all. Every conditional inside a `security definer` function is
-- something that has to be right; this one buys nothing.
--
-- **Not the 30-minute grid.** `hangout`'s own check constraint rejects an
-- off-grid bound with `23514` (`05-hangout.sql` §1), which is exactly the
-- structural-not-conventional reading ticket 07 §6 asked for. Restating it here
-- would be a second place to get it wrong.
--
-- **Not the collision.** The exclusion constraint answers with `23P01`, the
-- whole function aborts, and nothing is written — which is what makes the
-- editor's rejection message (ticket 08 §7) honest rather than a guess.
-- ---------------------------------------------------------------------------
create or replace function public.retime_hangout(
  hangout_id uuid,
  starts_at timestamptz,
  ends_at timestamptz
)
returns public.hangout
language plpgsql
security definer
set search_path = ''
as $$
declare
  moved public.hangout;
begin
  /*
   * Parameters are qualified by the function's own name rather than renamed
   * with a prefix. `p_starts_at` would work and would leak into the API — the
   * client sends these names as JSON keys — so the qualification stays here
   * where the ambiguity is, instead of in every caller.
   *
   * `edited_by` is set from `auth.uid()`, which reads the JWT claim rather than
   * the role: it is still the calling Friend in here, even though the statement
   * runs as the owner. §1's `with check` cannot enforce that — the owner
   * bypasses RLS — so this line is the honest version of the same promise, and
   * it is the reason the policy exists for every OTHER update.
   *
   * `edited_at` is not set here: §2's trigger stamps it, so there is one
   * expression in the schema that decides when an edit happened — and the same
   * trigger is what keeps `created_by` from moving underneath this statement.
   */
  update public.hangout h
     set starts_at = retime_hangout.starts_at,
         ends_at   = retime_hangout.ends_at,
         edited_by = (select auth.uid())
   where h.id = retime_hangout.hangout_id
  returning h.* into moved;

  if not found then
    /*
     * The sibling case of ticket 08 §8: the Hangout was cancelled while
     * somebody had its editor open. With a hard delete there is no row left to
     * explain the failure, so the client turns this into *"this hangout was
     * cancelled"* — which is why it is a distinguishable error rather than a
     * silent zero-row update.
     */
    raise exception 'hangout % no longer exists', retime_hangout.hangout_id
      using errcode = 'no_data_found';
  end if;

  /*
   * The extension. Every current Participant, every Slot of the NEW range —
   * which is `moved`'s, i.e. the row as it now stands, so the range written and
   * the range stored cannot disagree.
   *
   * `on conflict do nothing` rather than a `not exists` filter: the unique key
   * IS `(friend_id, slot_start)` (`02-availability.sql`), so idempotence is the
   * table's rather than this function's to remember. It is also what makes a
   * retime onto an overlapping range cost nothing.
   *
   * Ticket 08 §2's consequence, held rather than mitigated: moving Pizza from
   * Saturday 20:00 to Tuesday 19:00 **writes Tuesday Availability for Friends
   * who never mentioned Tuesday**. The human chose unrestricted retime with
   * that in front of them. What the product owes them instead of a restriction
   * is §11's dialog, which names the Friends whose calendars this will write to
   * before it runs.
   */
  insert into public.availability (friend_id, slot_start)
  select p.friend_id, g.slot
    from public.hangout_participant p
   cross join pg_catalog.generate_series(
                moved.starts_at,
                moved.ends_at - interval '30 minutes',
                interval '30 minutes'
              ) as g(slot)
   where p.hangout_id = moved.id
     and p.left_at is null
      on conflict (friend_id, slot_start) do nothing;

  return moved;
end;
$$;

-- The three-part lock ticket 07 §9 named, spelled out rather than implied.
-- `execute` is granted to `public` by default on a new function, so the revoke
-- is not belt-and-braces — it is the only thing standing between `anon` and
-- this.
revoke all on function public.retime_hangout(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;

grant execute on function public.retime_hangout(uuid, timestamptz, timestamptz)
  to authenticated;

comment on function public.retime_hangout(uuid, timestamptz, timestamptz) is
  'ADR-0002''s one narrow hole, and the only place one Friend writes another''s '
  'Availability. Moves the Hangout and extends every current Participant to '
  'cover the new range, in one transaction. Insert-only, so "may extend, never '
  'shorten" is structural. See §4 for ticket 07 §9''s security definer '
  'judgement before changing anything here.';

-- ---------------------------------------------------------------------------
-- Deliberately NOT here.
--
--   * **Join needs no RPC.** It writes *your own* Availability, under
--     `02-availability.sql`'s existing self-insert policy, plus one
--     `hangout_participant` row under `05-hangout.sql`'s flat-trust insert.
--     Only the retime crosses Friends.
--
--   * **Leave and re-Join need no new SQL at all.** The update grant is already
--     column-scoped to `left_at` and the policy is already
--     `friend_id = (select auth.uid())`, both proven live by
--     `verify-hangout.mjs`.
--
--   * **Cancel needs no new SQL.** It is a `delete` on `hangout`, granted and
--     `using (true)` since `05-hangout.sql` §3, and the cascade takes the
--     Participants with it — with no delete grant on that table in play.
--
--   * **The Past freeze is the client's**, in `hangout.ts`'s `isPast` against
--     `AppShell`'s one clock. See §4 for why it is not defended here.
--
--   * **Nothing is added to Realtime.** Every event this file can cause is
--     already published (`05-hangout.sql` §5, `03-realtime.sql`): `hangout`
--     UPDATE is the retime and the rename, `hangout` DELETE is the cancel and
--     the auto-cancel, and `hangout_participant` DELETE is the drop trigger.
--     All three are subscribed in `use-hangouts.ts`.
-- ---------------------------------------------------------------------------
