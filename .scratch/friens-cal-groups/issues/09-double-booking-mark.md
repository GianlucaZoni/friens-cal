# 09 — The double-booking mark

Status: done
Blocked by: 02

## Parent

[friens-cal — many Groups, joined by Code](../../groups-and-join-codes/map.md)

## What to build

Per-cal Hangouts mean the exclusion constraint stops protecting *you*: two cals
can each confirm 8pm Saturday and neither can see the other. This warns you, and
only you, because they are your own commitments.

**A mark, not an interruption.** A confirm-time modal was the obvious shape and
it is wrong: `candidate-card.tsx:63` states the rule it would have broken —
*confirming needs no dialog*, because retime writes other people's Availability
and confirm writes none. It would have been the first dialog on the one action
deliberately built without one. So the warning moves **earlier**, to where you
are scanning rather than committing.

**One rule keeps it coherent: the mark is on a commitment you could take on,
never on one you hold.** That is why confirming makes the mark vanish from the
card just clicked, and why drawing Availability is untouched at both ends — an
offer is not a commitment.

**There are four acts that make you a Participant, not three.** Confirm, Join,
Rejoin, and retime. Rejoin arrived from the leaving work and is easy to miss.

**There is no all-clear anywhere.** No green state, no "no conflicts" — the
absence of a mark must never be readable as a pass. Which is also why a failed
fetch takes the list's existing failure path rather than quietly drawing
nothing.

**The card carries the time only** — bounded, and it says whether the conflict
matters. The detail view and the retime dialog carry the naming.

**Retime is the best instance of the feature**: its dialog already states
consequences and its picker is live, so the line recomputes as you move the
range and steers you off the collision.

**Snapshot, not live.** Deliberately, so the Realtime work is not bent around a
nicety. It is nonetheless the first consumer wanting data from cals not on
screen.

The read needs **no RPC and no policy change** — ADR-0003's set stays at three.
Blocking was never available: the constraint is per-cal, and preventing this
needs the coupling per-cal Availability exists to remove.

Invisible until somebody is in two cals.

## Acceptance criteria

- [x] A Candidate overlapping a Hangout you are a Participant in, in another
      cal, carries a mark with the conflicting time
- [x] The mark never appears on a commitment you already hold, and vanishes from
      the card you just confirmed
- [x] All four acts are covered: confirm, Join, Rejoin, retime
- [x] Drawing or erasing Availability never marks anything
- [x] No green or "no conflicts" state exists anywhere
- [x] A failed cross-cal fetch takes the list's failure path, not silence
- [x] The retime dialog's line recomputes as the picker moves
- [x] A Friend in one cal sees no marks at all
- [x] Nothing warns you about anybody else's commitments
- [x] `npx tsc -b` is clean, `yarn test` passes, lint unchanged at nine

## Blocked by

- [02 — Join or create a cal at `/`](./02-join-or-create.md)

## Built

Two new modules, one new component file and five files touched.
`src/hangouts/elsewhere.ts` (+ `elsewhere.test.ts`) is the rule and the copy,
`src/hangouts/use-elsewhere.ts` is the snapshot read, and
`src/hangouts/busy-elsewhere.tsx` is the mark in its two sizes. The four
surfaces are `candidates/candidate-card.tsx`, `hangouts/hangout-card.tsx`,
`hangouts/hangout-detail.tsx` and `hangouts/retime-dialog.tsx`;
`candidates/candidate-list.tsx` and `shell/right-pane.tsx` pass the list
through. No SQL, no RPC, no policy, no dependency, no CONTEXT.md term.

Everything below was exercised in a browser against the local rehearsal stack
with `00`–`13` applied, signed in as real accounts, on three fixture cals of
this slice's own (`g09 alpha`, `g09 beta`, `g09 gamma`) so that nothing another
agent was looking at moved underneath them. The live project is pre-cutover and
was never touched.

### The decisions this slice had to make

1. **The clash is computed per card, from the whole list.** Every surface takes
   `commitments` rather than resolved clashes, and calls `clashesWith` on its
   own range. That is what makes "nested cards do not inherit" structural: a
   child Candidate that does not reach 20:00 asks the same question and gets a
   different answer. The retime dialog needs the list for a second reason — its
   question is about the range the picker is currently on, which is not a range
   anything above it knows.
2. **One predicate decides where the mark goes, and it lives beside the rule.**
   `isOffered` is `!isPast && stateOf !== 'participant'`, and the Hangout card
   is the only caller: the detail is handed the clashes the card already
   resolved, so the rule is not read twice and cannot drift. §4's "a commitment
   you could take on, never one you hold" is therefore one line of code.
   A Candidate needs no such test at all — confirming it makes it stop being a
   Candidate, and its Slots are blanked out of the scan by the Hangout it
   became.
3. **The four acts refresh the snapshot through a signature, not four
   callbacks.** `heldKey(hangouts, viewerId)` is the ids and times of the
   Hangouts the viewer is on in this cal, and every one of confirm, Join,
   Rejoin and retime moves it. Threading a `refresh()` through five writes would
   have meant wrapping the store's five callbacks in the pane, and the store's
   `confirm` returns void — there is no "landed" to hang off. The signature also
   ignores what it should: other people joining, leaving and being dropped churn
   the Hangout store constantly and change nothing here.
   **Worth knowing:** on a cal screen where the viewer holds something, this
   reads twice — once before the Hangout store lands, once when `held` stops
   being empty. The alternative was to wait for the Hangout store, and §9 is
   explicit that a mark materialising late, under a cursor already reaching for
   the tick, is worse than one that was never there. So the first read is the
   one that has to be early, and the second is narrow.
