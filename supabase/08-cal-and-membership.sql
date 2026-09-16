-- friens-cal — groups issue 01, file 1 of 4: the `cal`, Membership, and the two
-- RPCs that get a Friend into one
--
-- Paste this whole file into the Supabase SQL Editor and run it once. It is
-- idempotent — `create schema if not exists`, `create table if not exists`,
-- `create or replace function`, and every policy is dropped before it is
-- created.
--
-- **Run it BEFORE `09-per-cal.sql`, and it is safe to run early.** Nothing here
-- touches a shipped table, so the deployed client cannot notice it: it adds two
-- tables nothing queries yet and two functions nothing calls yet. File 09 is
-- the one that starts the outage, and it needs `cal` and `membership` to exist
-- before it can backfill into them.
--
-- **This whole slice is a human-run slice.** Nothing in the repo can reach the
-- project with DDL rights and that is by design — `.env` holds the publishable
-- key only (ADR-0001), which is enough to read and write rows under RLS and
-- nowhere near enough to create a schema.
--
-- What it does:
--   1. `private`, the schema that is NOT exposed, and why the one policy helper
--      every policy in the product now reads through has to live in it
--   2. `public.cal` — a named shared calendar with a Code
--   3. `public.membership` — who is in it, and the two traps that look like
--      hardening
--   4. the one policy helper `private.my_cal_ids()`, after the table it reads
--   5. the grants and policies on both
--   6. `private.new_cal_code()` — the Code alphabet, in one place
--   7. `create_cal(name)` and `join_cal(code)`, with ADR-0003's reasoning
--      beside each, which its condition 4 requires
--
-- Vocabulary note (CONTEXT.md): the domain term is **Group**, the identifier is
-- `cal`, and the UI string is "friens cal". `group` is a fully reserved word in
-- Postgres, so the domain term cannot be the identifier without quoting every
-- reference (groups ticket 04 §1).
--
-- Rehearse the whole sequence locally before it is pasted anywhere real:
-- `supabase/README.md`.

-- ---------------------------------------------------------------------------
-- 1. THE `private` SCHEMA, AND THE ONE HELPER.
--
-- ## Why a helper at all: the recursion
--
-- Every read in the product is about to become "the cals I am in". Written
-- inline, `membership`'s own select policy would have to read `membership`, and
-- Postgres raises `42P17 infinite recursion detected in policy for relation`
-- rather than resolving it. Supabase's RLS guide has a section called "Avoid
-- recursive policies" whose rejected example is this table pair exactly, and
-- the way out is a `security definer` function: a policy expression is ordinary
-- SQL run as the caller, so only a function running as somebody else can read
-- the table the policy is defending.
--
-- ## Why `private` and not `public`
--
-- The guide's blanket caution is "never create a `security definer` function in
-- a schema listed under Exposed schemas". `private` is not one, so this helper
-- is simply unreachable over the Data API and the caution does not apply. That
-- is the whole of it for helpers. It is NOT cover for the two RPCs in §7, which
-- are browser-callable on purpose and answer to ADR-0003 instead.
--
-- **Do not add `private` to the project's Exposed schemas** (Settings → API).
-- That setting is what makes this paragraph true, and it is not a grant, so
-- nothing in this file can defend it.
--
-- ## Why it takes no arguments and returns a set
--
-- `is_member_of(cal_id)` is the shape everybody reaches for first and it
-- defeats the optimisation it would need. `(select …)` around a function call
-- lets Postgres run it as an initPlan once per statement — but only if the
-- result does not depend on the row, and a boolean helper fed the row's own
-- `cal_id` does. `cal_id in (select private.my_cal_ids())` is evaluated once
-- per statement whatever the row count.
--
-- `stable` for the same reason from Postgres's side: it is what allows the
-- optimizer to collapse multiple calls into one.
--
-- **The function itself is §4, after the table it reads.** A `language sql`
-- body is parsed and resolved at creation time, so a helper written here would
-- fail with "relation public.membership does not exist". The schema and its
-- grants can land now; the function cannot.
-- ---------------------------------------------------------------------------
create schema if not exists private;

-- Belt-and-braces. A new schema grants nothing to PUBLIC by default, unlike
-- `public` itself, so this removes nothing today. It is here so that a project
-- setting or a future `grant` cannot quietly hand `anon` a door into a schema
-- whose whole job is to be unreachable.
revoke all on schema private from public, anon;

