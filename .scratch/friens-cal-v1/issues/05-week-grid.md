# 05 — The week grid renders your Availability

Status: ready-for-agent
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
- [ ] Week grid renders 30-minute rows for seven day columns
- [ ] Row count is derived from the time zone: 46 rows on the March DST day, 50
      on the October one, with the repeated hour distinguishable
- [ ] Your own Availability renders from real rows
- [ ] Today-forward Availability loads in one query; navigating backwards fetches
      past ranges on demand into the same store
- [ ] Prev/next and Today from the top bar move the view
- [ ] `npx tsc -p tsconfig.app.json --noEmit` is clean

## Blocked by

- [02 — The two-sidebar app shell](./02-app-shell.md)
