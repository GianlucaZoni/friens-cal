# 08 — The Candidate list

Status: ready-for-agent
Blocked by: 07

## Parent

[friens-cal v1 map](../../shared-availability-calendar/map.md)

## What to build

The right sidebar answers "so when can we actually meet". A Candidate is a
**computed** suggestion — a range where two or more non-Hidden Friends are all
free. It is not stored and has no identity.

### The pipeline (ticket 09), client-side over loaded Availability

1. **Horizon** — discard every slot before the start of the current 30-minute
   slot. This clips today's partial day without ever producing a sub-30-minute
   Candidate.
2. **Filter to visible** Friends.
3. **Blank the Hangouts** — drop slots inside any confirmed Hangout's range, for
   **every** Friend, not only its Participants: no second Hangout may exist at
   that time, so a Candidate there could never be confirmed.
4. **Sweep** into atomic runs of `{start, end, friendIds}` over one continuous
   timeline — **do not break at midnight**; a Candidate may span days.
5. **Extend** — for each run with ≥2 Friends, extend outward to the largest
   interval where all of them are continuously free. Dedupe.
6. **Prune dominated** — drop C if some D has `D.friends ⊇ C.friends` **and**
   `C interval ⊆ D interval`.
7. **Sort** — friend count desc → start asc → duration desc → friend-id order.
   Count strictly dominates duration. The last two keys are not cosmetic:
   without them a Realtime update visibly reshuffles tied cards.

Worked example — Marco 18:00–22:00, Sara 20:00–23:00, Luca 21:00–21:30 yields
**two** Candidates: *Marco + Sara 20:00–22:00* and *all three 21:00–21:30*.

**Glow when `2 × friends > group_size`**, group size counting **all** Friends
including Hidden ones — so hiding can only ever *suppress* a glow, never
manufacture one. A true full house additionally shows an **"everyone" pill**.

**Recompute** on: any Availability change (local or Realtime), any eye toggle,
any Hangout change, **a timer aligned to the :00 and :30 slot boundaries**, and
tab focus. That timer is not optional — step 1 makes the list stale with no data
change at all.

### The cards

Date top-left, `everyone` pill top-right, time range bottom-left, **wrapping**
blobatars bottom-right. **No count numeral** — the count is read off the faces,
and blobatars never overlap into a `+N` stack, which hides people on exactly the
cards that matter. The multi-colour border is a **left stripe** in the computed
`oklch` colours, and **the border *is* the glow**: non-glowing cards carry no
hue at all.

A sub-Candidate card annotates its relation ("inside 19:00–21:30"), or the pair
reads as the list repeating itself.

**Flat list, no day headers** — the sort is not chronological, so headers are
impossible without abandoning it. **Everything below the glow threshold collapses
behind "show more"** — not a cap; the cut line is the same `2n > group_size`.

Three empty states, in order: fewer than two Friends visible / no Availability
from now forward / Availability exists but nothing overlaps. The first **rewords
when Hangouts are pinned**, or it reads "show more friends" directly beneath
cards showing those same Friends' faces.

## Acceptance criteria

- [x] The pipeline is implemented as above and unit-tested, including the worked
      example and a Candidate spanning midnight
- [x] Domination pruning verified: no card is a subset of another in both axes
- [x] Sort is stable across recomputes
- [x] Glow fires exactly when `2 × friends > group_size`; hiding never creates one
- [x] Slot-boundary timer and focus recompute both re-clip today
- [x] Cards: wrapping blobatars, no numeral, left stripe, colour only when glowing
- [x] Sub-Candidates annotate their containing range
- [x] Sub-glow tail collapses behind "show more"
- [x] All three empty states, with the pinned-Hangout rewording
- [x] `npx tsc -p tsconfig.app.json --noEmit` is clean

## Blocked by

