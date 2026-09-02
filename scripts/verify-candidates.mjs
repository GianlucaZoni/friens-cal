/**
 * friens-cal — issue 08: run the real Candidate pipeline over the real rows.
 *
 *   node --experimental-strip-types --env-file=.env scripts/verify-candidates.mjs
 *
 * Needs the same `.env` as the other verify scripts: the publishable key, and
 * FRIEND_TEST_EMAIL / FRIEND_TEST_PASSWORD for a real Friend.
 *
 * ## What this proves that `candidates.test.ts` cannot
 *
 * The unit tests build `FreeSlot`s by hand. **This one goes through the seam**:
 * PostgREST rows → `mergeSlots` → the store's `friendId|milliseconds` key set →
 * `heldFrom` → `scanCandidates`. Three things live only in that seam and each
 * has already bitten this repo once —
 *
 * 1. PostgREST renders a `timestamptz` as `2027-09-06T17:00:00+00:00` and
 *    `Date#toISOString` writes `...000Z`. The same instant, two strings. That is
 *    the trap `slotKey` exists to avoid, and issue 07's `verify-realtime.mjs`
 *    fell into it.
 * 2. Friend ids are uuids, and the key is split on a `|` that has to survive
 *    them.
 * 3. The instants are real Rome instants, not the round UTC ones the tests use.
 *
 * It also asserts against the shapes actually in the database — the three
 * `04-demo-second-friend.sql` seeded for the heatmap's ramp, plus the run
 * `verify-availability.mjs` left behind in issue 05. They exercise the
 * Candidate rules for free: the staircase is an overlap that starts later than
 * either Friend's own run, the full house is the `everyone` case, and Friday is
 * two independently seeded runs that overlap by an hour — nobody designed that
 * one, and it is the sharpest check in the file.
 *
 * **Read-only.** Unlike `verify-availability.mjs` this seeds nothing and
 * deletes nothing — the pipeline is a derivation, so there is nothing to write
 * to test it.
 */
import { heldFrom, mergeSlots } from '../src/availability/slots.ts'
import { scanCandidates, glows, isFullHouse } from '../src/candidates/candidates.ts'
import { TZDate } from '@date-fns/tz'
import { createClient } from '@supabase/supabase-js'

/** The one group time zone (`GROUP_TIME_ZONE`), restated as the other scripts do. */
const ROME = 'Europe/Rome'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const email = process.env.FRIEND_TEST_EMAIL
const password = process.env.FRIEND_TEST_PASSWORD

const missing = Object.entries({
  VITE_SUPABASE_URL: url,
  VITE_SUPABASE_PUBLISHABLE_KEY: key,
  FRIEND_TEST_EMAIL: email,
  FRIEND_TEST_PASSWORD: password,
})
  .filter(([, value]) => !value)
  .map(([name]) => name)

if (missing.length > 0) {
  console.error(`Missing from .env: ${missing.join(', ')}`)
  process.exit(1)
}

/** `2027-09-06 19:00` in Rome, as an epoch instant. */
const at = (day, time) => {
  const [hour, minute] = time.split(':').map(Number)
  return new TZDate(2027, 8, day, hour, minute, ROME).getTime()
}

const failures = []

