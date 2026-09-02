/**
 * The month lattice and its two measurements.
 *
 *     yarn test
 *
 * Runs on Node's own runner, like `slots.test.ts` and `segments.test.ts` — so
 * the module under test imports only bare specifiers, never `@/`.
 *
 * Every date here is built with `new Date(y, m, d)` on purpose: that names a
 * *civil date* whose `getFullYear`/`getMonth`/`getDate` read the same in any
 * system time zone, which is what `monthLattice` and `wholeDay` consume. An ISO
 * string would name an instant, and the runner's own zone would decide which
 * calendar day it landed on.
 */
import { DAYS_IN_WEEK, daysBetween, monthLattice, monthWeeks, peakOf, wholeDay } from './month.ts'
import assert from 'node:assert/strict'
import test from 'node:test'

const ROME = 'Europe/Rome'
/** Monday, the same as the grid's. */
const MONDAY = 1

/** The Sunday the clocks go back in Rome: 02:00–03:00 happens twice. */
const CLOCKS_BACK = new Date(2026, 9, 25)
/** The Sunday the clocks go forward: 02:00–03:00 never happens. */
const CLOCKS_FORWARD = new Date(2027, 2, 28)

/* ================================================================== *
 * The lattice — whole weeks, counted rather than assumed
 * ================================================================== */

test('the lattice is whole weeks, and it begins on the grid’s own weekday', () => {
  // September 2026 opens on a Tuesday, so the row leads with 31 August.
  const days = monthLattice(new Date(2026, 8, 15), MONDAY)

  assert.equal(days.length % DAYS_IN_WEEK, 0)
  assert.equal(days[0].getDay(), MONDAY)
  assert.equal(days[0].getDate(), 31)
  assert.equal(days[0].getMonth(), 7)
  assert.equal(days[days.length - 1].getDay(), 0)
})

test('a month that needs six rows gets six, and one that needs five gets five', () => {
  // August 2026 opens on a Saturday and holds 31 days: 6 rows.
  assert.equal(monthLattice(new Date(2026, 7, 1), MONDAY).length, 6 * DAYS_IN_WEEK)
  // September 2026 opens on a Tuesday and holds 30: 5 rows.
  assert.equal(monthLattice(new Date(2026, 8, 1), MONDAY).length, 5 * DAYS_IN_WEEK)
})

test('February in a non-leap year that opens on the week’s first day is exactly four rows', () => {
  // The degenerate month, and the reason the row count is counted from the two
  // edges rather than fixed at five or six.
  assert.equal(monthLattice(new Date(2027, 1, 10), MONDAY).length, 4 * DAYS_IN_WEEK)
})

test('every cell of the lattice is drawn, in one row of seven each', () => {
  const days = monthLattice(new Date(2026, 8, 15), MONDAY)
  const weeks = monthWeeks(days)

  assert.equal(weeks.length, days.length / DAYS_IN_WEEK)
  weeks.forEach((week) => assert.equal(week.length, DAYS_IN_WEEK))
  assert.deepEqual(weeks.flat(), days)
})

/* ================================================================== *
 * A whole-day stroke is the day's own Slots — never 48
 * ================================================================== */

test('a whole-day stroke is 48 Slots on an ordinary day', () => {
  assert.equal(wholeDay(new Date(2026, 8, 1), ROME).length, 48)
})

test('the autumn Sunday is 50 Slots, and the spring Sunday is 46', () => {
  // The claim the acceptance criterion is really making. A hardcoded 48 would
  // write an hour that does not exist in March — an off-grid bound, which
  // `hangout_on_the_slot_grid` answers with 23514 — and miss one in October.
  assert.equal(wholeDay(CLOCKS_BACK, ROME).length, 50)
  assert.equal(wholeDay(CLOCKS_FORWARD, ROME).length, 46)
})

test('a whole-day stroke covers the day end to end, with no gap and no overlap', () => {
  const slots = wholeDay(CLOCKS_BACK, ROME)
  const HALF_HOUR = 30 * 60_000

  slots.forEach((slot, index) => {
    if (index === 0) return
    assert.equal(slot.getTime() - slots[index - 1].getTime(), HALF_HOUR)
  })
})

/* ================================================================== *
 * Peak concurrency — the number the wash carries
 * ================================================================== */

const segment = (start: number, end: number, friendIds: string[]) => ({ start, end, friendIds })

test('peak is the most Friends free at once, not the number who are free at all', () => {
  // Ticket 14's decisive pair, as data. Nine Friends free on both days; on the
  // first, not one pair overlaps.
  const nobodyOverlaps = Array.from({ length: 9 }, (_, index) =>
    segment(index * 2, index * 2 + 1, [`friend-${index}`])
  )
  const everybodyTogether = [
    segment(
      0,
      6,
      Array.from({ length: 9 }, (_, index) => `friend-${index}`)
    ),
  ]

  assert.equal(peakOf(nobodyOverlaps), 1)
  assert.equal(peakOf(everybodyTogether), 9)
})

test('peak reads the best moment, not the longest one', () => {
  // A whole evening at two, and half an hour at five. The wash is about how good
  // the day is, and the good half hour is what makes it good.
  const day = [segment(0, 20, ['a', 'b']), segment(40, 41, ['a', 'b', 'c', 'd', 'e'])]
  assert.equal(peakOf(day), 5)
})

test('a day nobody has marked has no peak at all', () => {
  // Not the foot of the ramp — the absence of a wash. `segmentsOf` emits no
  // segment for a span nobody is free in, so a quiet day has nothing to paint.
  assert.equal(peakOf([]), 0)
})

/* ================================================================== *
 * The drag's span
 * ================================================================== */

test('a drag covers every day between its two ends, whichever way it was made', () => {
  assert.deepEqual(daysBetween(35, 10, 13), [10, 11, 12, 13])
  assert.deepEqual(daysBetween(35, 13, 10), [10, 11, 12, 13])
})

test('a press that never moved is one day', () => {
  assert.deepEqual(daysBetween(35, 10, 10), [10])
})

test('a drag across the row boundary takes the days between, not a rectangle', () => {
  // Saturday of one row to Monday of the next: the Sunday between them is in it.
  // The month's unit is a day and the rows are a wrapping of one sequence.
  assert.deepEqual(daysBetween(35, 5, 8), [5, 6, 7, 8])
})

test('a pointer off the end of the grid resolves to the nearest edge', () => {
  assert.deepEqual(daysBetween(5, 3, 40), [3, 4])
  assert.deepEqual(daysBetween(5, 2, -7), [0, 1, 2])
})
