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

- [x] Both tables, with the exclusion constraint and the `friend_id` index
- [x] `revoke all` + grants **and** RLS on both
- [x] Confirming from a Candidate card creates the Hangout and seeds Participants
- [x] Two concurrent confirmations of overlapping ranges: one wins, and the
      loser is converted into a Join rather than shown an error
- [x] The Hangout renders on every Friend's grid, Participant or not
- [x] It pins above the Candidates and unpins when it **ends**
- [x] Its range disappears from the Candidate list
- [x] Anyone may confirm — flat trust, no ownership
- [x] `npx tsc -p tsconfig.app.json --noEmit` is clean

## Blocked by

- [08 — The Candidate list](./08-candidate-list.md)

## Built

Branch `feat/09-confirm-a-hangout`. `supabase/05-hangout.sql` is a human paste
(ADR-0001) and has been run; `scripts/verify-hangout.mjs` is **30 checks green**
against the live project and is idempotent.

### The decisions this slice had to make, not just carry

**Who may insert a `hangout_participant` row.** Ticket 07 §8 gives this table
"read by all; you may set your own `left_at`; deletes happen only via the drop
trigger" and never says who may **insert** — which confirming has to do, for
*other* Friends. Answered as **flat trust**, `with check (true)`, with the
narrow ADR-0002-shaped alternative written into the migration and rejected on
four counts: it guards the wrong thing (a Participant list is a group fact, and
`delete` on `hangout` is already `using (true)` — a fence beside an open gate);
it converts a benign race into a `42501` where the product's answer is the drop
rule; it needs a policy helper in an exposed schema, which is exactly the shape
ticket 07 §9's judgement was *not* spent on; and a wrong row is a Hangout you
can Leave, not data loss. **Confirmed by the human.**

