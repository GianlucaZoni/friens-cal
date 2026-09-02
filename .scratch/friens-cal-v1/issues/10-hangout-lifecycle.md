# 10 — The Hangout lifecycle

Status: ready-for-agent
Blocked by: 09

## Parent

[friens-cal v1 map](../../shared-availability-calendar/map.md)

## What to build

Everything that happens to a Hangout after it exists. Ticket 08 holds the full
state machine; this is its implementation.

**A Friend has three states**: not involved / Participant / **Left**. `left_at`
distinguishes them, and Left is **sticky** — the way back is manual, from the
card's menu, clearing `left_at`.

**Movement is one-way and automatic in one direction only:**

- **Join** — adding Availability that overlaps a Hangout you are not in does
  **not** auto-add you. A **"Join?"** appears on the Hangout instead. Joining
  also adds Availability for the slot.
- **Strict drop** — removing Availability that covered a Hangout **drops you**,
  from a statement-level trigger with transition tables, fronted by a
  confirmation dialog. That dialog **names every affected Hangout** and fires on
  the **grid**, on the Availability-delete path — it is not the card's cancel
  dialog, which always affects exactly one Hangout.
- **Leaving does not change your Availability.**
- A Hangout whose **last Participant** leaves or is dropped **auto-cancels**,
  from the same trigger.

**Retime is unrestricted** and can move a Hangout to another day. It can never
drop anyone: it **extends the Availability of every current Participant** to
cover the new time, through the single narrow `security definer` RPC of ADR-0002.
That RPC takes **exactly one argument — the Hangout id**; a
`(friend_id, start, end)` signature would be worse than flat trust. It needs
`search_path = ''` and explicit grant/revoke, and because Availability is slot
rows it is **structurally insert-only**: "may extend, never shorten" is a fact,
not a rule code must remember. Extensions are **never reverted**. A retimed
Hangout is permanently marked "edited". The confirmation dialog **names the
Friends whose calendars it will write to**.

**Cancel is a hard delete**, behind a warning. There is no undo and no tombstone;
the others find out by noticing an absence. This was chosen with eyes open.

**Past Hangouts freeze** — no retime, no cancel, no join.

The retime flow is a **Dialog, not a Popover**: outside-click would silently
discard edits on the one action that writes other people's data, a popover
occludes the grid being consulted, and the collision rejection needs somewhere
to land.

## Acceptance criteria

- [x] Statement-level trigger with transition tables implements the strict drop
- [x] The drop confirmation fires on the grid and names every affected Hangout
- [x] Adding overlapping Availability surfaces "Join?" and does not auto-add
- [x] Joining adds Availability for the slot
- [x] Leaving leaves Availability untouched; Left is sticky; rejoin clears `left_at`
- [x] Last Participant leaving auto-cancels the Hangout, from the trigger
- [ ] Retime RPC takes only the Hangout id, is `security definer` with
      `search_path = ''`, and can only insert Availability
- [x] Retime never drops a Participant, and marks the Hangout "edited"
- [x] Retime dialog names every Friend whose calendar it writes to
- [x] Cancel hard-deletes behind a warning naming the single Hangout
- [x] Past Hangouts reject retime, cancel and join
- [x] Retime is a Dialog; the cross-Friend write is **not** painted optimistically —
      the dialog holds the pending state and reports the outcome in place
- [x] `npx tsc -p tsconfig.app.json --noEmit` is clean

**The one box left unticked, and why.** The RPC is `security definer` with
`search_path = ''` and can only insert — but it takes **three** arguments, not
only the Hangout id. A retime needs the Participants extended to the range the
Hangout is *arriving* at, and one argument cannot express that without splitting
the move and the extension across two statements outside a transaction. See
`## Built`, and [ADR-0002](../../../docs/adr/0002-cross-friend-availability-writes.md),
which carries the amendment rather than being quietly contradicted.

## Blocked by

- [09 — Confirm a Candidate into a Hangout](./09-confirm-a-hangout.md)

## Added after issue 09 shipped — the detail sheet, naming, and provenance

Three things issue 09 either found missing or was told to hand over. They are
**additions to the scope above, not replacements**; every acceptance criterion
already listed still stands.

### 1. The detail sheet is yours, and naming is what makes it worth building

Ticket 16's final answer routes every card action through a **detail sheet** on
touch and the same detail as a **popover** on desktop, making the hover tick an
*accelerator* rather than the only route. Issue 09 built the tick and **not** the
sheet, for a reason worth knowing before you start: every action ticket 16 put
inside it was in this ticket, so there was nothing for the sheet to carry.