const check = (label, condition, detail = '') => {
  if (condition) {
    console.log(`  ✓ ${label}`)
    return
  }
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  failures.push(label)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
if (signInError) {
  console.error(`Could not sign in as ${email}: ${signInError.message}`)
  process.exit(1)
}

/* ------------------------------------------------------------------ *
 * The roster, as the sidebar counts it
 * ------------------------------------------------------------------ */

const { data: friends, error: rosterError } = await supabase
  .from('friend')
  .select('id, display_name, hue, tone, expression, blobatar_seed')

if (rosterError) {
  console.error(`Could not read the roster: ${rosterError.message}`)
  process.exit(1)
}

/** `identityOf`'s predicate, restated — the one definition of "finished setup". */
const setUp = friends.filter(
  (friend) =>
    friend.display_name !== null &&
    friend.blobatar_seed !== null &&
    friend.hue !== null &&
    friend.tone !== null &&
    friend.expression !== null
)

const visible = setUp.map((friend) => friend.id)
const groupSize = setUp.length
const nameOf = new Map(setUp.map((friend) => [friend.id, friend.display_name]))

console.log(`\nGroup: ${groupSize} Friends who have finished setup`)
setUp.forEach((friend) => console.log(`  · ${friend.display_name}`))

/* ------------------------------------------------------------------ *
 * The store, built the way the app builds it
 * ------------------------------------------------------------------ */

const WINDOW_FROM = at(1, '00:00')
const WINDOW_TO = at(15, '00:00')

const { data: rows, error: readError } = await supabase
  .from('availability')
  .select('friend_id, slot_start')
  .gte('slot_start', new Date(WINDOW_FROM).toISOString())
  .lt('slot_start', new Date(WINDOW_TO).toISOString())
  .order('slot_start')

if (readError) {
  console.error(`Could not read Availability: ${readError.message}`)
  process.exit(1)
}

// The app's own fold, so the keys under test are the app's keys.
const store = mergeSlots(new Set(), rows)

console.log(`\nSeeded window (Sep 2027): ${rows.length} slot rows, ${store.size} keys`)

const describe = (candidate) =>
  `${new TZDate(candidate.start, ROME).toISOString().slice(0, 16)}–${new TZDate(candidate.end, ROME).toISOString().slice(11, 16)} ${candidate.friendIds.map((id) => nameOf.get(id)).join(' + ')}`

/* ================================================================== *
 * 1. The seam: rows → keys → FreeSlots
 * ================================================================== */

console.log('\n1. The store key survives a PostgREST timestamp and a uuid')

const unpacked = heldFrom(store, WINDOW_FROM)

check('every row unpacks into a FreeSlot', unpacked.length === store.size, `${unpacked.length}`)
check(
  'every unpacked start is a real instant, not NaN',
  unpacked.every((slot) => Number.isFinite(slot.start)),
  'a `+00:00` offset parsed as NaN would silently empty the sidebar'
)
check(
  'every unpacked friendId is one of the Group',
  unpacked.every((slot) => friends.some((friend) => friend.id === slot.friendId)),
  'the key is split on the last `|`, and a uuid has to survive it'
)

/* ================================================================== *
 * 2. The pipeline over the seeded shapes
 * ================================================================== */

console.log('\n2. The pipeline over `04-demo-second-friend.sql`')

const { candidates, anyAvailability } = scanCandidates({
  slots: unpacked,
  visible,
  hangouts: [],
  from: WINDOW_FROM,
})

candidates.forEach((candidate) => console.log(`     ${describe(candidate)}`))

check('Availability exists from the horizon forward', anyAvailability)

const staircase = candidates.find((candidate) => candidate.start === at(6, '19:00'))
const fullHouse = candidates.find((candidate) => candidate.start === at(8, '20:00'))

check(
  "Monday's staircase is one Candidate starting where the SECOND Friend does",
  staircase !== undefined && staircase.end === at(6, '23:00'),
  'the overlap starts at 19:00 even though the first Friend started at 18:00'
)
/*
 * Not "every set-up Friend" — that was the first version of this check and it
 * went red the moment a third Friend joined without drawing anything, which is
 * a fact about the Group rather than about the pipeline. The invariant that
 * does hold: a Candidate's Friend set is *exactly* the Friends who hold a row
 * at every one of its Slots.
 */
const holdsThroughout = (friendId, candidate) =>
  Array.from(
    { length: (candidate.end - candidate.start) / (30 * 60_000) },
    (_, index) => candidate.start + index * 30 * 60_000
  ).every((instant) => store.has(`${friendId}|${instant}`))

check(
  "every Candidate's Friend set is exactly who is free throughout it",
  candidates.every(
    (candidate) =>
      candidate.friendIds.length >= 2 &&
      candidate.friendIds.every((friendId) => holdsThroughout(friendId, candidate)) &&
      visible
        .filter((friendId) => !candidate.friendIds.includes(friendId))
        .every((friendId) => !holdsThroughout(friendId, candidate))
  ),
  'the sweep and the extension agree with the rows'
)
check(
  "Wednesday's full house is 20:00–22:00",
  fullHouse !== undefined && fullHouse.end === at(8, '22:00')
)
/*
 * Friday is the one shape in the database nobody designed, and it turned out to
 * be the best check here. `04-demo-second-friend.sql` gives the Demo Friend
 * 10:00–13:00 alone; `verify-availability.mjs` separately seeded the signed-in
 * Friend 08:30–11:00 back in issue 05. Neither script knew about the other, so
 * the overlap is an accident — and it is exactly the case step 5 has to get
 * right: the extension must stop at 11:00, where the shorter run ends, and
 * neither the 08:30–10:00 nor the 11:00–13:00 tail may become a card of its own.
 */
const friday = candidates.filter(
  (candidate) => candidate.start >= at(10, '00:00') && candidate.start < at(11, '00:00')
)

check(
  "Friday's accidental overlap is one Candidate, 10:00–11:00",
  friday.length === 1 && friday[0].start === at(10, '10:00') && friday[0].end === at(10, '11:00'),
  friday.map(describe).join(' / ')
)
check(
  'the lone tails either side of it produce nothing — one Friend free is not a suggestion',
  !candidates.some(
    (candidate) => candidate.start === at(10, '08:30') || candidate.start === at(10, '11:00')
  )
)
check(
  'no Candidate is dominated by another',
  candidates.every(
    (candidate) =>
      !candidates.some(
        (other) =>
          other.id !== candidate.id &&
          candidate.start >= other.start &&
          candidate.end <= other.end &&
          candidate.friendIds.every((id) => other.friendIds.includes(id))
      )
  )
)
check(
  'the ranking is count desc, then start asc',
  candidates.every((candidate, index) => {
    const previous = candidates[index - 1]
    return (
      previous === undefined ||
      previous.friendIds.length > candidate.friendIds.length ||
      (previous.friendIds.length === candidate.friendIds.length &&
        previous.start <= candidate.start)
    )
  })
)

/* ================================================================== *
 * 3. What the cards will say
 * ================================================================== */

console.log(`\n3. The glow and the pill, at groupSize ${groupSize}`)

/*
 * Asserted as the RULE, not as this Group's current outcome. The Group grew
 * from two Friends to three while this slice was being built, and the first
 * version of these checks — "every card glows and every card carries the pill",
 * which is exactly what a Group of two produces — would have gone red on a
 * change that was not a regression in anything.
 */
check(
  `the glow fires exactly when 2n > ${groupSize}`,
  candidates.every(
    (candidate) => glows(candidate, groupSize) === 2 * candidate.friendIds.length > groupSize
  )
)
check(
  'the pill appears exactly on a true full house',
  candidates.every(
    (candidate) => isFullHouse(candidate, groupSize) === candidate.friendIds.length >= groupSize
  )
)

console.log(
  `     ${candidates.filter((candidate) => glows(candidate, groupSize)).length} of ${candidates.length} glow · ` +
    `${candidates.filter((candidate) => isFullHouse(candidate, groupSize)).length} carry the pill`
)

/*
 * The rule ticket 09 chose the denominator for: hiding is a query tool, so it
 * can only ever SUPPRESS a glow. The same rows with one Friend filtered out
 * must not lift anything over the bar.
 */
const filtered = scanCandidates({
  slots: unpacked,
  visible: visible.slice(0, -1),
  hangouts: [],
  from: WINDOW_FROM,
})

check(
  'hiding a Friend manufactures no glow and no pill',
  filtered.candidates.every(
    (candidate) =>
      candidate.friendIds.length <= groupSize &&
      (!glows(candidate, groupSize) ||
        candidates.some(
          (before) =>
            before.friendIds.length >= candidate.friendIds.length && glows(before, groupSize)
        ))
  ),
  'the denominator is the whole Group, Hidden included'
)

/* ================================================================== *
 * 4. The horizon
 * ================================================================== */

console.log('\n4. The horizon clips rather than dropping')

const clipped = scanCandidates({
  slots: unpacked,
  visible,
  hangouts: [],
  from: at(6, '21:00'),
})

const clippedMonday = clipped.candidates.find(
  (candidate) => candidate.start >= at(6, '00:00') && candidate.start < at(7, '00:00')
)

check(
  "Monday's Candidate survives a horizon inside it, clipped to it",
  clippedMonday !== undefined &&
    clippedMonday.start === at(6, '21:00') &&
    clippedMonday.end === at(6, '23:00'),
  'a window that has already started is still a window you can meet in'
)
check(
  'a horizon past everything empties the list',
  scanCandidates({ slots: unpacked, visible, hangouts: [], from: at(30, '00:00') }).candidates
    .length === 0
)

/* ================================================================== *
 * 5. A Hangout over the full house
 * ================================================================== */

console.log('\n5. A Hangout blanks its window for everyone (issue 09 will supply these)')

const withHangout = scanCandidates({
  slots: unpacked,
  visible,
  hangouts: [{ startsAt: at(8, '20:00'), endsAt: at(8, '22:00') }],
  from: WINDOW_FROM,
})

check(
  "Wednesday's Candidate is gone once a Hangout covers it",
  !withHangout.candidates.some(
    (candidate) => candidate.start >= at(8, '00:00') && candidate.start < at(9, '00:00')
  )
)
check(
  "Monday's Candidate is untouched by a Wednesday Hangout",
  withHangout.candidates.some((candidate) => candidate.start === at(6, '19:00'))
)
check(
  'blanking every overlap still reads as Availability existing',
  scanCandidates({
    slots: unpacked,
    visible,
    hangouts: [{ startsAt: WINDOW_FROM, endsAt: WINDOW_TO }],
    from: WINDOW_FROM,
  }).anyAvailability,
  'which is what keeps the empty state off "nobody\'s free yet — draw your availability"'
)

/* ------------------------------------------------------------------ */

await supabase.auth.signOut()

console.log(
  failures.length === 0
    ? '\nAll checks passed.\n'
    : `\n${failures.length} check(s) failed:\n${failures.map((label) => `  · ${label}`).join('\n')}\n`
)
process.exit(failures.length === 0 ? 0 : 1)
