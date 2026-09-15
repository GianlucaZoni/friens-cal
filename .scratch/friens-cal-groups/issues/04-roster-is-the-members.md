# 04 — The roster is the cal's Members, and it stays live

Status: ready-for-human
Blocked by: 01, 02

## Parent

[friens-cal — many Groups, joined by Code](../../groups-and-join-codes/map.md)

## What to build

The sidebar currently lists **every Friend in the product**. `use-roster` reads
`from('friend').select('*')` with no filter, and ticket 04 kept `friend` at
`using (true)` on purpose, so the policy will not scope it either.

**The read is not what gets scoped — the sets it feeds are.** The unfiltered
`friend` read stays exactly as it is, and a `membership` read for the current
cal supplies the ids that filter it. Scoping the read itself was disqualified by
a mechanism: `facesOf` silently drops unknown ids, so a scoped read does not
produce a nameless Participant but an **absent** one, the face row one short and
nothing saying so. `namesById` is the casualty that would have been missed —
`nameFor` would print *"someone else"* for a live, present Friend.

**So `friendsById` and `namesById` move inside `useRoster`**, built from the
full set, and no call site can pick the wrong one. They are built today at
`app-shell.tsx:133` and `right-pane.tsx:85`.

**This whole slice ships together, including its SQL.** The two maps moving into
the hook and the members topic are the same change seen from two ends: scoping
the sidebar without a `membership` subscription ships a window where the sidebar
is scoped and dead. Nothing subscribes to `membership` today — ticket 12's
broadcast covers `availability`, `hangout` and `hangout_participant` — so a
Friend who joins your cal and starts drawing is a Friend the roster never heard
of, which is the exact failure v1 built a subscription to prevent, arriving by a
different road.

**`12-cal-members-topic.sql`**, its own file rather than an edit to slice 01's
`11-realtime-per-cal.sql`, so one issue owns one migration. A per-row
`realtime.broadcast_changes()` trigger on `membership` publishing
`cal:<id>:members` and carrying `friend_id`, plus its `realtime.messages` select
policy. The topic's policy landing after the outage is harmless: nothing joins
it until this slice's client does.

**The damage being repaired is the denominator, not a leak.** `heat.ts`'s ramp
is normalised over this set, so every wash on every grid slides toward the
bottom of the range with each signup, `groupSize` counts the whole product, and
every stranger wears a muted silence dot on your sidebar. The glossary already
decided this — Candidate reads *"two or more non-Hidden **Members**"* — so this
brings a query into line with a word rather than choosing a new scope.

**Both reads gate `ready`.** A null member set coerced either way flashes an
empty cal or the whole product.

**Do not narrow the `friend` subscription to match.** It stays table-wide on
`postgres_changes`, so `useRoster` ends up running two channels on two
mechanisms. It is the only path by which a brand-new account reaches an existing
client: a Friend who signs up after your read and then joins your cal arrives as
a `friend` INSERT there, and the members broadcast then makes them a Member. Two
events, two mechanisms, both required. Narrowed, the members broadcast would
announce a Member whose name nobody has.

`use-taken-hues.ts` stays product-wide and deliberately so — Setup happens
before you belong anywhere, and hue is global.

## Acceptance criteria

- [ ] `12-cal-members-topic.sql` exists, is commented, and has been run
- [ ] The sidebar lists only the current cal's Members
- [ ] `friendsById` and `namesById` are built inside `useRoster` from the full
      `friend` set, and no call site builds its own
- [ ] A Participant on a past Hangout who is no longer a Member still renders
      with their name and face
- [ ] A Friend joining the cal in another browser appears in the sidebar without
      a reload
- [ ] A brand-new account that signs up and then joins appears with their name,
      not as an unnamed Member
- [ ] `groupSize` and the heat ramp count the cal's Members, not the product
- [ ] Nothing renders until both reads have returned
- [ ] The `friend` subscription is still table-wide on `postgres_changes`
- [ ] `npx tsc -b` is clean, `yarn test` passes, lint unchanged at nine

## Blocked by

- [01 — The cutover](./01-the-cutover.md)
- [02 — Join or create a cal at `/`](./02-join-or-create.md)
