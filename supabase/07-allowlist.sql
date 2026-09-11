-- friens-cal — issue 14: the allowlist, and the signup gate that reads it
--
-- Paste this whole file into the Supabase SQL Editor and run it once. It is
-- idempotent — `create table if not exists`, `create or replace function`, and
-- it seeds nothing, so re-running it cannot duplicate a row.
--
-- **Running this file is not the whole job.** The function below does nothing
-- at all until it is registered, which is a switch in the dashboard:
--
--   Authentication → Auth Hooks → "Before User Created"
--     → Postgres → schema `public` → `hook_restrict_signup_to_allowlist`
--
-- Until that switch is on, `signUp()` succeeds for ANY address. Nothing can
-- read a hook's registration back over the Data API, so the verification script
-- cannot check it for you — it can only find out the hard way, by creating an
-- account that neither it nor the app can delete. Register the hook, then run
-- the script. `scripts/setup-allowlist.sh` walks the whole sequence.
--
-- What it does:
--   1. `public.allowlist` — the addresses permitted to sign up, lower-cased,
--      with no browser access at all
--   2. how a Friend is added to it, which is the whole of this project's
--      membership administration
--   3. the `before-user-created` hook function that reads it
--   4. the grants that let only the Auth server call that function
--
-- Verify from a browser-shaped client, after running this AND registering it:
--   node --env-file=.env scripts/verify-allowlist.mjs
--
-- NAMING, because issue 14 had to choose. The table is `allowlist`, not the
-- research document's `signup_allowlist`. Everything already shipped calls it
-- `allowlist`: `03-realtime.sql` and `05-hangout.sql` both name it in prose as
-- the one table that must never be published, `verify-realtime.mjs` repeats it,
-- ticket 07's schema lists it, and issue 14's own acceptance criterion says it.
-- Only the research draft says otherwise. The FUNCTION keeps the research's
-- name — ticket 18 and the ticket 18 prototype findings both quote
-- `hook_restrict_signup_to_allowlist` as the place the rejection copy lives.
-- A table that will be edited by hand for the rest of this project's life gets
-- named once.


-- ---------------------------------------------------------------------------
-- 1. THE ALLOWLIST.
--
-- This is not app data. It is a list of our friends' personal email addresses,
-- and the browser must never see it — no grants to `anon` or `authenticated`,
-- ever. Every other table in this project is locked twice, by grants AND by RLS
-- (ADR-0001). Here the grant is the whole story, because there is no row anyone
-- holding a publishable key is allowed to see.
--
-- It is also the reason `03-realtime.sql` and `05-hangout.sql` both single this
-- table out as the one that must never join the `supabase_realtime` publication:
-- RLS is not applied to DELETE events, so publishing it would turn removing a
-- row into a broadcast of the address on it.
-- ---------------------------------------------------------------------------
create table if not exists public.allowlist (
  -- Lower-cased, and the constraint means it rather than hoping for it. The
  -- hook lowercases the candidate address before comparing, so a row typed as
  -- `Friend@Example.com` would match nothing, ever — and the Friend it belongs
  -- to would be turned away by a message that, by design, does not explain
  -- itself. A typo in this column is the one failure nobody could debug from
  -- the outside, so it is refused at write time.
  email    text primary key check (email = lower(email)),

  -- Whose this is. The table is edited by hand in the SQL Editor, and an
  -- address on its own is not always enough to remember.
  note     text,

  added_at timestamptz not null default now()
);

alter table public.allowlist enable row level security;

-- The second lock, and here the load-bearing one: Supabase grants `anon` and
-- `authenticated` on new tables in `public` by default, so this revoke is what
-- actually closes the table. The RLS above has no policies and so denies
-- everything anyway; it is belt to this braces, and it keeps the table off the
-- "RLS disabled in public" linter.
revoke all on table public.allowlist from anon, authenticated, public;

-- Deliberately NOT `force row level security`. The hook in §3 is
-- `security definer` and therefore runs as this table's owner, and an owner
-- bypasses RLS unless it is forced. Forcing it here would lock the hook out of
-- the only table it exists to read, and the symptom would be every signup in
-- the project refused with a message that says nothing about why.


