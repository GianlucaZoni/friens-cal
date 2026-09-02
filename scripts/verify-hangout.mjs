/**
 * friens-cal — issue 09: prove the `hangout` tables' constraints and their two
 * locks from a browser-shaped client.
 *
 *   node --env-file=.env scripts/verify-hangout.mjs
 *
 * Needs the same `.env` as the other verify scripts: the publishable key, and
 * FRIEND_TEST_EMAIL / FRIEND_TEST_PASSWORD for a real Friend.
 *
 * Run it after pasting `supabase/05-hangout.sql` into the SQL Editor. Every
 * check below is one of issue 09's database acceptance criteria, so a clean run
 * is the evidence that the database half of the slice is done.
 *
 * **Every authenticated insert carries `created_by`, as of issue 10.**
 * `06-hangout-lifecycle.sql` §1 makes the insert policy
 * `with check (created_by = (select auth.uid()))`, so an insert that omits it is
 * refused with `42501` — and two of the probes below would then report the
 * wrong refusal (a permission error where they are testing a check
 * constraint). The anonymous insert in §1 deliberately still omits it: it is
 * refused by the grant, before any policy is consulted.
 *
 * ## What only a script can prove
 *
 * Three of these are the reason this file exists rather than a paragraph
 * claiming the SQL is right:
 *
 * 1. **The exclusion constraint**, which is simultaneously a product rule (no
 *    two Hangouts overlap) and the concurrency answer (the confirm race cannot
 *    be won twice). Asserting it in prose is asserting that a GiST index was
 *    built; running two inserts is knowing.
 * 2. **That the range is half-open.** `tstzrange(a, b)` defaults to `[)`, so
 *    back-to-back plans are legal. If that default were ever `[]` the product
 *    would silently forbid two plans in one evening and nobody would find out
 *    from reading the migration.
 * 3. **The grants, which are a second lock independent of RLS** (ADR-0001).
 *    `hangout_participant` has `select`, `insert` and a **column-scoped**
 *    `update (left_at)` and no `delete` at all — three refusals that a policy
 *    review cannot see, because there is no policy to read.
 *
 * ## It seeds one Hangout and leaves it
 *
 * Every probe below is in **2030** and is deleted. Then, at the end, it
 * confirms the Friday Candidate that `verify-candidates.mjs` reports — 10 Sep
 * 2027, 10:00–11:00 — with **the Friends who actually hold that Availability**,
 * which is what "Participants seeded from the Candidate's Friend set" means.
 * That leaves the app something to render: a pinned card, a block on everyone's
 * grid, and one Candidate fewer in the sidebar.
 *
 * It is idempotent — a second run finds the Hangout already there and says so —
 * and it deliberately leaves Monday and Wednesday alone, so there is still a
 * Candidate to confirm from the UI.
 */
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

/** Postgres's own codes, named. Guessing at these is how a check passes wrongly. */
const CHECK_VIOLATION = '23514'
const EXCLUSION_VIOLATION = '23P01'
const INSUFFICIENT_PRIVILEGE = '42501'
/** PostgREST's "that table is not in my schema cache" — i.e. it does not exist. */
const NO_SUCH_TABLE = 'PGRST205'

const SLOT_MS = 30 * 60_000

/** A wall clock in Rome, as an ISO instant — how a Hangout's bounds are written. */
const romeAt = (year, month, day, hour, minute = 0) =>
  new Date(new TZDate(year, month - 1, day, hour, minute, ROME).getTime()).toISOString()

/** Long enough for a round trip through the WAL, short enough to fail a run. */
const EVENT_TIMEOUT_MS = 8000

