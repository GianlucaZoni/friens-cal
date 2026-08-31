# 05 — The week grid renders your Availability

Status: ready-for-human
Blocked by: 02

## Parent

[friens-cal v1 map](../../shared-availability-calendar/map.md)

## What to build

The calendar's centre column: a week grid of 30-minute rows that reads your own
Availability out of the database and draws it. Read path only — drawing is
issue 06.

**Availability is slot rows, not ranges** (ticket 07). This is the decision the
whole product rests on: merging stops existing, overlap counting becomes a
`group by`, concurrent writes are safe, and the cross-Friend RPC becomes
*structurally* insert-only.

```
availability  friend_id  uuid
              slot_start timestamptz
              unique (friend_id, slot_start)   -- makes writes idempotent
              index on (slot_start)            -- the today-forward scan
```

**Build the grid's rows from the time zone, not from the number 48.** In
Europe/Rome, March has a 23-hour day (46 slots) and October a 25-hour day (50
slots, with 02:00–03:00 occurring twice). A fixed 48-row grid shows an hour that
does not exist in March and hides one in October.

Timestamps are stored UTC and rendered in **one fixed group time zone**; per-
viewer time zones are explicitly out of scope for v1.

Fetching: **everything from today forward, unbounded**, in one query. Past
ranges are fetched on demand as the viewer navigates into them, into the same
store, and excluded from Candidate computation by date.

## Acceptance criteria

- [ ] `availability` table with the unique constraint and index above
- [ ] `revoke all` + explicit grants, and RLS: a Friend reads all rows, and
      inserts/deletes **only their own** — the `with check` on any update policy
      is load-bearing, or a Friend could reassign `friend_id`
- [x] Week grid renders 30-minute rows for seven day columns
- [x] Row count is derived from the time zone: 46 rows on the March DST day, 50
      on the October one, with the repeated hour distinguishable
- [ ] Your own Availability renders from real rows
- [ ] Today-forward Availability loads in one query; navigating backwards fetches
      past ranges on demand into the same store
- [x] Prev/next and Today from the top bar move the view
- [x] `npx tsc -p tsconfig.app.json --noEmit` is clean

## Blocked by

- [02 — The two-sidebar app shell](./02-app-shell.md)

## Comments

**Built on `feat/05-week-grid`.** Two commits: the slice, then the two-axis
review applied. **The database half is not done** — see "What is waiting on you"
at the bottom.

### The slot row generator is the tested seam, and it was written first

`src/availability/slots.ts` has no `@/` imports, which is what lets `yarn test`
(`node --test`) reach it — the same split `roster.ts` and `identity.ts` already
make. 17 new assertions, 46 in the suite. The two that matter are asserted
against the real tz database rather than a table of numbers:

- `2026-10-25` in `Europe/Rome` is **50 slots**, `02:00` appears twice, and the
  two carry `+2` and `+1`;
- `2027-03-28` is **46 slots**, `02:00` is absent entirely, and `01:30` is
  followed by `03:00`;
- the same two dates are 48 slots in `UTC`, so the count demonstrably comes from
  the zone and not from the date.

The time zone is a parameter here, not a constant — it is what the tests vary.
Its one home is `GROUP_TIME_ZONE` in `use-calendar-view.ts`, beside
`WEEK_STARTS_ON`.

### The DST week needed a decision the issue does not make

Rows are equal *duration*, because that is what makes a block's height mean
something and what makes issue 06's pixel-to-slot arithmetic honest. So a
25-hour day is 50 rows, not 48 taller ones — and on that week **the seven
columns genuinely disagree about what time it is**. No single hour gutter can be
true for all of them.

The first attempt took the week's *longest* day as the gutter. The spec review
caught it: on the October week that labels six of seven columns an hour out
below 02:00 — the wrong six. What ships instead:

- the **shared gutter is the day length the week agrees on** (unanimous 50 weeks
  a year, six-to-one on the two DST weeks);
- the **day that disagrees carries its own gutter**, immediately to its left,
  where the repeated `02:00` appears twice with its offset (`02+2`, `02+1`) and
  the missing one in March is visible as an absence (`01`, then `03`);
- the header reserves the same width, so every column still sits under its own
  date;
- the transitioning row is additionally marked in place with a dashed rule and a
  chip naming the hour, so that column reads without any gutter at all.

Verified in the browser: ordinary week one 48-row gutter and no chips; October
two gutters, 48 and 50; March two, 48 and 46. Header misalignment is 0px in all
three.

### The store, and what issues 06 and 07 will find

`useAvailability(calendar.days)` in `src/availability/use-availability.ts`,
instantiated in `AppShell` beside `useCalendarView` and `useRoster` — the
established place for state the whole view reaches. Plain React state, for the
reasons issue 04 already recorded.

- **Keyed `(friend_id, slot_start)`**, as epoch milliseconds rather than text:
  PostgREST returns `…T00:00:00+00:00` and `Date#toISOString` writes
  `…T00:00:00.000Z`, and keying on the string would make those two rows. Keyed on
  the instant, ticket 19's optimistic row and its Realtime echo are the same row
  and the echo is a no-op.
- **Folded by union, never replaced.** Navigating backwards fetches the strip
  below the floor into the same store. A replace would blank the week you were
  looking at. It also makes a duplicated fetch free — a StrictMode double-mount,
  a retry, an echo — which is why the promise has no `live` guard: discarding a
  late result is the only way to lose rows that are otherwise idempotent.
