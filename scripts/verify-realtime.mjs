/**
 * friens-cal — groups issue 01: prove the Realtime stream from two
 * browser-shaped clients, **after the move to broadcast**.
 *
 *   node --env-file=.env scripts/verify-realtime.mjs
 *
 * Needs the same `.env` as the other verify scripts: the publishable key, and
 * FRIEND_TEST_EMAIL / FRIEND_TEST_PASSWORD for a real Friend.
 *
 * Run it after pasting `supabase/08` through `11`. Every check is one of the
 * cutover's Realtime acceptance criteria, so a clean run is the evidence that
 * the database half of the slice is done.
 *
 * ## What changed, and why the old version of this file proved nothing
 *
 * v1's script tested `postgres_changes` on `availability` and `friend`.
 * [ADR-0004](../docs/adr/0004-broadcast-for-cal-scoped-realtime.md) moved
 * `availability`, `hangout` and `hangout_participant` onto private per-cal
 * broadcast topics and **removed them from the `supabase_realtime`
 * publication**. Left as it was, this script would still pass — on `friend`,
 * which did not move — while saying nothing at all about the three tables that
 * did.
 *
 * So it now checks three things the old one could not:
 *
 *   1. a change reaches another session over **broadcast**, on the cal's topic;
 *   2. the same change does **not** reach a `postgres_changes` subscriber,
 *      which is the publication drop, and the only half of ADR-0004 that closes
 *      anything;
 *   3. `friend` still does, because the product runs both mechanisms on purpose.
 *
 * Check 2 is a negative, and negatives are usually untrustworthy. This one is
 * not, because both subscriptions are open across the same write: the broadcast
 * arriving is proof the row was written, so the silence on the other channel is
 * a fact about the publication rather than about timing.
 *
 * ## Why this is a script rather than a SQL query
 *
 * A publishable key cannot read `pg_publication_tables`, so the membership is
 * not checkable from here — only the behaviour is. And a table outside the
 * publication **fails silently**: the channel still reports SUBSCRIBED, because
 * the channel is fine. That is what makes subscribe-write-and-look the only
 * honest test, and it cuts both ways now.
 *
 * ## Two clients, which is the point rather than a convenience
 *
 * Both sign in as the **same Friend**, which is ticket 19's own case: filtering
 * out your own session's events was rejected outright because it would break
 * your own second device. Client A is the phone and client B is the laptop.
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
 * The next event a collector receives, or null.
 *
 * Polling a buffer rather than resolving a promise per event, because the write
 * that triggers the event has to happen *after* the subscription is live and
 * *before* the wait begins — so the handler may fire while nothing is awaiting.
 */
const nextEvent = async (buffer, what, timeout = EVENT_TIMEOUT_MS) => {
  const deadline = Date.now() + timeout
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
 * 2. Which cal, which is a question this script did not used to have.
 *
 * Read rather than configured. `cal`'s select policy is
 * `id in (select private.my_cal_ids())`, so this returns exactly the cals this
 * Friend is a Member of — and an empty result is itself a finding, because
 * after the cutover every existing Friend is in one.
 * ---------------------------------------------------------------- */
const { data: cals, error: calErr } = await b.client
  .from('cal')
  .select('id, name, code')
  .order('name')

if (calErr) {
  die(
    'could not read `cal`. If this is `relation "public.cal" does not exist`, the ' +
      'migration has not been run:\n' +
      '  paste supabase/08-cal-and-membership.sql and 09-per-cal.sql into the SQL Editor.',
    calErr
  )
}
if (!cals.length) {
  die(
    `${email} is a Member of no cal. The cutover's 09-per-cal.sql puts every ` +
      'existing Friend into "spiritually unemployed" — check it ran.'
  )
}

const cal = cals[0]
ok(`the writer is in ${cals.length} cal(s); using "${cal.name}" (${cal.code})`)

/* ---------------------------------------------------------------- *
 * 3. Subscribe: one broadcast topic per hook, and one `postgres_changes`
 *    subscription that must stay silent.
 *
 * `private: true` is not decoration. It is what sends the channel join through
 * the `realtime.messages` select policy, which is where the cal boundary
 * actually lives — a public channel of the same name would be authorised by
 * nothing. If the join fails here, that policy is the first thing to look at.
 * ---------------------------------------------------------------- */
const inserts = []
const deletes = []
const hangoutEvents = []
const leaked = []
const friendUpdates = []

const topic = (stream) => `cal:${cal.id}:${stream}`

const availabilityChannel = a.client
  .channel(topic('availability'), { config: { private: true } })
  .on('broadcast', { event: 'INSERT' }, (message) => inserts.push(message.payload))
  .on('broadcast', { event: 'DELETE' }, (message) => deletes.push(message.payload))

const hangoutChannel = a.client
  .channel(topic('hangouts'), { config: { private: true } })
  .on('broadcast', { event: 'INSERT' }, (message) => hangoutEvents.push(message.payload))
  .on('broadcast', { event: 'DELETE' }, (message) => hangoutEvents.push(message.payload))

/*
 * The one that must hear nothing. This is the shape any holder of the
 * publishable key can open, which is exactly why the publication drop — and not
 * the client's choice of channel — is what closes ADR-0004's hole.
 */
const publicationChannel = a.client
  .channel('verify-publication-drop')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'availability' },
    (payload) => leaked.push(payload)
  )

