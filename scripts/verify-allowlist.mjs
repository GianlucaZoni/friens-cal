/**
 * friens-cal — issue 14: prove the allowlist gate from a browser-shaped client.
 *
 *   node --env-file=.env scripts/verify-allowlist.mjs
 *
 * Run it AFTER pasting `supabase/07-allowlist.sql` into the SQL Editor, AFTER
 * registering the hook in the dashboard, and AFTER seeding at least one
 * address. `scripts/setup-allowlist.sh` walks that order.
 *
 * WHY IT IS ALL BEHAVIOUR AND NO READS. Every other verify script in this repo
 * checks a table by reading it. This one cannot: `allowlist` grants nothing to
 * `anon` or `authenticated`, which is the acceptance criterion, so a script
 * holding the publishable key is exactly as locked out as an attacker. What it
 * can do is push on each lock and confirm it does not move.
 *
 * ONE CHECK HAS A COST, AND IT IS THE IMPORTANT ONE. §4 signs up an address
 * that is not on the list. If the hook is registered, that fails and nothing is
 * created — free, repeatable, run it as often as you like. If the hook is NOT
 * registered, the signup SUCCEEDS and a real `auth.users` row exists that
 * neither this script nor the app can delete: there is no service_role key in
 * this repo and there never will be (.env, ADR-0001). The script prints the
 * address it is about to use before it uses it, and if that happens it stops
 * and tells you which account to delete from the dashboard.
 *
 * There is no way to read a hook's registration back over the Data API, so this
 * is the only check there is. It is also, exactly, the criterion.
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY

const missing = Object.entries({
  VITE_SUPABASE_URL: url,
  VITE_SUPABASE_PUBLISHABLE_KEY: key,
})
  .filter(([, v]) => !v)
  .map(([k]) => k)

if (missing.length) {
  console.error(`✗ missing from .env: ${missing.join(', ')}`)
  console.error('  (run it as `node --env-file=.env scripts/verify-allowlist.mjs`)')
  process.exit(1)
}

/**
 * Optional. A real Friend who already has an account — the same pair
 * `verify-friend-row.mjs` uses. Two checks need it and are skipped without it:
 * the authenticated half of the lock, and the already-registered address.
 */
const friendEmail = process.env.FRIEND_TEST_EMAIL
const friendPassword = process.env.FRIEND_TEST_PASSWORD

const ok = (m) => console.log(`✓ ${m}`)
const skip = (m) => console.log(`· ${m}`)
const die = (m, e) => {
  console.error(`✗ ${m}`)
  if (e) console.error(`  ${e.message ?? e}`)
  process.exit(1)
}

/** The leak issue 14 forbids, in the words the research document drafted. */
const LEAK = 'not on the list'

/** Ticket 18, draft A, first sentence — what `07-allowlist.sql` returns. */
const DRAFT_A = 'We could not create an account with those details.'

/**
 * Both locks on the table, pushed from whatever role `client` is holding.
 * Run twice: once anonymous, once as a signed-in Friend, because the grant was
 * revoked from both and a script that only tried `anon` would miss half of it.
 */
const proveTableIsShut = async (client, role) => {
  const { data, error } = await client.from('allowlist').select('*')
  if (!error) {
    die(`\`allowlist\` IS READABLE BY \`${role}\` — it returned ${data?.length ?? 0} row(s)`)
  }
  ok(`select on \`allowlist\` as \`${role}\` is refused (${error.code})`)

  const { error: insertErr } = await client
    .from('allowlist')
    .insert({ email: `smuggled-${Date.now()}@example.com` })
  if (!insertErr) die(`\`${role}\` INSERTED A ROW INTO \`allowlist\` — the grant was not revoked`)
  ok(`insert into \`allowlist\` as \`${role}\` is refused (${insertErr.code})`)
}

/**
 * The hook function over the Data API.
 *
 * This is the front-door version of the enumeration leak: a `security definer`
 * function that reads the allowlist, left callable, answers "is this address one
 * of ours?" for any address anyone types. The revoke in §4 of the SQL is what
 * shuts it, and this is what proves the revoke survived.
 */
const proveHookIsUncallable = async (client, role) => {
  const { error } = await client.rpc('hook_restrict_signup_to_allowlist', {
    event: { user: { email: friendEmail ?? 'anyone@example.com' } },
  })
  if (!error) {
    die(`\`hook_restrict_signup_to_allowlist\` IS CALLABLE BY \`${role}\` OVER THE DATA API`)
  }
  ok(`the hook function is not callable as \`${role}\` (${error.code})`)
}

/* ---------------------------------------------------------------- *
 * 1. Anonymous, which is what a browser is before anyone signs in.
 *
 * A caveat worth knowing rather than discovering: PostgREST answers a table it
 * has no grant on with `PGRST205`, "could not find the table in the schema
 * cache" — the same answer it gives for a table that does not exist. So §1
 * proves `allowlist` is NOT REACHABLE, which is the criterion, and cannot on
 * its own prove it is there. (`42501` would settle it, and means the same
 * thing.) What proves the table exists and holds the right addresses is the one
 * acceptance signup a human runs, which is step 6 of `setup-allowlist.sh`.
 * ---------------------------------------------------------------- */