-- The caller needs `usage` on the schema and `execute` on the function, because
-- a policy expression runs as the querying role — not as the policy's author.
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- 2. THE CAL.
--
-- A named shared calendar, and the boundary around everything drawn on it
-- (CONTEXT.md). There are many; a Friend may be in several.
--
-- **No `time_zone` column, and its absence is a decision.** Groups ticket 04
-- §11 specified one, validated against `pg_timezone_names`, deliberately unread
-- so that "whose zone does the grid draw" stayed open. Ticket 08 then answered
-- it — **per viewer**, from the live device — and went looking for a reader for
-- this column. There is none. A canonical cal time nobody's grid draws is a
-- third clock, and a reader could not tell whether `Sat 20:00` was the sender's
-- frame or the cal's. The column is not created, and `create_cal` keeps the one
-- argument ADR-0003 gave it.
--
-- **No provenance column either**, unlike `hangout`, and for a reason that is
-- the mirror of `06-hangout-lifecycle.sql` §1's. That column exists because
-- flat trust plus no notifications leaves *who moved this* unanswerable by
-- anything but a column. Who made a cal is answerable already: it is the Member
-- with the earliest `joined_at`. And CONTEXT.md is explicit that "no Member
-- outranks another", so a `created_by` on this table would be the first hint of
-- an ownership model the domain has refused.
--
-- **A cal is never deleted.** No `delete` grant, no `delete` policy, and
-- nothing in the product reaches for one: a cal nobody is left in persists, and
-- its Code still works (CONTEXT.md).
-- ---------------------------------------------------------------------------
create table if not exists public.cal (
  id         uuid primary key default gen_random_uuid(),

  -- Renamable by every Member, so the constraint is the only thing that keeps
  -- a blank one out. Deliberately checked on `btrim(name)` rather than
  -- requiring `name = btrim(name)`: a rename that arrives with a trailing space
  -- is not a mistake worth a `23514` in somebody's face, and an empty name is.
  name       text not null
             constraint cal_has_a_name
             check (length(btrim(name)) between 1 and 60),

  -- **The Code, and the alphabet as a constraint rather than as a convention.**
  -- Six characters, uppercase, from the thirty in `private.new_cal_code()`.
  -- Spelled out here as well because this is the half that holds for whatever
  -- writes the row, including a hand-typed `insert` in the SQL Editor.
  --
  -- `unique` is what `create_cal` retries against. It is the collision
  -- detector, not a hope.
  code       text not null unique
             constraint cal_code_is_six_from_the_alphabet
             check (code ~ '^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$'),

  created_at timestamptz not null default now()
);

comment on table public.cal is
  'A Group: a named shared calendar, and the boundary around everything drawn '
  'on it. Named `cal` rather than `group` because `group` is a fully reserved '
  'word in Postgres. Never deleted — no delete grant and no delete policy.';

comment on column public.cal.code is
  'The six characters that let a Friend in. An address, not a secret '
  '(CONTEXT.md): every Member sees it, every Member is expected to share it, '
  'and it never changes.';

-- ---------------------------------------------------------------------------
-- 3. MEMBERSHIP.
--
-- Three columns, and identity is not one of them. A Friend is one person
-- everywhere (CONTEXT.md) — their name, face and colour live on `friend` and do
-- not vary from cal to cal — so nothing belongs per-Membership.
--
-- **Leaving is a hard delete, not a `left_at`.** Nothing in the product asks
-- whether somebody was ever in a cal, and a nullable column here would put
-- `where left_at is null` inside the one object every policy in the product
-- reads through, permanently, to answer a question nobody has. The Hangouts
-- they were on keep their name regardless — see `10-lifecycle-per-cal.sql`,
-- which is where leaving actually happens.
-- ---------------------------------------------------------------------------
create table if not exists public.membership (
  cal_id    uuid not null references public.cal (id)    on delete cascade,
  friend_id uuid not null references public.friend (id) on delete cascade,
  joined_at timestamptz not null default now(),

  primary key (cal_id, friend_id)
);

comment on table public.membership is
  'A Friend in a Group. Entered by Code and left voluntarily; nobody can be '
  'removed by anyone else and no Member outranks another. The hottest object '
  'in the schema — private.my_cal_ids() reads it, so every policy in the '
  'product depends on it.';