const friendChannel = a.client
  .channel('verify-friend')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'friend' }, (payload) =>
    friendUpdates.push(payload)
  )

try {
  await subscribed(availabilityChannel)
  await subscribed(hangoutChannel)
} catch (e) {
  die(
    'a private broadcast channel would not subscribe. The `realtime.messages` ' +
      'select policy in supabase/11-realtime-per-cal.sql is what authorises the ' +
      'join — check it exists, and that this Friend is a Member of the cal.',
    e
  )
}

try {
  await subscribed(publicationChannel)
  await subscribed(friendChannel)
} catch (e) {
  die('a postgres_changes channel would not subscribe — check the project is not paused', e)
}
ok('all four channels are SUBSCRIBED — two private broadcast, two postgres_changes')

/* ---------------------------------------------------------------- *
 * 4. An INSERT reaches the other session over broadcast.
 * ---------------------------------------------------------------- */
/**
 * The same instant, compared as an instant.
 *
 * Not as text: PostgREST and Realtime render a `timestamptz` as
 * `2027-10-05T19:00:00+00:00` while `Date#toISOString` writes
 * `2027-10-05T19:00:00.000Z`. Those are the same moment and two different
 * strings, which is the distinction `slotKey` exists for in the app.
 */
const sameInstant = (x, y) => new Date(x).getTime() === new Date(y).getTime()

const probe = new Date(Date.now() + 400 * 86_400_000)
// Snapped to the half hour, because that is what a Slot is (CONTEXT.md) — and
// now because `availability_on_the_slot_grid` rejects anything else outright.
probe.setUTCMinutes(probe.getUTCMinutes() < 30 ? 0 : 30, 0, 0)
const probeIso = probe.toISOString()

const { error: insertErr } = await b.client
  .from('availability')
  .insert({ cal_id: cal.id, friend_id: b.userId, slot_start: probeIso })
if (insertErr) {
  die(
    'the writing session could not insert a probe slot. A `42501` here with a ' +
      'correct-looking row usually means `cal_id` is missing from the insert, or ' +
      'the Friend is not a Member of the cal it names.',
    insertErr
  )
}

/**
 * Take the probe back out, whatever happens next.
 *
 * Nothing in this product is ever auto-deleted (ticket 01), so a probe left
 * behind by a failed run lives forever — 400 days out, where nobody will look
 * for it and everybody will eventually find it. Every `die` past this point
 * goes through here first.
 */
const removeProbe = async () => {
  await b.client
    .from('availability')
    .delete()
    .eq('cal_id', cal.id)
    .eq('friend_id', b.userId)
    .eq('slot_start', probeIso)
}

const insert = await nextEvent(inserts, 'the INSERT message')
if (insert === null) {
  await removeProbe()
  die(
    'NO INSERT MESSAGE on `' +
      topic('availability') +
      '`.\n' +
      '  The broadcast trigger is almost certainly missing. Paste ' +
      'supabase/11-realtime-per-cal.sql and run this again.\n' +
      '  (The channel subscribed fine — a table with no trigger emits nothing ' +
      'and reports nothing.)'
  )
}
ok('an INSERT from the other session arrives over broadcast, with no reload')

if (
  insert.operation !== 'INSERT' ||
  insert.table !== 'availability' ||
  insert.record?.friend_id !== b.userId ||
  !sameInstant(insert.record?.slot_start, probeIso)
) {
  await removeProbe()
  die(`the INSERT payload does not carry the row that was written — got ${JSON.stringify(insert)}`)
}
ok('the payload is {operation, table, record, old_record} and carries the whole row')

