/**
 * The Hangout, as the app holds it.
 *
 *     yarn test
 *
 * Four things in here are worth pinning rather than reading:
 *
 * 1. **The pin rule is `ends_at > now`, not "on its day".** The cheap version
 *    clears a Saturday-evening Hangout at midnight *on Saturday*, seven hours
 *    before it starts, and it looks correct until somebody plans a Saturday.
 * 2. **PostgREST's `+00:00` is not `Date#toISOString`'s `Z`.** The same instant,
 *    two strings — the trap that has already cost this repo two bugs.
 * 3. **A column run is asked of that column's own slots array**, because a DST
 *    day holds 46 or 50 rows rather than 48, and it is **half-open** — matching
 *    `tstzrange(starts_at, ends_at)`'s default `[)`, so a Hangout ending at
 *    22:00 does not paint the 22:00 row. If the client and the database ever
 *    disagreed about that bound, back-to-back plans would be a collision in one
 *    of them and not the other.
 */
import { slotsOfDay } from '../availability/slots.ts'
import {
  hangoutsFrom,
  isHappening,
  isPast,
  isOverlapRejection,
  participantIds,
  pinned,
  rangesOf,
  runInColumn,
} from './hangout.ts'
import { TZDate } from '@date-fns/tz'
import assert from 'node:assert/strict'
import test from 'node:test'

const ROME = 'Europe/Rome'

/** A wall clock in Rome, as a true instant. */
const at = (day: number, hour: number, minute = 0, month = 8, year = 2027) =>
  new TZDate(year, month, day, hour, minute, ROME).getTime()

const MARCO = '11111111-1111-4111-8111-111111111111'
const SARA = '22222222-2222-4222-8222-222222222222'
const LUCA = '33333333-3333-4333-8333-333333333333'

/*
 * Written the way PostgREST renders a `timestamptz` — `+00:00`, not `Z`.
 * September in Rome is UTC+2, so 20:00 local is 18:00 UTC.
 */
const PIZZA = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  starts_at: '2027-09-04T18:00:00+00:00',
  ends_at: '2027-09-04T21:00:00+00:00',
  title: 'Pizza',
  created_at: '2027-09-01T10:00:00+00:00',
}

const CLIMBING = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  starts_at: '2027-09-05T08:00:00+00:00',
  ends_at: '2027-09-05T10:00:00+00:00',
  title: null,
  created_at: '2027-09-01T10:00:00+00:00',
}

const on = (hangoutId: string, friendId: string, leftAt: string | null = null) => ({
  hangout_id: hangoutId,
  friend_id: friendId,
  left_at: leftAt,
})

test('a PostgREST `+00:00` timestamp lands on the instant it names, not on NaN', () => {
  const [pizza] = hangoutsFrom([PIZZA], [])

  // Saturday 4 September 2027, 20:00–23:00 in Rome.
  assert.equal(pizza.startsAt, at(4, 20))
  assert.equal(pizza.endsAt, at(4, 23))
})

test('rows fold into Hangouts in chronological order, whatever order they arrive in', () => {
  const folded = hangoutsFrom([CLIMBING, PIZZA], [])

  assert.deepEqual(
    folded.map((hangout) => hangout.id),
    [PIZZA.id, CLIMBING.id]
  )
})

test('Participants are the rows with no `left_at`; Left is stored, not a Participant', () => {
  const [pizza] = hangoutsFrom(
    [PIZZA],
    [on(PIZZA.id, MARCO), on(PIZZA.id, SARA, '2027-09-02T09:00:00+00:00'), on(PIZZA.id, LUCA)]
  )

  // All three rows survive the fold — the states are told apart by their
  // readers, so nothing here throws Sara's row away.
  assert.equal(pizza.participants.length, 3)
  assert.deepEqual(participantIds(pizza), [MARCO, LUCA])
})

test('participants land on their own Hangout, not on whichever one folded first', () => {
  const [pizza, climbing] = hangoutsFrom(
    [PIZZA, CLIMBING],
    [on(PIZZA.id, MARCO), on(CLIMBING.id, SARA), on(PIZZA.id, LUCA)]
  )

  assert.deepEqual(participantIds(pizza), [MARCO, LUCA])
  assert.deepEqual(participantIds(climbing), [SARA])
})

test('a Hangout with nobody on it folds to an empty list, not to undefined', () => {
  // Not reachable through the UI — the drop trigger auto-cancels an empty
  // Hangout (issue 10) — but a row seeded from the SQL editor produces exactly
  // this, and a card that maps `undefined` is a crash rather than an empty card.
  const [pizza] = hangoutsFrom([PIZZA], [])
  assert.deepEqual(pizza.participants, [])
  assert.deepEqual(participantIds(pizza), [])
})

