# 14 — Allowlist and self-signup

Status: ready-for-human
Blocked by: 01

## Parent

[friens-cal v1 map](../../shared-availability-calendar/map.md)

## What to build

Friends sign themselves up, and nobody else can. Requires dashboard work, which
is why it is human-led.

The **`before-user-created` Auth Hook, as a Postgres function**, is the only
enforceable allowlist gate — client-side checks and RLS cannot stop a signup.
It reads an `allowlist` table of lower-cased email addresses. **That table has no
browser access at all.**

The hook must be registered in the Supabase dashboard, and needs
`search_path = ''` and explicit grant/revoke like any `security definer`
function. Only the Auth server may call it; the Data API must not.

**Nothing here may leak whether an address is on the list.** The research
document's drafted rejection string (`'That email is not on the list…'`) is
exactly the leak this forbids and must not ship — the ticket 18 copy goes in the
hook's SQL instead.

**Copy alone cannot close the enumeration leak.** With Confirm Email disabled, an
already-registered address returns Supabase's own `User already registered`
regardless of what the hook says. Only a **client-side catch-all** closes it,
which is what ticket 18's draft A is shaped around.

Confirm Email stays **disabled** — safe only because this hook exists. There is
no password reset (ticket 13); the sign-in screen already says so honestly.

## Acceptance criteria

- [ ] `allowlist` table, lower-cased emails, with **no** grants to `anon` or
      `authenticated`
- [ ] `before-user-created` hook function with `search_path = ''` and explicit
      grant/revoke; not reachable over the Data API
- [ ] The hook is registered in the dashboard
- [ ] Sign-up screen using the ticket 18 draft A copy
- [ ] An address on the list can sign up and lands in the setup flow
- [ ] An address not on the list is refused, with a message that does **not**
      reveal list membership
- [ ] An already-registered address produces the same message as a rejected one,
      via the client-side catch-all
- [ ] The real Friends' addresses are seeded, and adding one later is documented
- [ ] `npx tsc -p tsconfig.app.json --noEmit` is clean

## Blocked by

- [01 — Sign in, and your Friend row exists](./01-sign-in-and-friend-row.md)
