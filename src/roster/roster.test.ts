/**
 * The roster's rules, asserted rather than argued: what order the Friends come
 * in, whose row wins, who is Hidden, and which of them are the cal's Members.
 *
 * Runs on Node's own runner, like `identity.test.ts` — which is why the module
 * under test has **no imports at all**: a test file's specifiers have to
 * resolve under plain Node, so `@/` never appears on this path. That constraint
 * is also what shaped `roster.ts` into pure functions over structural types,
 * with the Postgres row and the React state kept out in `use-roster.ts`.
 *
 *     yarn test
 */
import {
  byId,
  membersOnly,
  mergeSelf,
  namesOf,
  rosterOrder,
  rosterStatus,
  toggled,
  withMember,
  withoutHidden,
} from './roster.ts'
import assert from 'node:assert/strict'
import test from 'node:test'

const entry = (id: string, name: string, complete = true) => ({
  id,
  name,
  // Any object stands for a finished identity; only null/not-null is read.
  identity: complete ? {} : null,
})

/* ================================================================== *
 * Order
 * ================================================================== */

test('the roster is alphabetical, case-insensitively', () => {
  const ordered = rosterOrder([entry('1', 'zoe'), entry('2', 'Ada'), entry('3', 'bruno')])

  assert.deepEqual(
    ordered.map((f) => f.name),
    ['Ada', 'bruno', 'zoe']
  )
})

test('a Friend who has not finished setup sorts after every Friend who has', () => {
  const ordered = rosterOrder([
    entry('1', 'Someone new', false),
    entry('2', 'Zoe'),
    entry('3', 'Ada'),
  ])

  assert.deepEqual(
    ordered.map((f) => f.name),
    ['Ada', 'Zoe', 'Someone new']
  )
})

test('order is stable when two Friends share a name', () => {
  // Two Friends may pick the same display name — nothing forbids it — and the
  // roster must not reshuffle them between renders.
  const twice = [entry('b', 'Sam'), entry('a', 'Sam')]

  assert.deepEqual(
    rosterOrder(twice).map((f) => f.id),
    rosterOrder(twice).map((f) => f.id)
  )
})

test('rosterOrder does not mutate what it is given', () => {
  const given = [entry('1', 'Zoe'), entry('2', 'Ada')]
  rosterOrder(given)

  assert.deepEqual(
    given.map((f) => f.name),
    ['Zoe', 'Ada']
  )
})

/* ================================================================== *
 * Your own row
 * ================================================================== */

test('your own row wins over the copy the roster query returned', () => {
  // The reason this exists: changing your hue writes through the session
  // provider, which knows nothing about the roster's query. Without the
  // overlay your own row would keep its old colour until a reload.
  const merged = mergeSelf(
    [
      { id: 'me', hue: 10 },
      { id: 'other', hue: 200 },
    ],
    { id: 'me', hue: 99 }
  )

  assert.deepEqual(merged, [
    { id: 'me', hue: 99 },
    { id: 'other', hue: 200 },
  ])
})

test('your own row is added when the query has not landed, or failed', () => {
  assert.deepEqual(mergeSelf([], { id: 'me', hue: 99 }), [{ id: 'me', hue: 99 }])
})

test('mergeSelf with no row of your own is the query, untouched', () => {
  const rows = [{ id: 'other', hue: 200 }]
  assert.deepEqual(mergeSelf(rows, null), rows)
})

/* ================================================================== *
 * Hidden
 * ================================================================== */

test('toggling Hidden adds, then removes', () => {
  const once = toggled(new Set<string>(), 'ada')
  assert.deepEqual([...once], ['ada'])
  assert.deepEqual([...toggled(once, 'ada')], [])
})

test('toggling Hidden leaves the set it was given alone', () => {
  // Hidden is React state, so a mutated Set would be the same object and
  // nothing would re-render.
  const before = new Set(['ada'])
  const after = toggled(before, 'bruno')

  assert.deepEqual([...before], ['ada'])
  assert.notEqual(after, before)
})

test('withoutHidden is the Friends the viewer is currently trying to meet', () => {
  const friends = [entry('ada', 'Ada'), entry('bruno', 'Bruno')]

  assert.deepEqual(
    withoutHidden(friends, new Set(['bruno'])).map((f) => f.id),
    ['ada']
  )
})

/* ================================================================== *
 * The cal's Members
 * ================================================================== */

test("the roster is the cal's Members, out of every Friend in the product", () => {
  const everyFriend = [entry('ada', 'Ada'), entry('bea', 'Bea'), entry('cyd', 'Cyd')]

  assert.deepEqual(
    membersOnly(everyFriend, new Set(['ada', 'cyd'])).map((f) => f.id),
    ['ada', 'cyd']
  )
})

test('a cal nobody is in is empty, not unfiltered', () => {
  // The member set is null while its read is in flight and is never coerced;
  // an empty one is an answer, and it means an empty sidebar.
  assert.deepEqual(membersOnly([entry('ada', 'Ada')], new Set()), [])
})

test('a Friend who is no longer a Member keeps their name and their face', () => {
  // The two maps are built from the full read, which is the whole reason the
  // read stays unscoped. `facesOf` drops ids it does not know, so under a
  // scoped read a Participant on a past Hangout goes missing from the face row
  // rather than going nameless, and `nameFor` prints "someone else" for a
  // live Friend.
  const everyFriend = [entry('ada', 'Ada'), entry('bea', 'Bea')]
  const members = new Set(['ada'])

  assert.deepEqual(
    membersOnly(everyFriend, members).map((f) => f.id),
    ['ada']
  )
  assert.equal(namesOf(everyFriend).get('bea'), 'Bea')
  assert.equal(byId(everyFriend).get('bea')?.id, 'bea')
})

test('names include the Friends who have not finished setup', () => {
  // A face needs a hue (`setUpOnly`); a provenance line needs only a name.
  assert.equal(namesOf([entry('new', 'Someone new', false)]).get('new'), 'Someone new')
})

test('a join folds in and a leave folds out, without touching the set given', () => {
  const before = new Set(['ada'])
  const joined = withMember(before, 'bea', true)

  assert.deepEqual([...joined].sort(), ['ada', 'bea'])
  assert.deepEqual([...withMember(joined, 'ada', false)], ['bea'])
  assert.deepEqual([...before], ['ada'])
})

test('a join the roster already knows about changes nothing', () => {
  // The read and the broadcast overlap by design: a Membership written between
  // the read being issued and the channel joining arrives twice or not at all.
  assert.deepEqual([...withMember(new Set(['ada']), 'ada', true)], ['ada'])
})

/* ================================================================== *
 * Both reads
 * ================================================================== */

test('nothing is ready until both reads have returned', () => {
  assert.equal(rosterStatus(null, null, false), 'loading')
  assert.equal(rosterStatus([entry('ada', 'Ada')], null, false), 'loading')
  assert.equal(rosterStatus(null, new Set(['ada']), false), 'loading')
  assert.equal(rosterStatus([entry('ada', 'Ada')], new Set(['ada']), false), 'ready')
})

test('either read failing is an error', () => {
  assert.equal(rosterStatus(null, null, true), 'error')
  assert.equal(rosterStatus([entry('ada', 'Ada')], new Set(['ada']), true), 'error')
})
