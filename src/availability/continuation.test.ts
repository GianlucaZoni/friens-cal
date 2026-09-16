/**
 * A run that carries on past the column it is drawn in.
 *
 *     yarn test
 *
 * Node's own runner, like `slots.test.ts` and `segments.test.ts`, so
 * `continuation.ts` imports only bare specifiers, never `@/`.
 *
 * Every date here is `new Date(y, m, d)`, a *civil date* that reads the same in
 * any system zone, for the reason `slots.test.ts` states at length.
 *
 * The case that pays for the module is the prototype's: a Rome Friend draws
 * Tuesday 20:00–23:30 and a Kolkata Friend reads a 30-minute sliver at the foot
 * of Tuesday plus three hours at the head of Wednesday, ~960px apart in the
 * scroller, with no scroll position that shows both. The assertion below is
 * that the two fragments each know the other is there.
 */
import { withContinuation } from './continuation.ts'
import { runsOf, slotsOfDay, type Run } from './slots.ts'
import assert from 'node:assert/strict'
import test from 'node:test'

const ROME = 'Europe/Rome'
/** +5:30, so +3:30 from Rome in summer: inside the band where an evening splits. */
const KOLKATA = 'Asia/Kolkata'

/** Tuesday and the Wednesday after it, with nothing wrong with either. */
const TUESDAY = new Date(2026, 8, 15)
const WEDNESDAY = new Date(2026, 8, 16)

/** The Sunday the clocks go back in Rome: 50 rows, and 02:00 twice. */
const CLOCKS_BACK = new Date(2026, 9, 25)
const AFTER_CLOCKS_BACK = new Date(2026, 9, 26)
const BEFORE_CLOCKS_BACK = new Date(2026, 9, 24)

/** The Sunday the clocks go forward: 46 rows, and no 02:00 at all. */
const CLOCKS_FORWARD = new Date(2027, 2, 28)
const AFTER_CLOCKS_FORWARD = new Date(2027, 2, 29)
const BEFORE_CLOCKS_FORWARD = new Date(2027, 2, 27)

/**
 * The Slots of one day whose wall clock falls in `[from, to)`, as instants.
 *
 * Wall clock in the zone the Friend *drew* in, which is the only place a run
 * has a shape at all: what the store holds is instants, and every assertion
 * below reads those instants back through some other viewer's day.
 */
const wallClock = (day: Date, timeZone: string, from: string, to: string): number[] =>
  slotsOfDay(day, timeZone)
    .filter((slot) => slot.label >= from && slot.label < to)
    .map((slot) => slot.start.getTime())

/** The store, as the set of instants one Friend holds. */
const store = (...spans: number[][]) => {
  const held = new Set(spans.flat())
  return (instant: Date) => held.has(instant.getTime())
}

/** One column as the grid draws it: its runs, each told what is past the edges. */
const column = (day: Date, timeZone: string, isHeld: (instant: Date) => boolean) => {
  const slots = slotsOfDay(day, timeZone)
  return withContinuation(
    runsOf(slots.length, (row) => isHeld(slots[row].start)),
    slots,
    isHeld
  )
}

/** `[continuesBefore, continuesAfter]` per run, which is what all of this is for. */
const marks = (runs: readonly { continuesBefore: boolean; continuesAfter: boolean }[]) =>
  runs.map((run) => [run.continuesBefore, run.continuesAfter])

/* ================================================================== *
 * The rule
 * ================================================================== */

test('a run that ends at midnight with nothing beyond it keeps both caps', () => {
  // The half the prototype was explicit about: an evening that stops at 24:00
  // is an evening that stops, and capping it is correct. Only the store can
  // tell this apart from the fragment below it.
  const held = store(wallClock(TUESDAY, ROME, '22:00', '24:00'))
  const tuesday = column(TUESDAY, ROME, held)

  assert.deepEqual(
    tuesday.map((run) => [run.start, run.length]),
    [[44, 4]]
  )
  assert.deepEqual(marks(tuesday), [[false, false]])
})

test('a run whose next Slot exists across the boundary marks on both fragments', () => {
  const held = store(
    wallClock(TUESDAY, ROME, '22:00', '24:00'),
    wallClock(WEDNESDAY, ROME, '00:00', '01:00')
  )

  // The tail of Tuesday is open at its foot, the head of Wednesday at its top,
  // and neither is open at the end that genuinely ends.
  assert.deepEqual(marks(column(TUESDAY, ROME, held)), [[false, true]])
  assert.deepEqual(marks(column(WEDNESDAY, ROME, held)), [[true, false]])
})

test('a run that does not reach the column edge is never marked', () => {
  // The drawn run and the store are allowed to disagree: an erase draft in
  // flight subtracts from the block on screen and not from the store, so a run
  // can end at 23:30 with 23:30 still held. A rule phrased as "the Slot after
  // the run is held" would put a chevron in the middle of the column.
  const held = store(
    wallClock(TUESDAY, ROME, '22:00', '24:00'),
    wallClock(WEDNESDAY, ROME, '00:00', '01:00')
  )
  const erasing: Run[] = [{ start: 44, length: 3 }]

  assert.deepEqual(marks(withContinuation(erasing, slotsOfDay(TUESDAY, ROME), held)), [
    [false, false],
  ])
})

test('the runs themselves come back untouched', () => {
  const held = store(wallClock(TUESDAY, ROME, '09:00', '11:00'))
  const slots = slotsOfDay(TUESDAY, ROME)
  const runs = runsOf(slots.length, (row) => held(slots[row].start))

  assert.deepEqual(
    withContinuation(runs, slots, held).map(({ start, length }) => ({ start, length })),
    [...runs]
  )
})

