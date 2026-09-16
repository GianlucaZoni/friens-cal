-- friens-cal, groups issue 06: inviting a Friend, which is a grant and a
-- policy rather than a function
--
-- Paste this whole file into the Supabase SQL Editor and run it once. It is
-- idempotent: `add column if not exists`, `create or replace function`, and the
-- check constraint, the policy and the trigger are each dropped before they are
-- created.
--
-- It needs `01-friend.sql` and `07-allowlist.sql` and nothing else. It is NOT
-- part of the `08`-`11` cutover, does not need the outage, and can be run
-- before or after it.
--
-- **Run §2's first query before you run the file.** Tightening the check
-- constraint validates every row already in the table, so an address stored
-- with a capital or a trailing space stops this file halfway through instead of
-- being cleaned up by it.
--
-- What it does:
--   1. `allowlist.invited_by`, who vouched, and null for the rows seeded by
--      hand
--   2. the check constraint tightens to `email = lower(btrim(email))`
--   3. `grant insert … to authenticated`, which contradicts `07-allowlist.sql`
--      on purpose, and the reasoning ADR-0003 condition 4 requires beside it
--   4. the one policy: you may invite, and only in your own name
--   5. the trigger that makes inviting somebody twice silent, which the design
--      expected `on conflict do nothing` to do and which it cannot
--   6. what is still shut, and how to read the table back
--
-- Designed in groups issue 07 and recorded in the issue-07 amendment to
-- [ADR-0003](../docs/adr/0003-exposed-security-definer-rpcs.md). Read that
-- amendment before changing anything here: the short version is that the
-- obvious `invite(email)` RPC was refused, not deferred.
--
-- Verify from a browser-shaped client, after running this:
--   node --env-file=.env scripts/verify-allowlist.mjs
--
-- Rehearse locally first: `supabase/README.md`.


-- ---------------------------------------------------------------------------
-- 1. WHO VOUCHED.
--
-- Groups ticket 01 promised this column and `07-allowlist.sql` never had it, so
-- it arrives now, two slices late. The rows seeded by hand predate it and carry
-- a null inviter for the rest of the project's life. Nothing reads the column
-- yet; it exists so that "who let this person in" has an answer at all, and the
-- SQL Editor is the only thing that can ask.
--
-- `on delete set null` rather than a cascade. Deleting a Friend's account must
-- not quietly withdraw somebody else's permission to hold one: the two facts are
-- unrelated, and an allowlist row that vanishes when its voucher leaves is a
-- door that closes behind a person who did nothing.
-- ---------------------------------------------------------------------------
alter table public.allowlist
  add column if not exists invited_by uuid references public.friend (id) on delete set null;

-- The default is a SEPARATE statement, and both halves of that matter.
--
-- Separate, because `add column … default …` backfills every existing row with
-- the default it evaluates at that moment. Added here instead, the rows already
-- in the table keep the null they were written with, whoever happens to be
-- running this file and whatever claims their session carries.
--
-- `auth.uid()` and not `(select auth.uid())`, which is what the design ticket
-- wrote. A DEFAULT expression may not contain a subquery; Postgres refuses it
-- outright. The `(select …)` wrapper is an RLS idiom, worth its parentheses in
-- §4's policy where it caches one initplan across every candidate row, and
-- simply invalid here.
--
-- What it buys is small and worth saying plainly: the browser sends the id
-- explicitly (see `src/identity/invite.ts`), so the policy in §4 is what
-- actually enforces this, and in the SQL Editor `auth.uid()` is null so a
-- hand-written insert records no voucher, exactly as the seeded rows do. The
-- default is here so that a later caller which omits the column writes a
-- correct row rather than collecting a `42501` it cannot read a reason out of.
alter table public.allowlist
  alter column invited_by set default auth.uid();

comment on column public.allowlist.invited_by is
  'The Friend who put this address on the list. Null for the rows seeded by '
  'hand before the column existed, and null for anything added from the SQL '
  'Editor, where auth.uid() is null.';


-- ---------------------------------------------------------------------------
-- 2. THE CONSTRAINT TIGHTENS, AND IT IS A BUG FIX.
--
-- `07-allowlist.sql` wrote `check (email = lower(email))` and explained, in the
-- same breath, that "a pasted address arrives with a capital or a trailing space
-- more often than not". The constraint catches the capital and lets the space
-- through. A stored `'bob@x.com '` is accepted here and then compared against a
-- `trim()`-ed candidate by the signup hook, so it matches nobody, ever, and the
-- Friend it belongs to is turned away by a message that by design does not
-- explain itself. That is the one failure `07-allowlist.sql` §1 says nobody
-- could debug from the outside, and it was reachable the whole time.
--
-- FIND ANY EXISTING OFFENDER FIRST. Adding a check constraint validates the
-- rows that are already there, so a single bad address aborts this file:
--
--   select email from public.allowlist where email <> lower(btrim(email));
--
-- Anything that comes back is a Friend who cannot sign up today. Fix it before
-- running this file, and their signup starts working as a side effect:
--
--   update public.allowlist set email = lower(btrim(email))
--    where email <> lower(btrim(email));
--
-- The name is kept. `allowlist_email_check` is what Postgres called the
-- unnamed column constraint in `07-allowlist.sql`, and a reader diffing the two
-- files should see one constraint replaced rather than two constraints
-- accumulating.
-- ---------------------------------------------------------------------------
alter table public.allowlist
  drop constraint if exists allowlist_email_check;

