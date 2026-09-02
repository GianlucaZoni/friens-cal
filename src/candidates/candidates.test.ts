/**
 * The Candidate pipeline, asserted against ticket 09's own worked example.
 *
 *     yarn test
 *
 * Node's own runner, like `segments.test.ts` and `slots.test.ts` — so
 * `candidates.ts` imports only bare specifiers and relative paths, never `@/`.
 *
 * The case at the top is ticket 09's example verbatim: **Marco 18:00–22:00,
 * Sara 20:00–23:00, Luca 21:00–21:30 → two Candidates**, *Marco + Sara
 * 20:00–22:00* and *all three 21:00–21:30*. It is the example because it
 * exercises steps 5 and 6 against each other: the extension has to reach
 * *through* the three-Friend window without swallowing it, two different runs
 * have to dedupe onto one interval, and neither survivor may prune the other.
 *
 * The other claims pinned here are the ones a card would lie about if they
 * broke: that a Candidate crosses midnight, that domination leaves no card
 * saying strictly less than another, that the sort does not reshuffle on a
 * recompute, that the glow counts Hidden Friends in its denominator, and that
 * each of the three empty states is reached for its own reason.
 */
import { SLOT_MS, type FreeSlot } from '../availability/slots.ts'
import {
  containerOf,
  emptyReason,
  glows,
  isFullHouse,
  scanCandidates,
  splitAtGlow,
  type Candidate,
  type HangoutRange,
} from './candidates.ts'
import assert from 'node:assert/strict'
import test from 'node:test'

/* ------------------------------------------------------------------ *
 * A day, in wall-clock hours, with no time zone anywhere
 * ------------------------------------------------------------------ */

/**
 * Midnight of day 0. A round UTC instant, because nothing in the pipeline
 * formats anything — it is arithmetic on a lattice, and the lattice's phase is
 * the caller's business (`slotContaining`).
 */
const DAY_ZERO = Date.UTC(2026, 8, 1)
const DAY_MS = 48 * SLOT_MS

/** `at(21, 30)` — 21:30 on day 0. `at(1, 0, 1)` — 01:00 on day 1. */
const at = (hour: number, minute = 0, day = 0): number =>
  DAY_ZERO + day * DAY_MS + hour * 60 * 60_000 + minute * 60_000

/** One Friend free over a half-open span, as the Slot rows it really is. */
const held = (friendId: string, from: number, to: number): FreeSlot[] =>
  Array.from({ length: (to - from) / SLOT_MS }, (_, index) => ({
    friendId,
    start: from + index * SLOT_MS,
  }))

const NO_HANGOUTS: readonly HangoutRange[] = []

/** `{ start, end, friendIds }` flattened into something an assertion reads. */
const shape = (candidates: readonly Candidate[]) =>
  candidates.map((candidate) => [
    clock(candidate.start),
    clock(candidate.end),
    candidate.friendIds.join('+'),
  ])

/** `21:30`, or `Sun 01:00` once a Candidate has crossed into the next day. */
const clock = (instant: number): string => {
  const day = Math.floor((instant - DAY_ZERO) / DAY_MS)
  const minutes = (instant - DAY_ZERO - day * DAY_MS) / 60_000
  const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
  return day === 0 ? time : `+${day}d ${time}`
}

/* ================================================================== *
 * Ticket 09's worked example
 * ================================================================== */

const MARCO_SARA_LUCA = [
  ...held('marco', at(18), at(22)),
  ...held('sara', at(20), at(23)),
  ...held('luca', at(21), at(21, 30)),
]

test("ticket 09's worked example yields exactly two Candidates", () => {
  const { candidates } = scanCandidates({
    slots: MARCO_SARA_LUCA,
    visible: ['marco', 'sara', 'luca'],
    hangouts: NO_HANGOUTS,
    from: at(0),
  })

  assert.deepEqual(shape(candidates), [
    // All three first: count strictly dominates duration.
    ['21:00', '21:30', 'marco+sara+luca'],
    ['20:00', '22:00', 'marco+sara'],
  ])
})

test('the two {marco, sara} runs either side of the three-Friend window dedupe', () => {
  const { candidates } = scanCandidates({
    slots: MARCO_SARA_LUCA,
    visible: ['marco', 'sara', 'luca'],
    hangouts: NO_HANGOUTS,
    from: at(0),
  })

  // 20:00–21:00 and 21:30–22:00 are two atomic runs holding the same pair, and
  // both extend through Luca's window onto the identical interval. Without the
  // dedupe in step 5 this list has three cards, two of them the same card.
  assert.equal(candidates.filter((c) => c.friendIds.length === 2).length, 1)
})

