/**
 * The boundary sweep, asserted against the prototype's own case.
 *
 *     yarn test
 *
 * Node's own runner, like `slots.test.ts` and `gesture.test.ts` — so
 * `segments.ts` imports only bare specifiers, never `@/`.
 *
 * The case at the top is prototype 05's Q1 probe verbatim: **Marco 18:00–22:00,
 * Sara 20:00–23:00 → three segments.** That prototype compared segmenting the
 * day where the *set* changes (variant A) against one block per "somebody is
 * free" (variant B) and found B unusable — the cross-fade eats any segment
 * under an hour, and a block spanning three different sets cannot answer "who
 * is free here". So the answer unit is the segment, and this is the assertion
 * that the sweep produces it.
 *
 * The other claims worth pinning are the two the grid depends on and the one
 * issue 08 will: that a boundary falls wherever the set changes *at all*
 * (including where the count does not move), that an empty span produces no
 * segment rather than an empty one, and that contiguous segments group back
 * into the run they visually belong to.
 */
import { runsOfSegments, segmentsOf, type Segment } from './segments.ts'
import assert from 'node:assert/strict'
import test from 'node:test'

/** Row indices, so the wall clocks below read as themselves. */
const row = (hour: number, half = 0) => hour * 2 + half
const SLOTS_IN_DAY = 48

/**
 * A Friend's Availability as a half-open span of wall-clock hours, which is all
 * these tests need — the sweep is index arithmetic and knows nothing of dates.
 */
type Held = { id: string; from: number; to: number }

const freeIn =
  (held: readonly Held[]) =>
  (friendId: string, index: number): boolean =>
    held.some((span) => span.id === friendId && index >= row(span.from) && index < row(span.to))

/** `{ start, end, [ids] }` flattened to something an assertion reads cleanly. */
const shape = (segments: readonly Segment[]) =>
  segments.map(({ start, end, friendIds }) => [start, end, [...friendIds].join('+')])

/* ================================================================== *
 * The prototype's case
 * ================================================================== */

test('Marco 18:00–22:00 and Sara 20:00–23:00 make three segments', () => {
  const held = [
    { id: 'marco', from: 18, to: 22 },
    { id: 'sara', from: 20, to: 23 },
  ]

  assert.deepEqual(shape(segmentsOf(SLOTS_IN_DAY, ['marco', 'sara'], freeIn(held))), [
    [row(18), row(20), 'marco'],
    [row(20), row(22), 'marco+sara'],
    [row(22), row(23), 'sara'],
  ])
})

test('the three segments are contiguous, so they are one run', () => {
  const held = [
    { id: 'marco', from: 18, to: 22 },
    { id: 'sara', from: 20, to: 23 },
  ]
  const runs = runsOfSegments(segmentsOf(SLOTS_IN_DAY, ['marco', 'sara'], freeIn(held)))

  // One silhouette, three internal boundaries: the prototype's "segments inside
  // runs" — steal A's segmentation and B's outer outline.
  assert.equal(runs.length, 1)
  assert.equal(runs[0].length, 3)
})

/* ================================================================== *
 * Where a boundary falls
 * ================================================================== */

test('a boundary falls where the SET changes, even when the count does not', () => {
  // Marco leaves at 20:00 and Sara arrives at 20:00. Two free hours, one
  // Friend throughout, and a hard edge in the middle — because "who" changed.
  // A sweep over counts alone would show one unbroken block here, and the
  // popover would then disagree with the grid about how many answers it holds.
  const held = [
    { id: 'marco', from: 19, to: 20 },
    { id: 'sara', from: 20, to: 21 },
  ]

  assert.deepEqual(shape(segmentsOf(SLOTS_IN_DAY, ['marco', 'sara'], freeIn(held))), [
    [row(19), row(20), 'marco'],
    [row(20), row(21), 'sara'],
  ])
})

test('nobody free produces no segments at all', () => {
  assert.deepEqual(
    segmentsOf(SLOTS_IN_DAY, ['marco'], () => false),
    []
  )
})

test('a gap splits one Friend into two runs', () => {
  const held = [
    { id: 'marco', from: 10, to: 12 },
    { id: 'marco', from: 18, to: 20 },
  ]
  const segments = segmentsOf(SLOTS_IN_DAY, ['marco'], freeIn(held))

  // Same set on both sides, so they are two segments only because they do not
  // touch — and two runs for the same reason.
  assert.deepEqual(shape(segments), [
    [row(10), row(12), 'marco'],
    [row(18), row(20), 'marco'],
  ])
  assert.equal(runsOfSegments(segments).length, 2)
})

test('a half-hour segment survives', () => {
  // The unit is the Slot, and the sweep must not round it away: 30 minutes is
  // the smallest thing anybody can say anything about (CONTEXT.md).
  const held = [
    { id: 'marco', from: 20, to: 21 },
    { id: 'sara', from: 20.5, to: 21 },
  ]

  assert.deepEqual(shape(segmentsOf(SLOTS_IN_DAY, ['marco', 'sara'], freeIn(held))), [
    [row(20), row(20, 1), 'marco'],
    [row(20, 1), row(21), 'marco+sara'],
  ])
})

/* ================================================================== *
 * The order of `friendIds`, which is not decoration
 * ================================================================== */

test('friendIds come back in the order they were given, not the order they were found', () => {
  // The sweep decides where a boundary is by comparing one span's set with the
  // next, and it does that by *order*. Handing back the caller's order is what
  // makes that comparison sound — and it is also what puts the popover's list
  // in roster order for free.
  const held = [
    { id: 'sara', from: 18, to: 20 },
    { id: 'marco', from: 18, to: 20 },
  ]

  assert.deepEqual(shape(segmentsOf(SLOTS_IN_DAY, ['marco', 'sara'], freeIn(held))), [
    [row(18), row(20), 'marco+sara'],
  ])
})

test('a Friend not in the list is not in the sweep', () => {
  // Which is how Hidden works: hiding is a query tool, and the query is the
  // list of ids handed in (CONTEXT.md). Nothing here filters, and nothing here
  // knows the word "Hidden".
  const held = [{ id: 'sara', from: 18, to: 20 }]

  assert.deepEqual(segmentsOf(SLOTS_IN_DAY, ['marco'], freeIn(held)), [])
})

/* ================================================================== *
 * A day is 46, 48 or 50 slots
 * ================================================================== */

test('the sweep never looks past the length it was given', () => {
  // A spring DST day is 46 rows, and rows 46 and 47 do not exist on it. The
  // sweep is handed that column's own length for exactly this reason, and a
  // Friend "free" past the end must not appear.
  const spring = 46
  const held = [{ id: 'marco', from: 22, to: 24 }]
  const segments = segmentsOf(spring, ['marco'], freeIn(held))

  assert.equal(segments[segments.length - 1].end, spring)
})

/* ================================================================== *
 * Runs
 * ================================================================== */

test('grouping an empty sweep gives no runs', () => {
  assert.deepEqual(runsOfSegments([]), [])
})

test('grouping leaves the segments themselves alone', () => {
  const segments = segmentsOf(SLOTS_IN_DAY, ['marco'], freeIn([{ id: 'marco', from: 1, to: 2 }]))
  const before = shape(segments)
  runsOfSegments(segments)

  assert.deepEqual(shape(segments), before)
})
