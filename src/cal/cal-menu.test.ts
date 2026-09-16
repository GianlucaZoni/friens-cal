/**
 * The two overflow menus, as lists rather than as markup. The claim worth a
 * test is which items are on which surface. The components below only render
 * what these say.
 *
 *     yarn test
 */
import { CAL_ACTION_LABEL, calMenu, type CalAction } from './cal-menu.ts'
import assert from 'node:assert/strict'
import test from 'node:test'

test('the switcher holds Rename and View code, in that order', () => {
  assert.deepEqual(calMenu('switcher'), ['rename', 'view-code'])
})

test('a row on `/` holds Rename', () => {
  assert.deepEqual(calMenu('list'), ['rename'])
})

test('Leave is on neither menu yet, and on the switcher it never will be', () => {
  // Groups ticket 10 put Leave on `/`'s row and groups ticket 06 kept it off
  // the switcher: leaving is not a thing to do by accident while switching, and
  // the dialog that confirms it names every Hangout you would be marked Left
  // on. Ticket 05 adds it to `list` here. Read as strings, so this test still
  // says something once `CalAction` has a third member.
  const asStrings = (surface: 'switcher' | 'list') => calMenu(surface) as readonly string[]
  assert.ok(!asStrings('switcher').includes('leave'))
  assert.ok(!asStrings('list').includes('leave'))
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
