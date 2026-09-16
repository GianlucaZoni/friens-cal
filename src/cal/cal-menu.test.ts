/**
 * The two overflow menus, as lists rather than as markup. The claim worth a
 * test is which items are on which surface. The components below only render
 * what these say.
 *
 *     yarn test
 */
import { CAL_ACTION_LABEL, CAL_ACTION_VARIANT, calMenu, type CalAction } from './cal-menu.ts'
import assert from 'node:assert/strict'
import test from 'node:test'

test('the switcher holds Rename and View code, in that order', () => {
  assert.deepEqual(calMenu('switcher'), ['rename', 'view-code'])
})

test('a row on `/` holds Rename and Leave, in that order', () => {
  assert.deepEqual(calMenu('list'), ['rename', 'leave'])
})

test('Leave is on `/` and never on the switcher', () => {
  // Groups ticket 10 put Leave on `/`'s row and groups ticket 06 kept it off
  // the switcher: leaving is not a thing to do by accident while switching, and
  // the dialog that confirms it names every Hangout you would be marked Left
  // on.
  assert.ok(calMenu('list').includes('leave'))
  assert.ok(!calMenu('switcher').includes('leave'))
})

test('Leave is the one item drawn as destructive', () => {
  // Leaving is the only act on either menu that redrawing cannot undo, and the
  // variant is what the row is coloured by. Asserted over the union rather than
  // over `leave` alone, so adding a fourth item does not quietly inherit the
  // destructive treatment or quietly miss it.
  const listed = [...new Set<CalAction>([...calMenu('switcher'), ...calMenu('list')])]
  const destructive = listed.filter((action) => CAL_ACTION_VARIANT[action] === 'destructive')
  assert.deepEqual(destructive, ['leave'])
})

test('the two menus overlap on Rename and nowhere else', () => {
  // The sentence the build is to: the switcher's menu is the shortcut, `/` is
  // the complete set. Rename is the one act you want while looking at the thing
  // you are renaming, which is why it is on both.
  const shared = calMenu('switcher').filter((action) => calMenu('list').includes(action))
  assert.deepEqual(shared, ['rename'])
})

test('View code is only on the switcher, because a row on `/` already shows the Code', () => {
  assert.ok(calMenu('switcher').includes('view-code'))
  assert.ok(!calMenu('list').includes('view-code'))
})

test('every item a menu lists has a label to render', () => {
  const listed = new Set<CalAction>([...calMenu('switcher'), ...calMenu('list')])
  for (const action of listed) assert.equal(typeof CAL_ACTION_LABEL[action], 'string')
})

test('Leave is last on its menu, under the act that is not a one-way door', () => {
  // Order is the only friction a two-item menu has. Rename first, Leave under
  // it, so the destructive row is not where the cursor lands on the way in.
  const list = calMenu('list')
  assert.equal(list[list.length - 1], 'leave')
})
