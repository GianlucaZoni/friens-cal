/**
 * The double-booking mark's arithmetic and its copy.
 *
 *     yarn test
 *
 * Four claims are worth pinning here, and each one is a way the mark could be
 * wrong without looking wrong:
 *
 * 1. **Any overlap, however small**, and a plan that ends where the next one
 *    starts is not an overlap. Ticket 09 §3 mirrors v1 ticket 08 §5's rule,
 *    which is already how Join decides to offer itself.
 * 2. **The mark is on a commitment you could take on, never on one you hold**
 *    (§4). That one rule is what makes confirming erase the mark from the card
 *    just clicked, and it is the only thing keeping §2 and §5 from
 *    contradicting each other.
 * 3. **The four acts move `heldKey`** — confirm, Join, Rejoin and retime — and
 *    nobody else's doing moves it.
 * 4. **No `GMT+2` on these strings, ever** (§7). The frame disambiguates
 *    between Friends reading the same string, and nobody but the viewer will
 *    ever see this one.
 */
import { clashesWith, busyMark, busySuffix, clashNaming, heldKey, isOffered } from './elsewhere.ts'
import type { Commitment } from './elsewhere.ts'
import type { Hangout, Participant } from './hangout.ts'
import { TZDate } from '@date-fns/tz'
import assert from 'node:assert/strict'
import test from 'node:test'

const ROME = 'Europe/Rome'
const zone = { timeZone: ROME, frame: null }

/** A wall clock in Rome, as a true instant. */
const at = (day: number, hour: number, minute = 0) =>
  new TZDate(2027, 8, day, hour, minute, ROME).getTime()

const commitment = (fields: Partial<Commitment> = {}): Commitment => ({
  hangoutId: 'h1',
  calId: 'climbing',
  calName: 'spiritually unemployed',
  title: 'drinks',
  startsAt: at(4, 20),
  endsAt: at(4, 21),
  ...fields,
})

const hangout = (participants: readonly Participant[], fields: Partial<Hangout> = {}): Hangout => ({
  id: 'h9',
  startsAt: at(4, 20),
  endsAt: at(4, 23),
  title: null,
  createdBy: null,
  editedBy: null,
  editedAt: null,
  participants,
  ...fields,
})

const ME = 'ada'

test('any overlap counts, however small', () => {
  const mine = [commitment({ startsAt: at(4, 22, 30), endsAt: at(4, 23) })]

  assert.equal(clashesWith(mine, { start: at(4, 20), end: at(4, 23) }).length, 1)
})

test('a commitment that ends where the range starts is not a clash', () => {
  const mine = [commitment({ startsAt: at(4, 19), endsAt: at(4, 20) })]

  assert.deepEqual(clashesWith(mine, { start: at(4, 20), end: at(4, 23) }), [])
})

test('a nested Candidate that does not reach the commitment is not marked', () => {
  const mine = [commitment({ startsAt: at(4, 22), endsAt: at(4, 23) })]

  // The container 20:00 – 23:00 clashes and the 20:00 – 20:30 inside it does
  // not. Each card computes from its own range; nothing inherits.
  assert.equal(clashesWith(mine, { start: at(4, 20), end: at(4, 23) }).length, 1)
  assert.deepEqual(clashesWith(mine, { start: at(4, 20), end: at(4, 20, 30) }), [])
})

test('clashes come back earliest first', () => {
  const late = commitment({ hangoutId: 'late', startsAt: at(4, 22), endsAt: at(4, 23) })
  const early = commitment({ hangoutId: 'early', startsAt: at(4, 20), endsAt: at(4, 21) })

  assert.deepEqual(
    clashesWith([late, early], { start: at(4, 19), end: at(4, 23) }).map((it) => it.hangoutId),
    ['early', 'late']
  )
})

test('a Hangout you are on is not an offer, so it carries no mark', () => {
  const on = hangout([{ friendId: ME, leftAt: null }])

  assert.equal(isOffered(on, ME, at(4, 12)), false)
})

test('a Hangout you never joined, and one you Left, are both still offers', () => {
  const theirs = hangout([{ friendId: 'bea', leftAt: null }])
  const walkedOut = hangout([{ friendId: ME, leftAt: at(3, 9) }])

  assert.equal(isOffered(theirs, ME, at(4, 12)), true)
  assert.equal(isOffered(walkedOut, ME, at(4, 12)), true)
})

