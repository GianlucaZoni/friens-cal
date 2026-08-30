# 09 — Confirm a Candidate into a Hangout

Status: ready-for-agent
Blocked by: 08

## Parent

[friens-cal v1 map](../../shared-availability-calendar/map.md)

## What to build

A Candidate becomes a **Hangout** — a committed record that survives changes to
the Availability that produced it. **Confirming is the only way a Hangout is
ever created**; drawing one on the grid is out of scope.

```
hangout              id uuid pk, starts_at, ends_at timestamptz (30-min grid),
                     title text null, created_at
                     exclude using gist (tstzrange(starts_at, ends_at) with &&)
hangout_participant  hangout_id, friend_id, left_at timestamptz null
                     primary key (hangout_id, friend_id)
                     index on (friend_id)      -- leading-column trap
```

**The exclusion constraint earns its keep twice.** Forbidding overlapping
Hangouts is a product decision; expressing it in the database also **resolves the
confirm race** — two Friends cannot both win, and the loser's rejection is
converted client-side into a **Join**. Needs `btree_gist`, already installed.

Participants are **stored and seeded at confirmation** from the Candidate's
Friend set.

A confirmed Hangout shows on **everyone's** calendar — including non-Participants
— with participants' blobs and a glowing border, and **pins above the Candidate
list until it ends** (not until its day: that would clear a Saturday Hangout at
midnight on Saturday). Hiding never hides it.

Its slots are blanked from the Candidate pipeline (issue 08 step 3), which is
already built.

## Acceptance criteria

- [ ] Both tables, with the exclusion constraint and the `friend_id` index
- [ ] `revoke all` + grants **and** RLS on both
- [ ] Confirming from a Candidate card creates the Hangout and seeds Participants
- [ ] Two concurrent confirmations of overlapping ranges: one wins, and the
      loser is converted into a Join rather than shown an error
- [ ] The Hangout renders on every Friend's grid, Participant or not
- [ ] It pins above the Candidates and unpins when it **ends**
- [ ] Its range disappears from the Candidate list
- [ ] Anyone may confirm — flat trust, no ownership
- [ ] `npx tsc -p tsconfig.app.json --noEmit` is clean

## Blocked by

- [08 — The Candidate list](./08-candidate-list.md)