const nextEvent = async (buffer, what) => {
  const deadline = Date.now() + EVENT_TIMEOUT_MS
  while (buffer.length === 0) {
    if (Date.now() > deadline) return null
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  note(`  ${what} arrived`)
  return buffer.shift()
}

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

/* ---------------------------------------------------------------- *
 * 1. Anonymous first, while there is still no session.
 *
 * Both tables. `hangout` is the one that matters most: it is the only table in
 * the schema whose rows are *entirely* group-readable and group-writable, so a
 * missing grant here would be an open write endpoint rather than a leak.
 * ---------------------------------------------------------------- */
const anon = createClient(url, key)

const { data: leakedHangouts, error: anonHangoutErr } = await anon.from('hangout').select('*')
if (!anonHangoutErr && leakedHangouts?.length) {
  die(`ANONYMOUS READ RETURNED ${leakedHangouts.length} HANGOUT ROW(S) — the locks are not on`)
}
ok('anonymous read of `hangout` is refused')

const { data: leakedPeople, error: anonPeopleErr } = await anon
  .from('hangout_participant')
  .select('*')
if (!anonPeopleErr && leakedPeople?.length) {
  die(`ANONYMOUS READ RETURNED ${leakedPeople.length} PARTICIPANT ROW(S) — the locks are not on`)
}
ok('anonymous read of `hangout_participant` is refused')

const { error: anonWriteErr } = await anon
  .from('hangout')
  .insert({ starts_at: romeAt(2030, 1, 1, 20), ends_at: romeAt(2030, 1, 1, 22) })
if (!anonWriteErr) die('AN ANONYMOUS CLIENT CREATED A HANGOUT — the insert grant reaches `anon`')
ok('anonymous insert into `hangout` is refused')

/* ---------------------------------------------------------------- *
 * 2. Sign in.
 * ---------------------------------------------------------------- */
const supabase = createClient(url, key)
const { data: auth, error: signInErr } = await supabase.auth.signInWithPassword({
  email,
  password,
})
if (signInErr) die('sign-in failed', signInErr)
const me = auth.user.id
ok(`signed in as ${auth.user.email}`)

/* ---------------------------------------------------------------- *
 * 3. A Friend reads both tables, unfiltered.
 *
 * Unfiltered is the criterion, not a convenience: *a confirmed Hangout shows on
 * everyone's calendar — including non-Participants*, so a self-scoped read
 * policy would return the same result today and break that later.
 * ---------------------------------------------------------------- */
const { error: readHangoutErr } = await supabase.from('hangout').select('id, starts_at, ends_at')
if (readHangoutErr) {
  die(
    readHangoutErr.code === NO_SUCH_TABLE
      ? 'there is no `hangout` table yet.\n' +
          '  Paste `supabase/05-hangout.sql` into the Supabase SQL Editor and run it once.\n' +
          '  Nothing in this repo can create it — `.env` holds the publishable key only (ADR-0001).'
      : readHangoutErr.code === INSUFFICIENT_PRIVILEGE
        ? 'reading `hangout` is permission-denied — §3 of the SQL did not run'
        : 'reading `hangout` failed',
    readHangoutErr.code === NO_SUCH_TABLE ? undefined : readHangoutErr
  )
}
ok('a Friend reads `hangout` unfiltered')

const { error: readPeopleErr } = await supabase
  .from('hangout_participant')
  .select('hangout_id, friend_id, left_at')
if (readPeopleErr) {
  die(
    readPeopleErr.code === INSUFFICIENT_PRIVILEGE
      ? 'reading `hangout_participant` is permission-denied — §4 of the SQL did not run'
      : 'reading `hangout_participant` failed',
    readPeopleErr
  )
}
ok('a Friend reads `hangout_participant` unfiltered')

/* ---------------------------------------------------------------- *
 * 4. The shape constraints, before anything is created.
 * ---------------------------------------------------------------- */
const { error: backwardsErr } = await supabase
  .from('hangout')
  .insert({ starts_at: romeAt(2030, 1, 2, 22), ends_at: romeAt(2030, 1, 2, 20), created_by: me })
if (backwardsErr?.code !== CHECK_VIOLATION) {
  die('a Hangout that ends before it starts was accepted', backwardsErr ?? undefined)
}
ok('a Hangout that ends before it starts is refused')

/*
 * The 30-minute grid, and it is worth a check rather than a comment for a
 * reason that is the opposite of the obvious one. Postgres does **not** enforce
 * immutability in a check constraint, so §1's careful
 * `date_part('epoch', ts - <literal>)` spelling could be "simplified" to
 * `extract(minute from starts_at)` and the migration would still run — it would
 * simply start answering differently depending on the connection's `TimeZone`.
 * A constraint that is accepted and wrong is exactly what a behavioural check
 * is for.
 */
const { error: offGridErr } = await supabase
  .from('hangout')
  .insert({
    starts_at: romeAt(2030, 1, 3, 20, 17),
    ends_at: romeAt(2030, 1, 3, 22),
    created_by: me,
  })
if (offGridErr?.code !== CHECK_VIOLATION) {
  die(
    'a Hangout starting at :17 was accepted — coverage is now a fuzzy comparison',
    offGridErr ?? undefined
  )
}
ok('a Hangout off the 30-minute grid is refused (ticket 07 §6)')

/* ---------------------------------------------------------------- *
 * 5. Confirm one, and seed its Participants — including somebody else's.
 *
 * The cross-Friend insert is the question ticket 07 §8 left open and
 * `05-hangout.sql` answers as flat trust. It is the one thing about this table
 * that a policy file cannot show you is *intended* rather than overlooked.
 * ---------------------------------------------------------------- */
const { data: roster, error: rosterErr } = await supabase.from('friend').select('id, display_name')
if (rosterErr) die('could not read the roster', rosterErr)

const somebodyElse = roster.find((friend) => friend.id !== me) ?? null

const { data: mine, error: createErr } = await supabase
  .from('hangout')
  .insert({
    starts_at: romeAt(2030, 1, 4, 20),
    ends_at: romeAt(2030, 1, 4, 23),
    title: 'Probe',
    created_by: me,
  })
  .select('id, starts_at, ends_at, title, created_at')
  .single()
if (createErr) die('creating a Hangout failed', createErr)
ok('a Friend confirms a Hangout — anyone may, flat trust, no ownership')

const seeded = [me, ...(somebodyElse ? [somebodyElse.id] : [])].map((friendId) => ({
  hangout_id: mine.id,
  friend_id: friendId,
}))

const { error: seedErr } = await supabase.from('hangout_participant').insert(seeded)
if (seedErr) die('seeding Participants failed', seedErr)
ok(
  somebodyElse
    ? `Participants are seeded for OTHER Friends too (${somebodyElse.display_name ?? 'a second Friend'})`
    : 'Participants are seeded — only one Friend in this Group, so the cross-Friend case is untested'
)
if (!somebodyElse) {
  note('  add a second Friend from the dashboard to exercise the flat-trust insert')
}

/*
 * Idempotent, which is what makes the confirm path's retry safe. `upsert` with
 * `ignoreDuplicates` is `insert ... on conflict do nothing` and needs no update
 * grant — which matters, because the update grant here is column-scoped to
 * `left_at` and a merge-duplicates upsert would be refused by it.
 */
const { error: reseedErr } = await supabase
  .from('hangout_participant')
  .upsert(seeded, { onConflict: 'hangout_id,friend_id', ignoreDuplicates: true })
if (reseedErr) die('re-seeding the same Participants is not idempotent', reseedErr)
ok('seeding the same Participants twice is a no-op — the confirm retry is free')

/* ---------------------------------------------------------------- *
 * 6. THE EXCLUSION CONSTRAINT, both ways round.
 * ---------------------------------------------------------------- */
const { error: overlapErr } = await supabase
  .from('hangout')
  .insert({ starts_at: romeAt(2030, 1, 4, 22), ends_at: romeAt(2030, 1, 5, 1), created_by: me })
if (overlapErr?.code !== EXCLUSION_VIOLATION) {
  die(
    'AN OVERLAPPING HANGOUT WAS ACCEPTED — `btree_gist` or the constraint is missing, ' +
      'and the confirm race now has two winners',
    overlapErr ?? undefined
  )
}
ok(`an overlapping Hangout is refused with ${EXCLUSION_VIOLATION} (ticket 08 §7)`)
note('  which is also the confirm race: the loser converts into a Join, client-side')

/*
 * The other half, and the one a wrong bound spelling would break silently:
 * `[)` means a plan ending at 23:00 and one starting at 23:00 do not overlap.
 */
const { data: adjacent, error: adjacentErr } = await supabase
  .from('hangout')
  .insert({ starts_at: romeAt(2030, 1, 4, 23), ends_at: romeAt(2030, 1, 5, 1), created_by: me })
  .select('id')
  .single()
if (adjacentErr) {
  die(
    'A BACK-TO-BACK HANGOUT WAS REFUSED — the range is inclusive, so the product now ' +
      'silently forbids two plans in one evening',
    adjacentErr
  )
}
ok('a back-to-back Hangout is allowed — the range is half-open, `[)`')

/* ---------------------------------------------------------------- *
 * 7. `hangout_participant`'s three refusals — the grant half of the lock.
 * ---------------------------------------------------------------- */
const { error: deleteErr } = await supabase
  .from('hangout_participant')
  .delete()
  .eq('hangout_id', mine.id)
  .eq('friend_id', me)
if (deleteErr?.code !== INSUFFICIENT_PRIVILEGE) {
  die(
    'A FRIEND DELETED THEIR OWN PARTICIPANT ROW — Left has to be `left_at`, not a delete, ' +
      'or the next overlapping Availability re-offers "Join?" to somebody who walked out',
    deleteErr ?? undefined
  )
}
ok('deleting a Participant row is refused — there is no delete grant at all')

const { error: keyErr } = await supabase
  .from('hangout_participant')
  .update({ hangout_id: adjacent.id })
  .eq('hangout_id', mine.id)
  .eq('friend_id', me)
if (keyErr?.code !== INSUFFICIENT_PRIVILEGE) {
  die(
    'A FRIEND MOVED THEIR PARTICIPANT ROW ONTO ANOTHER HANGOUT — the update grant is not ' +
      'column-scoped to `left_at`',
    keyErr ?? undefined
  )
}
ok('updating `hangout_id` is refused — the update grant is column-scoped to `left_at`')

const leftAt = new Date().toISOString()
const { data: leftRows, error: leaveErr } = await supabase
  .from('hangout_participant')
  .update({ left_at: leftAt })
  .eq('hangout_id', mine.id)
  .eq('friend_id', me)
  .select('friend_id, left_at')
if (leaveErr) die('setting my own `left_at` failed', leaveErr)
if (leftRows.length !== 1) die(`setting my own \`left_at\` affected ${leftRows.length} rows`)
ok('a Friend sets their own `left_at` — Leave (ticket 07 §8)')

const { data: clearedRows, error: rejoinErr } = await supabase
  .from('hangout_participant')
  .update({ left_at: null })
  .eq('hangout_id', mine.id)
  .eq('friend_id', me)
  .select('friend_id, left_at')
if (rejoinErr) die('clearing my own `left_at` failed', rejoinErr)
if (clearedRows[0]?.left_at !== null) die('clearing `left_at` did not stick')
ok('and clears it again — which is how issue 10 re-Joins from the 3-dots')

if (somebodyElse) {
  /*
   * RLS turns a forbidden update into a **no-op**, not an error — the same
   * shape `verify-availability.mjs` asserts for a forbidden delete. So the
   * evidence is the row count, and asserting `error === null` here would pass
   * against a policy that had been removed entirely.
   */
  const { data: theirRows, error: theirErr } = await supabase
    .from('hangout_participant')
    .update({ left_at: leftAt })
    .eq('hangout_id', mine.id)
    .eq('friend_id', somebodyElse.id)
    .select('friend_id')
  if (theirErr)
    die("updating another Friend's `left_at` errored rather than matching nothing", theirErr)
  if (theirRows.length !== 0) {
    die(`A FRIEND MADE SOMEBODY ELSE LEAVE A HANGOUT — ${theirRows.length} row(s) updated`)
  }
  ok("another Friend's `left_at` matches no rows — Leave is yours alone")
}

/* ---------------------------------------------------------------- *
 * 7b. THE LOSING CONFIRM'S OWN LOOKUP, run against the real schema.
 *
 * The exclusion constraint is only half of ticket 08 §8. The other half is
 * client-side — `joinTheWinner` in `use-hangouts.ts` — and a click cannot drive
 * it from here: pointer events do not reach the app in the Browser pane this
 * project is verified in (a known local limitation, recorded in issue 08's
 * build notes). So the statements it issues are run here instead, in the same
 * order and with the same options, against the same schema.
 *
 * Three things this pins, each of which was wrong at some point while the slice
 * was being built:
 * ---------------------------------------------------------------- */

/*
 * 1. The winner lookup finds the Hangout that beat us, over the range the
 *    Candidate covered.
 */
const { data: found, error: findErr } = await supabase
  .from('hangout')
  .select('id, starts_at, ends_at')
  .lt('starts_at', romeAt(2030, 1, 4, 23))
  .gt('ends_at', romeAt(2030, 1, 4, 20))
  .order('starts_at')
  .limit(1)
  .maybeSingle()
if (findErr) die("the losing confirm's lookup for the winner failed", findErr)
if (found?.id !== mine.id) die('the winner lookup found the wrong Hangout, or none')
ok("the losing confirm's lookup finds the Hangout that won")

/*
 * 2. **The regression the review caught.** The exclusion constraint forbids two
 *    Hangouts overlapping *each other* — it says nothing about how many may sit
 *    inside one Candidate's range. `mine` (20:00–23:00) and `adjacent`
 *    (23:00–01:00) are disjoint and legal, and a 20:00–01:00 Candidate overlaps
 *    BOTH. A bare `maybeSingle()` answers PGRST116 on two rows and the client
 *    falls through to the error AC 4 forbids; `.order().limit(1)` returns the
 *    earliest, which is the honest reading of "the Hangout that won".
 */
const { data: earliest, error: manyErr } = await supabase
  .from('hangout')
  .select('id, starts_at')
  .lt('starts_at', romeAt(2030, 1, 5, 1))
  .gt('ends_at', romeAt(2030, 1, 4, 20))
  .order('starts_at')
  .limit(1)
  .maybeSingle()
if (manyErr) {
  die(
    'the winner lookup broke when TWO legal Hangouts sat inside one Candidate range — ' +
      'this is the `maybeSingle()` bug, and the client now shows an error instead of joining',
    manyErr
  )
}
if (earliest?.id !== mine.id) die('the winner lookup did not return the EARLIEST overlapping Hangout')
ok('two legal Hangouts in one Candidate range still yield one winner — the earliest')

/*
 * 3. **Left is sticky through the conversion**, which is why that upsert carries
 *    `ignoreDuplicates`. A Friend who walked out of the winning Hangout must not
 *    be walked back in by a button that was trying to do something else — ticket
 *    08 §9 makes re-joining a deliberate act from the Hangout's own menu. With
 *    `merge-duplicates` this would clear `left_at`, silently.
 */
const { error: leaveAgainErr } = await supabase
  .from('hangout_participant')
  .update({ left_at: leftAt })
  .eq('hangout_id', mine.id)
  .eq('friend_id', me)
if (leaveAgainErr) die('could not set up the sticky-Left case', leaveAgainErr)

const { error: convertErr } = await supabase
  .from('hangout_participant')
  .upsert(
    { hangout_id: mine.id, friend_id: me },
    { onConflict: 'hangout_id,friend_id', ignoreDuplicates: true }
  )
if (convertErr) die("the race conversion's participant upsert failed", convertErr)

const { data: stillLeft, error: stickyErr } = await supabase
  .from('hangout_participant')
  .select('left_at')
  .eq('hangout_id', mine.id)
  .eq('friend_id', me)
  .single()
if (stickyErr) die('could not re-read the sticky-Left row', stickyErr)
if (stillLeft.left_at === null) {
  die(
    'THE RACE CONVERSION RESURRECTED A FRIEND WHO HAD LEFT — `ignoreDuplicates` is not ' +
      'set, so `left_at` was cleared by a button that was trying to confirm something else'
  )
}
ok('the conversion leaves a Left Friend Left — `ignoreDuplicates`, not merge-duplicates')

/* ---------------------------------------------------------------- *
 * 8. Realtime, on both tables.
 *
 * A table outside the `supabase_realtime` publication fails **silently**: the
 * channel reports SUBSCRIBED because the channel is fine, and the firehose is
 * empty. A publishable key cannot read `pg_publication_tables`, so behaviour is
 * the only honest test — subscribe, write, and see whether it arrives.
 * ---------------------------------------------------------------- */
const listener = createClient(url, key)
const { error: listenerSignInErr } = await listener.auth.signInWithPassword({ email, password })
if (listenerSignInErr) die('sign-in failed for the listener', listenerSignInErr)

const hangoutInserts = []
const hangoutDeletes = []
const participantInserts = []

const channel = listener
  .channel('verify-hangout')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hangout' }, (p) =>
    hangoutInserts.push(p)
  )
  .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'hangout' }, (p) =>
    hangoutDeletes.push(p)
  )
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'hangout_participant' },
    (p) => participantInserts.push(p)
  )

