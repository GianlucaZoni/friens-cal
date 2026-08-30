# 06 — Prototype: drawing, resizing and duplicating Availability

Prototype run 2026-08-29. Throwaway code, deliberately.

## What I built

`src/prototypes/drag-interaction/` — a single-Friend week grid, 7 day columns,
30-minute rows, plain blue rectangles. Two forms of the same thing:

- `index.tsx` + `week-grid.tsx` + `variant-{a,b,c}-*.tsx` — the React route.
  Default export `DragInteractionPrototype`. Wire with
  `<Route path="/prototype/drag-interaction" element={<DragInteractionPrototype />} />`,
  then `?variant=A|B|C`, or the floating bar, or ← / →.
- `standalone.html` — a dependency-free twin, same time model and same gesture
  rules. Double-click it. It exists because the repo currently has **no
  `node_modules`** and I was told not to run installers.

**Caveat, read this first:** every behavioural finding below was measured by
driving `standalone.html` with synthetic pointer events, and the pure time/merge
functions were unit-checked separately. The React version is a line-by-line twin
but has **never been through `tsc`** — nobody could compile it. Run
`npx tsc --noEmit` on it once dependencies are installed before trusting it.

Three variants, differing on exactly one axis — how you remove part of a range:

| | A | B | C |
|---|---|---|---|
| merging | on | on | **off** |
| remove the middle | drag inside a block | double-click punches 30 min, then resize | click the record, Delete |

Everything else (cross-midnight, live merge, degenerate drags, escape/undo,
⌥duplicate, resize collisions, selection) is identical in all three so they can
be judged against each other. A toolbar toggle switches the create-drag between
three geometries (column-locked / rectangle / linear time) so question 1 could be
*tried* rather than argued about.

---

## 7 — Deleting part of a range ⚠️

**The current gesture set genuinely cannot do it, and that is not acceptable.**
The 08:00–22:00 monolith is not an edge case, it is the steady state: it is what
you get after drawing "morning" and "afternoon" on the same day twice in a month.
Merging plus "click to select, Delete to remove" means the only delete primitive
operates on a whole merged range. To remove 13:00–14:00 from it today you must
delete all fourteen hours and redraw two blocks around the hole — one delete plus
two drags, and you have to *remember* the original boundaries, because the thing
that knew them is gone. I built that path and it feels exactly as bad as it
sounds.

### The three options, all built

**A — erase drag (recommended).** A drag that *starts inside* a block subtracts
that span. Measured: one gesture, and the boundaries you are not touching are
never at risk. Wed 08:00–22:00, drag 12:00→14:00 inside it → `Wed 08:00–12:00`
and `Wed 14:00–22:00`.

The reason this is free: with merging, blocks are never *moved* — moving a block
is not in 01's gesture list — so "drag from the middle of a block" is an
**unassigned gesture**. Assigning it to erase costs nothing and takes nothing
away. It is also the paint/erase convention every comparable tool already uses
(When2meet, Doodle, spreadsheet range selection): the gesture is identical, the
*mode* is decided by what is under the pointer when the drag starts. It gives
whole-block delete for free too (drag across the whole thing), so click+Delete
stops being the only route out.

Two rough edges I measured, both fixable:

- The top and bottom 7px of a block are resize zones, so a drag begun exactly on
  a block's edge resizes instead of erasing. Recoverable, because erase snaps to
  30-minute slots — starting 12px inside the top still erases from the block's
  true start. But the edge zone must scale down for short blocks: a 30-minute
  block is 22px tall, and 7+7 leaves an 8px middle. Use `min(7, height/3)`.
- Only the *origin* decides the mode, not the direction. You cannot erase a span
  that begins on empty grid — that drag creates instead. Predictable, but it has
  to be taught once.

**B — punch and resize (rejected as primary).** Double-click punches out the
30-minute slot under the pointer, splitting the block; then you drag the two new
inner edges apart. Measured: **three gestures** to open one hole, versus one for
A. Worse, I measured the re-merge — drag either inner edge back over the gap and
the whole thing silently snaps back to `Wed 08:00–22:00`. And double-click on a
calendar grid means "create event" in every calendar app this group has ever
used. Reasonable as a secondary affordance, not as the answer.

**C — drop merging (reopens 01, and I recommend against it).** Records keep their
identity; deleting the middle becomes trivially "click the thing you drew,
Delete". I built it, and it is worse in ways that are easy to miss on paper:

- I seeded Wed with an overlapping pair, `12:00–14:00` and `13:00–18:00`. Clicked
  at 13:30, pressed Delete. The record `13:00–18:00` was removed — and **13:30
  was still blue**, because `12:00–14:00` still covers it. The user clicked a
  spot, deleted, and nothing changed at that spot. Meanwhile the picture changed
  somewhere they were not looking (14:00–18:00 opened up). That is indefensible.
