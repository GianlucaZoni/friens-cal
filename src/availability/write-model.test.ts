/**
 * The write model's two decisions, asserted: how a failed round trip is retried,
 * and what the toast calls the thing it could not save.
 *
 *     yarn test
 *
 * Node's own runner, like `slots.test.ts` and `gesture.test.ts` — so
 * `write-model.ts` imports only bare specifiers, never `@/`.
 *
 * The naming is load-bearing rather than cosmetic, which is why it is tested at
 * all: ticket 19 requires the toast to **name the range**, because once the
 * optimistic paint is reverted there is nothing left on screen to point at and
 * ticket 01 left no undo stack.
 */
import { SLOT_MS } from './slots.ts'
import { describeSlots, withRetries } from './write-model.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { times } from 'lodash-es'

const ROME = 'Europe/Rome'

/* ================================================================== *
 * The toast has to name the range, because nothing else will
 * ================================================================== */

/** A run of adjacent slots beginning at this instant. */
const run = (start: Date, count: number): Date[] =>
  times(count, (index) => new Date(start.getTime() + index * SLOT_MS))

/** Rome wall clock, as a true instant, on a day with nothing wrong with it. */
const romeOn = (year: number, month: number, day: number, hour: number, minute = 0) =>
  new Date(Date.UTC(year, month, day, hour - 2, minute))

test('one run is named by its day and its two ends', () => {
  // Thursday 3 September 2026, 20:00 for three hours.
  assert.equal(describeSlots(run(romeOn(2026, 8, 3, 20), 6), ROME), 'Thu 20:00–23:00')
})

test('the end is the end of the last slot, not its start', () => {
  assert.equal(describeSlots(run(romeOn(2026, 8, 3, 20), 1), ROME), 'Thu 20:00–20:30')
})

test('a run through midnight names both days', () => {
  assert.equal(describeSlots(run(romeOn(2026, 8, 3, 23), 4), ROME), 'Thu 23:00 – Fri 01:00')
})

test('a run that ends at midnight says 24:00', () => {
  // `Thu 23:30–00:00` reads as a range that goes backwards.
  assert.equal(describeSlots(run(romeOn(2026, 8, 3, 23, 30), 1), ROME), 'Thu 23:30–24:00')
})

test('a multi-day rectangle names the span of days once', () => {
  const days = [0, 1, 2].flatMap((offset) => run(romeOn(2026, 8, 7 + offset, 20), 4))
  assert.equal(describeSlots(days, ROME), 'Mon–Wed 20:00–22:00')
})

test('anything else is named by how much of it there was', () => {
  const scattered = [...run(romeOn(2026, 8, 7, 20), 2), ...run(romeOn(2026, 8, 9, 9), 2)]
  assert.equal(describeSlots(scattered, ROME), '2 blocks from Mon 20:00')
})

test('an empty gesture has nothing to name', () => {
  assert.equal(describeSlots([], ROME), 'nothing')
})

test('the slots are named in order however they arrived', () => {
  const forwards = run(romeOn(2026, 8, 3, 20), 4)
  assert.equal(describeSlots(forwards.slice().reverse(), ROME), describeSlots(forwards, ROME))
})

/* ================================================================== *
 * Two automatic retries, then give up (ticket 19)
 * ================================================================== */

test('a write that lands first time is attempted once', async () => {
  const attempts: number[] = []
  const failure = await withRetries(
    (attempt) => {
      attempts.push(attempt)
      return Promise.resolve(null)
    },
    { delays: [10, 20], sleep: () => Promise.resolve() }
  )

  assert.equal(failure, null)
  assert.deepEqual(attempts, [0])
})

test('two retries, and no more', async () => {
  const attempts: number[] = []
  const slept: number[] = []
  const failure = await withRetries(
    (attempt) => {
      attempts.push(attempt)
      return Promise.resolve({ message: 'network' })
    },
    {
      delays: [10, 20],
      sleep: (ms) => {
        slept.push(ms)
        return Promise.resolve()
      },
    }
  )

  // Three attempts in total: the write, then the two retries ticket 19 allows.
  assert.deepEqual(attempts, [0, 1, 2])
  // Backoff, and no sleep after the last attempt — there is nothing to wait for.
  assert.deepEqual(slept, [10, 20])
  assert.deepEqual(failure, { message: 'network' })
})

test('a retry that lands stops the rest', async () => {
  const attempts: number[] = []
  const failure = await withRetries(
    (attempt) => {
      attempts.push(attempt)
      return Promise.resolve(attempt === 1 ? null : { message: 'flaky' })
    },
    { delays: [10, 20], sleep: () => Promise.resolve() }
  )

  assert.equal(failure, null)
  assert.deepEqual(attempts, [0, 1])
})