alter table public.allowlist
  add constraint allowlist_email_check check (email = lower(btrim(email)));


-- ---------------------------------------------------------------------------
-- 3. THE GRANT. READ THIS BEFORE YOU REVOKE IT.
--
-- `07-allowlist.sql` §1 says of this table: "no grants to `anon` or
-- `authenticated`, ever". The line below contradicts that sentence, on purpose,
-- and a reader who finds the grant without this comment will read it as a
-- mistake and be right to. ADR-0003 condition 4 is why the reasoning is here
-- rather than in a ticket.
--
-- **The invariant 07 was built on is about READS, and it is untouched.** Nothing
-- holding a publishable key can see a row in this table: `select` is still
-- revoked, there is still no select policy, and the table is still the one
-- banned from the `supabase_realtime` publication, because RLS is not applied to
-- DELETE events and publishing it would turn removing a row into a broadcast of
-- the address on it. Every argument in `07-allowlist.sql` survives word for
-- word. What changed is that a Friend now has a reason to WRITE here, and
-- writing is the half that never leaked anything.
--
-- **Why this is not a function.** `invite(email)` was the obvious shape and it
-- is the first proposal in this project to fail ADR-0003's condition 1 at the
-- centre rather than at the margin: the caller "can never name another Friend",
-- and an invite's only meaningful argument is a person's email address, which is
-- *who* and nothing else. There is no derivation from `auth.uid()` available,
-- because the entire point is to name somebody who has no account yet. The rule
-- was not widened. The function was not written, the audited set of exposed
-- `security definer` functions is still exactly three, and the identity is
-- asserted by §4's policy instead of trusted from an argument.
--
-- **One verb.** `select`, `update` and `delete` stay revoked and still have no
-- policies, so all three deny twice over. This table goes from no policies at
-- all to exactly one.
--
-- The grant is table-wide rather than column-scoped, which this project usually
-- avoids. The only column it opens that §4 does not pin is `added_at`, and a
-- client that writes a wrong one has lied about when it vouched for somebody,
-- to a column nothing reads.
--
-- WHAT IT COSTS, recorded rather than solved:
--
--   * Any Friend can write unlimited rows. There is no rate limit and nowhere
--     in a static SPA to put one. The population that can do it is five people
--     who already hold accounts, and the prize for stuffing the table is more
--     accounts that can read a roster of five names.
--   * A typo is a live door, not a mess. `friend` is `using (true)` for every
--     authenticated reader, kept that way deliberately because identity is
--     global, so an address admitted by mistake buys a stranger every display
--     name and blobatar seed in the product. That is the whole radius. It is
--     small, and it is not nothing. There is no delete from inside the app, so
--     the mitigation is the dialog's confirm step and the SQL Editor.
--
-- `force row level security` still stays off, for `07-allowlist.sql` §1's
-- reason and not this one: the signup hook is `security definer`, forcing RLS
-- would lock it out of the only table it reads, and every signup in the project
-- would be refused with a message that says nothing about why.
-- ---------------------------------------------------------------------------
grant insert on table public.allowlist to authenticated;


-- ---------------------------------------------------------------------------
-- 4. AND ONLY IN YOUR OWN NAME.
--
-- `with check` is the whole of it. Without the policy the grant would let a
-- Friend write any `invited_by` they liked, including null and including
-- somebody else's id, and the provenance §1 exists for would be worth nothing.
--
-- There is no `using` clause because there is nothing to read: an insert policy
-- has only a `with check`, which is the shape a table with no select path
-- wants.
-- ---------------------------------------------------------------------------
drop policy if exists "a Friend invites, in their own name" on public.allowlist;
create policy "a Friend invites, in their own name"
  on public.allowlist for insert
  to authenticated
  with check (invited_by = (select auth.uid()));