test('a Friend free the whole time invents no pair that was never a run', () => {
  const { candidates } = scanCandidates({
    slots: [
      ...held('marco', at(18), at(22)),
      ...held('sara', at(18), at(22)),
      ...held('luca', at(18), at(22)),
    ],
    visible: ['marco', 'sara', 'luca'],
    hangouts: NO_HANGOUTS,
    from: at(0),
  })

  // One run, one Friend set, one Candidate. `{marco, sara}` is never a run's
  // set, so no `{marco, sara}` card exists — ticket 09's note on the example.
  assert.deepEqual(shape(candidates), [['18:00', '22:00', 'marco+sara+luca']])
})

/* ================================================================== *
 * Step 4 — the sweep does not break at midnight
 * ================================================================== */

test('a Candidate spans midnight as one card', () => {
  const { candidates } = scanCandidates({
    slots: [...held('marco', at(22), at(1, 0, 1)), ...held('sara', at(22), at(1, 0, 1))],
    visible: ['marco', 'sara'],
    hangouts: NO_HANGOUTS,
    from: at(0),
  })

  assert.deepEqual(shape(candidates), [['22:00', '+1d 01:00', 'marco+sara']])
})

test('the same Friends either side of a gap are two Candidates', () => {
  const { candidates } = scanCandidates({
    slots: [
      ...held('marco', at(18), at(20)),
      ...held('sara', at(18), at(20)),
      ...held('marco', at(21), at(23)),
      ...held('sara', at(21), at(23)),
    ],
    visible: ['marco', 'sara'],
    hangouts: NO_HANGOUTS,
    from: at(0),
  })

  assert.deepEqual(shape(candidates), [
    ['18:00', '20:00', 'marco+sara'],
    ['21:00', '23:00', 'marco+sara'],
  ])
})

/* ================================================================== *
 * Steps 1–3 — horizon, query, Hangouts
 * ================================================================== */

test('the horizon clips a Candidate that started before now', () => {
  const { candidates } = scanCandidates({
    slots: [...held('marco', at(14), at(22)), ...held('sara', at(14), at(22))],
    visible: ['marco', 'sara'],
    hangouts: NO_HANGOUTS,
    from: at(17, 30),
  })

  // Clipped to the Slot, never to the minute — which is what keeps step 1 from
  // ever emitting something shorter than a Slot.
  assert.deepEqual(shape(candidates), [['17:30', '22:00', 'marco+sara']])
})

test('a Hidden Friend leaves the Candidate they were in', () => {
  const slots = [
    ...held('marco', at(20), at(22)),
    ...held('sara', at(20), at(22)),
    ...held('luca', at(20), at(22)),
  ]
  const { candidates } = scanCandidates({
    slots,
    visible: ['marco', 'sara'],
    hangouts: NO_HANGOUTS,
    from: at(0),
  })

  assert.deepEqual(shape(candidates), [['20:00', '22:00', 'marco+sara']])
})

test('a confirmed Hangout is blanked for everyone, not only its Participants', () => {
  const { candidates } = scanCandidates({
    slots: [
      ...held('marco', at(18), at(23)),
      ...held('sara', at(18), at(23)),
      // Luca is in no Hangout and is free throughout; the blanking still
      // applies to him, because the exclusion constraint forbids a second
      // Hangout at that time whoever is in it.
      ...held('luca', at(18), at(23)),
    ],
    visible: ['marco', 'sara', 'luca'],
    hangouts: [{ startsAt: at(20), endsAt: at(22) }],
    from: at(0),
  })

  assert.deepEqual(shape(candidates), [
    ['18:00', '20:00', 'marco+sara+luca'],
    ['22:00', '23:00', 'marco+sara+luca'],
  ])
})

/* ================================================================== *
 * Step 6 — domination
 * ================================================================== */

