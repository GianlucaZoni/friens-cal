/**
 * friens-cal — issue 07: prove the Realtime stream from two browser-shaped
 * clients.
 *
 *   node --env-file=.env scripts/verify-realtime.mjs
 *
 * Needs the same `.env` as the other verify scripts: the publishable key, and
 * FRIEND_TEST_EMAIL / FRIEND_TEST_PASSWORD for a real Friend.
 *
 * Run it after pasting `supabase/03-realtime.sql`. Every check is one of issue
 * 07's Realtime acceptance criteria, so a clean run is the evidence that the
 * database half of the slice is done.
 *
 * ## Why this script exists rather than a SQL query
 *
 * A table that is not in the `supabase_realtime` publication **fails silently**.
 * The channel still reports SUBSCRIBED, because the channel is fine; it is the
 * publication that is empty. And a publishable key cannot read
 * `pg_publication_tables`, so the membership is not checkable from here — only
 * the behaviour is. That makes this the only honest test: subscribe, write from
 * somewhere else, and see whether it arrives.
 *
 * ## Two clients, which is the point rather than a convenience
 *
 * Both sign in as the **same Friend**, which is ticket 19's own case: "filtering
 * out your own session's events was rejected outright — it WOULD break your own
 * second device: drawing on a laptop must still reach the phone." Client A is the
 * phone and client B is the laptop. The app does not filter, so A hears B.
 *
 * It also means the cross-Friend case needs no second account: the read policy on
 * `availability` is `using (true)` and the subscription carries no filter, so the
 * stream does not know or care whose row it is. There is nothing per-Friend left
 * for a second account to exercise.
 *
 * Every row this script writes is **400+ days out** and it deletes what it
 * writes. Nothing in this product is ever auto-deleted (ticket 01), so a probe
 * left behind would live forever.
 */
import { createClient } from '@supabase/supabase-js'

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
  .filter(([, v]) => !v)
  .map(([k]) => k)

if (missing.length) {
  console.error(`✗ missing from .env: ${missing.join(', ')}`)
  process.exit(1)
}

const ok = (m) => console.log(`✓ ${m}`)
const note = (m) => console.log(`· ${m}`)
const die = (m, e) => {
  console.error(`✗ ${m}`)
  if (e) console.error(`  ${e.message ?? e} ${e?.code ? `(${e.code})` : ''}`)
  process.exit(1)
}

/** Long enough for a round trip through the WAL, short enough to fail a run. */
const EVENT_TIMEOUT_MS = 8000

/**
 * The next event a collector receives, or a rejection.
 *
 * Polling a buffer rather than resolving a promise per event, because the write
 * that triggers the event has to happen *after* the subscription is live and
 * *before* the wait begins — so the handler may fire while nothing is awaiting.
 */
const nextEvent = async (buffer, what) => {
  const deadline = Date.now() + EVENT_TIMEOUT_MS
  while (buffer.length === 0) {
    if (Date.now() > deadline) return null
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  note(`  ${what} arrived`)
  return buffer.shift()
}

/** A channel that is actually receiving, or a failure — never a silent maybe. */
const subscribed = (channel) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('channel never reached SUBSCRIBED')), 10_000)
    channel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer)
        resolve(channel)
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer)
        reject(error ?? new Error(status))
      }
    })
  })

const signIn = async (label) => {
  const client = createClient(url, key)
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) die(`sign-in failed for ${label}`, error)
  return { client, userId: data.user.id }
}

/* ---------------------------------------------------------------- *
 * 1. Two sessions as the same Friend — a phone and a laptop.
 * ---------------------------------------------------------------- */
const a = await signIn('the listener')
const b = await signIn('the writer')
ok(`two sessions signed in as ${email} — one listening, one writing`)

/* ---------------------------------------------------------------- *
 * 2. Subscribe, unfiltered.
 *
 * No `filter`, deliberately. There is no filter expression for "rows
 * overlapping the visible week" — the operators are per-column comparisons —
 * and one built from two of them would need the channel torn down and
 * re-subscribed on every calendar navigation (ticket 02 §6.4). Five clients, so
 * the whole table and filter in the browser.
 * ---------------------------------------------------------------- */