- **Issue 07 is one line**: delete the `.eq('friend_id', userId)`. Nothing else
  here is per-Friend, because the key carries the Friend.
- **The cost, named:** a union cannot express a deletion that happened
  elsewhere. Nothing in this slice deletes, and the subscription that will notice
  is issue 07's.

`requestedFrom` is a `ref`, not state — it is a request log, and writing it
synchronously inside the effect that reads it is exactly the cascading render
`eslint-plugin-react-hooks` v7 rejects. `status` is derived rather than assigned,
the same shape issue 04 hit with the mini calendar.

Verified: **four forward navigations issue zero queries** (the boot query is
unbounded above, so week navigation needs no refetch — ticket 07 §10), and
navigating backwards does fire.

### Your own Availability is a border and a ring, and no fill

Ticket 15. Contiguous slots are reassembled into runs by `runsOf` at render
time — merging happens there and nowhere else — and each run is one outlined
block, `pointer-events-none` so issue 06's drag reaches the column beneath it.
No fill, so issue 07's density will show straight through the middle rather than
being occluded, which is the whole reason ticket 15 changed it.

Measured: `oklch(0.62 0.105403 35)` in light and `oklch(0.75 0.127503 35)` in
dark, from `--friend-l` / `--friend-c` through the cascade with nothing branching
in JS; `background-color: rgba(0, 0, 0, 0)` in both. Block geometry lands exactly
on the grid — 18:00–22:00 is `top: 720px`, `height: 160px`.

### One defect fixed that predates this slice

The shell lattice's flex items were stretched to the *scroller's* height, so
every column's `border-l` divider stopped **646px short** while its 20px rows
overflowed past it — and the absolutely positioned blocks this slice adds would
have hung outside their own box. `items-start` on the scroll container fixes
both. The grid still scrolls inside the inset (`scrollHeight` 960, `clientHeight`
315) and the page scrolls neither way, at 1440px and at 375px.

### The read is paged, because "one query" would have silently truncated

The spec review's find, and the sharper of the two. Supabase caps every
PostgREST response at `db-max-rows` — **1000 by default, applied silently**. For
slot rows that is 500 hours: a Friend who marks eight hours a day crosses it
inside four months, and issue 07 multiplies it by the size of the Group. A
truncated read is indistinguishable from a Friend who drew less.

The first page is still the one query the issue asks for. It only pages on when
a page comes back full, which until someone has drawn a great deal never
happens.

### Four review findings deliberately not taken

1. **The viewer is read from the session, not from `roster.friends`**, which
   holds the same thing. Going through the roster would make the grid's colour
   wait on a read it otherwise has nothing to do with. It is not a second read
   of `friend` — no query is issued.
2. **`GROUP_TIME_ZONE` lives in `use-calendar-view.ts`**, which does make
   `availability/` import from `shell/`. The brief asked for it beside
   `WEEK_STARTS_ON` explicitly, and they are the same kind of fact: the two
   conventions the grid's geometry is built from.
3. **A failed read does not retry on its own.** The floor is rolled back so the
   range can be re-asked, but nothing re-runs until the viewer navigates; the
   error dot stays until then. Ticket 19's retry contract is about writes, and
   issue 06 has to build that machinery anyway.
4. **The week and month header blocks are now near-identical.** Merging them
   means touching `MonthLattice`, which this slice was told to leave alone.

### CONTEXT.md caught up with ticket 07

The glossary still described Availability as ranges that merge. **Slot** is now
a term of its own — half an hour, the smallest thing anything in the product can
refer to, and explicitly *not* always forty-eight to a day. Availability is one
Slot. What a person calls a range is a **run**, and the entry says plainly that a
run has no identity, no start and no end of its own, so merging never happens
because there is never anything to merge. Candidate follows the same vocabulary;
Hangout gains the contrast — it **is** a range, and that is what lets it outlive
the Availability underneath it.

### Not built, on purpose

No pointer handler exists anywhere in `src/availability/` (issue 06). No other
Friend's rows, no heatmap, no slot popover, no Realtime (issue 07). Nothing
computes overlap (issue 08). `MonthLattice` is byte-identical to the stub (issue
11). No silence dot. No `update` grant and no update policy.

### Known limitation

The column headers sit outside the scroll container, so on a platform with
classic rather than overlay scrollbars they would be offset from the columns by
the scrollbar's width. Pre-existing in the stub, invisible on macOS, and
properly issue 12's to settle.

### What is waiting on you

`npx tsc -b` is clean for all three projects, 46 tests pass, and lint is
unchanged at the 9 errors already on `main` (all in `src/components/ui/*` and
`grid-pattern.tsx`).

`supabase/02-availability.sql` is **written and not applied**. Nothing in this
repo can reach the project with DDL rights — the `.env` holds only the
publishable key, by design (ADR-0001). Until it is pasted, the grid renders the
lattice with an error dot in the top-left corner and the console says
`Could not find the table 'public.availability' in the schema cache`, which is
the read path working.

1. Paste `supabase/02-availability.sql` into the Supabase SQL Editor and run it.
2. Run `node --env-file=.env scripts/verify-availability.mjs`.

The script is one check per database criterion, and it **seeds three runs of
Availability through the client** and leaves them — including one a week in the
past, which sits below the store's boot floor, so it only appears once you
navigate to the previous week. That is the on-demand past fetch made visible.

The last four criteria are ticked when that script runs green, and the issue is
`resolved` then and not before.