try {
  await subscribed(channel)
} catch (e) {
  die('the Realtime channel would not subscribe — check the project is not paused', e)
}
ok('the `verify-hangout` channel is SUBSCRIBED')

const { data: broadcast, error: broadcastErr } = await supabase
  .from('hangout')
  .insert({ starts_at: romeAt(2030, 2, 1, 20), ends_at: romeAt(2030, 2, 1, 21), created_by: me })
  .select('id')
  .single()
if (broadcastErr) die('creating the Realtime probe Hangout failed', broadcastErr)

const heardInsert = await nextEvent(hangoutInserts, 'a `hangout` INSERT')
if (!heardInsert) {
  die(
    'no `hangout` INSERT arrived.\n' +
      '  (The channel subscribed fine — a table outside the publication emits nothing\n' +
      '   and reports no error. Paste §5 of `supabase/05-hangout.sql`.)'
  )
}
if (heardInsert.new.id !== broadcast.id) die('the INSERT payload was for a different Hangout')
ok('a `hangout` INSERT reaches another session with no reload')

const { error: broadcastSeedErr } = await supabase
  .from('hangout_participant')
  .insert({ hangout_id: broadcast.id, friend_id: me })
if (broadcastSeedErr) die('seeding the Realtime probe failed', broadcastSeedErr)