const inserts = []
const deletes = []
const friendUpdates = []

const availabilityChannel = a.client
  .channel('verify-availability')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'availability' },
    (payload) => inserts.push(payload)
  )
  .on(
    'postgres_changes',
    { event: 'DELETE', schema: 'public', table: 'availability' },
    (payload) => deletes.push(payload)
  )

const friendChannel = a.client
  .channel('verify-friend')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'friend' }, (payload) =>
    friendUpdates.push(payload)
  )

try {
  await subscribed(availabilityChannel)
  await subscribed(friendChannel)
} catch (e) {
  die('a Realtime channel would not subscribe — check the project is not paused', e)
}
ok('both channels are SUBSCRIBED')

/* ---------------------------------------------------------------- *
 * 3. An INSERT from the other session arrives with no reload.
 *
 * This is the check that fails when `03-realtime.sql` has not been pasted, and
 * it is the reason the message below is as specific as it is: nothing else about
 * the app misbehaves in that state.
 * ---------------------------------------------------------------- */
const probe = new Date(Date.now() + 400 * 86_400_000)
// Snapped to the half hour, because that is what a Slot is (CONTEXT.md) and an
// off-grid row would be invisible on the grid it is meant to be verifying.
probe.setUTCMinutes(probe.getUTCMinutes() < 30 ? 0 : 30, 0, 0)
const probeIso = probe.toISOString()

const { error: insertErr } = await b.client
  .from('availability')
  .insert({ friend_id: b.userId, slot_start: probeIso })
if (insertErr) die('the writing session could not insert a probe slot', insertErr)

/**
 * Take the probe back out, whatever happens next.
 *
 * Nothing in this product is ever auto-deleted (ticket 01), so a probe left
 * behind by a failed run lives forever — 400 days out, where nobody will look
 * for it and everybody will eventually find it. Every `die` past this point goes
 * through here first.
 */
const removeProbe = async () => {
  await b.client
    .from('availability')
    .delete()
    .eq('friend_id', b.userId)
    .eq('slot_start', probeIso)
}

const insert = await nextEvent(inserts, 'the INSERT event')
if (insert === null) {
  await removeProbe()
  die(
    'NO INSERT EVENT. The `availability` table is almost certainly not in the ' +
      'publication.\n' +
      '  Paste supabase/03-realtime.sql into the SQL Editor and run it, then run this again.\n' +
      '  (The channel subscribed fine — a table outside the publication emits ' +
      'nothing and reports nothing.)'
  )
}
ok('an INSERT from the other session arrives over Realtime, with no reload')

if (insert.new?.friend_id !== b.userId || insert.new?.slot_start !== probeIso) {
  await removeProbe()
  die(
    `the INSERT payload does not carry the row that was written — got ` +
      `${JSON.stringify(insert.new)}`
  )
}
ok('the INSERT payload carries `friend_id` and `slot_start` — the natural key')

/* ---------------------------------------------------------------- *
 * 4. Your own echo is the same row, so there is nothing to reconcile.
 *
 * Not a Realtime check so much as the reason no dedupe pass was written: the
 * client folds this row in by `(friend_id, slot_start)`, which is the key it
 * already painted optimistically under. Re-folding it is a no-op.
 * ---------------------------------------------------------------- */
const foldKey = (row) => `${row.friend_id}|${new Date(row.slot_start).getTime()}`
if (foldKey(insert.new) !== `${b.userId}|${probe.getTime()}`) {
  await removeProbe()
  die('the echo does not fold onto the key the optimistic row was painted under')
}
ok('the echo folds onto the same key as the optimistic row — no dedupe needed')

