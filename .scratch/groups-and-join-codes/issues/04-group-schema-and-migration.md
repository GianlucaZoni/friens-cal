# 04 — The Group, Membership, and dragging `group_id` through everything

Type: grilling
Blocked by: 02
Status: open

## Question

The schema, its policies, and the migration of live data. Ticket 01 settled the
*shape* of the domain; this settles the tables, and it is the ticket the rest of
the build is generated from.

1. **`group`** — id, name, code, `time_zone`, `created_at`, provenance. Is
   `group` even a legal table name in Postgres (it is a reserved word), and if
   quoting it everywhere is the cost, is `friens_cal` or `circle` the better
   physical name for a thing the glossary calls a Group? Ticket 01 fixed the
   *domain* term, not the identifier.

2. **`membership`** — `(group_id, friend_id)`, `joined_at`. Is that the whole
   row? Anything per-membership at all, given ticket 01 put identity globally on
   `friend`?

3. **The Code's uniqueness and generation.** Six characters from a 26-letter
   alphabet. Generated where — a Postgres `default`, a trigger, or the client
   retrying on conflict? A `default` that calls a random function cannot retry
   itself on a unique violation.

4. **`availability` changes its primary key** to
   `(group_id, friend_id, slot_start)`. That is not an `alter` on a shipped
   table the way `01-friend.sql` and `02-availability.sql` are written ("changing
   a shipped column means a new file, not an edit to this one"). What does the
   new file look like, and does the client's optimistic write keying (v1 ticket
   19) survive the wider key unchanged?

5. **`hangout` changes its exclusion constraint** to
   `exclude using gist (group_id with =, tstzrange(starts_at, ends_at) with &&)`.
   Confirm `btree_gist` covers the scalar equality half — v1's `05-hangout.sql`
   predicted this exact day ("`btree_gist` becomes load-bearing the day a scalar
   joins the constraint").

6. **ADR-0002's RPC.** `retime_hangout(hangout_id, starts_at, ends_at)` now
   writes `availability` rows that need a `group_id`. It derives *who* from the
   stored row; deriving *which Group* from the same row keeps the hole exactly as
   narrow, but the ADR needs an amendment saying so rather than a silent widening.

7. **Every policy on every table**, rewritten against ticket 02's helper. Five
   tables. Plus the grants, which v1's ADR-0001 refinement established as an
   independent second lock.

8. **The migration**, as a runnable file. Ticket 01 settled the content — one
   Group named "spiritually unemployed", everybody joined, every row backfilled,
   every `allowlist` row attributed to the human. The open part is *ordering*: a
   `not null group_id` cannot be added before the backfill, and the app is
   deployed and live while this runs. Is there a safe order that avoids a
   window where the deployed client writes rows the new schema rejects, or does
   this accept a few minutes of downtime and say so?

9. **`CONTEXT.md`** already carries the new terms from ticket 01. Check it still
   matches what this ticket decides, and that no implementation detail leaked
   into it.
