/**
 * The drag's geometry, asserted against ticket 10's measurements.
 *
 *     yarn test
 *
 * Node's own runner, like `slots.test.ts` — so `gesture.ts` imports only bare
 * specifiers, never `@/`.
 *
 * Two things here are measurements rather than opinions, and they are the
 * reason this module is separate from the component that drives it:
 *
 * 1. **Hysteresis is anchor-relative, not boundary-relative.** Ticket 10 drove
 *    the same 30px drift from two anchors and got two answers from a
 *    boundary-relative budget — *rejected* from mid-column, *accepted* from 94%
 *    across. Ticket 01 recorded the boundary version as the mitigation and
 *    ticket 10 then measured it dead. The pair of tests below is that
 *    experiment, with the fix in place: the same drift must get the same answer
 *    from both anchors.
 * 2. **A day is 46, 48 or 50 slots.** Linear time therefore cannot walk a
 *    global row index — it has to walk the *concatenated* columns, where one
 *    day contributes two rows more or fewer than its neighbours. Every case
 *    below that crosses midnight uses a DST week for exactly that reason.
 */
import {
  DRAG_THRESHOLD_PX,
  HYSTERESIS_PX,
  columnUnderPointer,
  fromAbsolute,
  isDrag,
  linearSelection,
  multiDaySelection,
  selectionFor,
  shiftSelection,
  toAbsolute,
} from './gesture.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { times } from 'lodash-es'

/** An ordinary week: seven days that all agree what a day is. */
const ORDINARY_WEEK = [48, 48, 48, 48, 48, 48, 48]

/**
 * The week the clocks go back in Rome (2026-10-25 is that Sunday, and the week
 * starts Monday) — so the LAST column holds 50 rows and the other six hold 48.
 */
const AUTUMN_WEEK = [48, 48, 48, 48, 48, 48, 50]

/** And the spring one, where the Sunday is two rows short. */
const SPRING_WEEK = [48, 48, 48, 48, 48, 48, 46]

/* ================================================================== *
 * The drag/click discriminator
 *
 * 4px, and it is the only thing that separates "opens the popover and writes
 * nothing" from "writes" (ticket 10's reversal of ticket 06).
 * ================================================================== */

test('4px is the threshold, and 3px of jitter is still a click', () => {
  assert.equal(DRAG_THRESHOLD_PX, 4)
  assert.equal(isDrag({ x: 0, y: 0 }, { x: 3, y: 0 }), false)
  assert.equal(isDrag({ x: 0, y: 0 }, { x: 0, y: 3 }), false)
  assert.equal(isDrag({ x: 0, y: 0 }, { x: 4, y: 0 }), true)
})

test('the threshold is a distance, not a pair of axes', () => {
  // 3px each way is 4.24px of travel. A drag, and a per-axis test would have
  // called it a click.
  assert.equal(isDrag({ x: 0, y: 0 }, { x: 3, y: 3 }), true)
})

/* ================================================================== *
 * Ticket 10's hysteresis experiment
 * ================================================================== */

test('a 30px drift is rejected from a mid-column anchor', () => {
  // Column 2 of 110px columns, anchor at its middle. 30px right is still
  // inside the column, so no rule could get this wrong.
  assert.equal(columnUnderPointer(2, 2, 30), 2)
})

test('a 30px drift is rejected from a 94%-across anchor — the same answer', () => {
  /*
   * This is the case that killed the boundary-relative rule. The anchor sits
   * 6px from the edge, so 30px of drift is unambiguously in column 3 and any
   * budget measured from the boundary has already been spent. Anchor-relative
   * has 45px to give and gives it.
   */
  assert.equal(columnUnderPointer(2, 3, 30), 2)
})

test('a deliberate crossing is still allowed', () => {
  assert.equal(columnUnderPointer(2, 3, HYSTERESIS_PX), 3)
  assert.equal(columnUnderPointer(2, 4, 220), 4)
})

test('the budget is symmetric — leftward drift is drift too', () => {
  assert.equal(columnUnderPointer(2, 1, -30), 2)
  assert.equal(columnUnderPointer(2, 1, -60), 1)
})

test('the budget sits in ticket 10’s measured 40–50px band', () => {
  assert.ok(HYSTERESIS_PX >= 40 && HYSTERESIS_PX <= 50)
})

test('the pointer’s own column wins once the budget is spent, however far it went', () => {
  // Not "one column at a time": a fast drag can skip columns between two
  // pointer events, and clamping to the neighbour would lose the gesture.
  assert.equal(columnUnderPointer(0, 6, 600), 6)
})

/* ================================================================== *
 * Linear time walks the concatenated columns
 * ================================================================== */

test('an absolute index is the sum of the columns before it', () => {
  assert.equal(toAbsolute(ORDINARY_WEEK, { column: 0, row: 0 }), 0)
  assert.equal(toAbsolute(ORDINARY_WEEK, { column: 1, row: 0 }), 48)
  assert.equal(toAbsolute(ORDINARY_WEEK, { column: 3, row: 12 }), 156)
})