test('no runs, nothing to mark', () => {
  assert.deepEqual(
    withContinuation([], slotsOfDay(TUESDAY, ROME), () => true),
    []
  )
})

test('a run that fills the column is open at both ends when both neighbours are held', () => {
  const held = store(
    wallClock(TUESDAY, ROME, '23:30', '24:00'),
    wallClock(WEDNESDAY, ROME, '00:00', '24:00'),
    wallClock(new Date(2026, 8, 17), ROME, '00:00', '00:30')
  )

  assert.deepEqual(marks(column(WEDNESDAY, ROME, held)), [[true, true]])
})

/* ================================================================== *
 * The sliver, which is the thing worth beating
 * ================================================================== */

test('a Rome evening read in Kolkata marks the sliver and the head it belongs to', () => {
  // Prototype 13's measured case. Rome draws 20:00–23:30 on the Tuesday; at
  // +3:30 that is 23:30–24:00 on Kolkata's Tuesday plus 00:00–03:00 on its
  // Wednesday. The 20px sliver reads as a mis-click, and the mark is the whole
  // of what stops it.
  const held = store(wallClock(TUESDAY, ROME, '20:00', '23:30'))
  const tuesday = column(TUESDAY, KOLKATA, held)
  const wednesday = column(WEDNESDAY, KOLKATA, held)

  assert.deepEqual(
    tuesday.map((run) => [run.length, run.continuesBefore, run.continuesAfter]),
    [[1, false, true]]
  )
  assert.deepEqual(
    wednesday.map((run) => [run.start, run.length, run.continuesBefore, run.continuesAfter]),
    [[0, 6, true, false]]
  )
})

test('the same evening read in the zone it was drawn in does not split at all', () => {
  // The control. Nothing here is gated on the cal spanning zones, and nothing
  // here invents a boundary that is not in the data either.
  const held = store(wallClock(TUESDAY, ROME, '20:00', '23:30'))

  assert.deepEqual(marks(column(TUESDAY, ROME, held)), [[false, false]])
  assert.deepEqual(column(WEDNESDAY, ROME, held), [])
})

/* ================================================================== *
 * A day is 46, 48 or 50 rows
 * ================================================================== */

test('the 50-row Sunday marks at both of its own boundaries', () => {
  const held = store(
    wallClock(BEFORE_CLOCKS_BACK, ROME, '23:00', '24:00'),
    wallClock(CLOCKS_BACK, ROME, '00:00', '01:00'),
    wallClock(CLOCKS_BACK, ROME, '23:00', '24:00'),
    wallClock(AFTER_CLOCKS_BACK, ROME, '00:00', '01:00')
  )
  const sunday = column(CLOCKS_BACK, ROME, held)

  // Two runs on the long day: the head of one evening and the foot of another.
  assert.equal(slotsOfDay(CLOCKS_BACK, ROME).length, 50)
  assert.deepEqual(
    sunday.map((run) => [run.start, run.start + run.length]),
    [
      [0, 2],
      [48, 50],
    ]
  )
  assert.deepEqual(marks(sunday), [
    [true, false],
    [false, true],
  ])
  assert.deepEqual(marks(column(BEFORE_CLOCKS_BACK, ROME, held)), [[false, true]])
  assert.deepEqual(marks(column(AFTER_CLOCKS_BACK, ROME, held)), [[true, false]])
})

test('the 46-row Sunday marks at both of its own boundaries', () => {
  // The hour that never happens leaves no rows behind, so the day's last row is
  // row 45 rather than row 47. The arithmetic is the instant either side of the
  // column and not the row count, which is why this needs no case of its own.
  const held = store(
    wallClock(BEFORE_CLOCKS_FORWARD, ROME, '23:00', '24:00'),
    wallClock(CLOCKS_FORWARD, ROME, '00:00', '01:00'),
    wallClock(CLOCKS_FORWARD, ROME, '23:00', '24:00'),
    wallClock(AFTER_CLOCKS_FORWARD, ROME, '00:00', '01:00')
  )
  const sunday = column(CLOCKS_FORWARD, ROME, held)

  assert.equal(slotsOfDay(CLOCKS_FORWARD, ROME).length, 46)
  assert.deepEqual(
    sunday.map((run) => [run.start, run.start + run.length]),
    [
      [0, 2],
      [44, 46],
    ]
  )
  assert.deepEqual(marks(sunday), [
    [true, false],
    [false, true],
  ])
  assert.deepEqual(marks(column(BEFORE_CLOCKS_FORWARD, ROME, held)), [[false, true]])
  assert.deepEqual(marks(column(AFTER_CLOCKS_FORWARD, ROME, held)), [[true, false]])
})

/* ================================================================== *
 * The store, not the columns on screen
 * ================================================================== */

test('a run continuing off the visible week still marks', () => {
  // The whole of the off-screen case, and the reason this is asked of the store
  // rather than of the neighbouring column. A Sunday evening run whose
  // remainder lands on a Monday the week view is not drawing has no
  // neighbouring column to ask.
  const sunday = new Date(2026, 8, 20)
  const monday = new Date(2026, 8, 21)
  const held = store(
    wallClock(sunday, ROME, '22:00', '24:00'),
    wallClock(monday, ROME, '00:00', '01:00')
  )

  const week = [14, 15, 16, 17, 18, 19, 20].map((date) =>
    column(new Date(2026, 8, date), ROME, held)
  )

  assert.equal(week.filter((runs) => runs.length > 0).length, 1)
  assert.deepEqual(marks(week[6]), [[false, true]])
})