const heardSeed = await nextEvent(participantInserts, 'a `hangout_participant` INSERT')
if (!heardSeed) {
  die(
    'no `hangout_participant` INSERT arrived — the second `alter publication` in §5 ' +
      'did not run'
  )
}
ok('a `hangout_participant` INSERT reaches another session too')

/* ---------------------------------------------------------------- *
 * 9. Cancellation is a hard delete, and the cascade needs no grant.
 *
 * `05-hangout.sql` §4 claims a referential action removes Participant rows even
 * though `authenticated` holds no delete grant on that table — which is what
 * makes "deletes happen only via the drop trigger" survive cancellation. That
 * claim is exactly the kind that is true in the manual and false in the schema.
 * ---------------------------------------------------------------- */
const { error: cancelErr } = await supabase.from('hangout').delete().eq('id', broadcast.id)
if (cancelErr) die('cancelling a Hangout failed', cancelErr)

const heardDelete = await nextEvent(hangoutDeletes, 'a `hangout` DELETE')
if (!heardDelete) {
  die('no `hangout` DELETE arrived — with no tombstone, this stream IS the notification')
}
if (heardDelete.old.id !== broadcast.id) die('the DELETE payload was for a different Hangout')
ok('a hard delete reaches another session, carrying the primary key')
note('  which is why `replica identity full` is not set: the key is all the store needs')

