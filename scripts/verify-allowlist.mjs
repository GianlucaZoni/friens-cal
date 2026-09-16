/**
 * friens-cal — issue 14, extended by groups issue 06: prove the allowlist gate
 * and the one verb that was opened in it, from a browser-shaped client.
 *
 *   node --env-file=.env scripts/verify-allowlist.mjs
 *
 * Run it AFTER pasting `supabase/07-allowlist.sql` and `supabase/13-invite.sql`
 * into the SQL Editor, AFTER registering the hook in the dashboard, and AFTER
 * seeding at least one address. `scripts/setup-allowlist.sh` walks that order
 * for the first three.
 *
 * WHY IT IS ALL BEHAVIOUR AND NO READS. Every other verify script in this repo
 * checks a table by reading it. This one cannot: `allowlist` still grants no
 * `select` to `anon` or `authenticated`, which is the acceptance criterion, so
 * a script holding the publishable key is exactly as locked out as an attacker.
 * What it can do is push on each lock and confirm it does not move.
 *
 * WHAT GROUPS ISSUE 06 CHANGED, AND WHY THIS FILE RATHER THAN A NEW ONE.
 * `13-invite.sql` grants `insert` to `authenticated` so a Friend can invite
 * somebody from inside the app. That makes §2's old assertion — that an insert
 * as `authenticated` is refused — false, and a second script would have left
 * this one failing. The lock it describes is now half open, and the file that
 * describes the lock is the file that has to say which half.
 *
 * IT LEAVES ONE ROW BEHIND, ON PURPOSE. §4 needs a new address to invite, and
 * nothing holding a publishable key can delete one afterwards: `delete` is
 * revoked and always will be. So the address is fixed rather than unique per
 * run, and it is on `.invalid`, the TLD RFC 2606 reserves so that it can never
 * resolve. Nobody can receive mail there, so nobody can ever prove ownership of
 * it to the signup form: the row is a door onto a wall. Every run after the
 * first one re-uses it and adds nothing. The statement that removes it is
 * printed at the end.
 *
 * ONE CHECK HAS A COST, AND IT IS THE IMPORTANT ONE. §6 signs up an address
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
 * `verify-friend-row.mjs` uses. Everything from §2 down needs it and is skipped
 * without it: the whole `authenticated` half of the lock, the invite verbs, and
 * the already-registered address.
 */
const friendEmail = process.env.FRIEND_TEST_EMAIL
const friendPassword = process.env.FRIEND_TEST_PASSWORD

/** The one row this script writes. See the header. */
const PROBE_ADDRESS = 'invite-probe@friens-cal.invalid'

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

/* ---------------------------------------------------------------- *
 * The raw response, because supabase-js is not where the leak would be.
 *
 * §4 has to compare two writes for sameness, and "same" has to mean the bytes
 * on the wire rather than the shape the client library hands back. A status
 * code or a header that differed would answer, for any address a Friend cares
 * to type, whether that person already has an account here — which is the
 * enumeration leak `07-allowlist.sql` §3 spends its rejection copy closing,
 * walked in from the other side.
 * ---------------------------------------------------------------- */

/** Headers that differ between any two requests and say nothing about either. */
const VOLATILE = new Set([
  'date',
  'x-kong-upstream-latency',
  'x-kong-proxy-latency',
  'cf-ray',
  'cf-cache-status',
  'sb-request-id',
  'x-request-id',
  'server-timing',
  'alt-svc',
  'report-to',
  'nel',
  'age',
])

let lastResponse = null

const recordingFetch = async (input, init) => {
  const response = await fetch(input, init)
  const target = typeof input === 'string' ? input : input.url
  if (target.includes('/rest/v1/allowlist')) {
    const copy = response.clone()
    lastResponse = {
      status: response.status,
      statusText: response.statusText,
      headers: [...copy.headers]
        .filter(([name]) => !VOLATILE.has(name.toLowerCase()))
        .map(([name, value]) => `${name.toLowerCase()}: ${value}`)
        .sort(),
      body: await copy.text(),
    }
  }
  return response
}

