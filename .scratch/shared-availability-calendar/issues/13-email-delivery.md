# 13 — Email delivery: custom SMTP, or no email at all

Type: grilling
Status: resolved
Blocked by: —

## Question

Ticket 01 settled that **password reset ships in v1**. Ticket 02's research
found that is not achievable as assumed: Supabase's **default mail service
refuses to deliver to any address that is not a project team member**, and caps
sending at **2 messages per hour project-wide**. Four out of five friends could
never receive a reset email — and the same restriction applies to the signup
confirmation email.

So one of these has to be chosen:

1. **Custom SMTP** (Resend, Postmark, Brevo — free at this volume). Reset and
   confirmation both work properly. Cost: a second vendor, a domain or a sender
   identity, and DNS records. Mildly awkward given ADR-0001 rejected Convex
   partly on the grounds of "two accounts, two dashboards" — worth saying out
   loud rather than quietly accepting.
2. **Drop email entirely for v1.** Disable Confirm Email (defensible *only*
   because the `before-user-created` hook already gates who may sign up, so an
   unconfirmed address cannot be a stranger) and handle a forgotten password
   out-of-band — you reset it from the dashboard when a friend asks in the
   group chat. Zero infrastructure, and honest at five users.
3. **Custom SMTP for reset only**, confirmation disabled.

Also to decide here: **which `flowType`** `supabase-js` uses. The docs never
state the default, and PKCE requires the reset to complete **on the same browser
and device** — which breaks the very common "link arrives on my phone, I'm on my
laptop" case. Set it explicitly either way.

Blocks ticket 04, because both the dashboard configuration and the redirect
allowlist depend on the answer.

## Answer

<!-- the choice, and what it costs -->

## Answer

**Option 2: no email at all in v1.**

- **Confirm Email is disabled.** Defensible only because the
  `before-user-created` hook already gates who may sign up, so an unconfirmed
  address can never belong to a stranger.
- **No password reset flow ships.** A friend who forgets their password asks in
  the group chat and the password is reset from the Supabase dashboard. This
  reverses ticket 01's "password reset ships in v1" — see the Corrections there.
- **No custom SMTP, no second vendor**, no domain or DNS setup. ADR-0001's
  "one vendor" argument holds after all.
- The two reset screens and the `PASSWORD_RECOVERY` handling from ticket 02's
  research are **not built**. If email is ever added, that research still
  stands and the flow can be built then.
- **`flowType` must still be set explicitly** on the `supabase-js` client, since
  the docs never state the default. With no email links in play the PKCE
  cross-device problem disappears, so this is now a small hygiene item for
  ticket 04 rather than a decision.

Unblocks ticket 04.
