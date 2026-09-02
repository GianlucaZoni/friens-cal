/**
 * The time editor's arithmetic.
 *
 *     yarn test
 *
 * Three things in here are worth pinning rather than reading, and all three are
 * why this is a module and not a corner of the dialog:
 *
 * 1. **Every choice is on the 30-minute grid**, which is ticket 07 §6's
 *    obligation on the manual editor and which `05-hangout.sql` would otherwise
 *    answer with `23514`. The proof is that the options *are* the day's Slots.
 * 2. **The DST day**, twice. A 23-hour day offers 46 starts and a 25-hour one
 *    offers 50, and "the same time tomorrow" is 23 or 25 hours rather than 24.
 * 3. **The two spellings**: a range ending at midnight is `24:00`, and one that
 *    crosses midnight names the day it lands on.
 */
import { slotsOfDay } from '../availability/slots.ts'
import { dateValueOf, dayFromValue, endChoices, sameClockOn, startChoices } from './retime.ts'
import { TZDate } from '@date-fns/tz'
import assert from 'node:assert/strict'
import test from 'node:test'

const ROME = 'Europe/Rome'

/** A wall clock in Rome, as a true instant. */
const at = (year: number, month: number, day: number, hour: number, minute = 0) =>
  new TZDate(year, month - 1, day, hour, minute, ROME).getTime()

/** A civil date the way the editor's `<input type="date">` hands one over. */
const civil = (year: number, month: number, day: number) => new Date(year, month - 1, day, 12)

const SEP_4 = civil(2027, 9, 4)
/** Rome puts the clocks forward here: 02:00 never happens, and the day is 23 hours. */
const SPRING_FORWARD = civil(2027, 3, 28)
/** And back here: 02:00 happens twice, and the day is 25 hours. */
const FALL_BACK = civil(2027, 10, 31)

test('the starts are the day’s own Slots — 48, 46 and 50 of them', () => {
  assert.equal(startChoices(SEP_4, ROME).length, 48)
  assert.equal(startChoices(SPRING_FORWARD, ROME).length, 46)
  assert.equal(startChoices(FALL_BACK, ROME).length, 50)
})

test('every start is a Slot the database will accept, in order', () => {
  const choices = startChoices(FALL_BACK, ROME)
  const slots = slotsOfDay(FALL_BACK, ROME)

  assert.deepEqual(
    choices.map((choice) => choice.at),
    slots.map((slot) => slot.start.getTime()),
    'the options ARE the Slots — there is no free-text time to snap'
  )
})

test('the repeated hour of the 25-hour Sunday is labelled with its offset', () => {
  const twoOClocks = startChoices(FALL_BACK, ROME).filter((choice) =>
    choice.label.startsWith('02:00')
  )

  // Without the offset the list reads `02:00, 02:30, 02:00, 02:30` and looks
  // like a rendering fault — `slotsOfDay` counts which wall clocks repeat.
  assert.deepEqual(
    twoOClocks.map((choice) => choice.label),
    ['02:00 (+2)', '02:00 (+1)']
  )
  assert.notEqual(twoOClocks[0].at, twoOClocks[1].at, 'two options, two instants')
})

test('the first end is half an hour after the start, never the start itself', () => {
  // `ends_at > starts_at` is a check constraint, and a Hangout that ends where
  // it starts is not a plan (`05-hangout.sql` §1). There is nothing to guard.
  const [first] = endChoices(at(2027, 9, 4, 20), ROME)
  assert.equal(first.at, at(2027, 9, 4, 20, 30))
  assert.equal(first.label, '20:30')
})

test('an end at midnight is 24:00, and one past it names the day', () => {
  const choices = endChoices(at(2027, 9, 4, 22), ROME)
  const labelAt = (hour: number, minute = 0) =>
    choices.find((choice) => choice.at === at(2027, 9, hour < 22 ? 5 : 4, hour, minute))?.label

  assert.equal(labelAt(23), '23:00', 'still on its own day')
  // A range that reads `22:00 – 00:00` runs backwards; `closingLabel` in
  // `slots.ts` owns this spelling for the grid and the failed-write toast too.
  assert.equal(labelAt(0), '24:00')
  assert.equal(labelAt(1), '01:00 Sun', 'a bare 01:00 under a Saturday start names a time gone by')
})

test('the ends step by real half hours, so a duration survives the clocks going back', () => {
  // 01:00 on the 25-hour Sunday, plus three hours of real time, is 03:00 —
  // because 02:00 happens twice in between. A wall-clock addition would say
  // 04:00 and would put the Hangout an hour past where anybody agreed to.
  const choices = endChoices(at(2027, 10, 31, 1), ROME)
  const threeHoursOn = choices[5]

  assert.equal(threeHoursOn.at, at(2027, 10, 31, 1) + 3 * 3_600_000)
  assert.equal(threeHoursOn.label, '03:00')
})

test('changing the day keeps the wall clock, not the elapsed milliseconds', () => {
  const saturday = at(2027, 9, 4, 20)
  const moved = sameClockOn(saturday, civil(2027, 9, 7), ROME)

  assert.equal(moved, at(2027, 9, 7, 20))
  assert.equal(
    sameClockOn(at(2027, 10, 30, 20), FALL_BACK, ROME),
    at(2027, 10, 31, 20),
    '20:00 is still 20:00 on a day that is 25 hours long'
  )
})

test('a wall clock the target day does not have falls back to the last one before it', () => {
  /*
   * 02:30 does not exist on the spring Sunday — the clocks go forward at 02:00
   * and the next Slot is 03:00. Never null: the date field cannot be allowed to
   * produce an empty state, so the answer is 01:30, the last Slot at or before
   * what was asked for.
   */
  const moved = sameClockOn(at(2027, 3, 27, 2, 30), SPRING_FORWARD, ROME)
  assert.equal(moved, at(2027, 3, 28, 1, 30))
})

test('the date field round-trips, and a half-past-midnight Slot stays on its own day', () => {
  assert.equal(dateValueOf(at(2027, 9, 4, 20), ROME), '2027-09-04')

  /*
   * 00:30 in Rome is the *previous* day in UTC, so a value read off the instant
   * rather than off the wall clock would jump a day back at half past midnight.
   */
  assert.equal(dateValueOf(at(2027, 9, 4, 0, 30), ROME), '2027-09-04')

  const parsed = dayFromValue('2027-09-04')
  assert.notEqual(parsed, null)
  assert.equal(dateValueOf(startChoices(parsed as Date, ROME)[0].at, ROME), '2027-09-04')
})

test('a cleared date field is null rather than an Invalid Date', () => {
  assert.equal(dayFromValue(''), null)
  assert.equal(dayFromValue('not-a-date'), null)
})
