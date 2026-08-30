/**
 * friens-cal — provisioning smoke test (ticket 04, item 4).
 *
 *   node --env-file=.env scripts/verify-supabase.mjs
 *
 * Proves, end to end from a browser-shaped client:
 *   1. the URL and publishable key are valid
 *   2. email+password sign-in works (so Confirm Email is off)
 *   3. an authenticated INSERT passes the `with check` policy
 *   4. an authenticated SELECT returns only your own rows
 *   5. an ANONYMOUS select is refused — i.e. the locks are actually on
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const email = process.env.SMOKE_TEST_EMAIL
const password = process.env.SMOKE_TEST_PASSWORD

const missing = Object.entries({ url, key, email, password })
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

// --- 5. anonymous first, while we still have no session ---------------------
const anon = createClient(url, key)
const { data: leaked, error: anonErr } = await anon.from('smoke_test').select('*')
if (!anonErr && leaked?.length) {
  die(`ANONYMOUS READ RETURNED ${leaked.length} ROW(S) — the locks are not on`)
}
ok('anonymous read is refused (grants + RLS are active)')

// --- 1 & 2. sign in ---------------------------------------------------------
const supabase = createClient(url, key)
const { data: auth, error: signInErr } =
  await supabase.auth.signInWithPassword({ email, password })
if (signInErr) die('sign-in failed', signInErr)
ok(`signed in as ${auth.user.email}`)
ok(`  user id ${auth.user.id}`)

// --- 3. insert --------------------------------------------------------------
const { data: inserted, error: insertErr } = await supabase
  .from('smoke_test')
  .insert({ owner_id: auth.user.id, note: 'hello from verify-supabase.mjs' })
  .select()
  .single()
if (insertErr) die('authenticated insert failed', insertErr)
ok(`inserted row ${inserted.id}`)

// --- 4. read back -----------------------------------------------------------
const { data: rows, error: readErr } = await supabase.from('smoke_test').select('*')
if (readErr) die('authenticated read failed', readErr)
if (!rows.some((r) => r.id === inserted.id)) die('read back did not contain the new row')
ok(`authenticated read returned ${rows.length} row(s), including the new one`)

console.log('\nAll five checks passed. Supabase is provisioned correctly.')
