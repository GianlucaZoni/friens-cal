/**
 * What a Candidate card writes on its two lines.
 *
 *     yarn test
 *
 * The list has **no day headers** (ticket 09: the sort is count-then-time, so
 * the list is not chronological and headers are impossible without abandoning
 * the ranking), which is what makes this copy load-bearing rather than
 * cosmetic — a card is the only thing that says which evening it is offering.
 *
 * The two spellings worth pinning are the ends: a range that finishes at
 * midnight must read `24:00` and stay on the day it was offered on, and one
 * that crosses midnight must name the day it lands on.
 */
import { insideLabel, whenOf } from './when.ts'
import assert from 'node:assert/strict'
import test from 'node:test'

const ROME = 'Europe/Rome'

/** Rome is UTC+2 in September, so 18:00 UTC is 20:00 on the card. */
const rome = (hour: number, minute = 0, day = 5) => Date.UTC(2026, 8, day, hour - 2, minute)

test('a card states its own date and range', () => {
  assert.deepEqual(whenOf(rome(20), rome(23, 30), ROME), {
    date: 'Sat 5 Sep',
    range: '20:00 – 23:30',
  })
})

test('a range that ends at midnight says 24:00, on the day it was offered on', () => {
  // `23:30 – 00:00` reads as a range running backwards, and dating it Sunday
  // would move a Saturday-evening offer to the next day.
  assert.deepEqual(whenOf(rome(22), rome(0, 0, 6), ROME), {
    date: 'Sat 5 Sep',
    range: '22:00 – 24:00',
  })
})

test('a range that crosses midnight names the day it lands on', () => {
  assert.deepEqual(whenOf(rome(22), rome(1, 0, 6), ROME), {
    date: 'Sat 5 Sep',
    range: '22:00 – 01:00 Sun',
  })
})

test('a sub-Candidate on the same evening names only the containing range', () => {
  assert.equal(
    insideLabel({ start: rome(19), end: rome(21, 30) }, { start: rome(20) }, ROME),
    'inside 19:00 – 21:30'
  )
})

test('a sub-Candidate on the far side of midnight names the containing day too', () => {
  // The container began the evening before. A bare "inside 22:00 – 02:00" on a
  // card dated Sunday names a window that, read literally, is already over.
  assert.equal(
    insideLabel({ start: rome(22), end: rome(2, 0, 6) }, { start: rome(0, 30, 6) }, ROME),
    'inside Sat 5 Sep, 22:00 – 02:00 Sun'
  )
})