Ticket 16's amendment fixes that by giving the sheet its own content — **the
name** — so it is no longer a shell around this ticket's buttons.

Issue 09's stand-in, to replace: on `@media (hover: none)` the confirm tick is
**permanently visible** on a Candidate card rather than absent. That was ticket
16's *earlier* decision, which its final answer revised, and it shipped because
the sheet that supersedes it could not be built yet. Replacing it is part of
building the sheet — do not leave both.

### 2. An unnamed Hangout is called "Hangout", and the name is on the marker

**Already built in issue 09** — `nameOf` in `src/hangouts/hangout.ts` is the one
default, and the week grid's block and the pinned card both render it. Listed
here because the sheet is what finally lets a Friend change it, and because the
default is what keeps ticket 16's *"the title is the headline"* hierarchy
unconditional. Do not reintroduce a null-title special case.

### 3. Provenance: who confirmed it, and who moved it

Ticket 07's and ticket 08's amendments add `created_by`, `retimed_by` and
`retimed_at`. **`retimed_by` non-null IS ticket 08 §1's "edited" mark** — there
is no separate boolean, so the two facts cannot contradict each other.

**This is not ownership and must not become it.** Every policy stays
`using (true)`; anyone may still retime or cancel anything (ticket 01). The
columns exist *because* of that plus no notifications: they are the only thing
that can answer "who moved this?" after the fact.

**The `with check` is the whole feature.** A column recording who did something,
which anybody may set to anybody, records nothing — so the insert policy needs
`with check (created_by = (select auth.uid()))` and the update policy
`with check (retimed_by = (select auth.uid()))`. `auth.uid()` reads the JWT
claim rather than the role, so it is still the calling Friend inside the
`security definer` retime RPC.

**Open, and it is ticket 07's `Needs the human`:** whether a *rename* also counts
as an edit. Recommended no — §1's mark exists to say "availability was written
for you", and a rename writes none. Do not guess; the answer changes the column
names.

## Added acceptance criteria

- [x] A tap on a card (touch) and a click on a card body (desktop) both open the
      same detail — sheet and popover respectively
- [x] The detail sets and clears a Hangout's name, and the grid marker and pinned
      card follow
- [x] Issue 09's permanently-visible touch tick is **removed** when the sheet lands
- [x] `created_by` is written at confirmation and `retimed_by` / `retimed_at` at
      retime, each defended by a `with check` on its own policy
- [x] A Friend cannot write somebody else's id into either provenance column
- [x] The detail shows `confirmed by …` and `retimed by …`, and renders correctly
      when either is null
- [x] Provenance gates nothing: every Friend can still retime and cancel every
      Hangout, including ones they did not confirm

## Correction to §3 above — the columns are `created_by`, `edited_by`, `edited_at`

The human answered ticket 07's `Needs the human`: **a rename counts as an edit.**
So `retimed_by` / `retimed_at` above never existed. Build:

```
created_by uuid null        references friend (id) on delete set null
edited_by  uuid null        references friend (id) on delete set null
edited_at  timestamptz null
```

`edited_by` non-null is ticket 08 §1's mark, set by **both** the retime and the
rename. One `with check (edited_by = (select auth.uid()))` on the update policy
covers every update, with nothing to exempt — which is why this is the simpler
schema as well as the decided one: no RLS policy can express *"if `starts_at`
changed then the mark must be set"*, because `with check` cannot see the old row.

The added acceptance criteria above stand with the names substituted, plus:

- [x] Renaming a Hangout sets `edited_by` / `edited_at` and shows the `edited`
      word, exactly as retiming does

## Built

`supabase/06-hangout-lifecycle.sql` is a human paste (ADR-0001) and **has been
run**. `scripts/verify-hangout-lifecycle.mjs` is **35 checks green** against the
live project and is idempotent — it sweeps its two probe windows (2030 and 2020)
before the run as well as after, because a run that dies mid-way otherwise makes
the *next* run fail on a range it does not own.

### The two chicken-and-eggs this slice had to resolve, not carry

