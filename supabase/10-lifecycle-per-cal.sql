-- friens-cal — groups issue 01, file 3 of 4: the Hangout lifecycle, made
-- cal-aware, and the Left that leaving writes
--
-- Paste this whole file into the Supabase SQL Editor and run it once, **after
-- `09-per-cal.sql`**. It is idempotent — `create or replace function`, and every
-- trigger is dropped before it is created.
--
-- **A new file rather than an edit to `06-hangout-lifecycle.sql`**, which is the
-- rule `02-availability.sql` set and every file since has restated: 06 is
-- shipped and has been run, so changing it means a migration, not a rewrite of
-- history. A reader comparing the two wants a readable diff.
--
-- **It rides the same outage as `09-per-cal.sql`.** From the moment 09 runs, the
-- two functions below are live bugs rather than merely imprecise ones. Paste 09,
-- then this, then 11, then deploy.
--
-- What it does:
--   1. `stamp_hangout_edit` — pins `cal_id` the way it already pins
--      `created_by`, which is the only place that can
--   2. THE DROP TRIGGER, given a cal on both sides of its comparison, and the
--      one predicate that keeps a departure from erasing the cal's history
--   3. `retime_hangout` — the same hole, one cal narrower
--   4. THE LEFT — a `before delete on membership` trigger, because a cascade
--      cannot write a marker
--
-- Verify from a browser-shaped client, after running this:
--   node --env-file=.env scripts/verify-hangout-lifecycle.mjs
--
-- **That script predates the cutover and will need its own pass**: it writes
-- `availability` and `hangout` rows without a `cal_id`, so every write in it
-- fails until it is updated. Issue 01 rewrote `verify-realtime.mjs` because
-- ADR-0004 made it prove the wrong thing; the other five verify scripts are
-- still v1's and are listed in that issue's write-up as work the cutover
-- leaves behind.

-- ---------------------------------------------------------------------------
-- 1. `cal_id` IS PINNED IN THE TRIGGER, NOT IN A POLICY.
--
-- `09-per-cal.sql` §5 leaves one hole open and names this as the place it
-- closes. `hangout`'s update grant is table-wide (`05-hangout.sql` §3) and its
-- update policy is `using (cal_id in (…)) with check (… and cal_id in (…))`, so
-- a Friend who is a Member of two cals satisfies both halves while **moving a
-- plan from one cal to the other** — carrying its Participants, its title and
-- its provenance into a room the other Members never agreed to.
--
-- No policy can stop it. "`cal_id` must not change" is a comparison of the old
-- row against the new, which is precisely the expression `with check` cannot
-- contain — the same wall `06-hangout-lifecycle.sql` §2 hit for `created_by`.
-- So it is said here, in the one place that sees both rows, and it costs one
-- line beside a line that already does the identical job.
--
-- **This is not a permission.** Every Member may still retime, rename and
-- cancel every Hangout in their cal. It only means a Hangout stays in the cal
-- it was confirmed in.
--
-- `security invoker` (the default) is unchanged and still right: the function
-- sets fields on the row already being written and needs no rights at all.
-- ---------------------------------------------------------------------------
create or replace function public.stamp_hangout_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.edited_at := now();
  new.created_by := old.created_by;
  new.cal_id := old.cal_id;
  return new;
end;
$$;

-- The trigger itself is unchanged from `06-hangout-lifecycle.sql` §2 and is
-- re-created here only so this file stands alone. `create or replace function`
-- above is what actually takes effect; a trigger points at a function by name.
drop trigger if exists hangout_stamp_edit on public.hangout;
create trigger hangout_stamp_edit
  before update on public.hangout
  for each row
  execute function public.stamp_hangout_edit();

