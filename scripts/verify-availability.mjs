/**
 * friens-cal — issue 05: prove the `availability` table's two locks from a
 * browser-shaped client, and leave the grid something to draw.
 *
 *   node --env-file=.env scripts/verify-availability.mjs
 *
 * Needs the same `.env` as `verify-friend-row.mjs`: the publishable key, and
 * FRIEND_TEST_EMAIL / FRIEND_TEST_PASSWORD for a real Friend.
 *
 * Run it after pasting `supabase/02-availability.sql` into the SQL Editor.
 * Every check below is one of issue 05's database acceptance criteria, so a
 * clean run is the evidence that the database half of the slice is done.
 *
 * It ends by SEEDING three runs of Availability for the signed-in Friend, and
 * leaves them there. That is deliberate twice over: the test Friend has no rows
 * of their own, so the grid is empty until something writes some — and writing
 * them through the client rather than the dashboard is the "inserts only their
 * own" criterion being exercised rather than asserted.
 */
import { TZDate } from '@date-fns/tz'
import { createClient } from '@supabase/supabase-js'

/**
 * The one group time zone (`GROUP_TIME_ZONE`, ticket 07 §5). Restated rather
 * than imported: `src/` is TypeScript, and `.nvmrc` pins a Node that needs a
 * flag to read it. Only the seed's wall clock depends on this — every check
 * below is about instants and grants.
 */
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

/** Midnight-relative wall clock in Rome, as a true instant. */
const romeAt = (dayOffset, hour) => {
  const now = new TZDate(new Date(), ROME)
  return new Date(
    new TZDate(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hour, ROME).getTime()
  )
}

/** A run of adjacent 30-minute slots — which is all a continuous Availability is. */
const slotRun = (start, hours) =>
  Array.from({ length: hours * 2 }, (_, index) => new Date(start.getTime() + index * 30 * 60_000))

const rowsFor = (friendId, instants) =>
  instants.map((slot) => ({ friend_id: friendId, slot_start: slot.toISOString() }))

/* ---------------------------------------------------------------- *
 * 1. Anonymous first, while there is still no session.
 * ---------------------------------------------------------------- */
const anon = createClient(url, key)

const { data: leaked, error: anonErr } = await anon.from('availability').select('*')
if (!anonErr && leaked?.length) {
  die(`ANONYMOUS READ RETURNED ${leaked.length} AVAILABILITY ROW(S) — the locks are not on`)
}
ok('anonymous read of `availability` is refused')

/* ---------------------------------------------------------------- *
 * 2. Sign in.
 * ---------------------------------------------------------------- */