test('no surviving Candidate is a subset of another in both axes', () => {
  const { candidates } = scanCandidates({
    slots: [
      ...held('marco', at(18), at(23)),
      ...held('sara', at(19), at(22)),
      ...held('luca', at(20), at(21)),
      ...held('bea', at(20), at(20, 30)),
    ],
    visible: ['marco', 'sara', 'luca', 'bea'],
    hangouts: NO_HANGOUTS,
    from: at(0),
  })

  candidates.forEach((candidate) =>
    candidates.forEach((other) => {
      if (other.id === candidate.id) return
      const inside = candidate.start >= other.start && candidate.end <= other.end
      const subset = candidate.friendIds.every((id) => other.friendIds.includes(id))
      assert.ok(
        !(inside && subset),
        `${candidate.id} says strictly less than ${other.id} and should have been pruned`
      )
    })
  )
})

test('a nested window with the same Friends is pruned, not shown twice', () => {
  const { candidates } = scanCandidates({
    slots: [
      ...held('marco', at(18), at(23)),
      ...held('sara', at(18), at(23)),
      ...held('luca', at(20), at(21)),
    ],
    visible: ['marco', 'sara', 'luca'],
    hangouts: NO_HANGOUTS,
    from: at(0),
  })

  // `{marco, sara}` extends across the whole evening from either side of Luca's
  // window, so the pair appears once and only at its maximal extent.
  assert.deepEqual(shape(candidates), [
    ['20:00', '21:00', 'marco+sara+luca'],
    ['18:00', '23:00', 'marco+sara'],
  ])
})

/* ================================================================== *
 * Step 7 — the sort, and its stability
 * ================================================================== */

test('count beats duration, permanently', () => {
  const { candidates } = scanCandidates({
    slots: [
      // Four Friends, half an hour.
      ...held('a', at(9), at(9, 30)),
      ...held('b', at(9), at(9, 30)),
      ...held('c', at(9), at(9, 30)),
      ...held('d', at(9), at(9, 30)),
      // Three Friends, four hours.
      ...held('a', at(18), at(22)),
      ...held('b', at(18), at(22)),
      ...held('c', at(18), at(22)),
    ],
    visible: ['a', 'b', 'c', 'd'],
    hangouts: NO_HANGOUTS,
    from: at(0),
  })

  assert.deepEqual(
    shape(candidates).map((row) => row[2]),
    ['a+b+c+d', 'a+b+c']
  )
})

test('the order does not depend on the order the Slots arrived in', () => {
  /*
   * The property a Realtime update needs: two Candidates tied on count and
   * start must not swap when the store is rebuilt. Feeding the same rows
   * shuffled is the closest a unit test gets to a Realtime insert landing
   * mid-list, and `Array#sort` is only stable with respect to its input.
   */
  const slots = [
    ...held('a', at(20), at(21)),
    ...held('b', at(20), at(21)),
    ...held('c', at(20), at(21, 30)),
    ...held('d', at(20), at(21, 30)),
  ]
  const scan = (rows: readonly FreeSlot[]) =>
    scanCandidates({
      slots: rows,
      visible: ['a', 'b', 'c', 'd'],
      hangouts: NO_HANGOUTS,
      from: at(0),
    }).candidates.map((candidate) => candidate.id)

  assert.deepEqual(scan(slots), scan([...slots].reverse()))
})

/* ================================================================== *
 * The glow, and the cut
 * ================================================================== */

/** Four Friends free 20:00–21:00, of a Group whose size the test varies. */
const four = scanCandidates({
  slots: [
    ...held('a', at(20), at(21)),
    ...held('b', at(20), at(21)),
    ...held('c', at(20), at(21)),
    ...held('d', at(20), at(21)),
  ],
  visible: ['a', 'b', 'c', 'd'],
  hangouts: NO_HANGOUTS,
  from: at(0),
}).candidates[0]

test('the glow fires exactly when 2 × friends > groupSize', () => {
  assert.equal(glows(four, 7), true) // 8 > 7
  assert.equal(glows(four, 8), false) // 8 > 8 is false
  assert.equal(glows(four, 9), false)
})

test('hiding a Friend can only suppress a glow, never manufacture one', () => {
  const slots = [
    ...held('a', at(20), at(21)),
    ...held('b', at(20), at(21)),
    ...held('c', at(20), at(21)),
  ]
  const groupSize = 6

  const everyone = scanCandidates({
    slots,
    visible: ['a', 'b', 'c', 'd', 'e', 'f'],
    hangouts: NO_HANGOUTS,
    from: at(0),
  })
  const filtered = scanCandidates({
    slots,
    visible: ['a', 'b', 'c'],
    hangouts: NO_HANGOUTS,
    from: at(0),
  })

  // The same three Friends, and the same answer either way: the denominator is
  // the Group, so hiding the other three cannot lift 6 > 6 into a glow.
  assert.equal(glows(everyone.candidates[0], groupSize), false)
  assert.equal(glows(filtered.candidates[0], groupSize), false)
})

