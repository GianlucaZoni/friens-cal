/**
 * The slot row model, asserted against the real tz database.
 *
 * Runs on Node's own runner, like `roster.test.ts` and `identity.test.ts` —
 * so the module under test imports only bare specifiers, never `@/`, which
 * plain Node cannot resolve.
 *
 *     yarn test
 *
 * The two DST dates below are the whole reason this module exists. A grid built
 * from the number 48 shows an hour that does not exist on 2027-03-28 and hides
 * one that happens twice on 2026-10-25 (issue 05, ticket 07 §5).
 *
 * Every date here is built with `new Date(y, m, d)` on purpose: that names a
 * *civil date* whose `getFullYear`/`getMonth`/`getDate` read the same in any
 * system time zone, which is exactly what `slotsOfDay` consumes. An ISO string
 * would name an instant, and the runner's own zone would decide which calendar
 * day it landed on.
 */
import { SLOT_MS, mergeSlots, runsOf, slotKey, slotsOfDay, startOfDayInZone } from './slots.ts'
import assert from 'node:assert/strict'
import test from 'node:test'

const ROME = 'Europe/Rome'

/** The Sunday the clocks go back in Rome: 02:00–03:00 happens twice. */
const CLOCKS_BACK = new Date(2026, 9, 25)
/** The Sunday the clocks go forward: 02:00–03:00 never happens. */
const CLOCKS_FORWARD = new Date(2027, 2, 28)
/** A Tuesday with nothing wrong with it. */
const ORDINARY = new Date(2026, 8, 1)

const labels = (day: Date, timeZone = ROME) => slotsOfDay(day, timeZone).map((slot) => slot.label)

/* ================================================================== *
 * How many rows the day holds
 * ================================================================== */

test('an ordinary day is 48 slots', () => {
  assert.equal(slotsOfDay(ORDINARY, ROME).length, 48)
})

test('the day the clocks go back is 50 slots', () => {
  assert.equal(slotsOfDay(CLOCKS_BACK, ROME).length, 50)
})

test('the day the clocks go forward is 46 slots', () => {
  assert.equal(slotsOfDay(CLOCKS_FORWARD, ROME).length, 46)
})

test('both DST dates are 48 slots in a zone that does not observe DST', () => {
  // The count comes from the time zone, not from the date. Same two days, no
  // transition, no anomaly.
  assert.equal(slotsOfDay(CLOCKS_BACK, 'UTC').length, 48)
  assert.equal(slotsOfDay(CLOCKS_FORWARD, 'UTC').length, 48)
})

/* ================================================================== *
 * What the rows are
 * ================================================================== */

test('a day runs from local midnight to the instant before the next one', () => {
  const slots = slotsOfDay(CLOCKS_BACK, ROME)
  const nextDay = startOfDayInZone(new Date(2026, 9, 26), ROME)

  assert.equal(slots[0].start.getTime(), startOfDayInZone(CLOCKS_BACK, ROME).getTime())
  assert.equal(slots[slots.length - 1].start.getTime() + SLOT_MS, nextDay.getTime())
})

test('every slot is 30 real minutes long, transition included', () => {
  // This is the claim that makes equal-height rows honest. Wall clock jumps at
  // the transition; the instants never do.
  const starts = slotsOfDay(CLOCKS_BACK, ROME).map((slot) => slot.start.getTime())
  const gaps = starts.slice(1).map((ms, index) => ms - starts[index])

  assert.deepEqual([...new Set(gaps)], [SLOT_MS])
})

test('an ordinary day starts at 00:00 and ends at 23:30', () => {
  const ordinary = labels(ORDINARY)

  assert.equal(ordinary[0], '00:00')
  assert.equal(ordinary[ordinary.length - 1], '23:30')
})

/* ================================================================== *
 * The hour that happens twice, and the hour that never happens
 * ================================================================== */

test('the repeated hour appears twice and is distinguishable by its offset', () => {
  const repeated = slotsOfDay(CLOCKS_BACK, ROME).filter((slot) => slot.label === '02:00')

  assert.equal(repeated.length, 2)
  // Same wall clock, one hour apart, and the gutter can tell them apart.
  assert.deepEqual(
    repeated.map((slot) => slot.offset),
    ['+2', '+1']
  )
  assert.equal(repeated[1].start.getTime() - repeated[0].start.getTime(), 60 * 60_000)
})

test('every slot of the repeated hour carries an offset, and no other slot does', () => {
  const marked = slotsOfDay(CLOCKS_BACK, ROME).filter((slot) => slot.offset !== null)

  assert.deepEqual(
    marked.map((slot) => `${slot.label}${slot.offset}`),
    ['02:00+2', '02:30+2', '02:00+1', '02:30+1']
  )
})

test('the skipped hour is simply absent — 01:30 is followed by 03:00', () => {
  const forward = labels(CLOCKS_FORWARD)

  assert.ok(!forward.includes('02:00'))
  assert.ok(!forward.includes('02:30'))
  assert.equal(forward[forward.indexOf('01:30') + 1], '03:00')
})

test('an ordinary day marks no offsets at all', () => {
  assert.ok(slotsOfDay(ORDINARY, ROME).every((slot) => slot.offset === null))
})

