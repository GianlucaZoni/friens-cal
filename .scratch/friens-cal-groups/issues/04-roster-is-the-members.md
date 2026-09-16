# 04 — The roster is the cal's Members, and it stays live

Status: ready-for-human — built, 2 criteria await the cutover
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

- [x] `12-cal-members-topic.sql` exists, is commented, and has been run
- [x] The sidebar lists only the current cal's Members
- [x] `friendsById` and `namesById` are built inside `useRoster` from the full
      `friend` set, and no call site builds its own
- [x] A Participant on a past Hangout who is no longer a Member still renders
      with their name and face
- [x] A Friend joining the cal in another browser appears in the sidebar without
      a reload
- [ ] A brand-new account that signs up and then joins appears with their name,
      not as an unnamed Member
- [x] `groupSize` and the heat ramp count the cal's Members, not the product
- [x] Nothing renders until both reads have returned
- [x] The `friend` subscription is still table-wide on `postgres_changes`
- [x] `npx tsc -b` is clean, `yarn test` passes, lint unchanged at nine

## Blocked by

- [01 — The cutover](./01-the-cutover.md)
- [02 — Join or create a cal at `/`](./02-join-or-create.md)

## Built

One SQL file, `supabase/12-cal-members-topic.sql`, and it is **one trigger**.
Client: `src/roster/roster.ts` (+ test) holds the new rules, `use-roster.ts`
grew a second read and a second channel, `lib/broadcast.ts` gained a third
stream, and `app-shell.tsx` and `right-pane.tsx` each lost a `useMemo`.

Everything below was exercised against the local rehearsal stack, with `00`
through `12` applied, three accounts, and a cal holding one Member and a past
Hangout whose Participants include a Friend who is not one. Nothing was run
against the live project.

### The decisions this slice had to make

1. **`12` needs no policy, and that was checked rather than assumed.** The
   ticket says "plus its `realtime.messages` select policy". There is already
   one: `11` §3 matches on the first two segments of the topic only, and says in
   as many words that the third is deliberately unchecked, so `cal:<id>:members`
   was admitted for a Member before it existed. A second `create policy` would
   be a duplicate OR'd against the first, and the day somebody tightened one the
   other would hold the door open. Confirmed on the stack: a Member reads the
   topic, a Friend who has just left reads 0 rows, a malformed topic raises
   nothing.
2. **The trigger is `after insert or delete`, not the three operations `11`
   uses.** `08` §5 grants `select, delete` on `membership` and no `update`,
   because there is nothing on the row to change. An update branch would be a
   handler for an event the schema cannot produce, in the SQL and again in the
   hook.
3. **The member set is tagged with the cal it was read for.** The obvious
   `setMemberIds(null)` at the top of the read effect is a `setState` in an
   effect body, which the lint gate refuses, and it would have made the count
   ten. `useState<{ calId, ids } | null>` plus one comparison at render says the
   same thing and says it better: a set read for the cal you just left is not a
   slow answer about this one, and the stale window stops being representable.
   It also stops this hook leaning on slice 02's `key={calId}`, which is where
   `useAvailability` and `useHangouts` still stand.
4. **Empty while the Members are unknown, never unfiltered.** `friends` is `[]`
   until the second read lands and `status` is `loading` for exactly that long,
   so nothing draws it. The coercion that is never made is the other one: a null
   member set read as "no filter yet" would flash every Friend in the product,
   which is this slice's own defect returning as a flicker.
5. **`RightPane` lost a prop rather than gaining one.** It already takes
   `roster`, so both maps come off that; `AppShell` passes `roster.friendsById`
   straight to `Calendar`. No call site builds either map any more, which is the
   whole point of moving them.

### What was verified, and how

Against the rehearsal stack, migration first:

- `12` applies clean and re-applies clean.
- A join and a leave each wrote exactly one message to `cal:<id>:members`,
  carrying `friend_id` in `record` and `old_record` respectively. `create_cal`
  broadcasts too, since it seeds the first Membership.