-- ---------------------------------------------------------------------------
-- 5. INVITING SOMEBODY TWICE HAS TO BE SILENT, AND `ON CONFLICT` CANNOT DO IT.
--
-- The design said the browser would write this as an upsert with
-- `on conflict do nothing`, on the stated grounds that DO NOTHING "needs only
-- INSERT privilege, so the grant stays one verb wide". **That is not true of the
-- statement PostgREST actually sends.** Measured on Postgres 17.6 and PostgREST
-- 16.2, as `authenticated` holding `insert` and nothing else:
--
--   insert … on conflict (email) do nothing   →  42501, "permission denied",
--                                                hinting GRANT SELECT
--   insert … on conflict do nothing           →  fine, 0 or 1 rows
--
-- A conflict target is an inference clause, and inferring an arbiter index
-- requires `select` on the columns it is inferred over. PostgREST emits a target
-- either way: `?on_conflict=email` uses that column, and omitting the parameter
-- makes it infer the primary key. Both are refused. The only upsert that would
-- work is the bare one, and there is no way to ask PostgREST for it.
--
-- So the choice was between granting `select` on a table of personal email
-- addresses, which is the one thing `07-allowlist.sql` exists to prevent, and a
-- plain insert whose duplicate comes back as `409 23505` while a new address
-- comes back as `201`. The second is the enumeration leak reopened at the
-- network layer: a Friend with the devtools network tab can ask, of any address
-- they care to type, whether that person is already one of us. Issue 07
-- anticipated exactly this ("if PostgREST distinguishes the two cases in any
-- header or status, the leak is back") without saying what to do about it.
--
-- **A `before insert` trigger does what the upsert was supposed to do.** It
-- returns null for an address already on the list, which skips the insert with
-- no error to distinguish, and it reads the table as its owner so the browser
-- still needs no `select`. Both cases are then one `201` with an empty body.
--
-- This is not a fourth exposed function and ADR-0003's audit is unchanged. Its
-- issue-10 amendment already draws the line: a trigger function "is not callable
-- over the Data API, it is reached by the referential machinery alone", so the
-- four conditions have nothing to say about it.
--
-- TWO CONSEQUENCES WORTH KNOWING BEFORE YOU MEET THEM:
--
--   * The trigger fires for every writer, the SQL Editor included. Re-inserting
--     an address that is already listed no longer raises `23505`; it does
--     nothing, quietly. The statement `07-allowlist.sql` §2 documents already
--     carried `on conflict (email) do nothing`, so that path is unchanged in
--     practice.
--   * A row that the trigger skips never reaches §4's `with check`, because
--     before-row triggers run first. Forging somebody else's `invited_by` on an
--     address that is ALREADY listed therefore comes back `201` rather than
--     `42501`. Nothing is written either way, and the sameness is the point.
--
-- The race is real and is accepted: two Friends inviting the same NEW address in
-- the same instant can both pass the `exists` and one will get `23505` from the
-- primary key. It needs two people typing one address within a few
-- milliseconds, and the second attempt succeeds silently.
--
-- The existing row keeps its original `note` and `invited_by`. The first
-- voucher keeps the provenance.
-- ---------------------------------------------------------------------------
create or replace function public.ignore_repeat_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.allowlist a where a.email = new.email) then
    -- Null from a before-row trigger abandons the insert for this row and
    -- reports success. That is the whole mechanism.
    return null;
  end if;

  return new;
end;
$$;

-- `security definer` for the one reason that matters: the `exists` above is a
-- read of `public.allowlist`, and every browser role is locked out of reading
-- that table. Running as the owner is what lets the check happen without
-- anybody being granted `select`. It is an implementation detail of the
-- trigger rather than an RPC, so it is revoked from every browser role, the
-- same way `handle_new_user` and `mark_left_on_leaving_cal` are.
revoke all on function public.ignore_repeat_invite() from public, anon, authenticated;

comment on function public.ignore_repeat_invite() is
  'Inviting an address that is already on the list does nothing and says so in '
  'exactly the words it uses for a new one. Without this the duplicate comes '
  'back as 409 23505 and answers, for any address anyone types, whether that '
  'person already has an account here.';

drop trigger if exists allowlist_ignores_repeats on public.allowlist;
create trigger allowlist_ignores_repeats
  before insert on public.allowlist
  for each row
  execute function public.ignore_repeat_invite();


-- ---------------------------------------------------------------------------
-- 6. WHAT IS STILL SHUT.
--
-- There is no invite list and no delete, from inside the app or anywhere else
-- reachable by a key in a bundle. The SQL Editor stays the only reader, and it
-- is the only place a mistyped address can be taken back off:
--
--   select email, note, invited_by, added_at from public.allowlist
--    order by added_at;
--
--   delete from public.allowlist where email = 'rob@gmail.com';
--
-- Deleting the row does NOT remove an account. `07-allowlist.sql` §2 has that
-- in full: the hook gates entry, not membership.
--
-- Check the locks from a browser-shaped client, which is the only check that
-- proves anything about what a publishable key can do:
--
--   node --env-file=.env scripts/verify-allowlist.mjs
-- ---------------------------------------------------------------------------