-- The leading-column trap, for the third time in this schema (v1 ticket 07
-- §11), and this time it sits inside every policy in the product. The key
-- indexes `(cal_id, friend_id)`, so it answers "who is in this cal" and says
-- nothing about "which cals is this Friend in" — which is the only question
-- `private.my_cal_ids()` ever asks. Supabase's own RLS guide uses this exact
-- table as its worked example of the mistake.
create index if not exists membership_friend_id_idx
  on public.membership (friend_id);

-- ---------------------------------------------------------------------------
-- 4. THE HELPER — §1's shape, here because it reads the table above.
-- ---------------------------------------------------------------------------
create or replace function private.my_cal_ids()
returns setof uuid
language sql
security definer
set search_path = ''
stable
as $$
  select m.cal_id
    from public.membership m
   where m.friend_id = (select auth.uid())
$$;

-- `execute` is handed to PUBLIC twice over on a new function — once by
-- Postgres's own default and once by Supabase's — so this revoke is the only
-- thing standing between `anon` and the membership table.
revoke all on function private.my_cal_ids() from public, anon;
grant execute on function private.my_cal_ids() to authenticated;

comment on function private.my_cal_ids() is
  'The cals the calling Friend is a Member of. The one policy helper in the '
  'schema: every cal-scoped read in the product is cal_id in (select '
  'private.my_cal_ids()). No arguments, so the optimizer can evaluate it once '
  'per statement rather than once per row.';

-- ---------------------------------------------------------------------------
-- **TRAP 1, and it is in this file because this is where it would be
-- introduced.** This function only skips RLS because its owner can. On Supabase
-- the SQL Editor runs as `postgres`, which holds `bypassrls`; a function owned
-- by a role without it evaluates `membership`'s policy again and is recursive
-- after all. So: **paste this file into the SQL Editor**, do not run it through
-- a migration tool connecting as some other role, and do not `alter function …
-- owner to` anything.
--
-- The symptom of getting it wrong is not a subtle one. Every read in the
-- product fails with `42P17`.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 5. LOCK 1 (grants) and LOCK 2 (RLS), on both tables.
--
-- The project has "Automatically expose new tables" OFF, so neither table is
-- reachable until granted. If a query that looks obviously correct comes back
-- permission-denied, this is the first thing to check — that is the lock
-- working, not a bug (ADR-0001).
-- ---------------------------------------------------------------------------
revoke all on table public.cal from public, anon, authenticated;

-- `select` and a COLUMN-SCOPED `update (name)`, and nothing else.
--
-- No `insert`: `create_cal` is the only legitimate creator, the same instinct
-- as `friend` withholding `insert` because its trigger is the only one
-- (`01-friend.sql` §3). No `delete`, ever — the out-of-scope decision that a
-- cal is never deleted, made structural rather than written down.
--
-- The update grant is scoped to `name` so `id`, `code` and `created_at` are not
-- writable from the browser at all, and RLS never has to defend them. **The
-- Code never changes** (CONTEXT.md) and this is what makes that true.
grant select on table public.cal to authenticated;
grant update (name) on table public.cal to authenticated;

alter table public.cal enable row level security;

-- You see the cals you are in, and no others. This is the read that makes
-- `join_cal` an RPC rather than a query: a Friend cannot resolve a Code for a
-- cal they are not in yet, because this policy hides the row the Code is on.
drop policy if exists "a Friend reads the cals they are in" on public.cal;
create policy "a Friend reads the cals they are in"
  on public.cal for select
  to authenticated
  using (id in (select private.my_cal_ids()));

-- Renaming is open to every Member equally (CONTEXT.md). `with check` as well
-- as `using`, so a rename cannot move the row to a cal you are in from one you
-- are not — the trap ADR-0002's refinement flags: `using` admits the row on the
-- way out and says nothing about the row on the way in.
drop policy if exists "any Member renames their cal" on public.cal;
create policy "any Member renames their cal"
  on public.cal for update
  to authenticated
  using (id in (select private.my_cal_ids()))
  with check (id in (select private.my_cal_ids()));

revoke all on table public.membership from public, anon, authenticated;

-- `select` and `delete`. No `insert` — `create_cal` and `join_cal` are its only
-- legitimate creators, and a browser-side insert would make the Code
-- unnecessary, which is the entire gate. No `update` — there is nothing on the
-- row to change.
grant select, delete on table public.membership to authenticated;

alter table public.membership enable row level security;

