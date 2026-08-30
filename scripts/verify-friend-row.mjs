/**
 * friens-cal — issue 01: prove the `friend` table's two locks from a
 * browser-shaped client.
 *
 *   node --env-file=.env scripts/verify-friend-row.mjs
 *
 * Needs FRIEND_TEST_EMAIL / FRIEND_TEST_PASSWORD in `.env` — a real Friend
 * created from the Supabase dashboard (there is no signup until issue 14).
 * FRIEND_DISPLAY_NAME is optional; see section 5.
 *
 * Run it after pasting `supabase/01-friend.sql` into the SQL Editor. Every
 * check below is one of issue 01's acceptance criteria, so a clean run is the
 * evidence that the database half of the slice is done.
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
const die = (m, e) => {
  console.error(`✗ ${m}`)
  if (e) console.error(`  ${e.message ?? e}`)
  process.exit(1)
}

/* ---------------------------------------------------------------- *
 * 1. Anonymous first, while there is still no session.
 * ---------------------------------------------------------------- */
const anon = createClient(url, key)

const { data: leaked, error: anonErr } = await anon.from('friend').select('*')
if (!anonErr && leaked?.length) {
  die(`ANONYMOUS READ RETURNED ${leaked.length} FRIEND ROW(S) — the locks are not on`)
}
ok('anonymous read of `friend` is refused')

const { error: smokeErr } = await anon.from('smoke_test').select('id').limit(1)
if (!smokeErr) die('`public.smoke_test` is still reachable — 01-friend.sql did not run')
ok('the provisioning smoke-test table is gone')

/* ---------------------------------------------------------------- *
 * 2. Sign in.
 * ---------------------------------------------------------------- */
const supabase = createClient(url, key)
const { data: auth, error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
if (signInErr) die('sign-in failed', signInErr)
ok(`signed in as ${auth.user.email}`)

/* ---------------------------------------------------------------- *
 * 3. The trigger made a Friend row for this account.
 * ---------------------------------------------------------------- */
const { data: mine, error: mineErr } = await supabase
  .from('friend')
  .select('*')
  .eq('id', auth.user.id)
  .maybeSingle()
if (mineErr) die('reading own Friend row failed', mineErr)
if (!mine) die('no Friend row for this account — the trigger or the backfill did not run')
ok(`own Friend row exists (display_name: ${JSON.stringify(mine.display_name)})`)

/* ---------------------------------------------------------------- *
 * 4. The roster: every Friend is readable.
 * ---------------------------------------------------------------- */
const { data: all, error: allErr } = await supabase.from('friend').select('*')
if (allErr) die('reading the roster failed', allErr)
if (!all.some((f) => f.id === auth.user.id)) die('the roster did not include the signed-in Friend')
ok(`the roster returned ${all.length} Friend row(s)`)

/* ---------------------------------------------------------------- *
 * 5. A Friend may update their own row.
 * ---------------------------------------------------------------- */
const { data: updated, error: updateErr } = await supabase
  .from('friend')
  .update({ display_name: `verify-${Date.now()}` })
  .eq('id', auth.user.id)
  .select()
if (updateErr) die('updating own Friend row failed', updateErr)
if (updated.length !== 1) die(`updating own row touched ${updated.length} rows, expected 1`)
ok('own Friend row is updatable')

/*
 * The row the trigger makes is blank, so nothing in issue 01 can put a name on
 * screen — `display_name` is the setup flow's to write (issue 03). Setting
 * FRIEND_DISPLAY_NAME stands in for that step, so the authenticated route has a
 * real name to render and the acceptance criterion becomes checkable.
 * Without it, whatever was there before is put back.
 */
// `||`, not `??`: .env.example ships the key with an empty value, and an empty
// display name is not a display name.
const finalName = process.env.FRIEND_DISPLAY_NAME || mine.display_name
const { error: restoreErr } = await supabase
  .from('friend')
  .update({ display_name: finalName })
  .eq('id', auth.user.id)
if (restoreErr) die('could not write the final display_name', restoreErr)
ok(`display_name left as ${JSON.stringify(finalName)}`)

/* ---------------------------------------------------------------- *
 * 6. And nobody else's. RLS makes this a no-op, not an error.
 * ---------------------------------------------------------------- */
const other = all.find((f) => f.id !== auth.user.id)
if (other) {
  const { data: touched, error: otherErr } = await supabase
    .from('friend')
    .update({ display_name: 'should never land' })
    .eq('id', other.id)
    .select()
  if (otherErr) {
    ok(`updating another Friend's row is refused (${otherErr.code})`)
  } else if (touched.length) {
    die(`UPDATED ANOTHER FRIEND'S ROW — the update policy is wrong`)
  } else {
    ok(`updating another Friend's row touches nothing`)
  }
} else {
  console.log('· only one Friend exists, so the cross-Friend update check is skipped')
}

/* ---------------------------------------------------------------- *
 * 7. Nobody inserts a Friend row. Only the trigger does.
 * ---------------------------------------------------------------- */
const { error: insertErr } = await supabase
  .from('friend')
  .insert({ id: auth.user.id, display_name: 'minted by the client' })
if (!insertErr) die('CLIENT INSERT INTO `friend` SUCCEEDED — the insert grant was not withheld')
ok(`client insert into \`friend\` is refused (${insertErr.code})`)

console.log('\nAll checks passed. The `friend` table is locked as issue 01 specifies.')