test('the everyone pill needs the whole Group, Hidden included', () => {
  assert.equal(isFullHouse(four, 4), true)
  assert.equal(isFullHouse(four, 5), false)
})

test('the tail behind show more is everything below the glow line', () => {
  const { candidates } = scanCandidates({
    slots: [
      ...held('a', at(20), at(21)),
      ...held('b', at(20), at(21)),
      ...held('c', at(20), at(21)),
      ...held('c', at(9), at(10)),
      ...held('d', at(9), at(10)),
    ],
    visible: ['a', 'b', 'c', 'd'],
    hangouts: NO_HANGOUTS,
    from: at(0),
  })

  const { shown, tail } = splitAtGlow(candidates, 4)
  assert.deepEqual(shape(shown), [['20:00', '21:00', 'a+b+c']]) // 6 > 4
  assert.deepEqual(shape(tail), [['09:00', '10:00', 'c+d']]) // 4 > 4 is false
})

test('nothing collapses when nothing is above the line', () => {
  const { candidates } = scanCandidates({
    slots: [...held('a', at(20), at(21)), ...held('b', at(20), at(21))],
    visible: ['a', 'b', 'c', 'd', 'e', 'f'],
    hangouts: NO_HANGOUTS,
    from: at(0),
  })

  // A pane holding one "show more" button and nothing else is indistinguishable
  // from an empty state. See `splitAtGlow`.
  const { shown, tail } = splitAtGlow(candidates, 6)
  assert.equal(shown.length, 1)
  assert.equal(tail.length, 0)
})

/* ================================================================== *
 * Sub-Candidates name the window they sit in
 * ================================================================== */

test('a sub-Candidate finds the window that contains it', () => {
  const { candidates } = scanCandidates({
    slots: [
      ...held('a', at(19), at(21, 30)),
      ...held('b', at(19), at(21, 30)),
      ...held('c', at(19), at(21, 30)),
      ...held('d', at(19), at(21, 30)),
      ...held('e', at(19), at(21, 30)),
      ...held('f', at(20), at(20, 30)),
    ],
    visible: ['a', 'b', 'c', 'd', 'e', 'f'],
    hangouts: NO_HANGOUTS,
    from: at(0),
  })

  const [six, five] = candidates
  assert.equal(six.friendIds.length, 6)
  assert.equal(containerOf(six, candidates)?.id, five.id)
  // The wider card is inside nothing, so it says nothing.
  assert.equal(containerOf(five, candidates), null)
})

/* ================================================================== *
 * The three empty states, each for its own reason
 * ================================================================== */

const EMPTY = { candidates: [], anyAvailability: false }

test('fewer than two visible Friends is its own reason', () => {
  assert.equal(emptyReason(1, EMPTY), 'too-few-friends')
  // And it outranks the others: with one Friend visible no Candidate can exist,
  // and the reason is the filter rather than the data.
  assert.equal(emptyReason(1, { candidates: [], anyAvailability: true }), 'too-few-friends')
})

test('no Availability from now forward is distinguished from no overlap', () => {
  assert.equal(emptyReason(4, EMPTY), 'no-availability')
  assert.equal(emptyReason(4, { candidates: [], anyAvailability: true }), 'no-overlap')
})

test('a Hangout that blanks the only overlap reads as no overlap, not as no Availability', () => {
  const scan = scanCandidates({
    slots: [...held('marco', at(20), at(22)), ...held('sara', at(20), at(22))],
    visible: ['marco', 'sara'],
    hangouts: [{ startsAt: at(20), endsAt: at(22) }],
    from: at(0),
  })

  // Both of them drew the whole evening. Telling them "nobody's free yet — draw
  // your availability" would be a lie, which is why `anyAvailability` is
  // measured before step 3.
  assert.equal(scan.candidates.length, 0)
  assert.equal(emptyReason(2, scan), 'no-overlap')
})

test('something to show is not an empty state', () => {
  assert.equal(emptyReason(4, { candidates: [four], anyAvailability: true }), null)
})