**The 30-minute grid as a constraint, not a convention.** Ticket 07 §6 attaches
the snap to the manual time editor (issue 10's). Said once structurally instead,
so coverage stays exact containment whatever writes the row. Written against the
UTC lattice because nothing in this schema knows about Rome — the two agree only
because Rome's offsets are whole hours, and a `:45` group zone would need it
rewritten rather than relaxed.

**Confirm needs no cross-Friend Availability write, and nothing should reach for
ADR-0002's RPC.** A Candidate is *by definition* a run in which every one of its
Friends already holds Availability at every Slot. That is what makes confirm the
simple one of the three, and it is said in the migration and in the hook because
it is the obvious wrong turn.

**An unnamed Hangout is called "Hangout"** (`nameOf`), and the name is what the
grid marker carries. Both **came from the human after the first build**, and both
replaced something worse: the card promoted the *time* to the headline when the
title was null, inverting ticket 16's hierarchy on every card this slice can
produce; and the grid block drew a bare pin, which read as decoration and was
indistinguishable from the drag's own dashed outlines. → ticket 16's amendment.

### Judgement calls, named so they can be overruled

1. **`edited` is not built.** Ticket 08 §1 wants the muted word after the title,
   but there is no column for it in this ticket's schema and nothing that could
   set one — retime is the only thing that marks a Hangout. It arrives with the
   migration that writes it, as **`edited_by`** (ticket 07's amendment and the
   human's answer to its `Needs the human`), which is the mark *and* the name in
   one column — and which a **rename** sets too.
2. **The touch route is a permanently-visible tick, not ticket 16's detail
   sheet.** The sheet is the live decision and every action it lists — Join,
   Leave, `Change the time…`, Cancel — is issue 10's, so there was nothing for
   it to carry. Ticket 16's amendment gives it naming, which is its own content;
   issue 10 replaces the tick when it lands. A visible tick is not the "bare tap
   writes" that rule was protecting against — it is an explicit control, which
   is ticket 16's own earlier answer.
3. **Confirm is not optimistic**, against ticket 19's rule for gestures. Ticket
   19's optimism was for a 60fps drag; a confirm is one click whose whole point
   is that it either won the race or lost it.
4. **Its first insert is not retried**, alone among this app's writes. A retry
   is indistinguishable from losing: a landed insert whose response was lost
   comes back `23P01`, and the conversion would then Join us to our own Hangout
   and leave every other Friend unseeded. The participant seed *is* retried,
   because `on conflict do nothing` makes it idempotent.
5. **A failed seed compensates by deleting the Hangout.** Two statements outside
   a transaction, so the compensation belongs to whoever issued them. Not ticket
   08 §4's auto-cancel, which is about the last Participant *leaving* and is the
   trigger's. Leaving the row would be worse than a failed confirm: an empty
   Hangout holds its window against the exclusion constraint, so nobody could
   confirm that evening.
6. **`hangout.ends_at` is indexed and `starts_at` is not.** The exclusion
   constraint's GiST index is on an *expression*, so it serves neither read's
   plain comparison. `ends_at` is the selective half of both; the boot read's
   sort then runs over the handful of rows the constraint's own "one plan at a
   time" leaves.

### What the two-axis review changed

The **Spec** axis found a real bug. `joinTheWinner` used `maybeSingle()` on a
guarantee the exclusion constraint does not give: it forbids two Hangouts
overlapping *each other*, not several from sitting inside one Candidate's range.
A 20:00–23:00 window holds 20:00–21:00 and 21:30–22:00 quite legally, and in
exactly the state that function exists for — a stale store — the re-read
returned two rows, answered `PGRST116`, and fell through to the error AC 4
forbids. Now `.order('starts_at').limit(1)`, and the live script pins it.

The **Standards** axis cleared all four SQL semantics this repo cannot execute
(the immutable `date_part` form, the inline `exclude using gist`, the
column-scoped grant against the RLS policy, and the cascade with no delete
grant) and corrected one claim: **Postgres does not enforce immutability in a
CHECK constraint at all** — only in index expressions. So the naive
`extract(minute from starts_at)` spelling would be *accepted* and would then
answer differently per connection `TimeZone`, which makes it more dangerous than
the comment first said and is why the behavioural check earns its place.

It also caught a shadowing worth an hour of somebody's life: a module-level
`failed(title, description)` in the same file as `const [failed, setFailed]`, so
`status: failed ? …` and `return failed(…)` were two different `failed`. Now
`reportFailure`.

### Verified against the live database (30 checks)

The three that only a script can prove: **the exclusion constraint rejecting an
overlap with `23P01`**, **a back-to-back Hangout being allowed** — the range is
`[)`, and an inclusive bound would have silently forbidden two plans in one
evening with nobody finding out from the migration — and the **grants as a second
lock independent of RLS**: no delete on `hangout_participant`, a `hangout_id`
update refused because the grant is column-scoped, and another Friend's
`left_at` matching zero rows rather than erroring.

Plus: the cross-Friend Participant seed; seeding twice as a no-op; Realtime
INSERT on both tables reaching a second session and a hard DELETE carrying the
primary key (which is why `replica identity full` is not set); and the cascade
removing Participants with no delete grant in play.

And the race conversion's own three statements, run in order against the real
schema — the winner lookup, **the two-legal-Hangouts-in-one-range regression**,
and `ignoreDuplicates` leaving a Left Friend Left rather than walking them back
into a plan they left.

### Verified in the browser, at 1440×900

- **Two pinned cards above a divider, then four Candidate cards.** The divider
  exists because both regions do.
- **The pin glyph, muted fill, and no hue anywhere** on a Hangout card, against
  the Candidates' stripe below it.
- **`Hangout | Fri 4 Sep · 13:30 – 21:00`** and **`Coffee | Fri 10 Sep ·
  10:00 – 11:00`** — name as the headline, date and time as the second line, in
  both the titled and untitled case.
- **The grid block**, on the Friday column, 300px tall for seven and a half
  hours at 40px/hour, labelled `Hangout` and carrying two Participants' blobs.
  Its `aria-label` reads *"Hangout · Fri 4 Sep, 13:30 – 21:00 · with UserTwo,
  Gianluca"*.
- **Both confirmed ranges are gone from the Candidate list**, one created
  through the UI tick and one by the script — the two routes, same outcome.
- **Six ticks, each labelled with its own date and range** (`Confirm Mon 6 Sep,
  19:00 – 23:00`), because a flat list with no day headers would otherwise give
  a screen reader six identical buttons.
- Console clean.

**Not driven here: a click.** Pointer events do not reach the app in this
Browser pane — the same known local limitation issue 08 recorded — so the tick
was read, not pressed. The Hangout at `Fri 4 Sep 13:30–21:00` is nonetheless
evidence the tick works end to end, because nothing else in the product can
create a Hangout and the script created only its own two. That is also why 7b
exists in the verify script.

### State of the checks

`npx tsc -b` clean for all three projects. `yarn test` **151 passing** — 137
from issue 08 plus 14 new in `hangout.test.ts` and one for `nameOf`.
`yarn lint` unchanged at the 9 errors already on `main`, all in
`src/components/ui/` and `src/components/grid-pattern.tsx`.
`verify-hangout.mjs` 30 checks green.

### Left behind for issue 10

- **The two database objects**, both named in `05-hangout.sql`'s closing
  section: the statement-level drop trigger (with its auto-cancel obligation)
  and ADR-0002's extend RPC. **Ticket 07 §9's `security definer` reasoning
  belongs in the migration that writes the RPC**, not in this one, so the next
  reader finds it beside the function they were about to "fix".
- The detail sheet, naming, and the provenance columns — see this ticket's
  siblings: ticket 07's and 08's amendments, ticket 16's amendment, and issue
  10's own added section.
- **A new obligation on issue 11's month view.** A Hangout shows on every
  Friend's calendar and the month is a calendar. Ticket 14 settled that month
  cells carry no numeral and that the week's heatmap does not carry over; it
  never had a Hangout to place, and now it does — at a cell size where a name
  may not fit.