-- ---------------------------------------------------------------------------
-- 2. WHO IS ON IT.
--
-- **The real addresses are not in this file and must not be.** This repo is
-- five people's personal email addresses away from being a mailing list.
-- `scripts/setup-allowlist.sh` prompts for them and prints the statement to
-- paste into the SQL Editor.
--
-- ADDING A FRIEND LATER is that same statement run on its own. It is the entire
-- administrative procedure for membership in this project, and there is
-- deliberately no screen for it — a group of five adds someone about once:
--
--   insert into public.allowlist (email, note)
--   values (lower(trim('New Friend@Example.com ')), 'New Friend')
--   on conflict (email) do nothing;
--
-- The `lower(trim(...))` is not decoration: the check constraint above rejects
-- anything else, and a pasted address arrives with a capital or a trailing
-- space more often than not.
--
-- REMOVING a row does NOT remove an account. The hook gates entry, not
-- membership: someone who has already signed up keeps their session, their
-- Friend row and their Availability. Revoking access means deleting the auth
-- user from the dashboard, and even then a token already issued stays valid
-- until it expires.
--
-- Read it back — from the SQL Editor, which is the only place that can:
--
--   select email, note, added_at from public.allowlist order by added_at;
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 3. THE GATE.
--
-- The `before-user-created` hook is the only enforceable allowlist gate there
-- is. Checking the list in the SPA before calling `signUp()` is UI and nothing
-- more — the publishable key is in every bundle by design, and anyone holding
-- it can call the auth endpoint directly. RLS cannot help either: `auth.users`
-- is not ours to put a policy on.
--
-- `security definer` so it can read `public.allowlist`, which grants nothing to
-- anybody. `set search_path = ''` because a `security definer` function without
-- one resolves unqualified names against the caller's path, so every name below
-- is schema-qualified.
--
-- THE REJECTION STRING IS COPY, chosen in ticket 18 (draft A) on the
-- enumeration-leak argument rather than on voice. The research document's own
-- draft — 'That email is not on the list. Ask whoever set this up to add you.'
-- — is exactly the leak issue 14 forbids: it answers, for any address anyone
-- cares to type, whether that address belongs to one of us. This sentence says
-- only that it did not work, which is the same thing the client says for a
-- taken address and for a weak password.
--
-- It is also, most of the time, a sentence nobody reads. The signup screen
-- replaces EVERY failure with this copy, because it has to: with Confirm Email
-- disabled (ticket 13) an already-registered address comes back as Supabase's
-- own `User already registered` and no string written here can change that.
-- This one matters where the client is not — a curl, a log line, the next
-- caller somebody writes.
--
-- Rewritten rather than copied from the docs' "Allow by Domain" example, which
-- compares its table against `$1` (the whole `event` argument, not the local
-- variable it meant) and names that variable after a column it also selects on.
-- `candidate_email` collides with nothing.
-- ---------------------------------------------------------------------------
create or replace function public.hook_restrict_signup_to_allowlist(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_email text;
  is_allowed      boolean;
begin
  -- Payload shape, per the Auth Hooks docs:
  --   { "metadata": { … }, "user": { "email": "…", … } }
  candidate_email := lower(trim(event -> 'user' ->> 'email'));

  -- `a.email = candidate_email` rather than `lower(a.email) = …`: the check
  -- constraint has already made every stored address lower-case, so this is an
  -- index lookup on the primary key instead of a scan over a function of it.
  --
  -- A signup with no email at all — anonymous, or phone — leaves
  -- `candidate_email` null, this `exists` false, and the signup refused.
  -- Neither is enabled on this project, and default-deny is the right answer if
  -- one ever is.
  select exists (
    select 1 from public.allowlist a where a.email = candidate_email
  ) into is_allowed;

  -- `{}` is "allow". An object carrying an `error` with a 4xx `http_code`
  -- blocks the signup and propagates `message` back to the caller.
  if is_allowed then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message',   'We could not create an account with those details.'
    )
  );
end;
$$;


-- ---------------------------------------------------------------------------
-- 4. WHO MAY CALL IT.
--
-- Exactly one role: the Auth server's. The revoke is not decoration. A
-- `security definer` function that reads the allowlist and is still executable
-- by `anon` is a hole with the key already inside every browser bundle —
-- `rpc('hook_restrict_signup_to_allowlist', { event: … })` would answer "is
-- this address one of ours?" for any address, on request. That is the same
-- enumeration leak the copy in §3 avoids, walked in through the front door.
--
-- The dashboard applies these itself when a hook is wired up through it. They
-- are written out here so that running this file leaves the function safe
-- whether or not anybody reaches the dashboard step — and so that the revoke
-- survives a later `create or replace`, which would otherwise inherit
-- `execute` for PUBLIC all over again.
-- ---------------------------------------------------------------------------
grant usage on schema public to supabase_auth_admin;

grant execute on function public.hook_restrict_signup_to_allowlist(jsonb)
  to supabase_auth_admin;

revoke execute on function public.hook_restrict_signup_to_allowlist(jsonb)
  from anon, authenticated, public;


-- ---------------------------------------------------------------------------
-- 5. STILL TO DO, AND NOT FROM HERE.
--
--   1. Register the hook — Authentication → Auth Hooks → "Before User Created".
--      Nothing above takes effect until this is done.
--   2. Seed the real addresses (§2).
--   3. Confirm Email stays DISABLED (Authentication → Sign In / Providers).
--      That is ticket 13's decision, and it is defensible only because this
--      hook exists: an unconfirmed address can never belong to a stranger.
--   4. `node --env-file=.env scripts/verify-allowlist.mjs`
--
-- `scripts/setup-allowlist.sh` is these four steps with the waiting built in.
-- ---------------------------------------------------------------------------
