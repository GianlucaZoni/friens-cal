# 06 — Prototype: drawing, resizing and duplicating Availability

Type: prototype
Status: resolved
Blocked by: —

## Question

Ticket 01 settled *what* the gestures are. This ticket settles whether they feel
right, and resolves the edge cases that only appear once a pointer is moving.

The gestures: drag empty grid to create (30-min snap), drag a block's top/bottom
edge to resize, click to select and delete to remove, **alt+drag to duplicate**
and drop anywhere.

Edge cases to resolve:

1. **Cross-midnight and multi-day drags.** Can a drag run from Tuesday 23:00
   into Wednesday 01:00? Does it produce one Availability or two? Can a drag run
   *horizontally* across day columns at all, or is a drag confined to one day?
2. **Merging feedback.** Availability merges. When a drag lands adjacent to or
   overlapping an existing block, does the user see the merge happen live during
   the drag, or on release?
3. **Degenerate drags.** A click with no movement — does it create a single
   30-minute block, or nothing? What is the minimum drag distance?
4. **Cancelling.** Escape mid-drag. Is there undo, and how far does it go?
5. **Alt+drag specifics.** Does the original stay highlighted? What does the
   cursor say? What happens when the copy lands on top of existing Availability
   (merge, per 01)? Is the modifier discoverable at all, and does anything in
   the UI hint at it?
6. **Resize collisions.** Dragging a block's edge into a neighbouring block.
7. **Deleting part of a range.** With merging, a Friend can end up with one
   08:00–22:00 block. Removing only the middle is currently impossible — is
   that acceptable, or does something have to give? **This one may reopen the
   merging decision in ticket 01; flag it rather than deciding alone.**
8. **Selection.** Can several blocks be selected at once? Is there marquee
   selection, or one at a time?

Desktop pointer only — touch is ticket 10. May build on ticket 05's prototype
but does not need to; plain rectangles are enough to judge feel.

## Answer

<!-- link the prototype; record the resolutions, especially item 7 -->

## Answer

Prototype: `src/prototypes/drag-interaction/` — three variants disagreeing on
**exactly one axis** (how you remove part of a range), via `?variant=A|B|C`, the
bottom bar, or ←/→. Also `standalone.html`, a dependency-free twin.
Findings: [`prototypes/06-drag-interaction.md`](../prototypes/06-drag-interaction.md).

**Caveat**: no `node_modules` in the repo, so the React version has **never been
through `tsc`** — run `npx tsc --noEmit` once deps are installed. All findings
were measured by driving the standalone with synthetic pointer events.

7. **Deleting part of a range — confirmed unacceptable.** The 08:00–22:00
   monolith is the *steady state*, not an edge case, and removing the middle
   costs one delete plus two redraws while losing boundaries you never touched.
   **Recommendation: keep merging, add an erase drag** — a drag *starting
   inside* a block subtracts that span. It is free, because with merging blocks
   are never moved, so drag-from-the-middle is an unassigned gesture; it is also
   the paint/erase convention of When2meet and Doodle. Rejected alternatives,
   both built: "punch and resize" takes three gestures and silently re-merges
   when you drag an edge back; **dropping merging is demonstrably worse** —
   with overlapping records, clicking 13:30 and pressing Delete left 13:30 still
   blue while the picture changed elsewhere. Plain split-on-click is impossible
   by construction: abutting ranges re-merge, so any split must remove a slot.
   **Awaiting the human's decision — this fills a gap ticket 01 left.**
1. **Cross-midnight — one Availability, not two.** Timestamps with no day
   column; midnight is not special; the *renderer* splits into per-day
   rectangles. Of three drag geometries built, **column-locked wins** —
   horizontal movement ignored, over-drag the bottom edge to cross midnight.
   But it is blunt: over-dragging is the one thing here that feels bad, it needs
   auto-scroll, and **nobody will find it on purpose**.
2. **Merging feedback — live during the drag.** Mid-drag shows the merged
   `06:00–22:00` block while the record is still `08:00–22:00`, with a dashed
   outline over just your contribution. Release commits what you already see.
3. **Degenerate drags** — a click with no movement creates one 30-minute block;
   threshold 4px, so 3px of jitter still counts as a click. Real cost: stray
   clicks litter the grid, observed happening.
4. **Cancel and undo** — Escape aborts and commits nothing; undo is 50 deep with
   ⌘Z / ⌘⇧Z. **Undo is not in ticket 01 at all**, and "undo after a failed
   Supabase round-trip" is undefined. → tickets 07 and 08.
5. **Alt+drag works but is undiscoverable**, and nothing reasonably fixes that —
   a hover chip is a tooltip and cannot exist on touch. Original stays dimmed
   with a dashed outline reading as a *source*; `copy` cursor on Alt-down;
   merges live on landing. **Keep ⌥ as an accelerator and make the discoverable
   path a control on the selected block or the 3-dots menu** ticket 01 already
   settled.
6. **Resize collisions** merge live. Found and fixed a real bug: an edge dragged
   past the opposite edge *flipped* the range, silently relocating the block.
8. **Selection — one at a time**, ⇧click to add, Delete removes all. **No
   marquee**: it would need a third modifier, and erase-drag does bulk removal
   better. Fixed a bug where ⇧click was swallowed by the erase gesture.
