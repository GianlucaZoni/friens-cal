# 06 — Inviting a Friend

Status: ready-for-human
Blocked by: 02

## Parent

[friens-cal — many Groups, joined by Code](../../groups-and-join-codes/map.md)

## What to build

Putting an email address on the allowlist from inside the app, so invites stop
being a trip to the SQL Editor.

**`13-invite.sql`.** `allowlist` never had an `invited_by` column, so this is a
schema change, and the five seeded rows carry a null inviter forever. The check
constraint tightens to `lower(btrim(email))` — the old one let a trailing space
through, and such a row would match the signup hook never.

**No function.** ADR-0003's condition 1 cannot be met by an invite function: its
only meaningful argument is a person's address, which is *who*. The rule was not
widened, and the audited set stays at exactly three. What ships instead is a
plain `insert` grant plus `with check (invited_by = (select auth.uid()))`, one
verb wide.

**There is no read side, and that is the load-bearing refusal.** "Show me my own
invites" needs a `select` path on a table of personal addresses, and
`07-allowlist.sql` is built end to end on nothing there being readable by a
publishable key. With no read, the write is upserted `on conflict do nothing`
with `return=minimal`, so the response cannot distinguish a new address from one
already on the list. The inviter therefore learns nothing about prior state, and
the copy must state an outcome rather than an event: *"rob@gmail.com can now
create an account."*

**A typo is a live door, not a mess.** `friend` is `using (true)`, so a mistyped
address buys a stranger the whole roster. No delete ships, so
confirm-before-write is the whole mitigation and it is not optional.

**The dialog lives in the blobatar menu** and is disabled until a Friend row
exists — because of the foreign key, not because setup is incomplete. It is
**two steps whose second one is yours**: the product sends no email, so step two
hands over a pasteable sentence carrying where the invite came from and the
current cal's Code.

**The row stays cal-free.** An Invite admits somebody to the product, not to a
cal. What a human pastes into a message is not what the row holds.

## Acceptance criteria

- [ ] `13-invite.sql` exists, is commented, and has been run
- [ ] `allowlist` has `invited_by`; the five seeded rows are null and stay null
- [ ] The check constraint rejects a trailing space
- [ ] A Friend can insert an allowlist row only with their own id as inviter
- [ ] No client can read `allowlist`, and this is asserted rather than assumed
- [ ] Inviting an address already on the list is indistinguishable in the
      response from inviting a new one
- [ ] The dialog confirms before writing and names the address being invited
- [ ] Step two offers a pasteable sentence carrying the origin and the current
      cal's Code
- [ ] The entry is disabled until the Friend row exists
- [ ] An invited address can then sign up, and an uninvited one still cannot
- [ ] `npx tsc -b` is clean, `yarn test` passes, lint unchanged at nine

## Blocked by

- [02 — Join or create a cal at `/`](./02-join-or-create.md)