const supabase = createClient(url, key)
const { data: auth, error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
if (signInErr) die('sign-in failed', signInErr)
const me = auth.user.id
ok(`signed in as ${auth.user.email}`)

/* ---------------------------------------------------------------- *
 * 3. The table is there, and a Friend may read it unfiltered.
 *
 * Unfiltered is the point: the read policy is `using (true)` because the whole
 * product is a count over other people's rows — the heatmap, the Candidate
 * scan and the silence dot (ticket 07 §8). A self-only policy would return
 * this same result today and break every one of them later.
 * ---------------------------------------------------------------- */
const { error: readErr } = await supabase.from('availability').select('friend_id, slot_start')
if (readErr) {
  die(
    readErr.code === '42501'
      ? 'reading `availability` is permission-denied — the grant in section 3 of the SQL did not run'
      : 'reading `availability` failed',
    readErr
  )
}
ok('a Friend reads `availability` unfiltered')

/* ---------------------------------------------------------------- *
 * 4. A Friend inserts their own rows.
 * ---------------------------------------------------------------- */
const probe = romeAt(365, 4)

const { error: mineErr } = await supabase.from('availability').insert(rowsFor(me, [probe]))
if (mineErr) die('inserting my own Availability failed', mineErr)
ok('a Friend inserts their own Availability')

/* ---------------------------------------------------------------- *
 * 5. The key. Twice over: it refuses the duplicate, and it is COMPOSITE —
 *    a second slot for the same Friend is a different row, not a conflict.
 * ---------------------------------------------------------------- */
const { error: dupeErr } = await supabase.from('availability').insert(rowsFor(me, [probe]))
if (!dupeErr) die('RE-INSERTING THE SAME SLOT SUCCEEDED — the unique key is missing')
if (dupeErr.code !== '23505') die(`re-inserting the same slot failed for the wrong reason`, dupeErr)
ok(`the same slot twice is refused by the key (${dupeErr.code})`)

const neighbour = new Date(probe.getTime() + 30 * 60_000)
const { error: neighbourErr } = await supabase.from('availability').insert(rowsFor(me, [neighbour]))
if (neighbourErr) die('the key is not composite — a second slot collided', neighbourErr)
ok('a different slot for the same Friend is a different row')

/* ---------------------------------------------------------------- *
 * 6. And that key is what makes a retry free.
 *
 * Ticket 19 sends one `insert ... on conflict do nothing` per gesture and
 * retries it twice before giving up. That is only safe because drawing over
 * Availability you already have is a no-op rather than an error — which is
 * this, and it is the most ordinary action in the app.
 * ---------------------------------------------------------------- */
const { error: retryErr } = await supabase
  .from('availability')
  .upsert(rowsFor(me, [probe, neighbour]), {
    onConflict: 'friend_id,slot_start',
    ignoreDuplicates: true,
  })
if (retryErr) die('`on conflict do nothing` was refused — a retry would not be idempotent', retryErr)
ok('re-drawing slots you already hold is a no-op, so a retry is idempotent')

/* ---------------------------------------------------------------- *
 * 7. Nobody paints anybody else's calendar.
 *
 * This is the conclusive half of "inserts only their own": the `with check` on
 * the insert policy refuses it outright rather than silently dropping it.
 * ---------------------------------------------------------------- */
const { data: friends, error: friendsErr } = await supabase.from('friend').select('id')
if (friendsErr) die('reading the roster failed', friendsErr)
const other = friends.find((f) => f.id !== me)

if (other) {
  const { error: crossErr } = await supabase
    .from('availability')
    .insert(rowsFor(other.id, [romeAt(366, 4)]))
  if (!crossErr) die("INSERTED AVAILABILITY FOR ANOTHER FRIEND — the `with check` is missing")
  ok(`inserting another Friend's Availability is refused (${crossErr.code})`)
} else {
  note('only one Friend exists, so the cross-Friend insert check is skipped')
}

/* ---------------------------------------------------------------- *
 * 8. There is no `update` grant at all.
 *
 * Not a policy — a withheld grant, so RLS never has to defend `friend_id`.
 * The row is two columns and both are the key: changing either is not an edit,
 * it is a different row.
 * ---------------------------------------------------------------- */
const { error: updateErr } = await supabase
  .from('availability')
  .update({ slot_start: romeAt(367, 4).toISOString() })
  .eq('friend_id', me)
  .eq('slot_start', probe.toISOString())
if (!updateErr) die('UPDATING AVAILABILITY SUCCEEDED — the update grant was not withheld')
ok(`updating \`availability\` is refused (${updateErr.code})`)

/* ---------------------------------------------------------------- *
 * 9. A Friend erases their own, and only their own.
 * ---------------------------------------------------------------- */
const { data: erased, error: eraseErr } = await supabase
  .from('availability')
  .delete()
  .eq('friend_id', me)
  .in('slot_start', [probe.toISOString(), neighbour.toISOString()])
  .select()
if (eraseErr) die('erasing my own Availability failed', eraseErr)
if (erased.length !== 2) die(`erasing my own slots removed ${erased.length} rows, expected 2`)
ok('a Friend erases their own Availability')

if (other) {
  /*
   * Scoped a year out, on purpose. An unscoped `delete ... eq(friend_id)` would
   * be the sharper check — but if the policy were ever wrong it would prove it
   * by destroying somebody's real Availability, and there is no undo in this
   * product (ticket 01). Everything past this horizon is script-made.
   */
  const { data: touched, error: otherDeleteErr } = await supabase
    .from('availability')
    .delete()
    .eq('friend_id', other.id)
    .gte('slot_start', romeAt(364, 0).toISOString())
    .select()
  if (otherDeleteErr) {
    ok(`erasing another Friend's Availability is refused (${otherDeleteErr.code})`)
  } else if (touched.length) {
    die(`ERASED ANOTHER FRIEND'S AVAILABILITY — the delete policy is wrong`)
  } else {
    ok("erasing another Friend's Availability touches nothing")
    note('  a shape check, not a proof: that Friend holds no rows in range to spare.')
    note('  Check 7 is the conclusive half — the insert is refused outright.')
  }
}

/* ---------------------------------------------------------------- *
 * 10. What cannot be proved from here.
 * ---------------------------------------------------------------- */
note('the `availability_slot_start_idx` index is NOT checked — a publishable key')
note('  cannot read the catalogue. Confirm it in the SQL Editor:')
note("  select indexdef from pg_indexes where tablename = 'availability';")

/* ---------------------------------------------------------------- *
 * 11. Seed, and leave it.
 *
 * Three runs. The one a week back is the interesting one: it sits below the
 * store's boot floor, so the grid only finds it once the viewer navigates into
 * the previous week — which is the "past ranges are fetched on demand into the
 * same store" criterion, made visible.
 * ---------------------------------------------------------------- */
const seed = [
  { label: 'today 18:00–22:00', slots: slotRun(romeAt(0, 18), 4) },
  { label: 'in two days 10:00–13:00', slots: slotRun(romeAt(2, 10), 3) },
  { label: 'a week ago 20:00–22:00', slots: slotRun(romeAt(-7, 20), 2) },
]

const { error: seedErr } = await supabase.from('availability').upsert(
  seed.flatMap((run) => rowsFor(me, run.slots)),
  { onConflict: 'friend_id,slot_start', ignoreDuplicates: true }
)
if (seedErr) die('seeding Availability failed', seedErr)

seed.forEach((run) => ok(`seeded ${run.label} (${run.slots.length} slots)`))

console.log('\nAll checks passed. The `availability` table is locked as issue 05 specifies.')