- From two signed-in clients: one subscribed to `cal:<id>:members` as the hook
  does and heard both events, payload keys
  `id, old_record, operation, record, schema, table`, which `rowChange` parses
  as it stands.
- The `membership` read returns 1 row for a Member of a one-Member cal and 0
  for a Friend who is not in it, while `friend` still returns all 3. The two
  reads are scoped differently on purpose and the stack shows it.
- The publication still holds exactly `public.friend`.

Then the app itself, dev server pointed at the local stack through a throwaway
env file (deleted afterwards), signed in as one of the rehearsal accounts:

- The sidebar listed **one** Friend in a one-Member cal. Before this slice it
  listed all three accounts on the stack.
- A second client joining that cal put the new Member on the sidebar, named,
  with no reload. Leaving took the row away again, the same way.
- A past Hangout in that cal has a Participant who is **not** a Member. Its
  block on the grid still reads
  `Hangout · Sat 4 Jan, 20:00 – 22:00 · over · with Ada, Cyd`, and that string
  is built from `facesOf(hangout, friendsById)`, so the map holding the departed
  Friend is the thing under test. A Members-only map would have said
  `with Ada` and looked fine.

### Checks

```
$ npx tsc -b
(clean)

$ yarn test
ℹ tests 292
ℹ pass 292
ℹ fail 0

$ yarn lint
✖ 9 problems (9 errors, 0 warnings)
```

Ten of the 292 are new, in `src/roster/roster.test.ts`.

### What this leaves behind

- **The "too few friends" empty state now has a second cause, and its copy only
  names the first.** `emptyReason` returns `too-few-friends` under two visible
  Friends, and `candidate-list.tsx` renders either "Show more friends to see
  when you can meet." or "Nothing to suggest while friends are hidden." Both
  blame hiding. With the roster scoped to Members, a cal with one Member hits
  that branch with nothing hidden, which is exactly what a freshly created cal
  is. Seen on the stack. It belongs to whoever owns the join-or-create screens
  rather than here, and it is copy rather than logic.
- **The full-table `friend` read is untouched and so is its ceiling.** One read
  of every Friend in the product on every load, fine at three and at three
  hundred. Ticket 14 accepted it; nothing here makes it better or worse.
- **`use-taken-hues.ts` is still product-wide**, deliberately: Setup happens
  before you belong to any cal, and hue is global.

### Left for after the cutover

Two criteria, both needing the live project.

1. **"`12-cal-members-topic.sql` … has been run."** A human pastes it into the
   SQL Editor, after `11`. It is the safest file in the effort: it starts no
   outage, silences no client, and writes to a topic nothing joins until this
   slice deploys, so it can go in well ahead of the deploy. Then:

   ```sql
   select tgname from pg_trigger
   where tgrelid = 'public.membership'::regclass and not tgisinternal;
   ```

   Expect `membership_broadcasts`. And the publication check in the file's §4
   should still return exactly `public.friend`.

2. **"A brand-new account that signs up and then joins appears with their name,
   not as an unnamed Member."** Not verified, because verifying it means
   creating an account. The mechanism is the table-wide `friend`
   `postgres_changes` subscription, which this slice deliberately did not touch
   and which `scripts/verify-realtime.mjs` still covers. What is unproven is the
   pair arriving together: the `friend` INSERT, then the members broadcast. It
   needs a second person signing up on the deployed client and using a Code
   while somebody watches a sidebar.

The two criteria that are ticked against the rehearsal stack rather than
production — the sidebar's Members, and a Friend joining appearing live — are
worth repeating once on the live project, with two browsers, after the cutover.
They are ticked because they were run end to end against a stack built from
these exact migrations, not because they were reasoned about.

### Run against the live project, 2026-09-16

Applied with `supabase db query --linked --project-ref mvvxyzqbdkkauxkltavw -f <file>`
rather than the SQL Editor. The post-checks are recorded in
`.scratch/friens-cal-groups/cutover-runbook.md`. The criteria above that waited
on the run are ticked; the browser criteria still wait on real accounts.