/**
 * Both locks on reading, pushed from whatever role `client` is holding.
 * Run twice: once anonymous, once as a signed-in Friend, because no read was
 * ever opened to either and a script that only tried `anon` would miss half.
 */
const proveReadsAreShut = async (client, role) => {
  const { data, error } = await client.from('allowlist').select('*')
  if (!error) {
    die(`\`allowlist\` IS READABLE BY \`${role}\` — it returned ${data?.length ?? 0} row(s)`)
  }
  ok(`select on \`allowlist\` as \`${role}\` is refused (${error.code})`)
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
 *
 * `13-invite.sql` opened `insert` to `authenticated` and to nobody else, so an
 * anonymous insert is still refused and that is checked here rather than
 * assumed: signing up is the only thing a stranger may do to this project.
 * ---------------------------------------------------------------- */
const anon = createClient(url, key, { global: { fetch: recordingFetch } })
await proveReadsAreShut(anon, 'anon')

const { error: anonInsert } = await anon
  .from('allowlist')
  .insert({ email: `smuggled-${Date.now()}@friens-cal.invalid`, invited_by: null })
if (!anonInsert) die('`anon` INSERTED A ROW INTO `allowlist` — the grant reaches too far')
ok(`insert into \`allowlist\` as \`anon\` is refused (${anonInsert.code})`)

await proveHookIsUncallable(anon, 'anon')

if (!friendEmail || !friendPassword) {
  skip('FRIEND_TEST_EMAIL / FRIEND_TEST_PASSWORD unset — everything from §2 down is skipped')
  process.exit(0)
}

/* ---------------------------------------------------------------- *
 * 2. And as a Friend, where exactly one verb is open.
 * ---------------------------------------------------------------- */
const signedIn = createClient(url, key, { global: { fetch: recordingFetch } })
const { data: session, error: signInErr } = await signedIn.auth.signInWithPassword({
  email: friendEmail,
  password: friendPassword,
})
if (signInErr) die('sign-in as FRIEND_TEST_EMAIL failed', signInErr)
const friendId = session.user.id
ok(`signed in as ${friendEmail}`)

await proveReadsAreShut(signedIn, 'authenticated')

const { error: updateErr } = await signedIn
  .from('allowlist')
  .update({ note: 'mine now' })
  .eq('email', friendEmail)
if (!updateErr) die('`authenticated` UPDATED A ROW IN `allowlist` — only `insert` was granted')
ok(`update on \`allowlist\` as \`authenticated\` is refused (${updateErr.code})`)

const { error: deleteErr } = await signedIn.from('allowlist').delete().eq('email', PROBE_ADDRESS)
if (!deleteErr) die('`authenticated` DELETED FROM `allowlist` — only `insert` was granted')
ok(`delete on \`allowlist\` as \`authenticated\` is refused (${deleteErr.code})`)

/* ---------------------------------------------------------------- *
 * 3. The two ways an invite is refused, neither of which writes anything.
 *
 * The policy is `with check (invited_by = (select auth.uid()))`, so the only
 * inviter a Friend can record is themselves. Provenance that could be forged
 * would be worth nothing, and the column exists for no other reason.
 *
 * The constraint is `check (email = lower(btrim(email)))`. The old one let a
 * trailing space through, and such a row matches the signup hook never — the
 * one failure `07-allowlist.sql` §1 says nobody could debug from the outside.
 * Both probes use addresses that are NOT on the list, so a refusal here is the
 * policy or the constraint speaking and not the duplicate trigger.
 * ---------------------------------------------------------------- */
const { error: forgedErr } = await signedIn.from('allowlist').insert({
  email: `forged-${Date.now()}@friens-cal.invalid`,
  note: 'verify-allowlist',
  // Any uuid that is not this Friend's. A real one would need a second account;
  // the policy compares to `auth.uid()` and does not care whether it exists.
  invited_by: '00000000-0000-4000-8000-000000000000',
})
if (!forgedErr) die('A FRIEND RECORDED SOMEBODY ELSE AS THE INVITER — the policy is not holding')
ok(`inviting in another Friend's name is refused (${forgedErr.code})`)

const { error: spacedErr } = await signedIn.from('allowlist').insert({
  email: ` spaced-${Date.now()}@friens-cal.invalid `,
  note: 'verify-allowlist',
  invited_by: friendId,
})
if (!spacedErr) die('AN ADDRESS WITH A TRAILING SPACE WAS STORED — run supabase/13-invite.sql')
if (spacedErr.code !== '23514') {
  die(
    `a trailing space was refused by something other than the check constraint: ${spacedErr.code}`
  )
}
ok(`an address with a trailing space is refused by the constraint (${spacedErr.code})`)

/* ---------------------------------------------------------------- *
 * 4. A new address and one already on the list, answered identically.
 *
 * This is the criterion the whole dialog's copy rests on. The inviter is told
 * "rob@gmail.com can now create an account", a sentence that is true either
 * way, and it is only honest because the round trip genuinely cannot tell the
 * two cases apart.
 *
 * `friendEmail` is the address that is definitely already on the list: they
 * signed up, so the hook found them there. `PROBE_ADDRESS` is definitely new on
 * the first run of this script against a given project. On later runs it is
 * there too, and the comparison still passes but stops being the interesting
 * one — delete the row (the statement is printed at the end) to get the strong
 * version back.
 * ---------------------------------------------------------------- */
const invite = async (email) => {
  lastResponse = null
  const { error } = await signedIn
    .from('allowlist')
    .insert({ email, note: 'verify-allowlist', invited_by: friendId })
  if (error) die(`inviting ${email} failed (${error.code}): ${error.message}`)
  if (lastResponse === null) die('the response to the invite was not captured')
  return lastResponse
}

const fresh = await invite(PROBE_ADDRESS)
const listed = await invite(friendEmail)

if (JSON.stringify(fresh) !== JSON.stringify(listed)) {
  console.error('✗ THE RESPONSE TELLS A NEW ADDRESS FROM ONE ALREADY ON THE LIST')
  console.error('')
  console.error('  That is the enumeration leak, reopened from the invite side: a Friend can')
  console.error('  ask, of any address they care to type, whether that person is one of us.')
  console.error("  The dialog's copy cannot close it. See supabase/13-invite.sql §5.")
  console.error('')
  console.error(`  new:      ${JSON.stringify(fresh)}`)
  console.error(`  existing: ${JSON.stringify(listed)}`)
  process.exit(1)
}
ok(
  `inviting is ${fresh.status} ${fresh.statusText || '(no reason)'} whether or not the address was already there`
)
if (fresh.body !== '') die(`the invite came back with a body: ${JSON.stringify(fresh.body)}`)
ok('and it comes back with no body, so there is nothing to read either')

/* ---------------------------------------------------------------- *
 * 5. An address that is already registered.
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
await signedIn.auth.signOut()

const { data: dupe, error: dupeErr } = await createClient(url, key).auth.signUp({
  email: friendEmail,
  password: `verify-${Date.now()}`,
})
if (!dupeErr && dupe.session)
  die(`SIGNING UP AN EXISTING ADDRESS RETURNED A SESSION — ${friendEmail}`)
if (!dupeErr) {
  // No error and no session is Supabase obfuscating a duplicate, which it
  // only does when Confirm Email is on. Ticket 13 turned it off, and this
  // whole slice is safe only because it stays off.
  die(
    'signing up an existing address returned neither a session nor an error — Confirm Email is on'
  )
}
ok(`an already-registered address is refused (${dupeErr.code}: ${dupeErr.message})`)

/* ---------------------------------------------------------------- *
 * 6. An address that is not on the list. The one check with a cost.
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
 * 7. And refused without saying why, which is the point of the copy.
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
console.log('an address that is not on it cannot make an account, and a Friend can add')
console.log('one only in their own name.')
console.log('\nThis run left one row behind, which is expected and cannot be removed from')
console.log('here. From the SQL Editor:')
console.log(`\n    delete from public.allowlist where email = '${PROBE_ADDRESS}';\n`)