const { data: orphans, error: orphanErr } = await supabase
  .from('hangout_participant')
  .select('friend_id')
  .eq('hangout_id', broadcast.id)
if (orphanErr) die('could not check for orphaned Participants', orphanErr)
if (orphans.length !== 0) {
  die(`cancelling left ${orphans.length} orphaned Participant row(s) — the cascade is missing`)
}
ok('its Participants went with it — `on delete cascade`, with no delete grant in play')

await listener.removeChannel(channel)

/* ---------------------------------------------------------------- *
 * 10. Clean up the probes.
 *
 * Nothing in this product is ever auto-deleted (ticket 01), so a probe left
 * behind would live forever — and, because of the exclusion constraint, would
 * make a *later* run of this script fail on a range it does not own.
 * ---------------------------------------------------------------- */
const { error: cleanupErr } = await supabase
  .from('hangout')
  .delete()
  .in('id', [mine.id, adjacent.id])
if (cleanupErr) die('could not clean up the probe Hangouts', cleanupErr)
ok('probes deleted')

/* ---------------------------------------------------------------- *
 * 11. Seed the demo Hangout, from a real Candidate's real Friend set.
 *
 * Friday 10 Sep 2027, 10:00–11:00 in Rome — the Candidate
 * `verify-candidates.mjs` calls "the sharpest check in the file", because it is
 * an accidental overlap between two runs seeded a slice apart by scripts that
 * did not know about each other.
 *
 * Its Participants are read out of `availability` rather than named here, which
 * is the criterion rather than a flourish: *Participants are seeded at
 * confirmation from the Candidate's Friend set*, and the Candidate's Friend set
 * is exactly the Friends holding a row at **every** Slot in the range.
 * ---------------------------------------------------------------- */
