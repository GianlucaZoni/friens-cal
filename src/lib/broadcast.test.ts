/**
 * The boundary where a broadcast message becomes a typed row.
 *
 *     yarn test
 *
 * Runs on Node's own runner, so the module under test imports only bare
 * specifiers, never `@/`.
 *
 * Every payload below is the literal shape `realtime.broadcast_changes()`
 * builds — read off the installed function's source and confirmed against
 * `realtime.messages` on a local stack, not guessed from the docs. If Supabase
 * ever renames a key, this is the file that says so.
 */
import { calTopic, rowChange } from './broadcast.ts'
import assert from 'node:assert/strict'
import test from 'node:test'

type Slot = { cal_id: string; friend_id: string; slot_start: string }

const CAL = '44849f7b-11c8-4caf-8c9b-09af37908658'

const slot: Slot = {
  cal_id: CAL,
  friend_id: '4f7dde4f-2b3e-4551-b136-f4c175d93cd9',
  slot_start: '2026-09-23T19:00:00+00:00',
}

const insert = {
  id: '611ae913-2827-4fca-b801-71baf83b80ac',
  operation: 'INSERT',
  schema: 'public',
  table: 'availability',
  record: slot,
  old_record: null,
}

const remove = { ...insert, operation: 'DELETE', record: null, old_record: slot }

test('the topic names the cal and the stream', () => {
  assert.equal(calTopic(CAL, 'availability'), `cal:${CAL}:availability`)
  assert.equal(calTopic(CAL, 'hangouts'), `cal:${CAL}:hangouts`)
})

test('an insert carries the whole row', () => {
  const change = rowChange<Slot>(insert, 'availability')
  assert.equal(change?.operation, 'INSERT')
  assert.deepEqual(change?.record, slot)
  assert.equal(change?.old_record, null)
})

test('a delete carries the whole OLD row, cal included', () => {
  const change = rowChange<Slot>(remove, 'availability')
  assert.equal(change?.operation, 'DELETE')
  assert.equal(change?.record, null)
  // The half `postgres_changes` could not deliver: under RLS a delete payload is
  // trimmed to key columns, so `cal_id` would have been absent.
  assert.equal(change?.old_record?.cal_id, CAL)
})

test('another table on the same topic is not this one', () => {
  // `useHangouts` subscribes to one topic carrying two tables, so this is the
  // only thing keeping a Participant row out of the Hangout fold.
  assert.equal(rowChange({ ...insert, table: 'hangout_participant' }, 'hangout'), null)
})

test('a payload with nothing to fold is dropped', () => {
  assert.equal(rowChange({ ...insert, record: null }, 'availability'), null)
  assert.equal(rowChange({ ...remove, old_record: null }, 'availability'), null)
})

test('junk is dropped rather than thrown on', () => {
  // A handler that threw here would take down the channel for a message the
  // client cannot use anyway.
  assert.equal(rowChange(null, 'availability'), null)
  assert.equal(rowChange('INSERT', 'availability'), null)
  assert.equal(
    rowChange({ operation: 'TRUNCATE', table: 'availability', record: slot }, 'availability'),
    null
  )
  assert.equal(rowChange({}, 'availability'), null)
})