test('a Hangout is happening from its start until its end, and Past only after', () => {
  const [pizza] = hangoutsFrom([PIZZA], [])

  assert.equal(isHappening(pizza, at(4, 19, 59)), false)
  assert.equal(isHappening(pizza, at(4, 20)), true, 'its own start instant counts')
  assert.equal(isHappening(pizza, at(4, 22, 30)), true)
  assert.equal(isHappening(pizza, at(4, 23)), false, 'half-open: the end instant is already over')

  assert.equal(isPast(pizza, at(4, 22, 59)), false, 'Live while it is happening (ticket 08 §6)')
  assert.equal(isPast(pizza, at(4, 23)), true)
})

test('it stays pinned until it ENDS, not until its day is over', () => {
  const hangouts = hangoutsFrom([PIZZA], [])

  // Midnight opening Saturday. The whole Hangout is still ahead.
  assert.deepEqual(pinned(hangouts, at(4, 0)).length, 1)
  // Mid-Hangout. This is the one the "leaves on its day" rule gets wrong: it
  // would have unpinned this card twenty-three hours ago.
  assert.deepEqual(pinned(hangouts, at(4, 21, 30)).length, 1)
  // One slot before the end.
  assert.deepEqual(pinned(hangouts, at(4, 22, 30)).length, 1)
  // Its end instant. Now it unpins — and only now.
  assert.deepEqual(pinned(hangouts, at(4, 23)).length, 0)
})

test('the pinned region is chronological and ignores hiding entirely', () => {
  // There is nothing to hide *with* — `pinned` takes no roster and no visible
  // set, which is the API saying that hiding never hides a Hangout.
  const hangouts = hangoutsFrom([CLIMBING, PIZZA], [on(PIZZA.id, MARCO), on(CLIMBING.id, SARA)])

  assert.deepEqual(
    pinned(hangouts, at(1, 0)).map((hangout) => hangout.id),
    [PIZZA.id, CLIMBING.id]
  )
})

test('the pipeline gets every Hangout as a bare range, past ones included', () => {
  const hangouts = hangoutsFrom([PIZZA, CLIMBING], [])

  assert.deepEqual(rangesOf(hangouts), [
    { startsAt: at(4, 20), endsAt: at(4, 23) },
    { startsAt: at(5, 10), endsAt: at(5, 12) },
  ])
})

test('a Hangout occupies the rows of its own column, clipped by it', () => {
  const saturday = slotsOfDay(new Date(at(4, 12)), ROME)
  const [pizza] = hangoutsFrom([PIZZA], [])

  /*
   * 20:00 is row 40 of a 48-row day, and three hours is six slots — 40 through
   * 45. **Not 46.** Row 46 is the 23:00 Slot, which is where the Hangout ends,
   * and painting it would put the block half an hour past the plan and make a
   * back-to-back Hangout overlap it on screen while the database calls them
   * disjoint.
   */
  assert.deepEqual(runInColumn(pizza, saturday), { start: 40, length: 6 })
  assert.equal(saturday[46].label, '23:00')
  assert.equal(runInColumn(pizza, slotsOfDay(new Date(at(5, 12)), ROME)), null)
})

test('a Hangout crossing midnight produces a run in each column it reaches', () => {
  const crossing = hangoutsFrom(
    [{ ...PIZZA, starts_at: '2027-09-04T20:00:00+00:00', ends_at: '2027-09-04T23:00:00+00:00' }],
    []
  )[0]

  // 22:00 Saturday to 01:00 Sunday, in Rome.
  assert.equal(crossing.startsAt, at(4, 22))
  assert.equal(crossing.endsAt, at(5, 1))

  assert.deepEqual(runInColumn(crossing, slotsOfDay(new Date(at(4, 12)), ROME)), {
    start: 44,
    length: 4,
  })
  assert.deepEqual(runInColumn(crossing, slotsOfDay(new Date(at(5, 12)), ROME)), {
    start: 0,
    length: 2,
  })
})

test('a Hangout inside the 25-hour day is placed by that column’s own rows', () => {
  /*
   * 31 October 2027 is Rome's fall-back Sunday: 50 slots, with 02:00 twice.
   * A Hangout at 03:00 sits at row 8 on that column and at row 6 on any
   * ordinary day — which is exactly why this is asked of the column rather than
   * computed from the hour.
   */
  const fallBack = slotsOfDay(new Date(at(31, 12, 0, 9)), ROME)
  assert.equal(fallBack.length, 50)

  const morning = hangoutsFrom(
    [{ ...PIZZA, starts_at: '2027-10-31T02:00:00+00:00', ends_at: '2027-10-31T03:00:00+00:00' }],
    []
  )[0]

  // 02:00 UTC is 03:00 in Rome — after the clocks have already gone back.
  assert.deepEqual(runInColumn(morning, fallBack), { start: 8, length: 2 })
})

test('only `23P01` is the confirm race; everything else is a failure to report', () => {
  assert.equal(isOverlapRejection({ code: '23P01' }), true)
  assert.equal(isOverlapRejection({ code: '23505' }), false, 'a unique violation is not this')
  assert.equal(isOverlapRejection({ code: '42501' }), false, 'permission denied is not this')
  assert.equal(isOverlapRejection(null), false)
  assert.equal(isOverlapRejection(undefined), false)
})