- Which record does a click at 13:30 even select? Two cover it. I picked
  "the last one"; every rule here is arbitrary.
- Drawing *over* existing Availability has nowhere to go: the drag starts inside
  a block, so it selects instead of drawing. Keeping draw-over needs yet another
  modifier.
- Merging is not a UI convenience. It is what makes "is this Friend free at T" a
  single containment test. Candidate computation, the Participant-drop rule
  ("removing Availability that covered the Hangout drops you"), and ADR-0002's
  extend-only RPC all have to union on read anyway. C moves that cost everywhere
  and buys one gesture.

### Recommendation

**Keep merging. Add the erase drag (A). Keep click-select + Delete for whole
ranges.** This does not reopen 01's merging decision — it fills a gap 01 left.
01's editing list simply never contemplated partial removal, so this is an
*addition* to it, not a contradiction, and it should be written back into 01's
Availability section as one line.

**This is the human's call, not mine.** If an invisible modifier-less gesture is
unacceptable on discoverability grounds, the fallback is A plus a visible eraser
toggle in the toolbar — costs a click, self-documenting, and gives ticket 10
(touch) something with no modifier key in it.

One thing that also died here, worth recording so nobody re-proposes it: **a
plain "split at this point" cannot work.** Two abutting ranges re-merge instantly
by definition. Any split has to *remove* at least one slot to survive. That is
the fact that kills the "just split it" intuition.

---

## 1 — Cross-midnight and multi-day drags

