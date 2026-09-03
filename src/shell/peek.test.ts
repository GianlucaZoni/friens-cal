/**
 * What the bottom drawer's peek chooses to show.
 *
 *     yarn test
 */
import type { Candidate } from '../candidates/candidates.ts'
import type { Hangout } from '../hangouts/hangout.ts'
import { peekOf } from './peek.ts'
import assert from 'node:assert/strict'
import test from 'node:test'

const HOUR = 60 * 60 * 1000
const NOON = new Date(2026, 8, 4, 12).getTime()

const hangout = (id: string, startsAt: number): Hangout => ({
  id,
  startsAt,
  endsAt: startsAt + 2 * HOUR,
  title: id,
  createdBy: null,
  editedBy: null,
  editedAt: null,
  participants: [],
})

const candidate = (id: string, start: number): Candidate => ({
  id,
  start,
  end: start + HOUR,
  friendIds: ['a', 'b'],
})

test('a Hangout that has not ended outranks the best Candidate', () => {
  const peek = peekOf([hangout('goopy', NOON)], [candidate('c', NOON - HOUR)], null)

  assert.deepEqual(peek, { kind: 'hangout', hangout: hangout('goopy', NOON) })
})

test('“nearest” is the earliest start, whatever order the store hands them over in', () => {
  // Realtime inserts arrive wherever they arrive; the peek is the one place
  // where being one card wrong is being entirely wrong.
  const peek = peekOf(
    [hangout('later', NOON + 5 * HOUR), hangout('sooner', NOON), hangout('middle', NOON + HOUR)],
    [],
    null
  )

  assert.equal(peek?.kind === 'hangout' && peek.hangout.id, 'sooner')
})

test('with no Hangout, the first element of the ranked list is the peek', () => {
  const peek = peekOf([], [candidate('best', NOON), candidate('second', NOON + HOUR)], null)

  assert.equal(peek?.kind === 'candidate' && peek.candidate.id, 'best')
})

test('with neither, the empty state is what the peek says', () => {
  assert.deepEqual(peekOf([], [], 'no-overlap'), { kind: 'empty', reason: 'no-overlap' })
})

test('nothing at all is null, and null is not an empty state', () => {
  // `empty` is null while the read is in flight. A peek that guessed "nobody's
  // free yet" over a query that had not landed is the exact confusion ticket
  // 09 wrote three separate messages to avoid.
  assert.equal(peekOf([], [], null), null)
})