/* ---------------------------------------------------------------- *
 * 5. A DELETE arrives, and carries the whole key — WITHOUT
 *    `replica identity full`.
 *
 * The structural claim in `03-realtime.sql` section 2. The default replica
 * identity is the primary key; here the primary key IS the whole row, so a
 * delete payload is already everything the store needs to remove the row. If
 * this check ever fails, that is the moment to reconsider `replica identity
 * full` — and to notice it is a write-path cost paid on every statement.
 * ---------------------------------------------------------------- */
const { error: deleteErr } = await b.client
  .from('availability')
  .delete()
  .eq('friend_id', b.userId)
  .eq('slot_start', probeIso)
if (deleteErr) die('the writing session could not delete its probe slot', deleteErr)

const removed = await nextEvent(deletes, 'the DELETE event')
if (removed === null) {
  die(
    'NO DELETE EVENT. Deletes are what a union merge cannot express, so the ' +
      'grid would keep showing erased Availability until a reload.'
  )
}
ok('a DELETE from the other session arrives over Realtime')

if (removed.old?.friend_id !== b.userId || removed.old?.slot_start !== probeIso) {
  die(
    'the DELETE payload does not carry the full key, so `replica identity full` ' +
      `WOULD be needed after all — got ${JSON.stringify(removed.old)}`
  )
}
ok('the DELETE payload carries the full key — `replica identity full` is not needed')

note('and note the documented hole: RLS is NOT applied to DELETE events, so every')
note('  subscriber sees every delete. Harmless here — the read policy is')
note('  `using (true)` and the product is a count over other people\'s rows — but')
note('  it is why `allowlist` must never be published.')

/* ---------------------------------------------------------------- *
 * 6. `friend` is published too, which the heatmap's count depends on.
 *
 * A no-op update — the same value written back. Postgres writes a new row
 * version regardless, so it emits an event and changes nothing. Writing a
 * *different* hue would recolour a real person's whole grid, which is not a
 * thing a verify script should do.
 * ---------------------------------------------------------------- */
const { data: mine, error: readMineErr } = await b.client
  .from('friend')
  .select('hue')
  .eq('id', b.userId)
  .single()
if (readMineErr) die('could not read my own Friend row', readMineErr)

const { error: touchErr } = await b.client
  .from('friend')
  .update({ hue: mine.hue })
  .eq('id', b.userId)
if (touchErr) die('could not touch my own Friend row', touchErr)

const touched = await nextEvent(friendUpdates, 'the friend UPDATE event')
if (touched === null) {
  die(
    'NO EVENT ON `friend`. The roster would go stale, and that is not cosmetic: ' +
      'the heatmap counts the Friends the roster knows about, so a Friend it has ' +
      'not heard of holds Availability that is never counted.\n' +
      '  Paste supabase/03-realtime.sql — it publishes `friend` as well.'
  )
}
ok(`\`friend\` is published — a row change reaches other sessions (${touched.eventType})`)
note(`  hue left at ${mine.hue}; the update wrote the value it read.`)

/* ---------------------------------------------------------------- *
 * 7. What cannot be proved from here.
 * ---------------------------------------------------------------- */
await a.client.removeChannel(availabilityChannel)
await a.client.removeChannel(friendChannel)

note('publication MEMBERSHIP is not read directly — a publishable key cannot')
note('  reach pg_publication_tables. Confirm in the SQL Editor if you want it')
note('  stated rather than demonstrated:')
note("  select tablename from pg_publication_tables where pubname = 'supabase_realtime';")
note('')
note('token rotation is not exercised: it would need a session to live past its')
note('  access token. Ticket 02 could not confirm from the docs that Realtime')
note("  re-authenticates; the installed client's source settles it —")
note('  supabase-js 2.112.4 wires onAuthStateChange -> realtime.setAuth(token) on')
note('  TOKEN_REFRESHED, SIGNED_IN and INITIAL_SESSION. Evidence from the shipped')
note('  source, not from the documentation the ticket asked about.')

console.log('\nAll checks passed. Realtime is publishing `availability` and `friend`.')
process.exit(0)
