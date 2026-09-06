/**
 * The four views' arithmetic.
 *
 *     yarn test
 *
 * Runs on Node's own runner, like `month.test.ts` — so the module under test
 * imports only bare specifiers and relative paths, never `@/`.
 *
 * Every date here is `new Date(y, m, d)` on purpose, for `month.test.ts`'s
 * reason: that names a *civil date* whose `getFullYear`/`getMonth`/`getDate`
 * read the same in any system time zone, which is what these functions consume.
 */
import { daysOf, rangeLabel, stepBy } from './view.ts'
import assert from 'node:assert/strict'
import test from 'node:test'

/** Monday, the same as the grid's. */
const MONDAY = 1

/** A Thursday, deliberately mid-week — so a week view has to move and the
 *  day-and-3-day views have to not. */
const THURSDAY = new Date(2026, 8, 3)

const civil = (date: Date) => [date.getFullYear(), date.getMonth(), date.getDate()]

/* ================================================================== *
 * Which days a view draws
 * ================================================================== */

test('day view draws exactly the anchor', () => {
  const days = daysOf('day', THURSDAY, MONDAY)

  assert.equal(days.length, 1)
  assert.deepEqual(civil(days[0]), civil(THURSDAY))
})

test('3-day view starts at the anchor rather than snapping to an edge', () => {
  const days = daysOf('3-day', THURSDAY, MONDAY)

  assert.equal(days.length, 3)
  // Thursday, Friday, Saturday — not the Tuesday a "block of three from the
  // month's start" would produce, and not the Monday a week snaps to.
  assert.deepEqual(
    days.map((day) => day.getDate()),
    [3, 4, 5]
  )
})

test('week view snaps to the grid’s own weekday, wherever in the week the anchor is', () => {
  const days = daysOf('week', THURSDAY, MONDAY)

  assert.equal(days.length, 7)
  assert.equal(days[0].getDay(), MONDAY)
  assert.deepEqual(
    days.map((day) => day.getDate()),
    [31, 1, 2, 3, 4, 5, 6]
  )
})

test('month view is the lattice, in whole weeks', () => {
  const days = daysOf('month', THURSDAY, MONDAY)

  assert.equal(days.length % 7, 0)
  assert.equal(days[0].getDay(), MONDAY)
  // September 2026 opens on a Tuesday, so the leading row starts 31 August.
  assert.deepEqual(civil(days[0]), [2026, 7, 31])
})

test('a 3-day block runs into the next month rather than stopping at its edge', () => {
  // The month boundary is not a wall: three days from 30 September is
  // September, October, October.
  const days = daysOf('3-day', new Date(2026, 8, 30), MONDAY)

  assert.deepEqual(
    days.map((day) => [day.getMonth(), day.getDate()]),
    [
      [8, 30],
      [9, 1],
      [9, 2],
    ]
  )
})

/* ================================================================== *
 * How far one press moves — the view's block, which issue 13 also swipes by
 * ================================================================== */

test('each view steps by its own block', () => {
  assert.deepEqual(civil(stepBy('day', THURSDAY, 1)), [2026, 8, 4])
  assert.deepEqual(civil(stepBy('3-day', THURSDAY, 1)), [2026, 8, 6])
  assert.deepEqual(civil(stepBy('week', THURSDAY, 1)), [2026, 8, 10])
  assert.deepEqual(civil(stepBy('month', THURSDAY, 1)), [2026, 9, 3])
})

test('stepping back is the exact inverse of stepping forward, for the day blocks', () => {
  for (const view of ['day', '3-day', 'week'] as const) {
    assert.deepEqual(civil(stepBy(view, stepBy(view, THURSDAY, 1), -1)), civil(THURSDAY))
  }
})

test('a 3-day step lands on the day after the block, never overlapping it', () => {
  const days = daysOf('3-day', THURSDAY, MONDAY)
  const next = daysOf('3-day', stepBy('3-day', THURSDAY, 1), MONDAY)

  // The last day of one block and the first of the next are consecutive: a
  // block that overlapped would page a day and show two of them twice.
  assert.equal(next[0].getTime() - days[2].getTime(), 24 * 60 * 60 * 1000)
})

test('the month step is a month and not 30 days, and it clamps at the short end', () => {
  // 31 days from 31 January is 3 March. `addMonths` is what keeps the anchor on
  // the month it is pointed at.
  assert.deepEqual(civil(stepBy('month', new Date(2027, 0, 31), 1)), [2027, 1, 28])
})

/* ================================================================== *
 * The label — month and year, never a day range
 * ================================================================== */

test('every non-month view inside one month names that month and year', () => {
  // Mid-month, so even the week's Monday-to-Sunday span stays inside September.
  const anchor = new Date(2026, 8, 17)
  for (const view of ['day', '3-day', 'week'] as const) {
    assert.equal(rangeLabel(view, anchor, daysOf(view, anchor, MONDAY)), 'September 2026')
  }
})

test('the week containing the anchor is what the week label names, spill included', () => {
  // 3 September 2026 is a Thursday whose week opens on 31 August — the label is
  // about the seven days on screen, not about the day the anchor fell on.
  assert.equal(rangeLabel('week', THURSDAY, daysOf('week', THURSDAY, MONDAY)), 'Aug – Sep 2026')
})

test('month view names the anchor’s month, not the lattice’s first day', () => {
  // The lattice opens on 31 August; the label must still say September.
  assert.equal(rangeLabel('month', THURSDAY, daysOf('month', THURSDAY, MONDAY)), 'September 2026')
})

test('a block straddling two months names both, and that is still month and year', () => {
  const anchor = new Date(2026, 8, 30)
  assert.equal(rangeLabel('3-day', anchor, daysOf('3-day', anchor, MONDAY)), 'Sep – Oct 2026')
})

test('a block straddling two years names both years', () => {
  const anchor = new Date(2026, 11, 31)
  assert.equal(rangeLabel('3-day', anchor, daysOf('3-day', anchor, MONDAY)), 'Dec 2026 – Jan 2027')
})