-- ---------------------------------------------------------------------------
-- 2. THE DROP TRIGGER — blind to cals, and that blindness is now a bug in both
--    directions at once.
--
-- `06-hangout-lifecycle.sql` §3 matches erased Slots to Hangouts on `friend_id`
-- and time alone, then tests coverage with `a.friend_id = s.friend_id and
-- a.slot_start = g.slot`. Both halves ignore which cal anything is in, which
-- was correct when there was only one. From `09-per-cal.sql` onwards:
--
--   * **Erasing your Saturday in cal A drops you from cal B's Saturday
--     Hangout**, because the suspect join matches on the Friend and the instant.
--   * **Your cal-A Availability keeps you on a cal-B Hangout you no longer
--     cover**, because the coverage test finds a row that is not in the same
--     room as the plan.
--
-- Neither would have raised an error. Both join predicates gain `cal_id`, and
-- `hangout_participant`'s own column is what they use — the redundant one
-- `09-per-cal.sql` §4 made unable to disagree with its Hangout's.
--
-- Everything `06-hangout-lifecycle.sql` §3 argues stays true and is not
-- repeated here: statement-level with a transition table so an eight-hour erase
-- is one statement rather than sixteen; `security definer` because
-- `hangout_participant` has no delete grant at all; coverage as exact slot-set
-- containment rather than `count(*) >= expected`; Left Friends are not dropped.
-- `hangout.ts`'s `slotStartsOf` + `holds` is still this expression in
-- TypeScript, and still has to stay that way, because ticket 08 §10's dialog
-- names the Hangouts a pending erase will drop you from *before* the delete.
--
-- ## The new predicate: a departure is not an erase
--
-- Leaving a cal cascades **every** Availability row you hold in it, past ones
-- included, and this trigger has no Past exemption — `06-hangout-lifecycle.sql`
-- §3 says so in terms and `droppedBy`'s doc comment repeats it. So without the
-- `exists` below, leaving would reach back and delete your Participant row on
-- every past Hangout in that cal, and the promise that "a past Hangout is a
-- record of who was there" (CONTEXT.md) would be false on the one path that
-- tests it.
--
-- The shield is one question, and the fact it asks about is already in the
-- database: **is this Friend still a Member of this cal?** Postgres runs a
-- referential action after the parent row is gone, so by the time this trigger
-- fires on a cascade from `membership`, the Membership row does not exist. An
-- ordinary erase always passes — you are still a Member. A departure never
-- does.
--
-- **The drop rule stays strict everywhere it was strict**, past Hangouts
-- included, for every erase that is an erase. A departure is simply not one,
-- and §4's trigger has already written the Left by the time this runs.
--
-- Two mechanisms were lost to this one. A transaction-local GUC set by the
-- leave path is a flag where a fact will do. Exempting Past Hangouts from the
-- drop outright changes what an ordinary erase of an old week does, which
-- nobody asked for and which v1 considered and accepted on purpose.
-- ---------------------------------------------------------------------------
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
    -- this Hangout, in this cal, and one of the Slots they just deleted **in
    -- that same cal** fell inside it.
    select distinct p.hangout_id, p.friend_id, p.cal_id, h.starts_at, h.ends_at
      from public.hangout_participant p
      join public.hangout h
        on h.id = p.hangout_id
      join erased e
        on e.friend_id = p.friend_id
       and e.cal_id    = p.cal_id
       and e.slot_start >= h.starts_at
       and e.slot_start <  h.ends_at
     where p.left_at is null
       -- Are you still a Member? An erase says yes; a departure says no. This
       -- is the whole of "leaving does not erase the cal's history".
       and exists (
         select 1
           from public.membership m
          where m.cal_id    = p.cal_id
            and m.friend_id = p.friend_id
       )
  ),
  uncovered as (
    -- Exact slot-set containment, against the post-delete table **in this
    -- Friend's cal**. `[)` — the last step is `ends_at - 30 minutes`, matching
    -- `tstzrange`'s default bound and the client's `slotStartsOf`.
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
           where a.cal_id    = s.cal_id
             and a.friend_id = s.friend_id
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
  'v1 ticket 07 §7''s strict drop, now per cal on both sides of the comparison. '
  'The membership `exists` is what makes a departure not an erase: leaving '
  'cascades your past Availability too, and without it the cascade would delete '
  'your name from the cal''s past Hangouts.';

-- Re-created so the file stands alone; the trigger is unchanged.
drop trigger if exists availability_drops_participants on public.availability;
create trigger availability_drops_participants
  after delete on public.availability
  referencing old table as erased
  for each statement
  execute function public.drop_participants_losing_coverage();

-- ---------------------------------------------------------------------------
-- 3. `retime_hangout` — ADR-0002's one narrow hole, one cal narrower.
--
-- The whole of `06-hangout-lifecycle.sql` §4 still applies and is not repeated:
-- why it is `security definer` in an exposed schema, why "may extend, never
-- shorten" is structural rather than a rule, why it takes three arguments
-- rather than the one ADR-0002 first specified, and what it deliberately does
-- not check. **Read §4 there before changing anything here.**
--
-- Two things change, and both are the same change.
--
-- **The Availability it writes gains a cal, derived from the stored Hangout
-- row.** Not from an argument. That is what keeps ADR-0003 condition 1 true for
-- this function under the new schema: the caller says *when*, never *who* and
-- now never *where*. ADR-0002's own amendment anticipated it — "deriving which
-- Group from the same row keeps the hole exactly as narrow" — and it needs no
-- further amendment for the same reason.
--
-- **`on conflict` names the new key.** `(friend_id, slot_start)` stopped
-- matching a unique constraint the moment `09-per-cal.sql` widened the key, so
-- without this the retime fails outright with `42P10`. The idempotence is still
-- the table's rather than this function's to remember.
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
   * Parameters qualified by the function's own name rather than renamed with a
   * prefix: the client sends these names as JSON keys, so the ambiguity is
   * resolved here instead of in every caller.
   *
   * `edited_by` is set from `auth.uid()`, which reads the JWT claim rather than
   * the role, so it is still the calling Friend in here even though the
   * statement runs as the owner. `edited_at` is not set here — §1's trigger
   * stamps it, and the same trigger is what keeps `created_by` and now `cal_id`
   * from moving underneath this statement.
   *
   * No `cal_id` in the `where`. The Hangout is addressed by its own primary
   * key, and a Friend who cannot see it cannot have its id — `hangout`'s select
   * policy is cal-scoped, and this function derives every effect from the row
   * it read rather than from what the caller claims about it.
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
     * explain the failure, so the client turns this into "this hangout was
     * cancelled".
     */
    raise exception 'hangout % no longer exists', retime_hangout.hangout_id
      using errcode = 'no_data_found';
  end if;

  /*
   * The extension. Every current Participant, every Slot of the NEW range, **in
   * the Hangout's own cal** — all three read off `moved`, i.e. the row as it now
   * stands, so the range written and the range stored cannot disagree, and
   * neither can the cal.
   *
   * Ticket 08 §2's consequence is held rather than mitigated: moving Pizza from
   * Saturday to Tuesday writes Tuesday Availability for Friends who never
   * mentioned Tuesday. What the product owes them instead of a restriction is
   * the dialog that names whose calendars this will write to before it runs.
   */
  insert into public.availability (cal_id, friend_id, slot_start)
  select moved.cal_id, p.friend_id, g.slot
    from public.hangout_participant p
   cross join pg_catalog.generate_series(
                moved.starts_at,
                moved.ends_at - interval '30 minutes',
                interval '30 minutes'
              ) as g(slot)
   where p.hangout_id = moved.id
     and p.left_at is null
      on conflict (cal_id, friend_id, slot_start) do nothing;

  return moved;
end;
$$;

-- `execute` is granted to `public` by default on a new function, and
-- `create or replace` re-grants it, so this revoke is not belt-and-braces — it
-- is the only thing standing between `anon` and this.
revoke all on function public.retime_hangout(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;

grant execute on function public.retime_hangout(uuid, timestamptz, timestamptz)
  to authenticated;

comment on function public.retime_hangout(uuid, timestamptz, timestamptz) is
  'ADR-0002''s one narrow hole, now per cal. Moves the Hangout and extends every '
  'current Participant to cover the new range, in the Hangout''s own cal, in one '
  'transaction. Insert-only, so "may extend, never shorten" is structural. See '
  '06-hangout-lifecycle.sql §4 for the security definer judgement.';

-- ---------------------------------------------------------------------------
-- 4. LEAVING WRITES **LEFT**, AND A CASCADE CANNOT.
--
-- Leaving a cal is still a plain `delete` on `membership`
-- (`08-cal-and-membership.sql` §5), and the cascade does most of it: your
-- Availability in that cal goes, and §2's predicate keeps the drop trigger off
-- your history. What a cascade cannot do is **write a marker**, and a marker is
-- what leaving owes the cal's future plans.
--
-- ## Left, not dropped, and the difference only shows up on the rejoin
--
-- Dropped is *no row*, and no row is indistinguishable from never having
-- joined — which is the state that gets **re-offered**. Leave the cal, rejoin
-- by Code next month, draw a Saturday, and the sidebar cheerfully offers you
-- back onto the plan you walked out of. Left is sticky, outranks Availability
-- permanently (CONTEXT.md), and is never re-offered. That is the entire
-- difference and it is on exactly the path nobody would have tested.
--
-- One Left, not two: a more final leaving-the-cal flavour would need a column
-- to distinguish it, and to everyone else reading the Hangout the two are the
-- same fact — Marco isn't coming.
--
-- ## Future only. The past keeps you as a plain Participant
--
-- `h.ends_at > now()`. Marking past Hangouts Left is the tidy implementation
-- and it rewrites history into a lie: it says you walked out of a dinner you
-- ate. The drop rule answers *are you still coming*, and the past does not
-- accept the question.
--
-- ## Why a trigger, and why the audited set is still three
--
-- The client alternative is two statements with no transaction around them: a
-- dead tab between them leaves you a Member marked Left on everything, which is
-- the one outcome nobody would think to look for. A `leave_cal(cal_id)` RPC
-- buys the same atomicity and spends
-- [ADR-0003](../docs/adr/0003-exposed-security-definer-rpcs.md)'s set-of-three,
-- which is the property the ADR keeps so the set can be audited as a set. A
-- trigger function costs none of it: it is reached by the referential machinery
-- rather than by `supabase.rpc()`, the same distinction
-- `06-hangout-lifecycle.sql` §3 draws for the drop trigger. ADR-0003 carries an
-- amendment saying so.
--
-- ## `before`, and it must return `old`
--
-- `before delete` rather than `after`, so the Left is written while the
-- Membership row still exists and before anything the delete sets off. **A
-- `before delete` trigger that returns null cancels the delete**, so the
-- `return old` at the bottom is not ceremony — without it, leaving a cal
-- silently does nothing at all and the row is still there on the next read.
--
-- The sequence the whole act resolves into, because three triggers fire and the
-- order is the proof:
--
--   1. this trigger marks you **Left** on the cal's future Hangouts. Rows
--      already Left are skipped; Hangouts you are not on have no row and gain
--      none; past ones are untouched.
--   2. that `update` fires `hangout_participant_autocancels`, so a future
--      Hangout you were **alone** on is cancelled — by the rule that already
--      exists rather than by a new one, and with past ones already exempt
--      there.
--   3. the `membership` row is deleted.
--   4. `availability` cascades: every Slot you held in that cal, past and
--      future.
--   5. `drop_participants_losing_coverage` fires and skips everything, because
--      §2's predicate finds no Membership.
--
-- RLS never enters it. Referential actions and trigger functions do not run as
-- the caller.
-- ---------------------------------------------------------------------------
create or replace function public.mark_left_on_leaving_cal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.hangout_participant p
     set left_at = now()
    from public.hangout h
   where h.id          = p.hangout_id
     and p.cal_id      = old.cal_id
     and p.friend_id   = old.friend_id
     and p.left_at is null
     and h.ends_at     > now();

  return old;
end;
$$;

-- `security definer` because it writes **other Hangouts' rows** on behalf of
-- whoever is leaving, and because the update grant on that table is
-- column-scoped to `left_at` under a policy that admits only your own row —
-- which this statement satisfies, but only by accident of who is leaving. It is
-- an implementation detail of the trigger, not an RPC, so it is revoked from
-- every browser role.
revoke all on function public.mark_left_on_leaving_cal() from public, anon, authenticated;

comment on function public.mark_left_on_leaving_cal() is
  'Leaving a cal marks the leaver Left on its FUTURE Hangouts and leaves past '
  'ones holding their name. A cascade cannot write a marker, and Left rather '
  'than dropped is what stops the rejoin from re-offering the plan they walked '
  'out of.';

drop trigger if exists membership_marks_left on public.membership;
create trigger membership_marks_left
  before delete on public.membership
  for each row
  execute function public.mark_left_on_leaving_cal();

-- ---------------------------------------------------------------------------
-- Deliberately NOT changed, and each one was checked rather than skipped.
--
--   * **`cancel_empty_hangouts(uuid[])`** takes Hangout ids and deletes by
--     primary key. A cal would add nothing: the ids it is handed came from rows
--     the callers already scoped. Its Past exemption (`ends_at > now()`) is
--     unchanged and is what makes §4's step 2 safe.
--
--   * **`autocancel_after_leaving()`** reads a transition table of
--     `hangout_participant` rows and passes their ids along. Same reason.
--
--   * **`handle_new_user()`** (`01-friend.sql`) still makes a blank `friend`
--     row and nothing else. A new account belongs to no cal, and `/` is the
--     join-or-create page — putting a signup into a cal from a trigger would be
--     the Code deciding nothing.
--
--   * **Anything about Realtime.** `11-realtime-per-cal.sql`, which is the last
--     file of this slice and has to land before the client deploys.
-- ---------------------------------------------------------------------------