test('a Past Hangout offers nothing, whatever your state on it', () => {
  const theirs = hangout([{ friendId: 'bea', leftAt: null }])

  assert.equal(isOffered(theirs, ME, at(5, 12)), false)
})

test('confirm, Join, Rejoin and retime each move what you hold', () => {
  const before = heldKey([hangout([{ friendId: 'bea', leftAt: null }])], ME)

  const confirmed = heldKey(
    [
      hangout([{ friendId: 'bea', leftAt: null }]),
      hangout([{ friendId: ME, leftAt: null }], { id: 'fresh' }),
    ],
    ME
  )
  const joined = heldKey(
    [
      hangout([
        { friendId: 'bea', leftAt: null },
        { friendId: ME, leftAt: null },
      ]),
    ],
    ME
  )
  const rejoined = heldKey([hangout([{ friendId: ME, leftAt: null }])], ME)
  const retimed = heldKey([hangout([{ friendId: ME, leftAt: null }], { startsAt: at(4, 21) })], ME)

  assert.notEqual(confirmed, before)
  assert.notEqual(joined, before)
  assert.notEqual(rejoined, before)
  assert.notEqual(retimed, rejoined)
})

test('somebody else joining does not move what you hold', () => {
  const alone = heldKey([hangout([{ friendId: ME, leftAt: null }])], ME)
  const crowded = heldKey(
    [
      hangout([
        { friendId: ME, leftAt: null },
        { friendId: 'bea', leftAt: null },
      ]),
    ],
    ME
  )

  assert.equal(crowded, alone)
})

test('leaving moves it too, because Left is not held either', () => {
  const on = heldKey([hangout([{ friendId: ME, leftAt: null }])], ME)
  const off = heldKey([hangout([{ friendId: ME, leftAt: at(3, 9) }])], ME)

  assert.notEqual(off, on)
})

test('the card carries the time and nothing else', () => {
  assert.equal(busyMark([commitment()], zone), 'Busy 20:00 – 21:00')
})

test('the card names the earliest and counts the rest', () => {
  const eight = commitment({ hangoutId: 'a', startsAt: at(4, 20), endsAt: at(4, 21) })
  const nine = commitment({ hangoutId: 'b', startsAt: at(4, 21), endsAt: at(4, 22) })
  const ten = commitment({ hangoutId: 'c', startsAt: at(4, 22), endsAt: at(4, 23) })

  assert.equal(busyMark([eight, nine], zone), 'Busy 20:00 – 21:00, and 1 other')
  assert.equal(busyMark([eight, nine, ten], zone), 'Busy 20:00 – 21:00, and 2 others')
})

test('nothing to say is nothing, never an all-clear', () => {
  assert.equal(busyMark([], zone), null)
  assert.equal(busySuffix([], zone), '')
})

test('the accelerator says it in its own label', () => {
  assert.equal(busySuffix([commitment()], zone), ' — you are busy 20:00 – 21:00 elsewhere')
  assert.equal(
    busySuffix([commitment(), commitment({ hangoutId: 'b', startsAt: at(4, 21) })], zone),
    ' — you are busy 20:00 – 21:00 elsewhere, and at 1 other time'
  )
})

test('no frame on any of these strings, even in a cal that spans zones', () => {
  const spanning = { timeZone: ROME, frame: 'GMT+2' }

  assert.equal(busyMark([commitment()], spanning), 'Busy 20:00 – 21:00')
  assert.ok(!busySuffix([commitment()], spanning).includes('GMT'))
  assert.ok(!clashNaming(commitment(), spanning).when.includes('GMT'))
})

test('the naming is the cal, the hangout and the date', () => {
  const named = clashNaming(commitment(), zone)

  assert.equal(named.what, 'drinks in spiritually unemployed')
  assert.equal(named.when, 'Sat 4 Sep · 20:00 – 21:00')
})

test('an untitled commitment is named the way every other surface names one', () => {
  assert.equal(
    clashNaming(commitment({ title: null }), zone).what,
    'Hangout in spiritually unemployed'
  )
})
