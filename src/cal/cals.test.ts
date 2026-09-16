/**
 * The list of cals as rules rather than as rendering: what order they come in,
 * what a join does to the list when the Code was one you already held, and what
 * `/g/:id` means before any query runs.
 *
 *     yarn test
 */
import { CAL_NAME_MAX, calOrder, calPath, isCalId, renameTo, withCal } from './cals.ts'
import assert from 'node:assert/strict'
import test from 'node:test'

const cal = (id: string, name: string) => ({ id, name })

/* ================================================================== *
 * Order
 * ================================================================== */

test('the list is alphabetical', () => {
  const ordered = calOrder([
    cal('c', 'uni leftovers'),
    cal('a', 'climbing crew'),
    cal('b', 'sunday roast'),
  ])
  assert.deepEqual(
    ordered.map((one) => one.name),
    ['climbing crew', 'sunday roast', 'uni leftovers']
  )
})

test('ordering ignores case, because nothing forces a name to be lower case', () => {
  const ordered = calOrder([cal('a', 'zebra'), cal('b', 'Apple'), cal('c', 'banana')])
  assert.deepEqual(
    ordered.map((one) => one.name),
    ['Apple', 'banana', 'zebra']
  )
})

test('two cals may share a name, and the order is still stable', () => {
  // Nothing in the schema stops it: `cal.name` has no unique constraint, and a
  // Friend can be in two cals a different set of people each called "climbing".
  // Without the id tie-break the comparator returns 0 and the order is whatever
  // the engine's sort did last.
  const ordered = calOrder([cal('b', 'climbing'), cal('a', 'climbing')])
  assert.deepEqual(
    ordered.map((one) => one.id),
    ['a', 'b']
  )
})

test('ordering copies, because the array it is given is React state', () => {
  const given = [cal('b', 'second'), cal('a', 'first')]
  const ordered = calOrder(given)
  assert.notEqual(ordered, given)
  assert.equal(given[0].name, 'second')
})

/* ================================================================== *
 * Folding a cal back in — the idempotent half of `join_cal`
 * ================================================================== */

test('a cal you did not hold is added', () => {
  const next = withCal([cal('a', 'first')], cal('b', 'second'))
  assert.deepEqual(
    next.map((one) => one.id),
    ['a', 'b']
  )
})

test('a Code you already hold replaces the row rather than adding a second', () => {
  // `join_cal` is idempotent and returns the cal either way, so the client
  // cannot tell a new Membership from an old one and must not try. Folding the
  // returned row in by id is what makes both outcomes the same code path.
  const next = withCal([cal('a', 'first'), cal('b', 'second')], cal('b', 'second, renamed'))
  assert.deepEqual(
    next.map((one) => one.name),
    ['first', 'second, renamed']
  )
})

test('folding a cal in leaves the list ordered', () => {
  const next = withCal([cal('a', 'apple'), cal('c', 'cherry')], cal('b', 'banana'))
  assert.deepEqual(
    next.map((one) => one.name),
    ['apple', 'banana', 'cherry']
  )
})

/* ================================================================== *
 * The route
 * ================================================================== */

test('a cal id is a path', () => {
  assert.equal(
    calPath('7c9e6679-7425-40de-944b-e07fc1f90ae7'),
    '/g/7c9e6679-7425-40de-944b-e07fc1f90ae7'
  )
})

test('a uuid is a cal id', () => {
  assert.ok(isCalId('7c9e6679-7425-40de-944b-e07fc1f90ae7'))
  assert.ok(isCalId('7C9E6679-7425-40DE-944B-E07FC1F90AE7'))
})

test('anything that is not a uuid is not a cal id, and never reaches Postgres', () => {
  // `.eq('id', 'nonsense')` comes back `22P02 invalid input syntax for type
  // uuid`, which is an error rather than an empty result — so a typed URL would
  // read as "we cannot reach your cals" instead of as "no such cal". This is
  // the guard that keeps the two apart.
  assert.ok(!isCalId('nonsense'))
  assert.ok(!isCalId(''))
  assert.ok(!isCalId(undefined))
  assert.ok(!isCalId('7c9e6679-7425-40de-944b-e07fc1f90ae'))
  assert.ok(!isCalId('7c9e6679-7425-40de-944b-e07fc1f90ae77'))
})

/* ================================================================== *
 * The name cap
 * ================================================================== */

test('a name caps at forty characters where it is typed', () => {
  // The column allows sixty (`cal_has_a_name`). Forty is the render budget: a
  // cal name sits in a list row beside a six-character Code and, from ticket
  // 03, in a dropdown pinned to its trigger's width.
  assert.equal(CAL_NAME_MAX, 40)
})

/* ================================================================== *
 * Renaming: what a typed draft is worth
 * ================================================================== */

test('a rename trims, the way `create_cal` does server-side', () => {
  assert.equal(renameTo('  climbing crew  ', 'padel'), 'climbing crew')
})

test('a draft that is empty or all spaces renames nothing', () => {
  // `cal_has_a_name` is `length(btrim(name)) between 1 and 60`, so a name of
  // spaces is a 23514 rather than a rename. The disabled button is what keeps a
  // Friend from meeting it.
  assert.equal(renameTo('', 'padel'), null)
  assert.equal(renameTo('   ', 'padel'), null)
})

test('a draft that is the name it already has renames nothing', () => {
  // Not tidiness: it is what makes the Rename button say whether pressing it
  // would do anything. Trailing space is the case that would otherwise write a
  // row for no change.
  assert.equal(renameTo('padel', 'padel'), null)
  assert.equal(renameTo(' padel ', 'padel'), null)
})

test('changing only the case is a rename', () => {
  // `calOrder` sorts case-insensitively, so the list will not move. The name a
  // Friend typed is still the name they meant.
  assert.equal(renameTo('Padel', 'padel'), 'Padel')
})

test('a name at the cap is fine and one over it is refused', () => {
  const atCap = 'x'.repeat(CAL_NAME_MAX)
  assert.equal(renameTo(atCap, 'padel'), atCap)
  // The input's `maxLength` is what a Friend sees stop them. This is the second
  // line, for a draft that reached here some other way: the column allows
  // sixty, so nothing downstream would refuse it.
  assert.equal(renameTo('x'.repeat(CAL_NAME_MAX + 1), 'padel'), null)
})

test('the cap is measured after trimming', () => {
  const atCap = 'x'.repeat(CAL_NAME_MAX)
  assert.equal(renameTo(`  ${atCap}  `, 'padel'), atCap)
})