if (insert.record.cal_id !== cal.id) {
  await removeProbe()
  die(`the INSERT carries cal_id ${insert.record.cal_id}, which is not the topic's cal`)
}
ok('and it names the cal the topic is for')

/* ---------------------------------------------------------------- *
 * 5. Your own echo is the same row, so there is nothing to reconcile.
 *
 * Not a Realtime check so much as the reason no dedupe pass was written: the
 * client folds this row in by `(friend_id, slot_start)` — the **two-part**
 * client key, which the cutover deliberately did not widen, because one cal is
 * on screen at a time.
 * ---------------------------------------------------------------- */
const foldKey = (row) => `${row.friend_id}|${new Date(row.slot_start).getTime()}`
if (foldKey(insert.record) !== `${b.userId}|${probe.getTime()}`) {
  await removeProbe()
  die('the echo does not fold onto the key the optimistic row was painted under')
}
ok('the echo folds onto the same key as the optimistic row — no dedupe needed')

/* ---------------------------------------------------------------- *
 * 6. THE PUBLICATION DROP — the check the old script could not make.
 *
 * The insert above definitely happened: §4 received it. So a `postgres_changes`
 * subscriber hearing nothing about it is a fact about `supabase_realtime`
 * rather than about timing, and that is the whole of ADR-0004's reason 1 —
 * anyone holding the publishable key can open this subscription, so the leak is
 * closed by the table leaving the publication and by nothing else.
 *
 * A short wait rather than the full timeout: the event it is looking for would
 * have arrived alongside the broadcast, which is already in hand.
 * ---------------------------------------------------------------- */
const leak = await nextEvent(leaked, 'a postgres_changes event (it should not)', 1500)
if (leak !== null) {
  await removeProbe()
  die(
    '`availability` IS STILL IN THE PUBLICATION. A postgres_changes subscriber ' +
      'received the write, so every holder of the publishable key still receives ' +
      'every delete on this table — including the cal, the Friend and the time.\n' +
      '  Run the three `alter publication ... drop table` statements at the ' +
      'bottom of supabase/11-realtime-per-cal.sql.'
  )
}
ok('`availability` is NOT in the supabase_realtime publication — the delete hole is closed')

/* ---------------------------------------------------------------- *
 * 7. A DELETE arrives, and carries the whole OLD row.
 *
 * Richer than what it replaced, and worth asserting rather than assuming: a
 * `postgres_changes` delete on an RLS'd table is trimmed to primary-key
 * columns, so the client could not have audited the cal even if it wanted to.
 * A broadcast delete is whatever the trigger sent, which is `OLD` in full.
 * ---------------------------------------------------------------- */
const { error: deleteErr } = await b.client
  .from('availability')
  .delete()
  .eq('cal_id', cal.id)
  .eq('friend_id', b.userId)
  .eq('slot_start', probeIso)
if (deleteErr) die('the writing session could not delete its probe slot', deleteErr)

const removed = await nextEvent(deletes, 'the DELETE message')
if (removed === null) {
  die(
    'NO DELETE MESSAGE. Deletes are what a union merge cannot express, so the ' +
      'grid would keep showing erased Availability until a reload.'
  )
}
ok('a DELETE from the other session arrives over broadcast')

if (
  removed.record !== null ||
  removed.old_record?.cal_id !== cal.id ||
  removed.old_record?.friend_id !== b.userId ||
  !sameInstant(removed.old_record?.slot_start, probeIso)
) {
  die(`the DELETE payload does not carry the whole old row — got ${JSON.stringify(removed)}`)
}
ok('the DELETE carries `old_record` in full, cal_id included')

/* ---------------------------------------------------------------- *
 * 8. The second topic, and both tables on it.
 *
 * `cal:<id>:hangouts` carries `hangout` and `hangout_participant` on one
 * channel, because the topics were chosen to map onto the two hooks rather than
 * onto the three tables. So the check is that both tables arrive here and that
 * each says which one it is — that `table` field is the only thing keeping a
 * Participant row out of the Hangout map in `use-hangouts.ts`.
 *
 * 400 days out, so the per-cal exclusion constraint has nothing to collide
 * with, and cancelled at the end — which takes the Participant row with it by
 * cascade and produces the second delete this section does not wait for.
 * ---------------------------------------------------------------- */