**The retime RPC takes three arguments, and ADR-0002 carries an amendment
saying so.** The refinement was emphatic that one argument — the hangout id — is
"the entire reason the hole is narrow", and implementing it exposed the reason
that cannot hold: a retime needs the Participants extended to the range the
Hangout is *arriving* at, and until the row has moved the stored row only knows
the one it is leaving. RPC-then-update extends everyone to the range they
already covered by definition. Update-then-RPC is two statements outside a
transaction, and if the second fails the Hangout sits at a time nobody covers
with **nothing to repair it** — the drop trigger fires on an `availability`
delete and there was none. Issue 09 compensated client-side for a failed
Participant seed; that does not work here, because the `update` back can itself
lose to the exclusion constraint if somebody took the old window in between. So
the move and the extension are one statement in one transaction.

It is **not** the `(friend_id, start, end)` signature the ADR rejected, and the
difference is not cosmetic: **who** is still derived from the stored row, and by
the time the function returns the range it wrote *is* the Hangout's own range,
because the same statement put it there. What the extra arguments cost is
recorded in the amendment — "the RPC" and "the retime" are now one object, so a
future second reason to extend somebody's Availability cannot reuse it and must
not be given a range argument on this precedent.

**The plural drop dialog has to predict the trigger, so it is written as the
trigger.** `droppedBy` in `hangout.ts` applies the three conditions
`06-hangout-lifecycle.sql` §3 applies, in that order, and the middle one is
load-bearing rather than an optimisation: the trigger's scan is narrowed by its
transition table to pairs where a deleted Slot fell *inside* a Hangout, so a
Participant who already did not cover their plan is left alone until they erase
inside its range. A client that reported that case would name a drop the
database is never going to perform. Coverage is `generate_series` over real half
hours on both sides — not `count(*) >= expected`, which is the cheap version and
is fooled by an off-grid row inside the range, since `availability.slot_start`
carries no grid constraint of its own and only `hangout` does.

### Decisions this slice had to make, not just carry

1. **`created_by` is immutable, from the same `before update` trigger that
   stamps `edited_at`.** Ticket 07's two `with check`s leave exactly one hole
   between them: an update that sets `edited_by` to the caller **and**
   `created_by` to somebody else satisfies both, so a Friend could reassign
   authorship while honestly signing the edit that did it. No policy can refuse
   that — "`created_by` must not change" is a comparison of the old row against
   the new, which is precisely the expression `with check` cannot contain, the
   same wall that made `edited_by` the right mark rather than `retimed_by`. It
   gates nobody; it only means the record of who confirmed a plan says what it
   said when it was written. Proven live.
2. **`edited_at` is stamped by the database, not sent by the client.** The
   alternative is one line shorter and puts a browser's clock into a provenance
   record: a Friend whose laptop is an hour out records an edit an hour out, and
   the detail sheet reads *"edited in three hours"*. `created_at` is already a
   server `default now()`. It also spares the RPC from setting it, so one
   expression in the schema decides when an edit happened.
3. **The auto-cancel exempts Past Hangouts; the drop does not.** Ticket 08 §4
   wants an empty Hangout gone and §6 makes a Past one uneditable — *no join, no
   retime, no cancel* — and an auto-cancel **is** a cancel. Derived rather than
   invented, and it settles a real collision: without it, tidying up last
   month's Availability would erase last month's plans, against ticket 01's
   "nothing is ever auto-deleted". Ticket 07 §7's drop stays strict and
   time-blind, so a Past Hangout can end up with nobody on it — which the grid
   and the card already render as *"nobody on it"*, and which is the honest
   picture: the plan happened, and nobody is on the record as having been there.
4. **The RPC does not defend the Past freeze, or the 30-minute grid, or the
   collision.** All three are `05-hangout.sql` §4's rejected shape — a fence
   beside an open gate — or a second place to get a rule wrong. `update` on
   `hangout` is `using (true)`, so a Past guard inside the function buys nothing
   a client cannot walk around; the grid is a check constraint answering `23514`;
   the collision is the exclusion constraint answering `23P01`. Every conditional
   inside a `security definer` body is a thing that has to be right, and these
   three would be right somewhere else already.
5. **One accelerator on a card, and it is `Join?` — no 3-dots.** Ticket 16's
   *Decisions so far* had a hover tick plus a 3-dots, and its final answer then
   made the detail the route on the grounds that *"with every action inside,
   there is nothing for a 3-dots to open"*. That sentence is about the desktop
   popover as much as the touch sheet, because they are **the same detail**: a
   menu offering Leave, `Change the time…` and Cancel beside a popover already
   offering all three is two routes to one place. What is left worth
   accelerating is the action that is a plain yes.