test('and it counts the 50-row day as fifty, not forty-eight', () => {
  // The autumn Sunday is the LAST column, so nothing after it can catch this.
  // Reverse the week and the difference is visible in every later column.
  const autumnFirst = [50, 48, 48, 48, 48, 48, 48]
  assert.equal(toAbsolute(autumnFirst, { column: 1, row: 0 }), 50)
  assert.equal(toAbsolute(SPRING_WEEK.slice().reverse(), { column: 1, row: 0 }), 46)
})

test('an absolute index maps back to the column that actually holds it', () => {
  assert.deepEqual(fromAbsolute(AUTUMN_WEEK, 0), { column: 0, row: 0 })
  assert.deepEqual(fromAbsolute(AUTUMN_WEEK, 47), { column: 0, row: 47 })
  assert.deepEqual(fromAbsolute(AUTUMN_WEEK, 48), { column: 1, row: 0 })
  // The last row of the week, which only exists because that Sunday is 25 hours.
  assert.deepEqual(fromAbsolute(AUTUMN_WEEK, 337), { column: 6, row: 49 })
})

test('an index past the end of the week clamps to its last slot', () => {
  // Where a drag that leaves the grid ends up. Clamping rather than throwing:
  // the pointer is allowed to be anywhere on screen.
  assert.deepEqual(fromAbsolute(AUTUMN_WEEK, 9999), { column: 6, row: 49 })
  assert.deepEqual(fromAbsolute(AUTUMN_WEEK, -5), { column: 0, row: 0 })
})

test('a linear drag inside one day is a run of that day’s rows', () => {
  const selection = linearSelection(ORDINARY_WEEK, { column: 3, row: 40 }, { column: 3, row: 43 })
  assert.deepEqual(selection, [
    { column: 3, row: 40 },
    { column: 3, row: 41 },
    { column: 3, row: 42 },
    { column: 3, row: 43 },
  ])
})

test('the anchor slot is always painted, so a one-slot drag is one slot', () => {
  assert.deepEqual(linearSelection(ORDINARY_WEEK, { column: 1, row: 7 }, { column: 1, row: 7 }), [
    { column: 1, row: 7 },
  ])
})

test('dragging upwards paints the same run as dragging down', () => {
  assert.deepEqual(
    linearSelection(ORDINARY_WEEK, { column: 3, row: 43 }, { column: 3, row: 40 }),
    linearSelection(ORDINARY_WEEK, { column: 3, row: 40 }, { column: 3, row: 43 })
  )
})

test('a linear drag crosses midnight in one continuous run', () => {
  // Tuesday 23:00 (row 46) to Wednesday 01:00 (row 1), which is what makes
  // crossing days an ordinary drag rather than an over-drag past the bottom.
  const selection = linearSelection(ORDINARY_WEEK, { column: 1, row: 46 }, { column: 2, row: 1 })
  assert.deepEqual(selection, [
    { column: 1, row: 46 },
    { column: 1, row: 47 },
    { column: 2, row: 0 },
    { column: 2, row: 1 },
  ])
})

test('crossing midnight into a 50-row day still lands on that day’s own rows', () => {
  // Saturday 23:30 into the autumn Sunday. The Sunday's row 0 is 00:00 whatever
  // its length; the length only matters on the way out of it.
  const selection = linearSelection(AUTUMN_WEEK, { column: 5, row: 47 }, { column: 6, row: 0 })
  assert.deepEqual(selection, [
    { column: 5, row: 47 },
    { column: 6, row: 0 },
  ])
})

test('a linear drag out of the 46-row day resumes at the next day’s row 0', () => {
  // There is no row 46 or 47 on the spring Sunday. A global row index would
  // have addressed two rows that do not exist.
  const springFirst = [46, 48, 48, 48, 48, 48, 48]
  const selection = linearSelection(springFirst, { column: 0, row: 45 }, { column: 1, row: 0 })
  assert.deepEqual(selection, [
    { column: 0, row: 45 },
    { column: 1, row: 0 },
  ])
})

/* ================================================================== *
 * Multi-day is the rectangle, and it is a WALL CLOCK rectangle
 * ================================================================== */

/** Labels for a 48-row day: `00:00`, `00:30`, … `23:30`. */
const ordinaryLabels = (): string[] =>
  times(48, (index) => {
    const hour = String(Math.floor(index / 2)).padStart(2, '0')
    return `${hour}:${index % 2 ? '30' : '00'}`
  })

/**
 * The autumn Sunday's labels: `02:00` and `02:30` appear twice, which is the
 * whole of why that day is 50 rows.
 */
const autumnLabels = (): string[] => {
  const rows = ordinaryLabels()
  return [...rows.slice(0, 6), '02:00', '02:30', ...rows.slice(6)]
}

const week = (...columns: string[][]) => columns

test('multi-day paints the same hours on every day crossed', () => {
  const labels = week(ordinaryLabels(), ordinaryLabels(), ordinaryLabels())
  const selection = multiDaySelection(labels, { column: 0, row: 40 }, { column: 2, row: 41 })

  assert.deepEqual(
    selection.map(({ column, row }) => `${column}:${labels[column][row]}`),
    ['0:20:00', '0:20:30', '1:20:00', '1:20:30', '2:20:00', '2:20:30']
  )
})