4. **The window has no upper bound, so the view window is not a refresh
   trigger.** §9 says "refreshed when the view window or the current cal
   changes". The read is `hangout.ends_at >= now` with nothing above it, which
   already covers every window the viewer can navigate to — and it has to, since
   the retime dialog's date field has no upper bound either and a snapshot
   clipped to the week on screen would go quiet exactly where somebody is moving
   a plan to. The floor only advances, so a navigation cannot need rows the
   snapshot does not hold. One trigger rather than two, and the deviation is in
   the narrowing direction.
5. **It is not fetched at all for a Friend in one cal.** `useCals()` is already
   the list surface; `cals.length < 2` returns an empty array with no request
   issued, which is every Friend in the product today. The alternative — fetch
   and get nothing — puts a query on every calendar screen to prove a fact the
   client already holds. Verified in the network panel as Cyd: the cal screen
   issues the store's own participant read and nothing else.
6. **The cal names come from `useCals()`, not from a second embed.** The read
   waits for that list rather than racing it, which is one round trip the
   join-or-create page already pays, and it means a rename lands here too. The
   `'another cal'` fallback is unreachable today and is there because
   `undefined` in a sentence is worse than a vague one.
7. **The failure path is the Hangout read's toast**, `timeout: 0`, next to a
   list that still renders. The Candidate list has no failure state of its own —
   `useHangouts` raises exactly this toast for exactly this reason — and §1's
   rule is what makes silence unacceptable here: a failed fetch that draws no
   marks turns "nothing is not an answer" into an answer, and a wrong one.
8. **No frame on any of these strings**, applied once in `elsewhere.ts` rather
   than at three call sites. §7's argument is that the frame disambiguates
   between Friends reading the same string and nobody but the viewer will ever
   see this one; the code spells that as `frameless(zone)` with the paragraph
   attached.
9. **The live region in the retime dialog is the wrapper, not the block.** The
   block cannot be rendered when there is nothing to say, and a live region that
   mounts together with its first content is one most screen readers never
   announce. An empty `div` that is always there announces the arrival and the
   departure as the picker moves.

### What the rehearsal showed

Fixture: `g09 alpha` and `g09 beta` hold Ada's and Bea's Availability on Sat 19
Sep (alpha 19:00–21:00 and 22:00–23:00, beta 20:00–23:00); `g09 gamma` holds two
Hangouts of Ada's alone, `climbing` 21:00–22:00 and an untitled 22:30–23:30;
alpha holds `bea night` 22:00–23:00 with Bea on it and Ada not.

- **Confirm.** Alpha's 19:00–21:00 Candidate carried **no** mark, which is
  right: gamma's 21:00 plan starts where it ends, and half-open means that is
  not an overlap. Confirming it produced a Hangout card with no mark on it.
  Over in beta the 20:00–23:00 Candidate then read
  `Busy 19:00 – 21:00, and 2 others` — alpha's new plan plus both of gamma's,
  two other cals at once — and its tick announced
  `Confirm Sat 19 Sep, 20:00 – 23:00 — you are busy 19:00 – 21:00 elsewhere, and at 2 other times`.
  Its detail named all three: `Hangout in g09 alpha`, `climbing in g09 gamma`,
  `Hangout in g09 gamma`, each with its own date and range. Confirming **that**
  took the mark away from the card that was clicked, while the clash stayed true.
- **Join.** Alpha's `bea night` card read `Busy 22:30 – 23:30` beside its
  `Join?`, and the button announced the same.
- **Rejoin.** With Ada's `left_at` set on alpha's plan, its card read
  `Busy 20:00 – 23:00` (beta's) and its detail put
  `That clashes with a plan of your own: Hangout in g09 beta` directly above the
  Rejoin button. Pressing Rejoin cleared both, in place.
- **Retime.** Beta's dialog carried the three-line block under the consequence
  sentence; moving the day to Sunday emptied it and moving it back brought it
  back, with no round trip.
- **Drawing and erasing.** A drawn 15:00–16:00 run and the erase that removed it
  again produced no mark, no dialog and no toast, and the grid holds no `Busy`
  string anywhere — a DOM sweep for it finds hits only inside the sidebar's card
  lists.
- **The failure path.** With the cross-cal request forced to `403` in the page,
  navigating into a cal raised *"Couldn't check your other cals"* with the
  Postgres message and no timeout, over a Candidate list that carried on working.
- **One cal.** As Cyd, who is a Member of exactly one, the cal screen issued no
  cross-cal request at all and nothing on it was marked.
- **Somebody else's commitments.** The one request is
  `friend_id=eq.<the viewer>&left_at=is.null&cal_id=neq.<this cal>`; nothing
  else was ever asked for, and every string rendered named a plan of Ada's own.

### Checks

```
$ npx tsc -b
(clean)

$ yarn test
ℹ tests 350
ℹ pass 350
ℹ fail 0

$ yarn lint
✖ 9 problems (9 errors, 0 warnings)
```

### Left behind

- **The mark's range can be read off the wrong day in one case.** A commitment
  that starts before the window it collides with, on the previous day, renders
  as `Busy 22:00 – 02:00 Sat` — the crossing marker names the day it lands on,
  and the day it began on is not on the card. The detail one tap away carries
  the date. Adding it to the card would spend the width §7 measured and cut the
  naming for.
- **The rehearsal fixture is still on the local stack** (three cals whose Codes
  begin `GZZ`, plus their Availability and Hangouts). It is a throwaway stack and
  other agents were using it at the same time, so it was left rather than deleted
  underneath them.

### Left for after the cutover

Nothing. Every criterion was exercised against a migrated stack; the live
project needs the human's SQL before any of it is reachable there, which is
ticket 01's half rather than this one's.
