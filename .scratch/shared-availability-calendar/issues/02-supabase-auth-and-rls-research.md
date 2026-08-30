# 02 — How Supabase does allowlisted signup, password reset, and privileged writes

Type: research
Status: resolved
Blocked by: —

## Question

Establish, from Supabase's own current documentation, how to build the auth and
authorization model v1 has already committed to. Specifically:

1. **Allowlist-gated signup with email + password.** What is the current
   supported way to reject a signup whose email is not on a table we control —
   an Auth Hook (`before user created`), a database trigger on `auth.users`, a
   check at the app layer, or disabling public signup entirely? Which of these
   is actually enforceable given the anon key is public?
2. **Password reset.** What Supabase gives for free, what has to be built
   (redirect URL, the update-password screen), and what must be configured in
   the dashboard for it to work from a static SPA.
3. **Profile rows.** The idiomatic way to hold Friend data (display name,
   blobatar seed, palette, expression) alongside `auth.users` — a `public`
   profiles table plus a trigger on user creation, or something newer.
4. **RLS policy syntax** for the two shapes this project needs: "readable by any
   authenticated Friend" and "writable only where `auth.uid() = friend_id`".
5. **`security definer` RPC** — how to write a Postgres function callable from
   the browser that runs with elevated rights, how to stop it being called for
   arbitrary arguments, and the current guidance on `search_path` hardening.
   This is the mechanism ADR-0002 depends on.
6. **Realtime** — what has to be enabled per table, whether RLS is respected on
   the stream, and how a subscription is scoped to a range of rows.

The human is new to Supabase, so the findings must **explain the concepts**, not
just cite APIs.

## Notes

Primary sources only — `supabase.com/docs`. Training data on Supabase auth is
known to be stale; do not answer from memory. Capture the findings as a Markdown
file in the repo and link it from this ticket.

## Context

Findings: [`research/supabase-auth-and-rls.md`](../research/supabase-auth-and-rls.md)

## Answer

Full findings: [`research/supabase-auth-and-rls.md`](../research/supabase-auth-and-rls.md).
All claims fetched from `supabase.com/docs` on 2026-08-29 (appending `.md` to a
guide URL serves raw Markdown, so the quotes are verbatim, not paraphrase).

1. **Allowlist signup** — the **`before-user-created` Auth Hook, implemented as
   a Postgres function**, is the supported and enforceable mechanism. It is on
   the free plan and the request never leaves the project instance, so no Edge
   Function and no server. An app-layer check is **UI only** — anyone can POST
   to `/auth/v1/signup` with the publishable key. Disabling signup is
   enforceable but kills the public form and forces `inviteUserByEmail`, which
   needs a secret key and therefore a server. An `auth.users` trigger works but
   is not endorsed for this and gives opaque errors.
2. **Password reset** — Supabase gives the email, token, session and enumeration
   protection; we build two screens and route on the `PASSWORD_RECOVERY` event
   from `onAuthStateChange`. Dashboard needs Site URL, the redirect allowlist,
   possibly `{{ .RedirectTo }}` in the template, and the landing screen needs an
   expired-link state. **But see the blocker below.**
3. **Profiles** — `public.profiles` + an `on_auth_user_created` trigger is still
   the pattern; nothing newer. `auth.users` is not exposed to the API, so this
   table is not optional. Adapted SQL creates a **blank** row (blobatar is
   chosen in the two-step setup, not at signup) and withholds the `insert`
   grant so only the trigger can mint profiles.
4. **RLS** — real `create policy` statements for both shapes, plus six gotchas:
   one policy per command; `using` vs `with check`; `update` silently requires a
   `select` policy; RLS-enabled-with-no-policy means deny-all; always
   `to authenticated` with `(select auth.uid())` for the initPlan cache; index
   every filtered column, **leading column only** — a `(hangout_id, friend_id)`
   primary key does *not* index `friend_id`.
5. **`security definer` RPC** — `set search_path = ''` plus full schema
   qualification is mandatory; functions are executable by any role by default,
   so `revoke ... from public, anon` then `grant ... to authenticated`.
   `auth.uid()` still works inside a definer function, which is precisely what
   makes ADR-0002's narrow hole possible.
6. **Realtime** — `alter publication supabase_realtime add table ...` per table;
   `replica identity full` only when `old` values are needed or deletes must
   honour filters. RLS is enforced per subscriber, with one documented hole:
   **RLS is not applied to DELETE**. Server-side filters are `column=op.value`,
   multiple conditions comma-combined as AND.

### Could not confirm

- Which flow `supabase-js` defaults to — `flowType` is never stated in the docs.
  **Set it explicitly**: PKCE requires the reset to finish on the same browser
  and device, which breaks the laptop→phone case.
- Whether Realtime's auth token refreshes automatically as the session rotates.
- Any explicit docs carve-out for intentionally-exposed `security definer` RPCs
  (see the ADR-0002 note below).