const DEMO_FROM = romeAt(2027, 9, 10, 10)
const DEMO_TO = romeAt(2027, 9, 10, 11)

const { data: already, error: alreadyErr } = await supabase
  .from('hangout')
  .select('id, starts_at, ends_at')
  .lt('starts_at', DEMO_TO)
  .gt('ends_at', DEMO_FROM)
if (alreadyErr) die('could not check for an existing demo Hangout', alreadyErr)

if (already.length > 0) {
  ok('the demo Hangout is already there — nothing to seed')
  note(`  Fri 10 Sep 2027, 10:00–11:00 (${already[0].id})`)
} else {
  const { data: slots, error: slotsErr } = await supabase
    .from('availability')
    .select('friend_id, slot_start')
    .gte('slot_start', DEMO_FROM)
    .lt('slot_start', DEMO_TO)
  if (slotsErr) die('could not read the Candidate underneath the demo Hangout', slotsErr)

  const wanted = (new Date(DEMO_TO).getTime() - new Date(DEMO_FROM).getTime()) / SLOT_MS
  const held = slots.reduce(
    (counts, row) => counts.set(row.friend_id, (counts.get(row.friend_id) ?? 0) + 1),
    new Map()
  )
  const friendSet = [...held.entries()]
    .filter(([, count]) => count === wanted)
    .map(([friendId]) => friendId)

  if (friendSet.length < 2) {
    note(
      `skipped the demo Hangout: only ${friendSet.length} Friend(s) hold all ${wanted} Slots ` +
        'of Fri 10 Sep 2027 10:00–11:00, so there is no Candidate there to confirm'
    )
    note('  run `verify-availability.mjs` and paste `04-demo-second-friend.sql` first')
  } else {
    const { data: demo, error: demoErr } = await supabase
      .from('hangout')
      .insert({ starts_at: DEMO_FROM, ends_at: DEMO_TO, title: 'Coffee', created_by: me })
      .select('id')
      .single()
    if (demoErr) die('creating the demo Hangout failed', demoErr)

    const { error: demoSeedErr } = await supabase
      .from('hangout_participant')
      .insert(friendSet.map((friendId) => ({ hangout_id: demo.id, friend_id: friendId })))
    if (demoSeedErr) die('seeding the demo Hangout failed', demoSeedErr)

    ok(`seeded "Coffee" — Fri 10 Sep 2027, 10:00–11:00, ${friendSet.length} Participants`)
    note('  it should now pin above the Candidate list, draw on every grid,')
    note('  and take its own range out of the Candidate list')
  }
}

await supabase.auth.signOut()
await listener.auth.signOut()

console.log('\nAll checks passed.\n')
process.exit(0)