test('multi-day does not cross midnight — that is what Linear is for', () => {
  const labels = week(ordinaryLabels(), ordinaryLabels())
  const selection = multiDaySelection(labels, { column: 0, row: 46 }, { column: 1, row: 2 })

  // The window is 01:00–23:30, on both days. A rectangle cannot be one run
  // through midnight, and pretending otherwise is the geometry Linear owns.
  assert.equal(selection.filter((slot) => slot.column === 0).length, 45)
  assert.equal(selection.filter((slot) => slot.column === 1).length, 45)
})

test('multi-day is a wall clock rectangle, so a DST day gets its own rows', () => {
  /*
   * 20:00–20:30 across an ordinary Saturday and the 25-hour Sunday. The two
   * days hold those hours at DIFFERENT ROW INDICES — 40 and 41 on the Saturday,
   * 42 and 43 on the Sunday, because two extra rows were inserted at 02:00. By
   * wall clock they are the same two hours, which is what "the same hours on
   * every day crossed" says.
   */
  const labels = week(ordinaryLabels(), autumnLabels())
  const selection = multiDaySelection(labels, { column: 0, row: 40 }, { column: 1, row: 43 })

  assert.deepEqual(selection, [
    { column: 0, row: 40 },
    { column: 0, row: 41 },
    { column: 1, row: 42 },
    { column: 1, row: 43 },
  ])
  assert.deepEqual(
    selection.map(({ column, row }) => labels[column][row]),
    ['20:00', '20:30', '20:00', '20:30']
  )
})

test('a multi-day window over the repeated hour paints both of them', () => {
  // You are free for both 02:00s: they are two real hours, and the day is 25
  // hours long precisely because they both happened.
  const labels = week(autumnLabels())
  const selection = multiDaySelection(labels, { column: 0, row: 4 }, { column: 0, row: 8 })

  assert.deepEqual(
    selection.map(({ row }) => labels[0][row]),
    ['02:00', '02:30', '02:00', '02:30', '03:00']
  )
})

test('a multi-day window over the hour that never happened paints nothing there', () => {
  const spring = [...ordinaryLabels().slice(0, 4), ...ordinaryLabels().slice(6)]
  const labels = week(ordinaryLabels(), spring)
  // 02:00–02:30 on both days. The spring Sunday has neither row.
  const selection = multiDaySelection(labels, { column: 0, row: 4 }, { column: 1, row: 4 })

  assert.deepEqual(
    selection.map(({ column, row }) => `${column}:${labels[column][row]}`),
    ['0:02:00', '0:02:30', '0:03:00', '1:03:00']
  )
})

test('dragging right to left paints the same rectangle', () => {
  const labels = week(ordinaryLabels(), ordinaryLabels(), ordinaryLabels())
  assert.deepEqual(
    multiDaySelection(labels, { column: 2, row: 41 }, { column: 0, row: 40 }),
    multiDaySelection(labels, { column: 0, row: 40 }, { column: 2, row: 41 })
  )
})

test('the mode chooses the geometry, and nothing else does', () => {
  const labels = week(ordinaryLabels(), ordinaryLabels())
  const anchor = { column: 0, row: 46 }
  const pointer = { column: 1, row: 2 }

  assert.deepEqual(
    selectionFor('linear', labels, anchor, pointer),
    linearSelection([48, 48], anchor, pointer)
  )
  assert.deepEqual(
    selectionFor('multi-day', labels, anchor, pointer),
    multiDaySelection(labels, anchor, pointer)
  )
})

/* ================================================================== *
 * ⌥+drag duplicates — the run, translated
 * ================================================================== */

test('a duplicate keeps its shape and its grab offset', () => {
  // Mon 09:00–10:00 (rows 18–19), grabbed at row 18 and dropped on Wed 09:00.
  const source = [
    { column: 0, row: 18 },
    { column: 0, row: 19 },
  ]
  const delta =
    toAbsolute(ORDINARY_WEEK, { column: 2, row: 18 }) -
    toAbsolute(ORDINARY_WEEK, { column: 0, row: 18 })

  assert.deepEqual(shiftSelection(ORDINARY_WEEK, source, delta), [
    { column: 2, row: 18 },
    { column: 2, row: 19 },
  ])
})

test('a duplicate dragged off the week keeps only the part that landed', () => {
  const source = [
    { column: 6, row: 46 },
    { column: 6, row: 47 },
  ]
  // Two rows further on than the week has. Clamping instead would stack the
  // copy's slots on top of each other at the last row.
  assert.deepEqual(shiftSelection(ORDINARY_WEEK, source, 2), [])
})

test('a duplicate translates through midnight, and through a DST day', () => {
  // Sat 23:30 + 1 slot lands on the autumn Sunday's 00:00.
  assert.deepEqual(shiftSelection(AUTUMN_WEEK, [{ column: 5, row: 47 }], 1), [
    { column: 6, row: 0 },
  ])
})