6. **A rename is frozen on a Past Hangout.** §6 says "uneditable" and lists
   join, retime and cancel; the human's answer to ticket 07 makes a rename **an
   edit**, so "uneditable" now covers it. The reachable case is not a Past
   Hangout opened from the sidebar — `pinned` keeps those out of the right pane
   entirely — but one whose end time passes *under an open sheet*, on the same
   `useSlotClock` tick that mutes it on the grid.
7. **The retime and cancel dialogs are the card's, not the detail's.** Ticket
   16's amendment allows a Sheet to contain a Dialog and forbids a Popover from
   doing it. Rather than build two arrangements, both are siblings of the detail
   and opening one closes it — the same behaviour on both surfaces, with nothing
   nested anywhere.
8. **Join, re-Join and the Left case are one path of three idempotent
   statements**: your own Availability first, then `insert ... on conflict do
   nothing` for the row, then `left_at = null`. Availability first because a
   Participant row without the Slots under it is exactly the state the drop rule
   exists to prevent and **nothing would repair it** — the trigger fires on a
   delete, and there would not have been one. A merge-duplicates upsert would
   have been one statement and is refused by the column-scoped
   `update (left_at)` grant. Three idempotent statements beat a branch on
   possibly-stale client state.

### Verified against the live database (35 checks)

The four only a script can prove: **a `hangout_participant` row disappearing
from a table this client holds no delete grant on at all** — that is
`security definer` working, and nothing but a live delete shows it; **the
auto-cancel firing from two different statements on two different tables**, and
refusing on a Past Hangout; **the RPC actually writing another Friend's
calendar**, which is ADR-0002's whole reason to exist; and **that it only
inserts** — the range the Hangout left is still Availability afterwards.

Plus: `created_by` and `edited_by` each refused with `42501` when absent and
when forged; `created_by` refusing to move inside an honestly signed update;
`edited_at` arriving from `now()` rather than from this process; erasing outside
a range dropping nobody; erasing **one** Slot inside it dropping me, and only
me; Leave leaving Availability untouched; re-Join clearing `left_at`; the
anonymous RPC call refused; `P0002` for a cancelled Hangout; `23514` for an
off-grid bound; `23P01` for a collision **and the Hangout still exactly where it
was**, which is the one-transaction claim.

**One bug the script found in itself, worth recording because it is the third
time.** The collision check compared PostgREST's `2030-04-10T18:00:00+00:00`
against `Date#toISOString`'s `…000Z` and reported a correctly rolled-back
transaction as a half-moved Hangout. Same instant, two strings — the trap issue
07's realtime verify hit and the reason `slotKey` exists. Now through `Date`,
like every other boundary in the repo.

`verify-hangout.mjs` is updated in the same slice and still passes in full:
§1's insert policy makes a `hangout` insert without `created_by` fail, and two
of its probes would otherwise have reported a permission error where they are
testing a check constraint. No check was added or removed. **It prints 28 `✓`
lines on a green run** — issue 09 recorded "30 checks", which counted its two
`·` notes; the file has 29 `ok(` call sites and two of them are the mutually
exclusive halves of one branch.

### Verified in the browser, driving the real UI

A **whole lifecycle through the app**, not asserted as statements: confirm a
Candidate → rename it → open the retime dialog → retime it → cancel it, ending
with the demo data byte-identical to how it started (two Hangouts, five
Candidates).

- **A confirm still works**, which is ticket 07's trap #1 closed: `created_by`
  and the insert policy landed together, so there was never a state where one
  was right.
- **`confirmed by UserTwo`** on the Hangout the UI created, and **no provenance
  lines at all** on the two seeded before the migration — ticket 16's "both are
  nullable and simply do not appear when absent".
- **A rename sets the mark.** The card shows `Pizza` with a small muted
  `edited` after it, the detail gains `edited by UserTwo · Wed 2 Sep, 18:08`,
  and **the grid marker follows** — `Pizza · Sat 5 Sep, 18:00 – 19:00 · with
  Gianluca, UserTwo`. That is the human's answer to ticket 07 visible on screen.
- **And clearing it works, which is the half that could have broken `nameOf`.**
  A whitespace-only field writes `null` rather than `''`, so the card headline
  falls back to `Hangout` and the grid marker with it — one way for a Hangout to
  be unnamed, not two that render identically and compare differently. `edited`
  correctly *stays*: it was edited. The field's placeholder is
  `Name this hangout…`, which is where ticket 16 said that nudge belongs — on
  the control that does the naming, never as the value.