-- ---------------------------------------------------------------------------
-- **TRAP 2. Never add `force row level security` to this table.**
--
-- It reads like the hardening every other table got and it is the opposite. A
-- `security definer` function skips RLS only when its owner may, and forcing
-- RLS removes that exemption *from the owner as well*. `private.my_cal_ids()`
-- would then evaluate this table's policy, which calls `private.my_cal_ids()`,
-- and the recursion §1 exists to avoid is back — from a line that looks like
-- somebody tightening a screw.
--
-- `07-allowlist.sql` carries the same warning for the same mechanism, one table
-- over. This is the second time in this schema that `force row level security`
-- would break the product, and both times it would look like an improvement.
-- ---------------------------------------------------------------------------

-- You see the Members of your own cals, which is what the roster reads. Note
-- the shape: the helper reads this table through the owner's exemption, so this
-- policy never evaluates itself.
drop policy if exists "a Member reads their cals' Members" on public.membership;
create policy "a Member reads their cals' Members"
  on public.membership for select
  to authenticated
  using (cal_id in (select private.my_cal_ids()));

-- **Leaving, and it is a plain `delete`.** ADR-0003's audited set of exposed
-- `security definer` functions stays at exactly three because of this line: a
-- `leave_cal(cal_id)` RPC would buy nothing this policy cannot express. Nobody
-- can be removed by anyone else (CONTEXT.md), which is the whole of `using`.
--
-- What the delete drags with it is not nothing — `availability` cascades from
-- here (`09-per-cal.sql`) and a trigger marks the leaver Left on the cal's
-- future Hangouts (`10-lifecycle-per-cal.sql`). Both are consequences of this
-- one statement, which is why leaving needs no transaction of its own.
drop policy if exists "a Friend leaves a cal themselves" on public.membership;
create policy "a Friend leaves a cal themselves"
  on public.membership for delete
  to authenticated
  using (friend_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 6. THE CODE ALPHABET, IN ONE PLACE.
--
-- Thirty characters: `2-9` and `A-Z`, with `0 O 1 I L U` removed. Thirty to the
-- sixth is 729 million, which is the number groups ticket 11 §6 accepted the
-- brute-force risk against.
--
-- The removals are the characters a person gets wrong reading a Code off one
-- screen and typing it into another — `0`/`O` and `1`/`I`/`L` — plus `U`, which
-- follows Crockford's base32 in keeping six random characters from spelling
-- something the reader has to say out loud.
--
-- **Generation lives here rather than in a column `default`**, because a
-- `default` cannot retry itself on a unique violation and this string collides
-- by design of the birthday problem rather than by accident. `create_cal` §7
-- wraps this in the retry. `09-per-cal.sql` calls it once, for the Code of the
-- cal every existing Friend is about to be backfilled into.
--
-- `random()` rather than a CSPRNG, deliberately. CONTEXT.md: the Code "is an
-- address, not a secret", the Code alone admits nobody to the product (the
-- allowlist does that), and a successful guess appears in a roster with a name
-- and a face. If that ever stops being true, `gen_random_bytes()` from pgcrypto
-- is the swap, and it is a swap of one expression.
--
-- Not in `public`: nothing may call this over the Data API. Minting Codes is
-- `create_cal`'s job, and a browser-callable generator would be a way to burn
-- through the space looking for what it produces.
-- ---------------------------------------------------------------------------
create or replace function private.new_cal_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(
           substr(
             '23456789ABCDEFGHJKMNPQRSTVWXYZ',
             1 + floor(random() * 30)::int,
             1
           ),
           ''
         )
    from pg_catalog.generate_series(1, 6)
$$;

revoke all on function private.new_cal_code() from public, anon, authenticated;

comment on function private.new_cal_code() is
  'One candidate Code: six characters from the thirty-character alphabet. A '
  'candidate, not a Code — the unique index on cal.code is what makes it one, '
  'and create_cal is what retries when it does not.';