const anon = createClient(url, key)
await proveTableIsShut(anon, 'anon')
await proveHookIsUncallable(anon, 'anon')

/* ---------------------------------------------------------------- *
 * 2. And as a Friend, because being one of us buys no access either.
 * ---------------------------------------------------------------- */
if (friendEmail && friendPassword) {
  const signedIn = createClient(url, key)
  const { error: signInErr } = await signedIn.auth.signInWithPassword({
    email: friendEmail,
    password: friendPassword,
  })
  if (signInErr) die('sign-in as FRIEND_TEST_EMAIL failed', signInErr)
  ok(`signed in as ${friendEmail}`)

  await proveTableIsShut(signedIn, 'authenticated')
  await proveHookIsUncallable(signedIn, 'authenticated')
  await signedIn.auth.signOut()
} else {
  skip('FRIEND_TEST_EMAIL / FRIEND_TEST_PASSWORD unset — the `authenticated` half is skipped')
}

/* ---------------------------------------------------------------- *
 * 3. An address that is already registered.
 *
 * The criterion is that this looks identical to a rejection from the outside.
 * It cannot be checked here, because the sameness is imposed by the client
 * (`SIGNUP_FAILURE` in `src/auth/use-session.ts`) and this script is not that
 * client — from down here the two errors are visibly different, which is the
 * whole reason the catch-all has to exist. What IS checkable here is that
 * Supabase refuses rather than quietly handing back a session.
 *
 * Creates nothing: the account already exists.
 * ---------------------------------------------------------------- */
if (friendEmail) {
  const { data, error } = await createClient(url, key).auth.signUp({
    email: friendEmail,
    password: `verify-${Date.now()}`,
  })
  if (!error && data.session) die(`SIGNING UP AN EXISTING ADDRESS RETURNED A SESSION — ${friendEmail}`)
  if (!error) {
    // No error and no session is Supabase obfuscating a duplicate, which it
    // only does when Confirm Email is on. Ticket 13 turned it off, and this
    // whole slice is safe only because it stays off.
    die('signing up an existing address returned neither a session nor an error — Confirm Email is on')
  }
  ok(`an already-registered address is refused (${error.code}: ${error.message})`)
} else {
  skip('FRIEND_TEST_EMAIL unset — the already-registered check is skipped')
}

/* ---------------------------------------------------------------- *
 * 4. An address that is not on the list. The one check with a cost.
 * ---------------------------------------------------------------- */
const stranger = `allowlist-check-${Date.now()}@example.com`
console.log(`\n· about to attempt a signup as ${stranger}`)
console.log('  if the hook is registered this fails and creates nothing.\n')

const { data: strangerData, error: strangerErr } = await createClient(url, key).auth.signUp({
  email: stranger,
  password: `verify-${Date.now()}-Aa1`,
})

if (!strangerErr) {
  console.error('✗ AN UNLISTED ADDRESS SIGNED UP SUCCESSFULLY — the hook is not gating anything')
  console.error('')
  console.error('  An account now exists and nothing in this repo can delete it:')
  console.error(`      ${stranger}`)
  console.error(`      user id ${strangerData.user?.id ?? '(unknown)'}`)
  console.error('  Delete it: Dashboard → Authentication → Users → find it → Delete user.')
  console.error('  That also removes its `friend` row, which cascades on the auth user.')
  console.error('')
  console.error('  Then register the hook and run this again:')
  console.error('      Authentication → Auth Hooks → "Before User Created" → Postgres')
  console.error('      → public → hook_restrict_signup_to_allowlist')
  process.exit(1)
}
ok(`an unlisted address is refused (${strangerErr.code ?? strangerErr.status})`)

/* ---------------------------------------------------------------- *
 * 5. And refused without saying why, which is the point of the copy.
 * ---------------------------------------------------------------- */
if (strangerErr.message.toLowerCase().includes(LEAK)) {
  die(
    `THE HOOK LEAKS LIST MEMBERSHIP — it answered: ${JSON.stringify(strangerErr.message)}\n` +
      "  That is the research document's draft string. Re-run supabase/07-allowlist.sql."
  )
}
ok('the refusal does not reveal whether the address is on the list')

if (strangerErr.message === DRAFT_A) {
  ok('the refusal is ticket 18 draft A, word for word')
} else {
  // Not fatal. A signup can be refused before it ever reaches the hook — rate
  // limits and password rules both get there first — and those messages are
  // Supabase's, not ours. They are also never shown: the client replaces every
  // one of them. Worth printing so a surprise is visible rather than silent.
  skip(`the refusal came back as ${JSON.stringify(strangerErr.message)}, not draft A`)
}

console.log('\nAll checks passed. The allowlist is unreadable, the hook is unreachable,')
console.log('and an address that is not on it cannot make an account.')