const hangoutStart = new Date(probe.getTime() + 86_400_000)
const hangoutEnd = new Date(hangoutStart.getTime() + 3_600_000)

const { data: hangout, error: hangoutErr } = await b.client
  .from('hangout')
  .insert({
    cal_id: cal.id,
    starts_at: hangoutStart.toISOString(),
    ends_at: hangoutEnd.toISOString(),
    title: 'verify-realtime probe',
    created_by: b.userId,
  })
  .select('id, cal_id')
  .single()
if (hangoutErr) die('the writing session could not confirm a probe Hangout', hangoutErr)

const cancelProbe = async () => {
  await b.client.from('hangout').delete().eq('id', hangout.id)
}

const { error: seatErr } = await b.client
  .from('hangout_participant')
  .insert({ hangout_id: hangout.id, cal_id: hangout.cal_id, friend_id: b.userId })
if (seatErr) {
  await cancelProbe()
  die('the writing session could not seed itself as a Participant', seatErr)
}

const seen = new Set()
for (let i = 0; i < 2; i += 1) {
  const event = await nextEvent(hangoutEvents, 'a hangouts-topic message')
  if (event === null) break
  seen.add(event.table)
}

if (!seen.has('hangout') || !seen.has('hangout_participant')) {
  await cancelProbe()
  die(
    `only [${[...seen].join(', ')}] arrived on ${topic('hangouts')}. Both tables ` +
      'publish to this one topic, and `use-hangouts.ts` tells them apart by the ' +
      '`table` field — check both triggers in 11-realtime-per-cal.sql.'
  )
}
ok('`hangout` and `hangout_participant` both arrive on the cal\'s hangouts topic, named')

await cancelProbe()
note('  probe Hangout cancelled; the cascade took its Participant row with it')

/* ---------------------------------------------------------------- *
 * 9. `friend` is STILL on postgres_changes, and still published.
 *
 * The product runs both mechanisms at once on purpose (ADR-0004), and this is
 * the half that did not move: identity is global, so `friend`'s reads are
 * unrestricted and the original reasoning still holds for it word for word. It
 * is also the only path by which a brand-new account reaches an already-running
 * client, which a later slice depends on.
 *
 * A no-op update — the same value written back. Postgres writes a new row
 * version regardless, so it emits an event and changes nothing. Writing a
 * *different* hue would recolour a real person's whole grid.
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
    'NO EVENT ON `friend`. It must stay in the publication: it is the only way a ' +
      'brand-new account reaches a client that has already read the roster.\n' +
      '  11-realtime-per-cal.sql drops three tables and must not have dropped ' +
      'this one — check `select tablename from pg_publication_tables where ' +
      "pubname = 'supabase_realtime'` shows `friend`."
  )
}
ok(`\`friend\` is still published on postgres_changes (${touched.eventType})`)
note(`  hue left at ${mine.hue}; the update wrote the value it read.`)

/* ---------------------------------------------------------------- *
 * 10. What cannot be proved from here.
 * ---------------------------------------------------------------- */
await a.client.removeChannel(availabilityChannel)
await a.client.removeChannel(hangoutChannel)
await a.client.removeChannel(publicationChannel)
await a.client.removeChannel(friendChannel)

note('a Friend being REFUSED another cal\'s topic is not exercised: it needs a')
note('  second cal this account is not in, and a verify script that joins one')
note('  would have to create it. Check it in the SQL Editor instead —')
note("  set local role authenticated; set local request.jwt.claims = '{\"sub\":…}';")
note("  set local realtime.topic to 'cal:<other id>:availability';")
note('  select count(*) from realtime.messages;   -- expect 0')
note('')
note('publication MEMBERSHIP is still not read directly — a publishable key')
note('  cannot reach pg_publication_tables. §6 demonstrates the drop instead of')
note('  stating it, which is the stronger of the two anyway.')
note('')
note('token rotation is not exercised: it would need a session to live past its')
note('  access token. supabase-js 2.112.4 wires onAuthStateChange ->')
note('  realtime.setAuth(token) on TOKEN_REFRESHED, SIGNED_IN and')
note('  INITIAL_SESSION, which is what makes a private channel carry the')
note('  Friend. Evidence from the shipped source, not from the documentation.')

console.log('\nAll checks passed. Broadcast carries the three cal-scoped tables; `friend` does not.')
process.exit(0)