**Storage: one Availability, not two.** I gave `start`/`end` plain absolute
timestamps with no day column, so midnight is not special, and made the
*renderer* split a range into per-day rectangles (the first gets a `↓`, the next
day's gets `↑ from Tue`). Verified: `Tue 23:00 → Wed 01:00` renders as two
rectangles from one record and merges correctly through midnight with a
`Wed 00:00–02:00` block. Two records would be wrong — it makes the 30 minutes
either side of midnight un-mergeable and forces every consumer to special-case
the boundary.

**Drag geometry: tried all three, recommend column-locked.**

- *Column-locked* — horizontal movement is ignored; keep dragging past the bottom
  of the column and the range runs into the next day. Verified: Sat 23:00 dragged
  down past the grid bottom → `Sat 23:00 → Sun 01:00`, one record.
- *Rectangle* — dragging across columns paints the same hours on every day
  touched (Mon→Fri gave five records at 03:00–05:00). Genuinely useful for
  "weekday evenings", but it makes cross-midnight impossible in the same gesture;
  the two behaviours cannot coexist in one drag.
- *Linear time* — anchor→pointer is one continuous run through the week
  (`Sat 20:00 → Sun 02:00`, one record). Reads as a bug the moment your hand
  drifts a column sideways: you get an accidental 30-hour range.

Blunt bit: cross-midnight by over-dragging past the bottom is **the one thing
here that feels bad**. It needs auto-scroll at the column bottom, which the
prototype does not have, so today you have to physically drag toward the window
edge. It is also discoverable by accident rather than by design. It works, and I
would still ship it, but it is not a feature anyone will find on purpose.
Rectangle mode is worth revisiting later as an explicit second tool — not as the
default drag.

## 2 — Merging feedback

**Live, during the drag.** Verified: with `Wed 08:00–22:00` committed, drawing
06:00→07:59 shows a single `06:00–22:00` rectangle mid-drag while the record list
still reads `08:00–22:00`. Release just commits what you are already looking at.
The draft keeps a dashed white outline over only the slots *this* gesture is
contributing, so you see both the union and your own contribution at once.
On-release merging was not built: a block visibly jumping and absorbing at the
instant you let go is exactly the "wait, did I do that?" moment worth avoiding.

## 3 — Degenerate drags

**A click with no movement creates one 30-minute block.** Minimum drag distance
is 4px — verified that a 3px jitter still commits as a click. Rationale: 30
minutes is the smallest legal Availability and the single most common thing
anyone draws; making a click do nothing turns every quick "I'm free at 7" into a
fiddly 22-pixel drag.

The cost is real and I watched it happen while the page was open: stray clicks
litter the grid with 30-minute blocks. Undo covers it, and with variant A erasing
one is a single gesture. Clicks on an *existing* block select rather than create,
so the litter only accumulates on empty grid.

## 4 — Cancelling and undo

Escape mid-drag aborts the gesture and commits nothing; the preview reverts on
the same frame. Verified across create, erase, resize and duplicate. Escape with
no drag in flight clears the selection.

Undo is a linear stack, **50 deep**, ⌘Z / Ctrl+Z, ⌘⇧Z to redo; any new commit
clears the redo stack. Verified across all five mutating actions. 50 is arbitrary
but far past a session's worth.

Open question for the implementation ticket: this prototype has no persistence,
so undo is purely local. Once writes go to Supabase, "undo after a failed
round-trip" is untested and undefined. Undo is not mentioned in 01 at all — flag
it for ticket 07/08.

## 5 — Alt+drag duplicate

Works, and the mechanics are right. The copy lands on any day and any time,
snaps to 30 minutes, and preserves the grab offset so the block stays put under
the cursor. **The original stays in place, dimmed to 55% with a dashed outline** —
it reads as a *source*, not as something being moved, which is the distinction
that matters. The cursor becomes `copy` as soon as Alt goes down while hovering a
block, before the drag starts. Landing on existing Availability merges, live and
then on release — verified: copying `Mon 09:00–11:00` onto Wed inside the
08:00–22:00 block left one record and logged `(merged into existing)`. Alt+click
with no movement does nothing, so there is no accidental duplicate-in-place.

**Is it discoverable? No. Nothing about the grid suggests it, and nothing
reasonably could.** I added a hover chip on blocks (`drag inside → erase · ⌥
copy`), and it is honest, but it is a tooltip — nobody reads tooltips, and it
cannot exist at all on touch, where ticket 10 has no modifier keys to work with.

Recommendation: keep ⌥drag as the *accelerator*, but make the discoverable path
an explicit control on the selected block — a small duplicate button, or the
3-dots menu pattern 01 already settled for Hangouts and Candidates. That also
gives ticket 10 something to reuse instead of inventing a touch-only gesture.

## 6 — Resize collisions

**Dragging an edge into a neighbour merges them, live, during the drag.**
Verified: `Thu 18:00–20:00` with a neighbour at `21:00–22:30`, bottom edge
dragged to 21:30 → one record `Thu 18:00–22:30`. Consistent with binary+merging;
clamping the edge at the neighbour would be arbitrary, since the union is
obviously the intent.

Found and fixed a real bug here: dragging one edge *past* the opposite edge
originally **flipped** the range — `Mon 14:00–15:30` silently became
`Mon 15:30–16:00`, i.e. the block relocated. That is Google Calendar's behaviour
and it is fine for a titled event you can watch move, but it is destructive for
an untitled availability block. The dragged edge now clamps at 30 minutes from
the fixed edge. Collapse-to-delete was deliberately not built; if you want a
resize to be able to delete a block, that should be a decision, not a side
effect.

## 8 — Selection

**One at a time, ⇧click to add or remove, Delete/Backspace removes all selected.
No marquee, and I recommend against one.** Drag on empty grid is create and drag
inside a block is erase, so a marquee needs a third modifier; and multi-select's
only real use is bulk delete, which the erase drag already does better — one drag
clears a span across a whole column. Multi-select earns its keep only for
"delete these three scattered blocks".

Bug found and fixed: in the erase variant, ⇧click was being swallowed by the
erase gesture's no-movement branch and *replaced* the selection instead of
extending it.

---

## Tried and rejected

- **Rectangle drag as the default.** Loses cross-midnight entirely and surprises
  you the instant your hand drifts one column sideways.
- **Linear-time drag.** One sideways twitch produces a 30-hour range.
- **Resize that flips past the opposite edge.** Silently relocates an untitled
  block. Replaced with clamping.
- **Split-on-click without removing a slot.** Impossible by construction —
  abutting ranges re-merge. Any split must remove ≥1 slot.
- **Merging shown only on release.** The absorb-on-drop moment is the thing to
  avoid.
- **Storing a cross-midnight range as two records.** Makes the 30 minutes either
  side of midnight un-mergeable and pushes a special case into every consumer.

## Contradicts or extends settled scope

- **01's Availability editing list has no partial-removal gesture at all.** Item
  7 is a hole in 01 rather than a contradiction, but it needs one line added once
  the human picks an option.
- **01 says nothing about cross-midnight.** This prototype proposes it is *one*
  Availability, and therefore that the schema stores plain timestamps with no day
  column. That belongs in ticket 07 explicitly.
- **Undo does not appear in 01.** Proposed here; interacts with Supabase writes.
  Flag for 07/08.
- **01's "a Friend may only duplicate their own Availability" is untested** — this
  is a single-Friend prototype.
- Everything else in 01's gesture list survived contact: 30-minute snap,
  edge-resize, click-select-delete, and ⌥drag-to-duplicate-anywhere all work and
  feel right.
