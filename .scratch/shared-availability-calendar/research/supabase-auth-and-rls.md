# Supabase: allowlisted signup, password reset, profiles, RLS, privileged RPC, realtime

Research for ticket
[`02-supabase-auth-and-rls-research.md`](../issues/02-supabase-auth-and-rls-research.md).

**Method.** Every claim below is taken from `supabase.com/docs`, fetched
2026-08-29, and cited inline. Supabase docs pages are also served as raw
Markdown by appending `.md` to the URL — that is how these were read, so the
quotes are the docs' own words rather than a rendering of them. Where the docs
are silent or self-contradictory it says so under **Could not confirm**.

**Reading order.** Section 0 is the mental model everything else depends on.
If you read nothing else, read section 0 and section 7 (Consequences).

---

## 0. The mental model: two locks, not one

Everything in this document rests on one idea, and Supabase's own security page
states it plainly:

> The Data API works with two layers of Postgres access control:
> 1. **Grants** determine which Postgres roles can reach a table, view, or
>    function over the Data API. These roles include `anon`, `authenticated`,
>    and `service_role`.
> 2. **Row Level Security (RLS) policies** determine which rows those roles can
>    read or modify.
>
> — [Securing your API](https://supabase.com/docs/guides/api/securing-your-api)

So there are two locks on every table, and they are independent:

- **A grant** is "may this role touch this table at all?" It is per-operation
  (`select`, `insert`, `update`, `delete`) and has nothing to do with rows. A
  missing grant fails fast with Postgres error `42501` *before any policy runs*
  ([RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security)).
- **A policy** is "which rows?" It behaves like a `WHERE` clause silently
  appended to every query:

  > Think of a policy as adding a `WHERE` clause to every query.
  > — [RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security)

**Which role am I?** Supabase maps every request to a Postgres role based on
the API key and whether a user is logged in:

| Key | User logged in via Supabase Auth | Postgres role used for RLS |
| --- | --- | --- |
| Publishable key | No | `anon` |
| Publishable key | Yes | `authenticated` |

— [Understanding API keys](https://supabase.com/docs/guides/getting-started/api-keys)

That table is the whole reason ADR-0001's warning is correct. The key in the
browser only says *which application* is talking; Auth says *which person*. An
unauthenticated visitor with our public key is `anon`, and whatever `anon` can
do, the entire internet can do.

**Naming note (this will bite you in the dashboard).** ADR-0001 says "anon
key". The docs now call the browser key a **publishable key**, format
`sb_publishable_...`; `anon` (a long-lived JWT) is described as the "Legacy
version of publishable keys" and the docs say legacy keys "will be deprecated
by the end of 2026, and you should now use the publishable
(`sb_publishable_xxx`) and secret (`sb_secret_xxx`) keys instead"
([API keys](https://supabase.com/docs/guides/getting-started/api-keys)). The
Postgres *role* is still called `anon` — only the key was renamed. Use a
publishable key in the SPA.

**RLS on with no policies means deny-all.** Confirmed:

> Once RLS is enabled, no data is accessible through the API when using a
> publishable key, until you create policies.
> — [RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security)

**But policies alone are not enough.** This is the single most quotable warning
on the page, and it is new-ish guidance that contradicts a lot of older
Supabase tutorials:

> **Danger:** A table in an exposed schema without RLS is readable and writable
> by any role with a grant on it. Enable RLS on every table in an exposed
> schema. On projects that still grant `anon` and `authenticated` by default,
> revoke those grants. **Adding policies doesn't remove them.**
>
> — [RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security)

And:

> On existing projects, tables created in `public` receive `SELECT`, `INSERT`,
> `UPDATE`, and `DELETE` privileges for `anon`, `authenticated`, and
> `service_role` by default. Functions receive `EXECUTE`.
> — [Securing your API](https://supabase.com/docs/guides/api/securing-your-api)

So the correct recipe for every table is three statements, not one:

```sql
alter table public.<t> enable row level security;
revoke all on table public.<t> from anon, authenticated;
grant  <only what is needed> on table public.<t> to <only the roles that need it>;
-- then policies
```

Supabase notes it is "changing the platform default to revoke these automatic
grants so that exposure becomes opt-in", so a brand-new project may or may not
hand out the automatic grants. Write the `revoke` regardless; it is idempotent
and it means the migration does not depend on when the project was created.

---

## 1. Allowlist-gated signup with email + password

### 1.1 The four candidates, scored

| Approach | Enforceable? | Verdict |
| --- | --- | --- |
| Check an allowlist table in the SPA before calling `signUp()` | **No** | UI only |
| Turn off "Allow new users to sign up" | **Yes** | Real, but kills the public signup form |
| Trigger on `auth.users` that raises | **Yes**, but undocumented for this purpose | Works, poor errors, not the supported path |
| **`before-user-created` Auth Hook** | **Yes** | **This is the answer** |

### 1.2 Why the app-layer check is not a security boundary

The signup endpoint is `/auth/v1/signup`, and it accepts the publishable key
that ships in our JavaScript bundle. Any check written in React runs on the
attacker's own machine, in code they can read and skip. A `curl` to
`/auth/v1/signup` with the key lifted from our bundle never executes a single
line of our app. The allowlist query in the SPA is worth writing — it is how a
non-allowlisted friend-of-a-friend gets the polite "you're not on the list"
message issue 01 asked for — but it must be understood as **copy, not
authorization**. The real check has to run somewhere the caller cannot reach:
inside Supabase's Auth server, or inside Postgres.

### 1.3 The supported mechanism: the `before-user-created` hook

Supabase has a documented hook that exists for exactly this:

> This hook runs before a new user is created. It allows developers to inspect
> the incoming user object and optionally reject the request. Use this to
> enforce custom signup policies that Supabase Auth does not handle natively —
> such as blocking disposable email domains, restricting access by region or
> IP, or requiring that users belong to a specific email domain.
>
> You can implement this hook using an HTTP endpoint or a Postgres function.
> **If the hook returns an error object, the signup is denied and the user is
> not created.**
>
> — [Before User Created Hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook)

It is on the **Free** plan
([Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks) — the table
lists Before User Created as "Free, Pro"; only MFA Verification and Password
Verification are Teams/Enterprise). It can be a **Postgres function**, which
matters enormously for us:

> A Postgres function can be configured as a hook. The function should take in
> a single argument -- the event of type JSONB -- and return a JSONB object.
> Since the Postgres function runs on your database, **the request does not
> leave your project's instance.**
> — [Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks)

That means the allowlist gate needs **no Edge Function and no server** — it is
a SQL function plus a dashboard toggle. ADR-0001's "no edge functions unless a
specific decision demands one" survives intact.

The payload gives us the email:

> | `user` | `object` | The user record that is about to be created. Matches
> the shape of the `auth.users` table. |
>
> Note: Because the hook runs immediately before insertion into the database,
> **this user will not be found in Postgres at the time the hook is called.**
> — [Before User Created Hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook)

Rejection contract, verbatim from the docs:

```json
{
  "error": {
    "http_code": 400,
    "message": "Only company emails are allowed to sign up."
  }
}
```

> This response will block the user creation and return the error message to
> the client that attempted signup.

Allow contract: return `{}` (or a 204).

The `message` is returned to the client, so the "you're not on the list"
wording can live in the hook and the SPA can simply display whatever came back.

### 1.4 Copy-pasteable: the friens-cal allowlist gate

The docs ship an "Allow by Domain" example. friens-cal needs allow-by-*address*
instead, since the friends are on assorted personal mail providers. This is
that example restructured for exact-address matching, default-deny:

```sql
-- One row per Friend we are willing to let in. Hand-curated; edited only in
-- the SQL editor by whoever administers the project.
create table public.signup_allowlist (
  email      text primary key,
  note       text,
  created_at timestamptz not null default now()
);

-- The allowlist is NOT app data. The browser must never see it: it is a list
-- of our friends' email addresses. No grants to anon/authenticated at all.
alter table public.signup_allowlist enable row level security;
revoke all on table public.signup_allowlist from anon, authenticated, public;

-- Seed it.
insert into public.signup_allowlist (email, note) values
  ('friend.one@example.com', 'Friend One'),
  ('friend.two@example.com', 'Friend Two');

-- The hook itself. `security definer` so it can read signup_allowlist even
-- though that table is RLS-enabled and grants nothing to anyone.
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
  candidate_email := lower(trim(event -> 'user' ->> 'email'));

  select exists (
    select 1
    from public.signup_allowlist a
    where lower(a.email) = candidate_email
  ) into is_allowed;

  if is_allowed then
    return '{}'::jsonb;   -- allow
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message',   'That email is not on the list. Ask whoever set this up to add you.'
    )
  );
end;
$$;

-- Permissions, exactly as the docs prescribe for hook functions:
-- only the Auth server may call it; the Data API must not be able to.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_restrict_signup_to_allowlist
  to supabase_auth_admin;
revoke execute on function public.hook_restrict_signup_to_allowlist
  from authenticated, anon, public;
```

Then enable it: **Dashboard → Authentication → Auth Hooks →
"Before User Created" → Postgres function →
`public.hook_restrict_signup_to_allowlist`**
([hooks configuration](https://supabase.com/dashboard/project/_/auth/hooks); for
local dev, `config.toml`, per
[Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks)).

The grant/revoke block is not optional decoration. The docs explain why
Supabase applies these automatically when you wire a hook through the
dashboard:

> - Allow the `supabase_auth_admin` role to execute the function. […]
> - Revoke permissions from other roles (e.g. `anon`, `authenticated`,
>   `public`) **to ensure the function is not accessible by Supabase Data
>   APIs.**
> — [Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks)

Also note this, which is why the example above uses `security definer` rather
than relying on the hook role's own privileges:

> You will need to alter your row-level security (RLS) policies to allow the
> `supabase_auth_admin` role to access tables that you have RLS policies on.
> […] Alternatively, you can create your Postgres function via the dashboard
> with the `security definer` tag.
> — [Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks)

Either works. `security definer` + `set search_path = ''` is fewer moving parts
than writing an RLS policy targeted at an internal Supabase role.

### 1.5 A bug in the docs' own example — do not copy it verbatim

The published "Allow by Domain" SQL contains this:

```sql
declare
  domain text;
...
  select count(*) into is_allowed
  from public.signup_email_domains
  where type = 'allow' and lower(domain) = lower($1);
```

Two problems, both visible by inspection: `$1` is the function's first
*argument* (`event jsonb`), not the local `domain` variable, so it compares a
domain against the whole JSON event; and `domain` is simultaneously a plpgsql
variable and a column on `signup_email_domains`, which plpgsql normally rejects
as an ambiguous reference. **This was not executed against a live database**, so
treat it as "looks wrong, verify before trusting" rather than a confirmed
defect — but it is a good reason to use the rewritten version in §1.4, whose
variable names (`candidate_email`) do not collide with any column.

### 1.6 What the hook does *not* do

- **It gates entry, not membership.** Removing a row from `signup_allowlist`
  after someone has signed up does nothing to their existing account. Revoking
  access means deleting the auth user
  ([User Management](https://supabase.com/docs/guides/auth/managing-user-data)),
  and even then: "Supabase access tokens are stateless JWTs, so a token already
  in the user's hands stays valid until its `exp` claim passes."
- **Auth Hooks are labelled BETA** in the dashboard navigation
  ([General configuration](https://supabase.com/docs/guides/auth/general-configuration)
  lists "Auth Hooks (BETA)"). Worth knowing; not a reason to avoid it, since it
  is the only documented mechanism for this and it is GA'd onto the Free plan.

### 1.7 The other two enforceable options, and why they lose

**Disable public signup.** Real and server-side:

> **Allow new users to sign up**: Users will be able to sign up. If this config
> is disabled, only existing users can sign in.
> — [General configuration](https://supabase.com/docs/guides/auth/general-configuration)

There is even a dedicated error code, `signup_disabled` — "Sign ups (new
account creation) are disabled on the server."
([Error codes](https://supabase.com/docs/guides/auth/debugging/error-codes)).
But it deletes the feature: issue 01 committed to "a public signup form gated
by the allowlist". The natural pairing would be
`auth.admin.inviteUserByEmail()`, and that is an Auth Admin method requiring a
**secret** key — which cannot ship in the browser, which means a server, which
contradicts ADR-0001. Rejected.

**A trigger on `auth.users`.** A `before insert` trigger that raises would abort
the transaction and is therefore genuinely enforceable. The docs acknowledge
this side effect only as a hazard, not as a technique — "If the trigger fails,
it could block signups, so test your code thoroughly"
([User Management](https://supabase.com/docs/guides/auth/managing-user-data)).
No Supabase page recommends it for allowlisting. The failure surfaces as an
opaque database error rather than the hook's clean `message`, and it builds on
a table Supabase owns and may migrate. The hook exists precisely so you do not
have to do this. Rejected.

---

## 2. Password reset

### 2.1 What Supabase gives for free

- `resetPasswordForEmail(email, { redirectTo })` — sends the recovery mail.
- The recovery email itself, from a built-in template.
- The token, its verification, and the resulting session.
- `updateUser({ password })` to set the new one.
- Enumeration protection, for free:

  > To prevent user enumeration, `resetPasswordForEmail()` doesn't reveal
  > whether an account exists for the given email address. When no user is
  > associated with the address, Supabase Auth won't send an email, though the
  > method still returns without an error.
  > — [Password-based Auth](https://supabase.com/docs/guides/auth/passwords)

  Design consequence: the "check your email" screen must be shown
  unconditionally. We cannot tell the user "no such account", and should not
  try.

### 2.2 What we have to build (two screens)

Straight from the docs' two steps:

> **Step 1: Create a reset password page.** This page should be publicly
> accessible. Collect the user's email address and request a password reset
> email. Specify the redirect URL, which should point to the URL of a **change
> password** page. This URL needs to be configured in your redirect URLs.
>
> **Step 2: Create a change password page** at the URL you specified in the
> previous step. This page should be accessible only to authenticated users.
> Collect the user's new password and call `updateUser` to update their
> password.
> — [Password-based Auth](https://supabase.com/docs/guides/auth/passwords)

```js
// screen 1
await supabase.auth.resetPasswordForEmail('friend@example.com', {
  redirectTo: 'https://friens-cal.example/update-password',
})
```

```js
// screen 2, after the session has been established from the link
const { error } = await supabase.auth.updateUser({ password: newPassword })
```

The bit the prose glosses over is *how screen 2 knows it is in a recovery*. The
answer is the `PASSWORD_RECOVERY` auth event, and the docs give this example:

```js
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    console.log('PASSWORD_RECOVERY', session)
    // show screen to update user's password
    showPasswordResetScreen(true)
  }
})
```

— [`onAuthStateChange`](https://supabase.com/docs/reference/javascript/auth-onauthstatechange)
(documented events: `INITIAL_SESSION`, `SIGNED_IN`, `SIGNED_OUT`,
`PASSWORD_RECOVERY`, `TOKEN_REFRESHED`, `USER_UPDATED`.)

So in the SPA: mount the listener once at app root, and let
`PASSWORD_RECOVERY` route to the update-password screen. The recovery link
produces a real, logged-in session — which is exactly why the docs say screen 2
is "accessible only to authenticated users", and why nothing extra is needed to
authorize the `updateUser` call.

### 2.3 The flow: implicit vs PKCE, and what it means for a static SPA

Two flows exist. Implicit returns tokens in the URL fragment. PKCE returns
`?code=...` which must be exchanged:

> The `code` parameter is commonly known as the Auth Code and can be exchanged
> for an access token by calling `exchangeCodeForSession(code)`. […] You may
> also configure the client library to automatically exchange it for a session
> after a successful redirect. This can be done by setting the
> `detectSessionInUrl` option to `true`.
> — [PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow)

For a static Vite SPA, either works, because `detectSessionInUrl: true` does
the exchange in the browser — the docs' framing of PKCE as "server-side auth"
is about where the redirect *lands*, not about a requirement for a server.
There is one PKCE constraint to design around:

> The code verifier is created and stored locally when the Auth flow is first
> initiated. That means **the code exchange must be initiated on the same
> browser and device where the flow was started.**
> — [PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow)

Meaning: request the reset on your laptop, open the mail on your phone, and it
fails. For a five-person tool that is a real papercut. Implicit flow does not
have this constraint. Pick deliberately, and set `flowType` explicitly rather
than inheriting a default.

**Could not confirm:** which flow `supabase-js` uses by default. The docs show
`flowType: 'pkce'` being set explicitly in the client-init example and never
state the default. Set it explicitly in `createClient` and the question
disappears.

PKCE also requires editing the recovery email template to send a token hash
instead of a link, per the docs' PKCE Step 1 — another reason implicit is the
lower-friction choice here.

### 2.4 Dashboard configuration (all four are required)

**Site URL and Redirect URLs** —
Dashboard → [Authentication → URL Configuration](https://supabase.com/dashboard/project/_/auth/url-configuration):

> The Site URL […] defines the **default redirect URL** when no `redirectTo` is
> specified in the code. Change this from `http://localhost:3000` to your
> production URL […] **This setting is critical for email confirmations and
> password resets.**
> — [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)

Add both the production `https://…/update-password` and a
`http://localhost:5173/**` for dev. Wildcards are supported (`*` does not cross
`.` or `/`; `**` does), though "we recommend setting the exact redirect URL path
for your site URL in production".

**Email templates** —
Dashboard → [Authentication → Email Templates](https://supabase.com/dashboard/project/_/auth/templates).
One gotcha lives here:

> When using a `redirectTo` option, you may need to replace the
> `{{ .SiteURL }}` with `{{ .RedirectTo }}` in your email templates.
> — [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)

**Error handling on the landing page** — failures still redirect to our URL:

> When authentication fails, the user will still be redirected to the redirect
> URL provided. However, the error details will be returned as query fragments
> in the URL.
> — [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)

An expired recovery link therefore lands on `/update-password` with no session
and `error_description` in the fragment. That screen needs a "this link has
expired, request another" state or it will look broken.

**SMTP — see §2.5. This one is a blocker.**

### 2.5 🔴 The free-tier SMTP restriction — read this before planning v1

This is the single most consequential finding in the whole ticket.

> **Send messages only to pre-authorized addresses.** Unless you configure a
> custom SMTP server for your project, Supabase Auth **will refuse to deliver
> messages to addresses that are not part of the project's team.** […] if your
> project's organization has these member accounts `person-a@example.com`,
> `person-b@example.com` and `person-c@example.com` then Supabase Auth will
> only send messages to these addresses. All other addresses will fail with the
> error message *Email address not authorized.*
>
> **Significant rate-limits that can change over time.** […] Currently this
> value is set to **2 messages per hour.**
>
> — [Send emails with custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)

Corroborated by the rate-limit table: endpoints that trigger email sends
(`/auth/v1/signup`, `/auth/v1/recover`, `/auth/v1/user`) are limited to "2
emails per hour with the built-in email provider", project-wide, and
"Customizable: **Custom SMTP Only**"
([Rate limits](https://supabase.com/docs/guides/auth/rate-limits)). And there is
a dedicated error code `email_address_not_authorized`
([Error codes](https://supabase.com/docs/guides/auth/debugging/error-codes)).

Restated for friens-cal: **on the default SMTP service, four of the five friends
cannot receive a password reset email at all, and the fifth can receive two per
hour, shared with every signup confirmation.** Issue 01's "Password reset ships
in v1 (Supabase's own flow)" is not achievable without custom SMTP.

The fix is small and free-tier-friendly: set up a transactional email provider
and paste four values into
Dashboard → [Authentication → SMTP Settings](https://supabase.com/dashboard/project/_/auth/smtp).
The docs list Resend, AWS SES, Postmark, Twilio SendGrid, ZeptoMail and Brevo as
working with Supabase Auth. But it is **a new vendor account**, which is exactly
the "two accounts, two dashboards" cost ADR-0001 rejected Convex over. Not a
reason to reverse ADR-0001 — the cost here is a free mail relay, not a second
auth provider — but the decision record should stop implying zero extra vendors.

**Corollary: signup confirmation email.** "Confirm Email" is on by default
("Users will need to confirm their email address before signing in for the
first time" —
[General configuration](https://supabase.com/docs/guides/auth/general-configuration)),
and that confirmation is also email. Two coherent options:

1. Set up custom SMTP → confirmation and reset both work. **Recommended.**
2. Turn Confirm Email off for now → signup logs you straight in, and password
   reset simply does not work until SMTP exists. Note what "off" means:
   "Having **Confirm Email** disabled assumes that the user's email does not
   need to be verified in order to login and implicitly confirms the user's
   email in the database." This is defensible here *only because* the
   `before-user-created` hook already restricts signup to addresses we chose.

**Also worth knowing (local dev):** the passwords guide has a "Local development
with Mailpit" section, so the Supabase CLI captures outbound mail locally and
neither restriction applies while developing
([Password-based Auth](https://supabase.com/docs/guides/auth/passwords)).

**Not from the docs — an inference to verify at deploy time:** a static SPA
served from most hosts needs a rewrite rule so `/update-password` returns
`index.html` rather than 404, since the recovery link is a deep link into a
client-side route. This is standard SPA hosting, not a Supabase concern, but it
is the kind of thing that only shows up the first time someone clicks a real
recovery email.

---

## 3. Profile rows

### 3.1 Still the same pattern, and still current

The trigger-on-signup pattern is the documented approach, unchanged. Nothing
newer replaces it. The reason it must exist at all:

> **For security, the Auth schema is not exposed in the auto-generated API.**
> If you want to access users data via the API, you can create your own user
> tables in the `public` schema.
> — [User Management](https://supabase.com/docs/guides/auth/managing-user-data)

So the SPA can never `select` from `auth.users`. A `public.profiles` table is
not a nicety, it is the only way the app can render a friend's name.

Two constraints the docs are emphatic about:

> Reference the `auth.users` table to ensure data integrity. Specify
> `on delete cascade` in the reference.
>
> **Caution:** Only use primary keys as foreign key references for schemas and
> tables like `auth.users` which are managed by Supabase. […] Primary keys are
> **guaranteed not to change**. Columns, indices, constraints or other database
> objects managed by Supabase **may change at any time**.
> — [User Management](https://supabase.com/docs/guides/auth/managing-user-data)

I.e. reference `auth.users(id)` and nothing else — never `auth.users(email)`.

### 3.2 The trigger, verbatim from the docs

> To update your `public.profiles` table every time a user signs up, set up a
> trigger. **If the trigger fails, it could block signups, so test your code
> thoroughly.**

```sql
-- inserts a row into public.profiles
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, first_name, last_name)
  values (new.id, new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data ->> 'last_name');
  return new;
end;
$$;

-- trigger the function every time a user is created
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

— [User Management](https://supabase.com/docs/guides/auth/managing-user-data)

Note the shape: `security definer set search_path = ''`, fully schema-qualified
insert, `after insert`, `return new`.

### 3.3 Adapted for friens-cal

Our Friend identity is display name + blobatar (seed, palette, expression), and
issue 01 says those are chosen in a **two-step setup after first login**, not at
signup. So the trigger should create a *blank* row that the setup flow then
fills in — the trigger's job is to guarantee a profile row exists for every
`auth.users` row, so no query anywhere has to handle a missing profile.

```sql
create table public.profiles (
  id                uuid primary key references auth.users on delete cascade,
  display_name      text,
  avatar_seed       text,
  avatar_palette    text,
  avatar_expression text,
  setup_complete    boolean not null default false,
  created_at        timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
-- No delete: profiles die with their auth.users row, via the cascade.
grant select, update on table public.profiles to authenticated;
-- No insert grant either: only the trigger creates profile rows.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

Deliberate choices worth defending:

- **No `insert` grant to `authenticated`.** Profile rows have exactly one
  legitimate creator — the trigger, which runs as `postgres`. Withholding the
  grant means no client-side bug can ever mint a profile.
- **`setup_complete`** gives the SPA a cheap "has this Friend finished the
  two-step setup?" check without inspecting nullability of four columns.
- **Blobatar fields as plain columns, not JSON.** The Friend's block colour
  derives from the palette (issue 01), so palette is read on every grid render.
  A column can be indexed and typed; a JSON blob cannot, as easily.

Two ordering facts to keep straight:

- The `before-user-created` hook runs **before** the `auth.users` insert, so it
  cannot see the user in Postgres. The `on_auth_user_created` trigger runs
  **after**. They are two different moments and cannot be merged.
- The trigger and the hook are both `security definer` with
  `set search_path = ''` for the same reason (§5.3).

**Not the newest possible answer, flagged:** the docs also describe storing
arbitrary data on the user itself via `raw_user_meta_data`, settable through
`signUp({ options: { data } })`. Do **not** use it for the blobatar. The RLS
guide is explicit: "`raw_user_meta_data` — can be updated by the authenticated
user using the `supabase.auth.update()` function. It is not a good place to
store authorization data." It is also unreadable by other Friends, and the whole
point of the palette is that *everyone else* sees it on the grid.

---

## 4. RLS policy syntax for the two shapes we need

### 4.1 Shape A — readable by any authenticated Friend

```sql
create policy "Any Friend can read all availability"
on public.availability
for select
to authenticated
using ( true );
```

`to authenticated` is what does the work: the docs' own example for exactly
this shape is `create policy "Public profiles are viewable only by
authenticated users" on profiles for select to authenticated using ( true )`
([RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security)).

One caveat, since our whole model is "there are no strangers":

> Using the `anon` Postgres role is different from an anonymous user in
> Supabase Auth. **An anonymous user assumes the `authenticated` role** to
> access the database and can be differentiated from a permanent user by
> checking the `is_anonymous` claim in the JWT.
> — [RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security)

Anonymous sign-ins are a separate dashboard toggle
("Allow anonymous sign-ins" —
[General configuration](https://supabase.com/docs/guides/auth/general-configuration)),
off unless enabled. Leave it off and `to authenticated` means "a real Friend".
Belt and braces if you want it: `using ( coalesce((select auth.jwt() ->>
'is_anonymous')::boolean, false) = false )`.

### 4.2 Shape B — writable only where `auth.uid() = friend_id`

Four separate policies. Note `insert` uses `with check`, `select`/`delete` use
`using`, and `update` needs **both**:

```sql
alter table public.availability enable row level security;
revoke all on table public.availability from anon, authenticated;
grant select, insert, update, delete on table public.availability to authenticated;

create policy "Friends read all availability"
on public.availability for select
to authenticated
using ( true );

create policy "A Friend inserts only their own availability"
on public.availability for insert
to authenticated
with check ( (select auth.uid()) = friend_id );

create policy "A Friend updates only their own availability"
on public.availability for update
to authenticated
using      ( (select auth.uid()) = friend_id )   -- which existing rows
with check ( (select auth.uid()) = friend_id );  -- what the result may look like

create policy "A Friend deletes only their own availability"
on public.availability for delete
to authenticated
using ( (select auth.uid()) = friend_id );

-- Policies filter on friend_id, so index it (see gotcha 5 below).
create index availability_friend_id_idx
  on public.availability using btree (friend_id);
```

### 4.3 The six gotchas, each with its citation

**1. One policy per command. `for all` is discouraged.**

> Write a separate policy for `select`, `insert`, `update`, and `delete`.
> Postgres does not accept multiple operations in one `for` clause, and a
> `for all` policy hides which operation each rule was meant to cover.

**2. `using` vs `with check` — and why `update` needs both.**

> The `using` clause decides which existing rows can be updated. The `with
> check` clause decides what the resulting row is allowed to look like, **which
> stops a user from reassigning `user_id` to someone else.** […] If no `with
> check` expression is defined, the `using` expression decides both.

Concretely: with `using` alone, a Friend could `update` their own Availability
row and set `friend_id` to someone else's — donating a block to another
Friend's calendar. The `with check` closes it. This matters here more than in
most apps, because ADR-0002 says exactly one mechanism may cross the
Friend boundary, and it is not this one.

**3. `update` silently needs a `select` policy.**

> **Caution:** To perform an `UPDATE` operation, a corresponding `SELECT`
> policy is required. Without a `SELECT` policy, the `UPDATE` operation will
> not work as expected.

Free for us — Shape A supplies it.

**4. RLS enabled with no policy = deny all; and grants are a separate lock.**
See §0. "Once RLS is enabled, no data is accessible through the API when using
a publishable key, until you create policies", *and* "Adding policies doesn't
remove [grants]". Both must be right.

**5. Always name the role, and always wrap the helper in `select`.**

> Always name the role a policy applies to, using the `to` clause. […] This
> prevents the policy from running for any `anon` users, since the execution
> stops at the `to authenticated` step.

> Instead of `using ( auth.uid() = user_id )` you can do
> `using ( (select auth.uid()) = user_id )`. **Wrapping the function causes an
> `initPlan` to be run by the Postgres optimizer, which allows it to "cache"
> the results per-statement, rather than calling the function on each row.**
>
> **Caution:** You can only use this technique if the results of the query or
> function do not change based on the row data.

`auth.uid()` is constant per statement, so it qualifies. Always write
`(select auth.uid())`.

**6. Index every column a policy filters on, and mind leading columns.**

> Postgres evaluates the policy against each candidate row, so an unindexed
> filter column turns a read into a sequential scan. […] **A column counts as
> indexed only when it comes first in a `btree` index.** […] A membership table
> keyed on `(team_id, user_id)` has no index on `user_id`.

Directly relevant: if `hangout_participants` gets a composite primary key
`(hangout_id, friend_id)` — the obvious modelling — then any policy filtering
on `friend_id` is unindexed and needs `create index … (friend_id)`.

**Bonus gotcha, `auth.uid()` returns null when signed out:**

> This means that a policy like `USING (auth.uid() = user_id)` will silently
> fail for unauthenticated users, because `null = user_id` is always false in
> SQL. To avoid confusion and make your intention clear, we recommend
> explicitly checking for authentication: `USING (auth.uid() IS NOT NULL AND
> auth.uid() = user_id)`.

With `to authenticated` this is already unreachable, but it explains the
category of bug where a policy "does nothing" instead of erroring.

**Two more, for later tables:**

- **Views bypass RLS by default.** "Views bypass RLS by default because they
  are usually created with the `postgres` user." On PG15+, fix with
  `create view … with (security_invoker = true) as …`. Relevant if Candidate
  computation ever moves to a view.
- **Recursive policies deadlock.** Two tables whose policies read each other
  raise `42P17`, "infinite recursion detected in policy for relation". The
  documented shape that causes it is exactly `hangouts` ↔
  `hangout_participants`. The documented fix is a `security definer` function
  in a **private** schema returning the caller's ids, then
  `using ( id in (select private.…()) )`. Worth reading before writing hangout
  policies — but note friens-cal may dodge it entirely, since issue 01 says
  Hangouts are visible to every Friend, so the policies need not consult
  participants at all.

### 4.4 Test the policies, don't eyeball them

The RLS guide now treats tests as part of the procedure, not an extra:

> 3. Create a `.sql` file under `supabase/tests/` that asserts allow and deny
>    for `select`, `insert`, `update`, and `delete`, for `anon` and
>    `authenticated`. 4. Run `supabase test db`. […] **Until the suite passes,
>    you don't know whether the policies do what you intended.**

The trap it calls out is worth internalising, because it is how a broken policy
passes a test suite:

> | A missing grant | raises `42501` | `throws_ok` |
> | A `with check` violation | raises `42501` | `throws_ok` |
> | A `using` clause filtering the row out | **raises nothing, matches zero
> rows** | `is_empty` over the statement with `returning`, then a read proving
> the target row is intact |
>
> **Never prove an allowed write with `lives_ok`. It passes when the write
> matched zero rows.**

Impersonation in tests is `set local role authenticated;` plus
`set local request.jwt.claim.sub = '<uuid>';`. The guide ships a complete
14-assertion `profiles_rls.test.sql` that is a direct template for
`availability_rls.test.sql`.

---

## 5. The `security definer` RPC that ADR-0002 depends on

### 5.1 What `security definer` actually means

> Postgres allows you to specify whether you want the function to be executed
> as the user *calling* the function (`invoker`), or as the *creator* of the
> function (`definer`).
> — [Database Functions](https://supabase.com/docs/guides/database/functions)

And on Supabase specifically:

> A "security definer" function runs using the same role that *created* the
> function. This means that if you create a role with a superuser (like
> `postgres`), then that function will have `bypassrls` privileges.
> — [RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security)

That is the hole ADR-0002 wants: inside such a function, `availability`'s
"only your own rows" policies do not apply. The docs also confirm the mechanism
depends on the owner, which is a genuine failure mode to know about:

> This works because the function runs as its owner, and a `security definer`
> function **only skips RLS when its owner can**. On Supabase the owner is
> `postgres`, which has `bypassrls`. A function owned by a role without
> `bypassrls`, or reading a table set to `force row level security`, evaluates
> the […] policy again.

Two things follow: create the function as `postgres` (the SQL editor does this;
so does a migration), and never put `force row level security` on
`availability` or the RPC stops working.

Crucially, `auth.uid()` **still works inside** a `security definer` function —
it reads the request's JWT claims, not the executing role. The RLS guide's own
`private.has_good_role()` example calls `(select auth.uid())` inside a
`security definer` body. So the function can be simultaneously all-powerful over
the table and fully aware of who is asking. That is what makes ADR-0002's
"narrow hole" possible.

### 5.2 How to stop it being abused with arbitrary arguments

This is the design question, and the answer is not a Supabase API — it is a
principle: **accept the smallest possible argument list, and derive everything
else server-side.**

The tempting signature is the dangerous one:

```sql
-- DO NOT. Every guarantee in ADR-0002 is now a client-side promise.
extend_availability(p_friend_id uuid, p_start timestamptz, p_end timestamptz)
```

A function like that, running with `bypassrls`, is a *worse* permission than
flat trust: it lets anyone with the publishable key and a valid session write
any range onto any Friend's calendar, with no audit trail and a reassuring
name. The narrow version takes one argument:

```sql
extend_availability_for_hangout(p_hangout_id uuid)
```

Every fact the write depends on — which Friends, which time range — is then
**read from the database**, not accepted from the caller:

- *which Friends* → the rows already in `hangout_participants` for that hangout;
- *which range* → that hangout's own `starts_at`/`ends_at`;
- *who is asking* → `auth.uid()`, which the caller cannot forge.

The caller's only influence is *which hangout*, and the worst thing they can do
with that is trigger a write that the hangout's own stored data already
authorises. That is what "narrow hole" has to mean to be worth its cost.

Four checks belong inside the body, in this order:

1. **Caller is a Friend at all** — `auth.uid()` is not null and has a profile
   row. Guards against the function being reachable by a role we did not
   intend.
2. **The hangout exists** — `select … into … ; if not found then raise`.
3. **Only extend, never shrink.** ADR-0002's core promise. Structurally
   guaranteed if the only write is an insert-then-merge (a union of ranges can
   only grow), rather than an `update … set starts_at = …`.
4. **Only participants.** Iterate the participant list; never take a friend id
   from outside.

Note what is deliberately *not* checked: whether the caller is themselves a
participant. Issue 01 says "Anyone may confirm, edit or cancel any Hangout.
Flat trust." So authorization is "is a Friend", and the narrowness comes from
the *shape* of the write, not from who requests it. Worth stating explicitly in
the eventual function's comment, because a future reader will assume it is an
oversight.

### 5.3 `search_path` hardening — mandatory, and here is why

> It is best practice to use `security invoker` (which is also the default). If
> you ever use `security definer`, you *must* set the `search_path`. If you use
> an empty search path (`search_path = ''`), you must explicitly state the
> schema for every relation in the function body (e.g. `from public.table`).
> — [Database Functions](https://supabase.com/docs/guides/database/functions)

The RLS guide explains the attack in one sentence:

> Set `search_path = ''` on every `security definer` function and
> schema-qualify the names inside it. **Without a pinned `search_path`, a
> caller can point an unqualified name at their own object and run it with the
> function owner's privileges.**

Unpacked: `search_path` is the list of schemas Postgres searches for an
unqualified name. If our function says `from availability` and an attacker can
create `their_schema.availability` and get their schema searched first, our
`postgres`-owned, RLS-bypassing function happily operates on *their* table —
and, more to the point, on anything else they can name. `set search_path = ''`
means nothing is searched, every name must be written `public.availability`,
and the substitution is impossible. Non-negotiable on every `security definer`
function in this project — the RPC, the profile trigger, and the signup hook.

### 5.4 Granting and revoking execute

> By default, database functions can be executed by any role.
> — [Database Functions](https://supabase.com/docs/guides/database/functions)

"Any role" includes `anon`. A `security definer` function left at defaults is
callable by an unauthenticated stranger with our public key. Always write the
revoke:

```sql
revoke execute on function public.extend_availability_for_hangout(uuid) from public, anon;
grant  execute on function public.extend_availability_for_hangout(uuid) to authenticated;
```

The docs also offer the deny-by-default posture, which is the better long-term
setting for a project whose whole authorization story is "policies are the
security":

```sql
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
```

…after which every function is invisible until explicitly granted.

### 5.5 ⚠️ A tension in the docs you should decide about consciously

The RLS guide says this, flatly, with no exception:

> **Caution:** A `security definer` function in an exposed schema is callable
> over the Data API with the creator's privileges. **Never create one in a
> schema listed under "Exposed schemas"** in your API settings.
> — [RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security)

But `supabase.rpc('fn')` reaches a function *through* the Data API, which means
the function must live in an exposed schema. ADR-0002 requires a browser-callable
`security definer` function. Read literally, the two cannot both be satisfied.

The reconciliation — and this is **my reading, not something the docs state**:
that caution is aimed at *helper* functions, the `private.has_good_role()` kind
that exist to be called from inside a policy and were never meant to be
callable directly. Every example around it puts helpers in a `private` schema.
An intentional RPC is a different animal: it *is* the API surface, and it is
expected to defend itself. The docs' own "Dedicated API schemas" guidance points
the same way — "Objects in a schema such as `api` define the API surface.
Internal tables and helper functions remain in schemas that aren't exposed"
([Securing your API](https://supabase.com/docs/guides/api/securing-your-api)).

**Could not confirm:** no page found states an explicit carve-out for
intentionally-exposed `security definer` RPCs. Treat this as a known sharp edge
rather than a settled question. The mitigations that make it defensible, all of
which the docs do prescribe individually:

- exactly **one** such function exists in the whole project (ADR-0002 already
  says this — it is now a security property, not just tidiness);
- `set search_path = ''` and full schema qualification;
- `revoke execute … from public, anon`, `grant … to authenticated`;
- the function validates `auth.uid()` itself and derives every other fact from
  stored data (§5.2);
- any *helper* it needs goes in a `private` schema, never `public`;
- it gets a pgTAP test file like any RLS-protected table.

### 5.6 Calling it, and reporting failure

```js
const { data, error } = await supabase.rpc('extend_availability_for_hangout', {
  p_hangout_id: hangoutId,
})
```

— [Database Functions](https://supabase.com/docs/guides/database/functions)

Inside the function, `raise exception 'message'` "immediately ends function and
reverts transaction" and the message surfaces to the client, so refusals are
reportable in the UI. `raise log` / `raise warning` write to
Dashboard → Postgres Logs. For the one function in this codebase that can touch
another Friend's data, logging every extension it performs is cheap and is the
closest thing to the audit trail ADR-0002 says it wants.

**Two constraints to design around:**

- "**Overloaded functions are not supported.**" One name, one signature. Do not
  plan a two-arity variant.
- ADR-0002 accepts that extensions are not reverted and that Availability rows
  carry no provenance. Nothing in the docs pushes back on that; it stands.

---

## 6. Realtime

### 6.1 Two mechanisms, and Supabase now recommends the other one

> You can use Supabase to subscribe to real-time database changes. There are
> two options available:
> 1. **Broadcast.** This is the recommended method for scalability and
>    security.
> 2. **Postgres Changes.** This is a simpler method. It requires less setup,
>    but does not scale as well as Broadcast.
>
> — [Subscribing to Database Changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)

For five friends, Postgres Changes is the right call — the scaling numbers
below are three orders of magnitude past our load. But note the recommendation
has moved, in case a future reader wonders why tutorials disagree.

### 6.2 What must be enabled per table

**Publication.** A table emits nothing until it is added to the
`supabase_realtime` publication (a publication is Postgres's own list of tables
whose changes get streamed to replicas — Realtime is a subscriber to it):

> Go to your project's Publications settings, and under `supabase_realtime`,
> toggle on the tables you want to listen to. Alternatively […]:
>
> ```sql
> alter publication supabase_realtime
> add table your_table_name;
> ```
>
> — [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)

Dashboard path: **Database → Publications**. For friens-cal:

```sql
alter publication supabase_realtime add table public.availability;
alter publication supabase_realtime add table public.hangouts;
alter publication supabase_realtime add table public.hangout_participants;
```

**Replica identity — only if you need `old` values.**

> By default, only `new` record changes are sent but if you want to receive the
> `old` record (previous values) whenever you `UPDATE` or `DELETE` a record,
> you can set the `replica identity` of your table to `full`:
>
> ```sql
> alter table messages replica identity full;
> ```
>
> — [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)

Default replica identity sends the primary key on delete. That is enough for a
client that keeps a local `id → row` map, which the grid needs anyway. But note
the linked limitation:

> You can only filter Delete events when tracking Postgres Changes if the table
> has the `replica identity` set to `full`.

So: if the availability subscription is ever filtered, deletes escape the filter
unless replica identity is `full`. Decide once and write it in the migration.

**Grants.** Only relevant off `public`: "You can listen to tables in your
private schemas by granting table `SELECT` permissions to the database role
found in your access token."

### 6.3 Is RLS respected on the stream? Yes — with one hole

Yes. The strongest statement in the docs themselves:

> **Postgres Changes authorizes every event against each subscriber.** When you
> make a single change to a table with 100 subscribed users, Realtime performs
> 100 authorization checks — one per user — so throughput scales with the
> number of subscribers, not the write rate.
> — [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)

Supabase's product page states it as a feature: "Row-level security
integration: Respect database permissions when broadcasting changes"
([Realtime — Postgres changes](https://supabase.com/features/realtime-postgres-changes)).
The quickstart's own step 2 is titled "Allow anonymous access" and consists of
enabling RLS plus writing a `select` policy — i.e. the stream is gated by the
`select` policy, and with RLS on and no policy you receive nothing.

**The hole, and it is documented:**

> **Caution:** RLS policies are not applied to `DELETE` statements, because
> there is no way for Postgres to verify that a user has access to a deleted
> record.
> — [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)

Every subscriber sees every delete on a published table. **For friens-cal this
costs nothing** — Availability is readable by all authenticated Friends anyway
(§4.1), so a delete event leaks nothing that a `select` would not. But it is a
rule to remember before publishing any table whose reads are restricted.

**Could not confirm:** the docs do not state whether `supabase-js` refreshes
Realtime's auth token automatically as the session rotates. `setAuth()` is
documented only in the "Custom tokens" context, and
`await supabase.realtime.setAuth()` appears (with no argument) in the Broadcast
example. If the grid ever goes quiet after a long idle, this is the first thing
to check.

### 6.4 Scoping a subscription to a subset of rows

Server-side filters, which is the important part:

> A filter is a `column=operator.value` expression (for example `id=eq.1` or
> `title=like.%foo%`) that Realtime evaluates **on the server, so filtered-out
> events never leave the database.**
> — [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)

```js
const channel = supabase
  .channel('availability-changes')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'availability', filter: 'friend_id=eq.<uuid>' },
    (payload) => console.log(payload)
  )
  .subscribe()
```

Operators: `eq`, `neq`, `lt`, `lte`, `gt`, `gte`, `in` (max 100 values),
`like`/`ilike`, `match`/`imatch` (POSIX regex), `is`, `isdistinct`. Any can be
negated with `not.`, and — this is newer than most tutorials —
**multiple conditions combine with commas as an `AND`**. There is a typed
builder:

```js
import { postgresChangesFilter } from '@supabase/supabase-js'
// → 'quantity=gte.10,status=eq.open'
const filter = postgresChangesFilter().gte('quantity', 10).eq('status', 'open')
```

Column selection also exists, and is new enough to be worth knowing:

> By default each change event contains the full row. Use `select` to receive
> only a subset of columns instead. […] The listed columns must be selectable
> by the subscribing role, and the table's primary key is always included.
> `select` requires an explicit `schema` and `table` — it's not supported on
> wildcard subscriptions.

```js
{ event: '*', schema: 'public', table: 'profiles', select: ['id', 'display_name'] }
```

**What this means for the grid.** There is no `filter` expression that says
"rows overlapping the visible week" — the operators are per-column comparisons,
and an overlap test is two comparisons on two different columns joined by AND,
which the comma syntax *can* express (`starts_at=lt.<weekEnd>,ends_at=gt.<weekStart>`).
Tempting, but it would need the channel torn down and re-subscribed on every
calendar navigation. Given five friends, the sane v1 is **subscribe to the whole
table unfiltered and filter in the client**, which also sidesteps the
delete-filtering caveat in §6.2 entirely. The filter syntax is here for when
that stops being true.

### 6.5 Scale, for calibration

The docs' own Micro-instance table: 500 connected clients, 64 DB changes/sec,
p95 latency 238ms without RLS. friens-cal has five clients. Realtime is not
going to be the constraint. The one piece of advice that still applies: "Keep
authorization cheap by writing […] indexed RLS policies" — which is gotcha 6 in
§4.3, now with a second reason to obey it, since the policy runs once per
subscriber per event.

---

## 7. Consequences for friens-cal

### 🔴 Blocks a committed decision

**Password reset in v1 requires setting up custom SMTP — a new third-party
vendor.** Issue 01 settled: "**Password reset ships in v1** (Supabase's own
flow)." That is not achievable on the default mail service. Supabase "will
refuse to deliver messages to addresses that are not part of the project's
team", and caps sending at "2 messages per hour" project-wide
([custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
[rate limits](https://supabase.com/docs/guides/auth/rate-limits)). Four of five
friends would never receive a reset email; the fifth gets two an hour, shared
with signup confirmations.

Not fatal — Resend/Postmark/Brevo are free at this volume and the setup is four
fields in the dashboard — but it needs a decision, and probably a provisioning
step in
[`04-provision-supabase-project.md`](../issues/04-provision-supabase-project.md).
Note the mild irony: ADR-0001 rejected Convex partly for requiring "two
accounts, two dashboards and two billing relationships", and we have now
acquired a second vendor anyway. Much smaller — a mail relay, not an auth
provider — so ADR-0001 stands, but its Consequences section overstates the
"one product" benefit and could be amended.

**Same restriction hits signup.** "Confirm Email" is on by default, and that
confirmation is also email. Either set up SMTP before anyone can sign up, or
disable Confirm Email for v1 — defensible *only* because the
`before-user-created` hook already restricts signup to addresses we chose.
Either way it is a decision someone has to make, not a default to inherit.

### 🟡 Sharpens a committed decision

**ADR-0002's `security definer` RPC lives in an exposed schema, and the docs
say never to do that.** The RLS guide's caution — "Never create one in a schema
listed under 'Exposed schemas'" — is unqualified, while `supabase.rpc()`
requires exactly that. My reading is that the caution targets policy *helpers*,
not intentional RPCs, but **no page states that carve-out** (§5.5). ADR-0002 is
not invalidated; the mechanism works and is the standard way to do this. But
the ADR should record that the function is knowingly the one exposed
privileged surface in the project, and that its narrowness is a security
property rather than a matter of taste.

**The RPC must take one argument: the hangout id.** Not `(friend_id, start,
end)`. A `bypassrls` function that accepts a target friend and a time range is
strictly *worse* than the flat-trust option ADR-0002 rejected, because it
grants the same power while looking safe. Deriving participants and range from
the hangout row is what makes the hole narrow (§5.2). Worth writing into
ADR-0002 explicitly, since it is the difference between the decision working
and the decision being decorative.

**Availability's `update` policy needs `with check`, not just `using`.**
Without it, a Friend can `update` their own row and reassign `friend_id`,
writing a block into another Friend's calendar — a second cross-Friend write
path, exactly what ADR-0002 exists to prevent (§4.3, gotcha 2). This is a
one-line detail that silently defeats the ADR if missed. It belongs in
[`07-data-model-and-schema.md`](../issues/07-data-model-and-schema.md).

### 🟢 Confirms what was already assumed

- **Allowlist-gated public signup is achievable, enforceably, with no server.**
  The `before-user-created` hook runs as a Postgres function on the Free plan,
  and "the request does not leave your project's instance". ADR-0001's "no edge
  functions unless a specific decision demands one" survives; §1.4 is the SQL.
  (Caveat: Auth Hooks are dashboard-labelled BETA.)
- **The app-layer allowlist check is UI, not security** — worth keeping for the
  "you're not on the list" message issue 01 wants, but the hook is the boundary.
- **Realtime respects RLS**, needs only a publication entry per table, and for
  five clients is nowhere near its limits. ADR-0001's "realtime is available for
  roughly the cost of subscribing" holds. The delete-events RLS hole costs us
  nothing because Availability is all-Friends-readable anyway.
- **The `public.profiles` + `on_auth_user_created` trigger pattern is current.**
  Nothing newer replaces it, and it is the only way the SPA can read Friend
  identity, since "the Auth schema is not exposed in the auto-generated API".

### 🔵 New work these findings imply

- **Grants are a second lock, and new tables in `public` may be granted to
  `anon` by default.** "Adding policies doesn't remove them." Every table needs
  `revoke all … from anon, authenticated` alongside its `enable row level
  security`. ADR-0001 says "a table without a correct policy is a table anyone
  can read or write" — true, but incomplete: a table with correct policies and
  a stray grant is also a problem. The schema ticket should adopt the
  three-statement recipe from §0 as a checklist item.
- **RLS policy tests are now part of the documented procedure**, with a
  worked pgTAP file and a specific trap ("Never prove an allowed write with
  `lives_ok`"). Given that policies *are* the authorization layer here, this is
  the highest-value testing in the project and probably deserves its own
  ticket.
- **Set `flowType` explicitly** in `createClient`. PKCE requires the reset to be
  completed on the same browser and device it was started on — laptop-to-phone
  breaks it. The docs never state supabase-js's default (§2.3).
- **Rename "anon key" to "publishable key"** in ADR-0001 when it is next
  touched. The `anon` *role* keeps its name; the key is now
  `sb_publishable_...`, and the JWT-style keys "will be deprecated by the end of
  2026".

---

## Sources

All fetched 2026-08-29 from `supabase.com`. Raw Markdown for any guide page is
available by appending `.md` to the URL.

- [Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks)
- [Before User Created Hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook)
- [Password-based Auth](https://supabase.com/docs/guides/auth/passwords)
- [`onAuthStateChange`](https://supabase.com/docs/reference/javascript/auth-onauthstatechange)
- [PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
- [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Send emails with custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- [General configuration](https://supabase.com/docs/guides/auth/general-configuration)
- [Error codes](https://supabase.com/docs/guides/auth/debugging/error-codes)
- [User Management](https://supabase.com/docs/guides/auth/managing-user-data)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Database Functions](https://supabase.com/docs/guides/database/functions)
- [Securing your API](https://supabase.com/docs/guides/api/securing-your-api)
- [Understanding API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Subscribing to Database Changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)
- [Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization)
- [Realtime — Postgres changes (product page)](https://supabase.com/features/realtime-postgres-changes)
