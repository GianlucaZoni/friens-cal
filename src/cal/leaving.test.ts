/**
 * What leaving a cal costs, as the dialog has to state it.
 *
 *     yarn test
 *
 * Two claims are worth pinning rather than reading:
 *
 * 1. **The split is future/past, and the past is not a loss.** The trigger in
 *    `10-lifecycle-per-cal.sql` §4 marks Left where `ends_at > now()` and leaves
 *    everything else holding your name, so a dialog that listed a past Hangout
 *    would be naming a loss that is not going to happen.
 * 2. **A Hangout you already Left is not named again.** The trigger skips
 *    `left_at is not null`, and so does this.
 */
import { hangoutsFrom } from '../hangouts/hangout.ts'
import { leavingConsequence, markedLeftBy } from './leaving.ts'
import { TZDate } from '@date-fns/tz'
import assert from 'node:assert/strict'
import test from 'node:test'

const ROME = 'Europe/Rome'

/** A wall clock in Rome, as a true instant. */
const at = (day: number, hour: number) => new TZDate(2027, 8, day, hour, 0, ROME).getTime()

const MARCO = '11111111-1111-4111-8111-111111111111'
const SARA = '22222222-2222-4222-8222-222222222222'

/** Written the way PostgREST renders a `timestamptz` — `+00:00`, not `Z`. */
const hangout = (id: string, day: number, startHour: number, endHour: number) => ({
  id,
  starts_at: new Date(at(day, startHour)).toISOString().replace('Z', '+00:00'),
  ends_at: new Date(at(day, endHour)).toISOString().replace('Z', '+00:00'),
  title: null,
  created_by: null,
  edited_by: null,
  edited_at: null,
})

const DINNER = hangout('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 4, 20, 23)
const CLIMBING = hangout('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 11, 10, 12)
const SWIM = hangout('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 12, 9, 11)

const on = (hangoutId: string, friendId: string, leftAt: string | null = null) => ({
  hangout_id: hangoutId,
  friend_id: friendId,
  left_at: leftAt,
})

/** Sat 4th's dinner is over; the 11th and the 12th are not. */
const NOW = at(8, 12)

test('it names the future Hangouts the leaver is on, and not the past one', () => {
  const hangouts = hangoutsFrom(
    [DINNER, CLIMBING, SWIM],
    [on(DINNER.id, MARCO), on(CLIMBING.id, MARCO), on(SWIM.id, SARA)]
  )

  // Climbing only: the dinner has happened, and the swim is Sara's.
  assert.deepEqual(
    markedLeftBy(hangouts, MARCO, NOW).map((it) => it.id),
    [CLIMBING.id]
  )
})

test('a Hangout the leaver already Left is not named a second time', () => {
  // Left is sticky and the trigger skips it (`p.left_at is null`), so naming it
  // would promise a write that is not going to happen.
  const hangouts = hangoutsFrom([CLIMBING], [on(CLIMBING.id, MARCO, '2027-09-05T08:00:00+00:00')])
  assert.deepEqual(markedLeftBy(hangouts, MARCO, NOW), [])
})

test('a Hangout the leaver was never on is not named at all', () => {
  const hangouts = hangoutsFrom([CLIMBING], [on(CLIMBING.id, SARA)])
  assert.deepEqual(markedLeftBy(hangouts, MARCO, NOW), [])
})

test('a Hangout happening right now still counts, because it has not ended', () => {
  // `ends_at > now()` is the trigger's test, and the client's `isPast` is the
  // same boundary: a plan you are standing in the middle of is one leaving
  // takes you off.
  const hangouts = hangoutsFrom([CLIMBING], [on(CLIMBING.id, MARCO)])
  const midway = at(11, 11)
  assert.deepEqual(
    markedLeftBy(hangouts, MARCO, midway).map((it) => it.id),
    [CLIMBING.id]
  )

  // And one that ended on the exact instant is past, matching `[)`.
  assert.deepEqual(markedLeftBy(hangouts, MARCO, at(11, 12)), [])
})

test('the list stays chronological, because `hangoutsFrom` sorted it', () => {
  const hangouts = hangoutsFrom([SWIM, CLIMBING], [on(SWIM.id, MARCO), on(CLIMBING.id, MARCO)])
  assert.deepEqual(
    markedLeftBy(hangouts, MARCO, NOW).map((it) => it.id),
    [CLIMBING.id, SWIM.id]
  )
})

test('the consequence sentence counts what it is about to list', () => {
  assert.equal(
    leavingConsequence(1),
    'Leaving takes you off one hangout here that has not happened yet:'
  )
  assert.equal(
    leavingConsequence(3),
    'Leaving takes you off 3 hangouts here that have not happened yet:'
  )
})

test('with nothing to list it says so, rather than introducing an empty list', () => {
  // The dialog still has two jobs left — the past, and the Code — so the empty
  // case is a sentence rather than a reason not to open.
  assert.equal(leavingConsequence(0), 'You are not on any hangout here that has not happened yet.')
})
