# Cutover runbook: many cals, joined by Code

Status: draft, completed once tickets 03, 05 and 09 land

Everything an agent could build for `.scratch/friens-cal-groups/` is on
`main`. What is left is the part nothing in this repo can do: run SQL against
the live project (ADR-0001), deploy, and press things in a real browser with
real accounts. This file is that list, in the order it has to happen.

Every SQL file below was rehearsed on a local Supabase stack built from
`00-provisioning.sql` through `07-allowlist.sql`, in order, and `09` was
re-run twice to prove it is idempotent. The procedure is in
`supabase/README.md`. The live data has rows the rehearsal never saw, so the
checks after each step are not optional.

## Before you start

1. `yarn install` in the main checkout. Ticket 02 added `input-otp` to
   `package.json` and one entry to `yarn.lock`.
2. Read `supabase/08` through `13` once. Each header says what it does and why.
   The comments beside anything that looks like a mistake exist because it
   is not one.
3. Tell the other Friends there will be a few minutes where the app errors and
   a reload is needed afterwards. Planning ticket 04 §8 accepted this outage
   over a staged rollout.
4. Pick a quiet moment. `09` through `11` plus the deploy are one sitting.

## The safe files first

These touch nothing the deployed client can see. Run them any time before the
sitting, in the Supabase SQL Editor, as the dashboard's `postgres` role (that
role has to own `private.my_cal_ids()`).

### `supabase/08-cal-and-membership.sql`

The `private` schema and its one helper, `cal`, `membership`, `create_cal`,
`join_cal`. Then:

```sql
select proname, prosecdef from pg_proc where proname in ('my_cal_ids', 'create_cal', 'join_cal');
```

Expect three rows, all `prosecdef = true`.

### `supabase/13-invite.sql`

`allowlist.invited_by`, the tightened email constraint, the one `insert` grant.
First run this and fix anything it returns, or `13` aborts on the constraint:

```sql
select email from public.allowlist where email <> lower(btrim(email));
```

If it returns rows, run the `update` in `13`'s §2 comment, then paste the file.
Afterwards:

```sql
select email, invited_by from public.allowlist order by added_at;
```

Expect the seeded rows with `invited_by` null.

## The sitting

### 1. `supabase/09-per-cal.sql` (the outage starts here)

`cal_id` through `availability`, `hangout` and `hangout_participant`, the new
keys and constraints, every policy rewritten, `friend.time_zone` and its
grant, and the backfill into the one cal named "spiritually unemployed". From
this statement on, the deployed client's every draw fails with `42P10`.

If it stops on `23514`, an existing Slot is off the half-hour grid; the query
to find it is in the comment above the `availability_on_the_slot_grid`
statement. Fix the row, re-run the file. It is safe to re-run from the top.

Then:

```sql
select id, name, code from public.cal;                                 -- one row; keep the Code
select count(*) from public.availability where cal_id is null;         -- 0
select count(*) from public.hangout where cal_id is null;              -- 0
select count(*) from public.hangout_participant where cal_id is null;  -- 0
select count(*) from public.membership;                                -- one per row in public.friend
```

### 2. `supabase/10-lifecycle-per-cal.sql`

The drop trigger and `retime_hangout` made cal-aware, `cal_id` pinned on
update, and the `before delete on membership` trigger that writes Left. No
check beyond "it ran".

### 3. `supabase/11-realtime-per-cal.sql`

Broadcast triggers on the three tables, the `realtime.messages` policy, and
the three publication drops. This silences the deployed client's live updates.

```sql
select tablename from pg_publication_tables where pubname = 'supabase_realtime';
```

Expect exactly `friend`.

### 4. `supabase/12-cal-members-topic.sql`

One more broadcast trigger, on `membership`. Nothing joins its topic until the
new client is up, so it is harmless here and belongs in the same sitting.

### 5. Deploy

Push `main`. Vercel redeploys production from it. Then every open tab needs a
reload; tabs left open across the window show errors until then.

```bash
git push origin main
```

### 6. Prove Realtime from the repo

```bash
node --env-file=.env scripts/verify-realtime.mjs
```

It proves broadcast delivery on both cal topics, the payload shape, that a
`postgres_changes` subscriber hears nothing about the same write, and that
`friend` still arrives the old way. It writes 400+ days out and deletes what
it writes.

```bash
node --env-file=.env scripts/verify-allowlist.mjs
```

It proves the four invite locks. It leaves one probe row,
`invite-probe@friens-cal.invalid`, which can never receive mail; it prints the
statement to delete it.

### 7. Dashboard

Database, Linter: suppress rule 0029 for `create_cal` and `join_cal`, naming
ADR-0003. They are exposed `security definer` functions on purpose and the
reasoning is beside each in `08`.

## Browser acceptance, with real accounts

These are the criteria no script can stand in for. Each line names the ticket
whose `### Left for after the cutover` section has the detail.

- **01** Two browsers, two signed-in Friends, draw on one, watch it paint on
  the other.
- **02** Press the copy button beside a Code on `/` and paste it somewhere.
  The harness could not grant clipboard permission; everything else on that
  page was clicked through on the rehearsal stack.
- **04** A Friend joins your cal from another browser and appears in your
  sidebar without a reload. Then, the one that needs a brand-new account: sign
  somebody up, have them join, and check they appear with their name.
- **06** Invite an address from the blobatar menu, then have that person sign
  up. An uninvited address still cannot.
- **07** Two browsers in different zones (a VPN, or a laptop with its zone
  changed) read different wall clocks off the same drawn Slot; the roster
  shows `Nh ahead` beside the other one; time strings gain `GMT+x` only then.
- **03, 05, 09** to be added when those tickets land.

## The verify scripts that now fail, and why that is fine for today

`verify-availability`, `verify-candidates`, `verify-hangout` and
`verify-hangout-lifecycle` still write rows without a `cal_id` and fail from
`09` onward. They are v1's regression suite for the lifecycle, and rewriting
them is its own ticket. `verify-realtime` and `verify-allowlist` are current.
