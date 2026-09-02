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
  covers,
  droppedBy,
  hangoutsFrom,
  isEdited,
  isHappening,
  isPast,
  mayJoin,
  missingSlots,
  nameOf,
  isOverlapRejection,
  participantIds,
  pinned,
  rangesOf,
  runInColumn,
  slotStartsOf,
  stateOf,
  wouldAutoCancel,
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
  /*
   * Null on all three, which is the **pre-migration** Hangout: the provenance
   * columns arrived in `06-hangout-lifecycle.sql` and backfilling an author
   * would have been inventing a fact (ticket 07). Every reader has to render
   * this case, so the default fixture is it.
   */
  created_by: null,
  edited_by: null,
  edited_at: null,
}

const CLIMBING = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  starts_at: '2027-09-05T08:00:00+00:00',
  ends_at: '2027-09-05T10:00:00+00:00',
  title: null,
  created_at: '2027-09-01T10:00:00+00:00',
  created_by: null,
  edited_by: null,
  edited_at: null,
}

/** When a Friend Left, and when somebody edited — both as PostgREST spells them. */
const LEFT = '2027-09-02T09:00:00+00:00'
const EDITED = '2027-09-03T09:00:00+00:00'

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

test('every Hangout has a name, and an unnamed one is called "Hangout"', () => {
  const [pizza] = hangoutsFrom([PIZZA], [])
  const [climbing] = hangoutsFrom([CLIMBING], [])

  assert.equal(nameOf(pizza), 'Pizza')
  /*
   * Not a placeholder. Naming a Hangout is the detail sheet's job (issue 10),
   * so **every** Hangout confirmed today lands here — and the card's hierarchy
   * ("the name is the headline, the time is the second line") is only
   * unconditional because this never returns null.
   */
  assert.equal(nameOf(climbing), 'Hangout')
  assert.equal(nameOf({ title: '' }), '', 'an empty title is a title, not an absent one')
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

/* ------------------------------------------------------------------ *
 * Issue 10 — the lifecycle
 * ------------------------------------------------------------------ */

test('`editedBy` non-null IS the "edited" mark — there is no second flag to disagree', () => {
  const [fresh] = hangoutsFrom([PIZZA], [])
  const [moved] = hangoutsFrom([{ ...PIZZA, edited_by: SARA, edited_at: EDITED }], [])

  assert.equal(isEdited(fresh), false)
  assert.equal(isEdited(moved), true)
  assert.equal(moved.editedAt, at(3, 11), 'the stamp goes through Date, like every other bound')
})

test('the pre-migration Hangout has no provenance, and reads as null rather than as nobody', () => {
  // Ticket 07: nullable "because Hangouts confirmed before this migration have
  // no author, and backfilling one would be inventing a fact". The detail
  // renders no line at all for these, which is why null has to survive the fold.
  const [pizza] = hangoutsFrom([PIZZA], [])
  assert.equal(pizza.createdBy, null)
  assert.equal(pizza.editedBy, null)
  assert.equal(pizza.editedAt, null)
})

test('a Hangout covers exactly its own Slots, half-open', () => {
  const [pizza] = hangoutsFrom([PIZZA], [])

  // 20:00–23:00 is six half hours, and 23:00 itself is NOT one of them —
  // `tstzrange`'s `[)`, which is what lets two plans sit back to back.
  assert.equal(slotStartsOf(pizza).length, 6)
  assert.equal(slotStartsOf(pizza)[0], at(4, 20))
  assert.equal(slotStartsOf(pizza)[5], at(4, 22, 30))
  assert.equal(
    slotStartsOf(pizza).includes(at(4, 23)),
    false,
    'the closing bound is not a Slot the Hangout covers'
  )
})

test('coverage across the 25-hour Sunday counts the repeated hour', () => {
  /*
   * The autumn Sunday holds 02:00 twice, so 01:00–04:00 in Rome is FOUR hours
   * of real time and eight Slots rather than six. This is the case a client
   * predicate built on wall-clock arithmetic gets wrong and the trigger's
   * `generate_series` over real half hours gets right — and if the two
   * disagreed, ticket 08 §10's dialog would lie about what an erase costs.
   */
  const overnight = {
    ...PIZZA,
    starts_at: new TZDate(2027, 9, 31, 1, ROME).toISOString(),
    ends_at: new TZDate(2027, 9, 31, 4, ROME).toISOString(),
  }
  const [hangout] = hangoutsFrom([overnight], [])

  assert.equal(slotStartsOf(hangout).length, 8)
})

test('`covers` is every Slot, and `missingSlots` is what a Join has to write', () => {
  const [pizza] = hangoutsFrom([PIZZA], [])
  const slots = slotStartsOf(pizza)

  assert.equal(
    covers(pizza, () => true),
    true
  )
  assert.equal(
    covers(pizza, (slot) => slot !== slots[3]),
    false,
    'one hole anywhere is a loss of coverage — the drop rule is strict (ticket 07 §7)'
  )
  assert.deepEqual(
    missingSlots(pizza, (slot) => slot !== slots[3]),
    [slots[3]]
  )
  assert.deepEqual(
    missingSlots(pizza, () => false),
    slots,
    'nothing held is the whole range'
  )
})

test('three states out of two facts: no row, row, row with `left_at`', () => {
  const [pizza] = hangoutsFrom([PIZZA], [on(PIZZA.id, MARCO), on(PIZZA.id, SARA, LEFT)])

  assert.equal(stateOf(pizza, MARCO), 'participant')
  assert.equal(stateOf(pizza, SARA), 'left')
  assert.equal(stateOf(pizza, LUCA), 'not-involved')
})

test('"Join?" shows on ANY overlap, never for a Friend who Left, never on a Past one', () => {
  const [pizza] = hangoutsFrom([PIZZA], [on(PIZZA.id, MARCO), on(PIZZA.id, SARA, LEFT)])
  const slots = slotStartsOf(pizza)
  const beforeIt = at(4, 19)
  const oneSlot = (slot: number) => slot === slots[0]

  // Ticket 08 §5: however small. One Slot in common is enough, because Join
  // writes whatever is missing to cover the whole range.
  assert.equal(mayJoin(pizza, LUCA, oneSlot, beforeIt), true)
  assert.equal(
    mayJoin(pizza, LUCA, () => false, beforeIt),
    false,
    'no overlap, no offer'
  )

  // §9: the tool never suggests rejoining something you walked out of.
  assert.equal(
    mayJoin(pizza, SARA, () => true, beforeIt),
    false
  )
  // And a Participant is already on it.
  assert.equal(
    mayJoin(pizza, MARCO, () => true, beforeIt),
    false
  )
  // §6: Past freezes join as well as retime and cancel.
  assert.equal(
    mayJoin(pizza, LUCA, () => true, at(5, 0)),
    false
  )
})

test('the drop dialog names a Hangout only when the erase actually breaks its coverage', () => {
  const [pizza] = hangoutsFrom([PIZZA], [on(PIZZA.id, MARCO)])
  const slots = slotStartsOf(pizza)
  const holdsEverything = () => true

  assert.deepEqual(
    droppedBy([pizza], MARCO, new Set([slots[2]]), holdsEverything).map((it) => it.id),
    [PIZZA.id]
  )

  /*
   * Erasing Availability that lies OUTSIDE the range touches nothing. The
   * trigger's transition table narrows its scan to pairs where a deleted Slot
   * fell inside a Hangout, so a client that reported this one would be naming
   * a drop the database is never going to perform.
   */
  assert.deepEqual(droppedBy([pizza], MARCO, new Set([at(4, 19)]), holdsEverything), [])
})

test('the drop dialog ignores Slots the viewer does not hold, and Friends who are not on it', () => {
  const [pizza] = hangoutsFrom([PIZZA], [on(PIZZA.id, MARCO), on(PIZZA.id, SARA, LEFT)])
  const slots = slotStartsOf(pizza)

  /*
   * A selection can include Slots the viewer never held — `useAvailability`'s
   * `stroke` filters the delta before writing, so nothing the store will not
   * actually delete may appear in this dialog.
   */
  assert.deepEqual(
    droppedBy([pizza], MARCO, new Set([slots[2]]), () => false),
    []
  )

  // Left outranks Availability permanently, so erasing underneath it changes
  // nothing — and the trigger's own scan is `left_at is null`.
  assert.deepEqual(
    droppedBy([pizza], SARA, new Set([slots[2]]), () => true),
    []
  )
  // And somebody with no row at all cannot be dropped from it.
  assert.deepEqual(
    droppedBy([pizza], LUCA, new Set([slots[2]]), () => true),
    []
  )
})

test('a partial erase inside the range still drops you — the rule is strict', () => {
  // Ticket 07 §7: *any* loss of coverage. Erasing one half hour out of six is
  // not "mostly still free", it is a Hangout you no longer cover.
  const [pizza] = hangoutsFrom([PIZZA], [on(PIZZA.id, MARCO)])
  const slots = slotStartsOf(pizza)

  assert.equal(droppedBy([pizza], MARCO, new Set([slots[5]]), () => true).length, 1)
})

test('the last Participant leaving cancels it — unless it is already Past', () => {
  const [alone] = hangoutsFrom([PIZZA], [on(PIZZA.id, MARCO)])
  const [two] = hangoutsFrom([PIZZA], [on(PIZZA.id, MARCO), on(PIZZA.id, SARA)])
  const [withALeaver] = hangoutsFrom([PIZZA], [on(PIZZA.id, MARCO), on(PIZZA.id, SARA, LEFT)])

  assert.equal(wouldAutoCancel(alone, MARCO, at(4, 19)), true)
  assert.equal(wouldAutoCancel(two, MARCO, at(4, 19)), false)
  assert.equal(
    wouldAutoCancel(withALeaver, MARCO, at(4, 19)),
    true,
    'a Friend who Left is not a Participant, so the last one standing is alone'
  )

  /*
   * Ticket 08 §6 makes a Past Hangout uneditable — *no join, no retime, no
   * cancel* — and an auto-cancel is a cancel. So tidying up last month's
   * Availability cannot erase last month's plans; the drop still happens and
   * the Hangout is simply left with nobody on it, which is honest.
   */
  assert.equal(wouldAutoCancel(alone, MARCO, at(5, 0)), false)
})