- [07 — Everyone's Availability as a heatmap](./07-heatmap.md)

## Built

`src/candidates/` — four modules and a hook, and the right pane stops being a
stub. Nothing about a Hangout is built here: issue 09 owns the table, the
confirm, and the pinned region, and step 3 of the pipeline is written and tested
against the shape it will hand back rather than left as a hole for it to find.

- **`candidates.ts`** — the pipeline, pure and tested. Steps 1–3 are two
  filters, 5–8 are extend, prune, rank, identify. **Step 4 is not in this
  file**: issue 07 built the boundary sweep and handed it over, and
  `segmentsOf` cuts exactly where an atomic run ends — wherever the *set*
  changes or a slot is missing — so it is reused over one continuous lattice
  instead of one column's indices.
- **`when.ts`** — what a card writes on its two lines. Its own module for the
  reason `describeSlots` is one: the list has no day headers, so a card is the
  only thing that says which evening it is offering, and the two spellings that
  are easy to get wrong (a range ending at midnight, a range crossing one) are
  worth a test.
- **`use-slot-clock.ts`** — the :00/:30 timer, plus focus.
- **`use-candidates.ts`** — the other four recompute triggers.
- **`candidate-card.tsx` / `candidate-list.tsx`** — the card and the list.

Three things outside `src/candidates/` moved: `slots.ts` gained `heldFrom` and
`slotContaining`, `useAvailability` exposes the first of them, and `useRoster`
gained `showAll` so the first empty state's action has somewhere to go.

### The one seam the store did not already have

`isFree(friendId, slotStart)` is the whole of what the grid needs — the grid
knows its ~350 instants and asks about each one. **The Candidate scan does not
know its instants.** Its horizon is unbounded above, so the only thing that can
say which Slots exist is the key set itself, and a probe would need the answer
it is looking for. Hence `heldFrom`, which unpacks `friendId|milliseconds` back
into rows.

That parse is the one genuinely new risk in this slice, and it is exactly what
`verify-candidates.mjs` exists to cover: PostgREST renders a `timestamptz` as
`…+00:00` where `toISOString` writes `…000Z`, which is the trap `slotKey` was
built for and the one issue 07's `verify-realtime.mjs` fell into. Asserted on
real rows: 178 keys, 178 `FreeSlot`s, every start finite, every id in the Group.

### The horizon is floored off the wall clock, not the epoch

`slotContaining` reads `TZDate#getMinutes()` rather than dividing by 30
minutes. For Rome the two agree — every offset it has ever had is a whole
number of hours — but a zone at `+05:45` sits a quarter hour off the epoch's
lattice, and a horizon landing between two Slots would clip a Candidate to a
time no row begins at. DST needs no case of its own for the same reason: the
offset applies to the instant handed in.

### The card is the one the human picked, not the one ticket 16 recommended

The tickets supersede themselves in place and the card was decided four times.
The live decision is ticket 16's **second** `## Answer` and ticket 09's **last**
section, and they agree with this issue: **the app-shell prototype's card, not
variants A/B/C.** So there is **no count numeral anywhere** — which also
retires ticket 09's `## Amendment` about where the `everyone` label goes, since
that amendment assumed the 56px numeral rail and ticket 09 says so itself in the
section below it. The pill carries `everyone` alone.

Built from `src/prototypes/app-shell/parts.tsx` at `63f1d32^` — the picked card,
with the two things ticket 16 overrode afterwards changed: the blobatars **wrap**
rather than `-space-x-1.5` stacking, and the `.slice(0, 5)` cap is gone. With
five Friends a wrapped row is at most five faces, so the cap could never have
fired — and could not have hidden anyone as the Group grows, which is the
failure it was measured for.

### The stripe IS the glow

A non-glowing card carries no hue at all: plain `border`, no stripe, no shadow.
Reserving colour for `2n > groupSize` is what makes the top of the list
findable, and it is why the "3px, 5px when glowing" from variant A collapsed
into one width — there is no non-glowing stripe to be thinner than.

Two stops per colour at the same two percentages, which is what makes the edge
hard. One stop each would interpolate between neighbouring hues and put a smear
of a colour nobody owns between every pair of Friends — the mesh gradient's
failure arriving through the back door.

### Two judgement calls, named so they can be overruled

1. **Friends mid-setup are in neither the numerator nor the denominator.**
   `setUpOnly` on both sides. They cannot hold Availability (`RequireSetup`
   stands between them and the grid) so they can never be *in* a Candidate, and
   they have no hue or face to draw. Counting them in `groupSize` would raise
   the glow bar for someone who cannot help clear it, and one unfinished signup
   would take the `everyone` pill off every card in the Group until they
   finished. Same rule the heatmap already uses (`counted` in `week-grid.tsx`),
   applied to the other denominator — and ticket 09 says `groupSize` counts
   "all Friends", so this is a reading rather than a quotation.

2. **The show-more cut does not apply when nothing is above the line.** A group
   of six whose only overlaps are pairs has nothing that clears `2n > 6`, so a
   literal cut collapses the whole list and leaves a pane holding one disclosure
   button — indistinguishable from the three empty states, in the exact case
   where the group most needs to see its thin options. So the cut fires only
   when there is something above it.

### One thing the ticket did not ask and the data forced

Empty state 2 is measured **before** step 3, not after. A group whose every
free evening is already a confirmed Hangout would otherwise be told *"nobody's
free yet — draw your availability"*, which is a lie told to people who have
drawn plenty. Asserted both ways in the unit tests and against the real rows.

### Verified against the real database

`node --experimental-strip-types --env-file=.env scripts/verify-candidates.mjs`
— 19 checks, all passing, read-only (the pipeline is a derivation, so there is
nothing to write to test it). It runs the **real** pipeline over the **real**
rows, through the store's own `mergeSlots` fold.

The three Candidates it finds in the Sep 2027 demo window:

    2027-09-06  19:00–23:00   Demo Friend + Gianluca
    2027-09-08  20:00–22:00   Demo Friend + Gianluca
    2027-09-10  10:00–11:00   Demo Friend + Gianluca

**Friday is the sharpest check in the file and nobody designed it.**
`04-demo-second-friend.sql` gave the Demo Friend 10:00–13:00 alone;
`verify-availability.mjs` had separately seeded the signed-in Friend 08:30–11:00
back in issue 05. Neither script knew about the other, so the hour they share is
an accident — and it is exactly the case step 5 has to get right: the extension
stops at 11:00 where the shorter run ends, and neither the 08:30–10:00 nor the
11:00–13:00 tail becomes a card of its own. **The first version of this check
asserted Friday produced nothing, and the failure was in the assertion, not the
app** — the same shape as issue 07's one bug.

### The Group grew from two Friends to three while this was being built

Which broke two checks that were not testing anything. `verify-candidates.mjs`
first asserted *"every Candidate glows"* and *"every card carries the pill"* —
true statements about a Group of two, and red the moment a third Friend
appeared. Both are now written as the **rule** (`glows === 2n > groupSize`,
`pill === n >= groupSize`) with the current outcome printed as information
rather than asserted. A third check, *"Monday's Candidate holds every set-up
Friend"*, went the same way and is now the invariant that actually holds: a
Candidate's Friend set is **exactly** the Friends holding a row at every one of
its Slots.

At `groupSize` 3 the bar is `2n > 3`, so **every Candidate still glows** — the
minimum Candidate is two Friends and 4 > 3 — but **no card carries the pill**,
because that needs all three. Which is the more informative state of the two,
and it is what the browser was checked against.

### What is still not reachable in this database

Three of this issue's rendering claims have no data behind them here, and are
covered by unit test only:

- **A non-glowing card**, and therefore the **collapsed tail**. Both need
  `2n <= groupSize` with `n >= 2`, so they need a Group of **four** or more.
  This is ticket 09's declared degenerate case, one Friend wider than it
  described it.
- **The `everyone` pill**, which now needs all three Friends free at the same
  time. Only the third Friend can write their own Availability
  (`02-availability.sql`'s `with check`), and nothing in the repo can do it for
  them — the same wall issue 07 hit and recorded.
- **The sub-Candidate annotation**, which needs a nested pair and so needs three
  Friends free in a window inside another.

All three are one drag on the grid away for whoever has the third account: draw
**Mon 6 Sep 2027, 20:00–21:00** and the top card becomes a full house carrying
the pill, a three-segment stripe, and *"inside 19:00 – 23:00"*.

### Verified in the browser, at 1440×900, both themes

Read-only: **clicks do not reach the app in this Browser pane** (pointer events
and `matchMedia` resize both die in the harness, which is a known local
limitation and not the app — the pane has to be *loaded* at the target width for
the shell to lay the panes out in flow at all). So the interaction-driven states
— hiding a Friend down to empty state 1, the *show more* toggle — were not
driven. What was read off the running app:

- **Three cards, in rank order**, matching the script exactly: `Mon 6 Sep ·
  19:00 – 23:00`, `Wed 8 Sep · 20:00 – 22:00`, `Fri 10 Sep · 10:00 – 11:00`.
- **No numeral.** A card's entire text is its date and its range — asserted on
  `innerText`, not by looking.
- **The stripe**, computed: `width: 3px`, and
  `linear-gradient(oklch(0.62 0.105403 200) 0%, oklch(0.62 0.105403 200) 50%,
  oklch(0.62 0.105403 35) 50%, oklch(0.62 0.105403 35) 100%)`. Two stops per
  colour landing on the same percentage, so the edge is hard; both segments at
  identical L and C, so it is a hue ladder rather than a rainbow; hues 200 and
  35 are the two Friends' own.
- **`--friend-c` resolves to `0.10540304690994162`** in light and
  `0.1275034359714482` in dark — the computed minimum over the hue circle, not a
  number anybody typed. Ticket 16's chroma correction, cashed and visible.
- **The theme switches through the cascade with nothing branching in JS**: the
  same stripe re-resolves at `L 0.75 / C 0.1275` under `.dark`, on an
  `oklch(0.205 0 0)` card.
- **The blobatars wrap and do not overlap**: `flex-wrap: wrap`, and the two
  faces sit 4px apart at 20px each — a positive gap, where the prototype's
  `-space-x-1.5` was a negative one.
- **The glow's soft shadow** is on the card, and the border is the plain theme
  `--border` rather than a hue.
- **Focus resync is idempotent**: dispatching `focus` and `visibilitychange`
  leaves the three cards byte-identical and raises nothing in the console. A
  resync landing in the same Slot sets the same number and React bails out of
  the render, which is what keeps the cheapest of the five triggers cheap.
- **A fresh tab logs nothing.** The one 400 in the console predates the reload
  and is a failed sign-in attempt, not a request the app makes.

An actual **slot-boundary crossing** was not watched: no Friend holds
Availability spanning the present moment, so there is nothing on screen for the
timer to re-clip today. `slotContaining` carries the four assertions that
matter instead — flooring inside a slot, an exact boundary, a `+05:45` zone off
the epoch's lattice, and a real slot start inside the repeated hour of a
25-hour day — and the hook re-reads it rather than adding `SLOT_MS`, so a
laptop that slept through six boundaries lands on the right Slot in one step.

### State of the checks

`npx tsc -b` clean for all three projects. `yarn test` 137 passing — 103 from
issue 07 plus 34 new: 22 in `candidates.test.ts`, 5 in `when.test.ts`, 7 added to
`slots.test.ts` for the two new functions there. `yarn lint` unchanged at the 9
errors already on `main`, all in `src/components/ui/`.
`verify-candidates.mjs` 19 checks passing against the live database.

### Left behind for issue 09

- `HangoutRange` and step 3, built and tested. `AppShell` passes a module-level
  `NO_HANGOUTS` constant — a literal `[]` would be a fresh array every render and
  re-run the whole pipeline.
- `CandidateList` takes `hangoutsPinned`, which is the flag that rewords empty
  state 1. It is `hangouts.length > 0` today and therefore always false.
- **The region headings and the divider are gone.** The shell's stub carried
  "Pinned Hangouts" and "Candidates" labels above two bordered regions; ticket
  16 settles that neither region gets a heading and that **the divider exists
  only when both regions do**. With no Hangouts, that is: no rule, no heading,
  Candidates start at the top. Issue 09 adds the region, the rule and the pin
  glyph that tells a Candidate from a Hangout.
- **No controls on a card.** Ticket 16's final answer routes every action
  through a detail — a hover tick and a click-to-open popover on desktop, a
  tap-opens-sheet on touch — and all of it writes other people's Availability.
  A card that only reads is the honest state of this slice.