test('the slots that open an hour are exactly the ones on the hour', () => {
  const opens = slotsOfDay(CLOCKS_BACK, ROME).filter((slot) => slot.opensHour)

  assert.equal(opens.length, 25)
  assert.ok(opens.every((slot) => slot.label.endsWith(':00')))
})

/* ================================================================== *
 * The store's key
 * ================================================================== */

test('a slot key is the same whether the instant arrives as a Date, an ISO string or epoch ms', () => {
  // Postgres hands back `2026-10-25T00:00:00+00:00` and `Date#toISOString`
  // writes `2026-10-25T00:00:00.000Z`. Keying on the text would make those two
  // different rows; keying on the instant is what makes ticket 19's optimistic
  // row and its Realtime echo the same row.
  const instant = new Date(Date.UTC(2026, 9, 25, 0, 0, 0))

  assert.equal(slotKey('friend-a', instant), slotKey('friend-a', instant.toISOString()))
  assert.equal(slotKey('friend-a', instant), slotKey('friend-a', '2026-10-25T00:00:00+00:00'))
  assert.equal(slotKey('friend-a', instant), slotKey('friend-a', instant.getTime()))
})

test('two Friends free at the same instant are two keys', () => {
  const instant = new Date(Date.UTC(2026, 9, 25))

  assert.notEqual(slotKey('friend-a', instant), slotKey('friend-b', instant))
})

/* ================================================================== *
 * Contiguous slots, reassembled
 * ================================================================== */

test('adjacent held slots become one run', () => {
  // Merging stopped existing at the table (ticket 07); it comes back at render
  // time, and only at render time.
  assert.deepEqual(
    runsOf(6, (index) => [1, 2, 3].includes(index)),
    [{ start: 1, length: 3 }]
  )
})

test('a gap of one slot is two runs', () => {
  assert.deepEqual(
    runsOf(6, (index) => [0, 1, 3].includes(index)),
    [
      { start: 0, length: 2 },
      { start: 3, length: 1 },
    ]
  )
})

test('a run may reach the last slot of the day', () => {
  assert.deepEqual(
    runsOf(3, () => true),
    [{ start: 0, length: 3 }]
  )
})

test('nothing held is no runs', () => {
  assert.deepEqual(
    runsOf(48, () => false),
    []
  )
})

/* ================================================================== *
 * Where the clocks moved
 * ================================================================== */

test('the clocks going back are marked on the second occurrence of the hour', () => {
  const shifted = slotsOfDay(CLOCKS_BACK, ROME).filter((slot) => slot.shiftsClock)

  // One marker, on the 02:00 that is the *second* one — the slot the extra hour
  // begins at. Its own offset is what says which 02:00 it is.
  assert.deepEqual(
    shifted.map((slot) => `${slot.label}${slot.offset}`),
    ['02:00+1']
  )
})

test('the clocks going forward are marked on the hour that follows the missing one', () => {
  const shifted = slotsOfDay(CLOCKS_FORWARD, ROME).filter((slot) => slot.shiftsClock)

  assert.deepEqual(
    shifted.map((slot) => slot.label),
    ['03:00']
  )
})

test('an ordinary day marks no clock shift, and neither does midnight', () => {
  // Midnight would be the naive off-by-one here: the first slot has no previous
  // slot to differ from, and it must not be mistaken for a transition.
  assert.ok(slotsOfDay(ORDINARY, ROME).every((slot) => !slot.shiftsClock))
  assert.equal(slotsOfDay(CLOCKS_BACK, ROME)[0].shiftsClock, false)
})

/* ================================================================== *
 * Fetching a past range merges rather than replaces
 * ================================================================== */

test('a later fetch adds to the store instead of replacing it', () => {
  // Navigating backwards fetches a strip of the past into the SAME store
  // (issue 05). A replace would blank the weeks already on screen.
  const today = mergeSlots(new Set(), [{ friend_id: 'a', slot_start: '2026-09-01T08:00:00+00:00' }])
  const past = mergeSlots(today, [{ friend_id: 'a', slot_start: '2026-08-01T08:00:00+00:00' }])

  assert.equal(past.size, 2)
  assert.ok(past.has(slotKey('a', '2026-09-01T08:00:00+00:00')))
  assert.ok(past.has(slotKey('a', '2026-08-01T08:00:00+00:00')))
})

test('merging the same rows twice changes nothing', () => {
  // Which is what makes a duplicated fetch — StrictMode, a retry, a Realtime
  // echo of your own insert (ticket 19) — a no-op rather than a bug.
  const rows = [{ friend_id: 'a', slot_start: '2026-09-01T08:00:00+00:00' }]

  assert.equal(mergeSlots(mergeSlots(new Set(), rows), rows).size, 1)
})

test('merging leaves the set it was given alone', () => {
  const before = mergeSlots(new Set(), [{ friend_id: 'a', slot_start: '2026-09-01T08:00:00Z' }])
  mergeSlots(before, [{ friend_id: 'b', slot_start: '2026-09-01T08:00:00Z' }])

  assert.equal(before.size, 1)
})