-- ---------------------------------------------------------------------------
-- 7. THE TWO EXPOSED RPCs, AND ADR-0003'S REASONING BESIDE THEM.
--
-- **ADR-0003 condition 4 is why this comment exists**: the reasoning lives in
-- the migration beside the function, so the next reader does not "fix" it.
--
-- Supabase's RLS guide says, without qualification, *"never create a
-- `security definer` function in a schema listed under Exposed schemas"* — and
-- `supabase.rpc()` can only call functions in exactly such a schema. Both
-- functions below are therefore holes cut deliberately through the only
-- security layer this project has, and ADR-0003 is the rule they answer to.
-- All four of its conditions, and how each one is met here:
--
--   1. **The caller can never name another Friend.** Neither function takes a
--      `friend_id`. `create_cal` makes `auth.uid()` the first Member;
--      `join_cal` joins `auth.uid()`. The arguments say *what* and *where*,
--      never *who*. This is the load-bearing condition and it is readable off
--      the signature.
--   2. **Each does one thing, bounded by the rows it read.** `create_cal`
--      writes one `cal` and one `membership`. `join_cal` reads one `cal` by its
--      Code and writes one `membership` for it.
--   3. **`set search_path = ''`, schema-qualified throughout, `revoke execute`
--      from `public` and `anon`, `grant execute` to `authenticated` alone.**
--      Spelled out under each function.
--   4. This comment.
--
-- Supabase's database linter will flag both as
-- `0029_authenticated_security_definer_function_executable`. That rule's own
-- third resolution is "keep both — intentional", with "create my profile" as
-- its example, and it attaches a condition: such a function is "effectively a
-- public API endpoint to anyone who can sign up". Here that population is
-- people a Friend vouched for by name, because holding an account at all
-- requires an Invite (`07-allowlist.sql`). Suppress each finding against
-- ADR-0003 rather than leaving two standing advisories that train everybody to
-- ignore the advisor.
--
-- **This remains a recorded judgement, not a documented carve-out.** The RLS
-- guide's "never" is unamended.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- `create_cal(name)` — two inserts that must not come apart.
--
-- A `cal` row and the creator's Membership. Split across two statements, a
-- failure of the second orphans a cal **nobody is in and nobody can ever
-- reach**: you cannot join it without its Code, and you cannot read its Code
-- because `cal`'s select policy is membership-scoped. Those rows are
-- unrecoverable from anywhere but the SQL Editor. PostgREST cannot span two
-- statements and this project has no server (ADR-0001), so the transaction has
-- to be the function.
--
-- **The retry, and why it is a block rather than a loop over a `select`.**
-- Checking whether a Code is taken and then inserting it is a race with a
-- window in it. Inserting and catching `unique_violation` has no window: the
-- index is the arbiter. A `begin … exception` block is a subtransaction, which
-- is the cost, and at one collision in millions it is paid never.
--
-- Ten attempts and then the error propagates. Not infinite: if the alphabet or
-- the generator is broken, a loop that never exits is a connection held open
-- forever, and an honest `23505` is a better failure than a hung request.
-- ---------------------------------------------------------------------------
create or replace function public.create_cal(name text)
returns public.cal
language plpgsql
security definer
set search_path = ''
as $$
declare
  made    public.cal;
  caller  uuid := (select auth.uid());
  attempt integer := 0;
begin
  /*
   * Unreachable through `grant execute to authenticated`, which is the point of
   * saying it out loud: this function must never be the thing that decides who
   * the caller is by trusting an argument. If `auth.uid()` is null there is no
   * Friend to make a Member, and the honest answer is a refusal.
   */
  if caller is null then
    raise exception 'create_cal needs a signed-in Friend'
      using errcode = 'insufficient_privilege';
  end if;

  /*
   * The parameter is qualified by the function's own name rather than renamed
   * with a prefix — `p_name` would work and would leak into the API, since the
   * client sends these names as JSON keys. `06-hangout-lifecycle.sql` §4 made
   * the same call for the same reason.
   *
   * `btrim` here and a `length(btrim(name))` check on the column: the check
   * refuses the empty name, and this stores the tidy one.
   */
  loop
    attempt := attempt + 1;
    begin
      insert into public.cal (name, code)
      values (btrim(create_cal.name), private.new_cal_code())
      returning * into made;
      exit;
    exception when unique_violation then
      -- `cal` has exactly one unique constraint, on `code`, so this cannot be
      -- catching anything else. If a second one is ever added, this block stops
      -- being unambiguous and wants an `if sqlerrm like …` or a savepoint per
      -- constraint.
      if attempt >= 10 then
        raise;
      end if;
    end;
  end loop;

  insert into public.membership (cal_id, friend_id)
  values (made.id, caller);

  return made;
end;
$$;

