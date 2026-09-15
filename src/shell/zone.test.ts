/**
 * The viewer's zone, asserted against the real tz database.
 *
 * Runs on Node's own runner, like `slots.test.ts` and `view.test.ts` — so the
 * module under test imports only bare specifiers, never `@/`.
 *
 *     yarn test
 *
 * Two instants, because every answer here is a fact about a moment rather than
 * about a zone: `SUMMER` has the EU and the US both on daylight saving, and
 * `BETWEEN` sits in the ten days of autumn where the EU has moved and the US
 * has not.
 */
import {
  deviceTimeZone,
  offsetLabel,
  spansZones,
  zoneFrame,
} from './zone.ts'
import assert from 'node:assert/strict'
import test from 'node:test'

const ROME = 'Europe/Rome'
const BERLIN = 'Europe/Berlin'
const NEW_YORK = 'America/New_York'
const TOKYO = 'Asia/Tokyo'
const KOLKATA = 'Asia/Kolkata'
const KATHMANDU = 'Asia/Kathmandu'
const MOSCOW = 'Europe/Moscow'
const SYDNEY = 'Australia/Sydney'
const LORD_HOWE = 'Australia/Lord_Howe'

/** July: Rome +2, New York -4. */
const SUMMER = Date.UTC(2026, 6, 1, 12)
/** Winter: Rome +1, New York -5. */
const WINTER = Date.UTC(2027, 0, 15, 12)
/** After the EU clocks went back on 2026-10-25 and before the US ones on 11-01. */
const BETWEEN = Date.UTC(2026, 9, 27, 12)

/* ================================================================== *
 * The frame a time string names
 * ================================================================== */

test('the frame is the offset, never the zone abbreviation', () => {
  assert.equal(zoneFrame(ROME, SUMMER), 'GMT+2')
  assert.equal(zoneFrame(ROME, WINTER), 'GMT+1')
  assert.equal(zoneFrame(NEW_YORK, SUMMER), 'GMT-4')
  assert.equal(zoneFrame(NEW_YORK, WINTER), 'GMT-5')
})

test('a zone off the hour keeps its minutes', () => {
  assert.equal(zoneFrame(KOLKATA, SUMMER), 'GMT+5:30')
  assert.equal(zoneFrame(KATHMANDU, SUMMER), 'GMT+5:45')
})

test('UTC is bare GMT, with no zero to read', () => {
  assert.equal(zoneFrame('UTC', SUMMER), 'GMT')
})

/**
 * `Intl`'s `timeZoneName: 'short'` is locale-*inverted* — under `en-GB` Rome
 * renders `CEST` and New York `GMT-4`, under `en-US` the other way round — so
 * two Friends in one room with different browser locales would read different
 * markers off the same string (planning ticket 08 §6). This is the assertion
 * that the frame does not inherit that: it is computed, and it matches
 * `shortOffset`, which is the one token that is uniform across both.
 */
test('the frame is the same string in every locale, in both zones', () => {
  const shortOffset = (locale: string, timeZone: string, at: number): string =>
    new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'shortOffset' })
      .formatToParts(new Date(at))
      .find((part) => part.type === 'timeZoneName')!.value

  for (const timeZone of [ROME, NEW_YORK, KATHMANDU, TOKYO, 'UTC']) {
    for (const at of [SUMMER, WINTER]) {
      assert.equal(zoneFrame(timeZone, at), shortOffset('en-GB', timeZone, at))
      assert.equal(zoneFrame(timeZone, at), shortOffset('en-US', timeZone, at))
    }
  }
})

/* ================================================================== *
 * What the roster says beside a Friend
 * ================================================================== */

test('a Friend whose clock reads the same gets nothing', () => {
  assert.equal(offsetLabel(ROME, ROME, SUMMER), null)
  assert.equal(offsetLabel(ROME, BERLIN, SUMMER), null)
})

test('a Friend ahead is ahead, and one behind is behind', () => {
  assert.equal(offsetLabel(ROME, TOKYO, WINTER), '8h ahead')
  assert.equal(offsetLabel(MOSCOW, 'UTC', SUMMER), '3h behind')
})

test('half and quarter hours are spelled out rather than rounded away', () => {
  assert.equal(offsetLabel(ROME, KOLKATA, SUMMER), '3h30m ahead')
  assert.equal(offsetLabel(TOKYO, KOLKATA, SUMMER), '3h30m behind')
  assert.equal(offsetLabel(ROME, KATHMANDU, SUMMER), '3h45m ahead')
})

test('an offset under an hour is minutes alone', () => {
  // Lord Howe is +10:30 against Sydney's +10 whenever neither is on daylight
  // saving, which July is.
  assert.equal(offsetLabel(SYDNEY, LORD_HOWE, SUMMER), '30m ahead')
})

test('the offset is a fact about the instant, not about the pair of zones', () => {
  // Rome and New York are six hours apart for most of the year and five for
  // the ten days the EU has changed its clocks and the US has not.
  assert.equal(offsetLabel(ROME, NEW_YORK, SUMMER), '6h behind')
  assert.equal(offsetLabel(ROME, NEW_YORK, BETWEEN), '5h behind')
})

test('a Friend who has never signed in since the column existed gets nothing', () => {
  assert.equal(offsetLabel(ROME, null, SUMMER), null)
})

/* ================================================================== *
 * Whether the cal spans zones at all
 * ================================================================== */

test('a cal whose Friends all read the same clock spans nothing', () => {
  assert.equal(spansZones(ROME, [ROME, BERLIN, null], SUMMER), false)
  assert.equal(spansZones(ROME, [], SUMMER), false)
})

test('one Friend on another clock is enough', () => {
  assert.equal(spansZones(ROME, [ROME, NEW_YORK], SUMMER), true)
})

test('a cal can start and stop spanning zones as the clocks change', () => {
  // Lord Howe shifts by half an hour rather than a whole one, so it reads
  // Sydney's clock exactly while both are on daylight saving — January here —
  // and sits thirty minutes ahead of it for the rest of the year.
  assert.equal(spansZones(SYDNEY, [LORD_HOWE], WINTER), false)
  assert.equal(spansZones(SYDNEY, [LORD_HOWE], SUMMER), true)
})

/* ================================================================== *
 * The device
 * ================================================================== */

test('the device zone is a zone the tz database knows', () => {
  assert.doesNotThrow(() =>
    new Intl.DateTimeFormat('en-GB', { timeZone: deviceTimeZone() }).format(new Date())
  )
})