- **The default holds a sentence together.** Cancelling the unnamed one asks
  *"Cancel Hangout?"*, which is the whole reason `nameOf` has no null case.
- **The retime dialog's consequence, live and above the controls.** Moving the
  day to one nobody covers: *"Gianluca and UserTwo will be marked free Sun 20
  Sep · 18:00 – 19:00. There is no notification, and the extra availability is
  not removed if the hangout moves back."* Moving it to one they do: *"Everybody
  on this hangout is already free Thu 3 Sep · 18:00 – 19:00. Nobody else's
  calendar will be changed."* In an `aria-live="polite"` region, because it
  changes under a control the viewer is operating. The action is disabled until
  something moves.
- **The retime, submitted.** The card and the grid block moved to Thu 3 Sep, the
  range it left came **back into the Candidate list**, and the big
  `Wed 2 Sep 18:00 – 08:00 Fri` window **split in two around the new time** —
  step 3 of the pipeline blanking a Hangout's Slots, live. Cancelling it merged
  them back.
- **The cancel warning, singular**: *"Cancel Pizza? Thu 3 Sep · 18:00 – 19:00 —
  with Gianluca, UserTwo. It is deleted outright: there is no undo, no record
  that it existed, and nobody is told."*
- **The desktop route.** Every card body is a real `<button
  aria-haspopup="dialog" data-slot="popover-trigger">` — in the tab order, and
  the tick beside it stays an accelerator.
- **The touch route, under an emulated `(hover: none)`.** The Candidate tick's
  computed `display` is **`none`** (the `@media (hover: none) { display: none }`
  rule is in the served CSS, so the arbitrary variant compiled), every card
  becomes a `sheet-trigger`, and the detail arrives as a **bottom** Sheet — not
  left or right, where the panes themselves live below 768px. The Hangout sheet
  carries name/Save, the time, `Change the time…`, the Participants, Leave and
  `Cancel this hangout…`; the Candidate sheet carries the faces with names and
  `Confirm this hangout`. **Issue 09's permanently-visible tick is gone, not
  left beside it.**
- Console clean.

**Not driven here: the plural drop dialog.** Pointer events do not reach the app
in this Browser pane — the known local limitation issues 08 and 09 recorded — and
both routes into it (`onPointerUp` on an erase drag, and `Erase block` in the
slot popover) begin with a `pointerdown` that calls `setPointerCapture`, which
throws for a synthetic pointer. Faking the pointer stack would have meant not
testing the real path. What *is* proven: the trigger it predicts, live, in seven
of the 35 checks; and `droppedBy` against the trigger's three conditions in the
unit tests, including the partial erase, the outside erase, the Slot the viewer
does not hold, the Left Friend and the Friend with no row. The component itself
is read, not pressed.

### State of the checks

`npx tsc -b` clean for all three projects. `yarn test` **172 passing** — 151
from issue 09 plus 11 in `hangout.test.ts` and 10 in a new `retime.test.ts`,
which pins the 46/48/50-row day, the repeated hour labelled with its offset, a
duration surviving the clocks going back, and the `24:00` / `01:00 Sun`
spellings. `yarn lint` unchanged at the 9 errors already on `main`, all in
`src/components/ui/` and `src/components/grid-pattern.tsx`.
`verify-hangout-lifecycle.mjs` 35 checks green and idempotent across three runs;
`verify-hangout.mjs`, `verify-availability.mjs`, `verify-friend-row.mjs`,
`verify-candidates.mjs` and `verify-realtime.mjs` all still green.

### Left behind

- **One `availability` row this client cannot delete**, and it is structural
  rather than an oversight: the retime check writes another Friend's Availability
  and `02-availability.sql` makes deletes self-only, while ADR-0002 settles that
  extensions are never reverted. Kept to a single 30-minute Slot in **2020**,
  where the Candidate scan's now-forward horizon can never reach it; the script
  prints the one `delete` a human can run.
- **Issue 11's month view still owes a Hangout a place**, and now owes it a
  **name** as well — ticket 14 settled that month cells carry no numeral, at a
  cell size where a name may not fit.
- **`hangout.ts` is doing two jobs.** It is the fold, the render helpers *and*
  the lifecycle predicates now, at ~400 lines. Nothing is wrong with it, but the
  seam is visible: `slotStartsOf` / `covers` / `droppedBy` / `wouldAutoCancel`
  are a coverage module, and they are the half that has to stay in step with a
  Postgres trigger rather than with a React tree.