-- The three-part lock ADR-0003 condition 3 names. `execute` is granted to
-- PUBLIC by default on a new function, so the revoke is not belt-and-braces —
-- it is the only thing standing between `anon` and this.
revoke all on function public.create_cal(text) from public, anon, authenticated;
grant execute on function public.create_cal(text) to authenticated;

comment on function public.create_cal(text) is
  'Makes a cal and puts the caller in it, in one transaction — split in two, a '
  'failed second insert orphans a cal nobody can reach or delete. Generates the '
  'Code with retry on collision, which a column default cannot do. See §7 for '
  'ADR-0003''s reasoning before changing anything here.';

-- ---------------------------------------------------------------------------
-- `join_cal(code)` — the new category, and the reason ADR-0003 exists at all.
--
-- `retime_hangout` is callable meaningfully only by somebody who can already
-- see the Hangout. **This is callable by anyone holding an account, against a
-- cal they cannot see, and its entire purpose is to grant access.** That is why
-- the older judgement in `06-hangout-lifecycle.sql` §4 could not simply be
-- extended to cover it.
--
-- **Joining is immediate — no preview, no confirm step.** A call that resolved
-- a Code and returned the cal's name *without* joining would be a pure
-- enumeration oracle: somebody could probe Codes and learn what exists while
-- leaving no trace. Immediate join has no such gap. Guessing right puts you in
-- a roster five friends look at, so there is no quiet win.
--
-- **Idempotent, on purpose.** A Code for a cal you are already in is not an
-- error: `on conflict do nothing`, return the row, and the client routes there
-- as if it had been picked from the list. A double-submit or a retry on a flaky
-- connection is then harmless.
--
-- **A Code matching nothing raises.** It is the honest PostgREST shape and
-- needs no sentinel, and §4's argument is why there is no oracle to protect
-- here. The client replaces the message, as the signup screen already does.
-- ---------------------------------------------------------------------------
create or replace function public.join_cal(code text)
returns public.cal
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.cal;
  caller uuid := (select auth.uid());
begin
  if caller is null then
    raise exception 'join_cal needs a signed-in Friend'
      using errcode = 'insufficient_privilege';
  end if;

  /*
   * `upper(btrim(…))` because the client's input accepts both cases on purpose.
   * The Code field's `pattern` is `^[A-Za-z0-9]*$`, deliberately wider than the
   * thirty characters above, so that it can never reject a keystroke this
   * function would have accepted — which makes normalising here the only place
   * the two alphabets have to agree.
   *
   * Not named `found`: that is plpgsql's own boolean, and shadowing it would
   * break the `if target is null` below in a way that reads as correct.
   */
  select c.* into target
    from public.cal c
   where c.code = upper(btrim(join_cal.code));

  if target is null then
    raise exception 'no cal with that code'
      using errcode = 'no_data_found';
  end if;

  insert into public.membership (cal_id, friend_id)
  values (target.id, caller)
  on conflict (cal_id, friend_id) do nothing;

  return target;
end;
$$;

revoke all on function public.join_cal(text) from public, anon, authenticated;
grant execute on function public.join_cal(text) to authenticated;

comment on function public.join_cal(text) is
  'Resolves a Code and makes the caller a Member, in one call. Exposed and '
  'security definer because cal reads are membership-scoped, so a Friend cannot '
  'look up a cal they are not in yet. Idempotent; a bad Code raises. See §7 for '
  'ADR-0003''s reasoning before changing anything here.';

-- ---------------------------------------------------------------------------
-- Deliberately NOT here.
--
--   * **`cal_id` on anything.** `09-per-cal.sql` is the file that starts the
--     outage, and the backfill and the `not null` that depends on it must not
--     be in different files.
--   * **Leaving's Left marker.** A `before delete on membership` trigger writes
--     it, and it lives in `10-lifecycle-per-cal.sql` beside the two lifecycle
--     functions it has to agree with.
--   * **Anything about Realtime.** `11-realtime-per-cal.sql`. Note that
--     `membership` is not published and gains no broadcast trigger here; the
--     roster's `cal:<id>:members` topic is a later slice's file
--     (`12-cal-members-topic.sql`), and nothing joins that topic until it ships.
--
-- Then paste `09-per-cal.sql`. **That is the one that begins the outage** — the
-- deployed client's every draw and Join fails from the moment
-- `availability`'s key widens.
-- ---------------------------------------------------------------------------
