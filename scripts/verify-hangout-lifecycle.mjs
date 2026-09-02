/**
 * friens-cal — issue 10: prove the Hangout lifecycle's database half from a
 * browser-shaped client.
 *
 *   node --env-file=.env scripts/verify-hangout-lifecycle.mjs
 *
 * Needs the same `.env` as the other verify scripts: the publishable key, and
 * FRIEND_TEST_EMAIL / FRIEND_TEST_PASSWORD for a real Friend.
 *
 * Run it after pasting `supabase/06-hangout-lifecycle.sql` into the SQL Editor.
 * `verify-hangout.mjs` covers the two tables' shape and locks; this covers what
 * that file's closing section deliberately left behind.
 *
 * ## What only a script can prove
 *
 * Four things here are the reason this file exists rather than a paragraph
 * claiming the SQL is right:
 *
 * 1. **The strict drop, from a trigger.** Erasing Availability inside a Hangout
 *    removes a `hangout_participant` row that the browser holds **no delete
 *    grant on at all** (`05-hangout.sql` §4). That is `security definer` working,
 *    and nothing but a live delete can show it.
 * 2. **The auto-cancel, and its Past exemption.** Ticket 08 §4 wants an empty
 *    Hangout gone and §6 wants a Past one untouchable, and the two meet in one
 *    `where` clause. Reading it is not knowing it.
 * 3. **The RPC actually writing somebody else's calendar.** ADR-0002's whole
 *    reason to exist, and the one statement in the product that crosses
 *    Friends. It is also the only way to see that it **only inserts** — the
 *    Availability that covered the old range is still there afterwards.
 * 4. **The two `with check`s, and what the trigger adds to them.** A provenance
 *    column anybody may set to anybody records nothing, so the refusals are the
 *    feature — including the one no policy can express, `created_by` refusing
 *    to move.
 *
 * ## It cleans up after itself, with one named exception
 *
 * Every probe is in 2030 or 2020 and is deleted. The exception is structural
 * rather than laziness: the retime writes **another Friend's** Availability, and
 * `02-availability.sql` makes deletes self-only — so this client cannot remove
 * it, and ADR-0002 settles that extensions are never reverted anyway. It is
 * kept to a single 30-minute Slot, in 2020, where the Candidate scan's
 * now-forward horizon can never see it; the script prints the one `delete` a
 * human can run if they want it gone.
 *
 * ## Why so much of it is statements rather than clicks
 *
 * Pointer events do not reach the app in the Browser pane this project is
 * verified in — the known local limitation issues 08 and 09 recorded, and the
 * reason `verify-hangout.mjs` has a §7b. Everything below is reachable from the
 * UI; this is the same set of statements the UI issues, run in the same order.
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
/** `raise ... using errcode = 'no_data_found'` — §4's "that Hangout is gone". */
const NO_DATA_FOUND = 'P0002'
/** PostgREST's "no such function in my schema cache" — i.e. §4 did not run. */
const NO_SUCH_FUNCTION = 'PGRST202'

const SLOT_MS = 30 * 60_000

/** A wall clock in Rome, as an ISO instant — how a Hangout's bounds are written. */
const romeAt = (year, month, day, hour, minute = 0) =>
  new Date(new TZDate(year, month - 1, day, hour, minute, ROME).getTime()).toISOString()

/**
 * Every Slot instant a range covers, half-open — the client's `slotStartsOf`
 * and the trigger's `generate_series`, in the third language that has to agree
 * with them.
 */
const slotsOf = (fromIso, toIso) => {
  const from = new Date(fromIso).getTime()
  const to = new Date(toIso).getTime()
  const count = Math.round((to - from) / SLOT_MS)
  return Array.from({ length: count }, (_, step) => new Date(from + step * SLOT_MS).toISOString())
}

/* ---------------------------------------------------------------- *
 * Sign in, and find somebody to write about.
 * ---------------------------------------------------------------- */
const anon = createClient(url, key)
const supabase = createClient(url, key)

const { data: auth, error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
if (signInErr) die('sign-in failed', signInErr)
const me = auth.user.id
ok(`signed in as ${auth.user.email}`)

const { data: roster, error: rosterErr } = await supabase.from('friend').select('id, display_name')
if (rosterErr) die('could not read the roster', rosterErr)
const other = roster.find((friend) => friend.id !== me) ?? null
if (other) ok(`a second Friend to cross: ${other.display_name ?? other.id}`)
else note('only one Friend in this Group — the cross-Friend checks will be skipped')

/**
 * The two windows every probe lives in — 2030 for the live ones, 2020 for the
 * two that have to be Past.
 *
 * Named because they are swept **before** the run as well as after it. A run
 * that dies mid-way leaves Hangouts behind, and the exclusion constraint then
 * makes the *next* run fail on a range it does not own — which is a confusing
 * way to be told about the first failure. `verify-hangout.mjs` is idempotent
 * and this has to be too.
 */
const WINDOWS = [
  [romeAt(2030, 4, 1, 0), romeAt(2030, 4, 16, 0)],
  [romeAt(2020, 4, 1, 0), romeAt(2020, 4, 16, 0)],
]

/**
 * Clear both windows: the Hangouts, then my own Availability.
 *
 * **In that order, and it matters.** Deleting the Availability first would fire
 * the drop trigger and auto-cancel half the probes out from under the sweep —
 * which is the rule working, and still a confusing way to tidy up.
 *
 * Nothing in this product is ever auto-deleted (ticket 01), so a probe left
 * behind lives forever.
 */
const sweep = async (when) => {
  const failure = await WINDOWS.reduce(async (previous, [from, to]) => {
    const earlier = await previous
    if (earlier) return earlier

    const { error: hangoutErr } = await supabase
      .from('hangout')
      .delete()
      .gte('starts_at', from)
      .lt('starts_at', to)
    if (hangoutErr) return hangoutErr

    const { error: slotErr } = await supabase
      .from('availability')
      .delete()
      .eq('friend_id', me)
      .gte('slot_start', from)
      .lt('slot_start', to)
    return slotErr ?? null
  }, Promise.resolve(null))

  if (failure) die(`could not ${when} the probe windows`, failure)
}

await sweep('clear')
ok('the probe windows are clear — 2030 and 2020, both years this file owns')

/** Create a Hangout and seed its Participants. Dies rather than continuing. */
const plan = async (what, startsAt, endsAt, friendIds, title = null) => {
  const { data, error } = await supabase
    .from('hangout')
    .insert({ starts_at: startsAt, ends_at: endsAt, title, created_by: me })
    .select('id, starts_at, ends_at, title, created_by, edited_by, edited_at')
    .single()
  if (error) die(`could not set up the ${what} probe`, error)

  const { error: seedErr } = await supabase
    .from('hangout_participant')
    .insert(friendIds.map((friendId) => ({ hangout_id: data.id, friend_id: friendId })))
  if (seedErr) die(`could not seed the ${what} probe`, seedErr)
  return data
}

/** Draw my own Availability over a range — the ordinary self-insert. */
const hold = async (what, startsAt, endsAt) => {
  const { error } = await supabase.from('availability').upsert(
    slotsOf(startsAt, endsAt).map((slot_start) => ({ friend_id: me, slot_start })),
    { onConflict: 'friend_id,slot_start', ignoreDuplicates: true }
  )
  if (error) die(`could not draw Availability for the ${what} probe`, error)
}

/** Erase some of my own Slots — the gesture the drop trigger hangs off. */
const erase = async (what, instants) => {
  const { error } = await supabase
    .from('availability')
    .delete()
    .eq('friend_id', me)
    .in('slot_start', instants)
  if (error) die(`could not erase Availability for the ${what} probe`, error)
}

const participantsOf = async (hangoutId) => {
  const { data, error } = await supabase
    .from('hangout_participant')
    .select('friend_id, left_at')
    .eq('hangout_id', hangoutId)
  if (error) die('could not read the Participants back', error)
  return data
}

const hangoutById = async (hangoutId) => {
  const { data, error } = await supabase
    .from('hangout')
    .select('id, starts_at, ends_at, title, created_by, edited_by, edited_at')
    .eq('id', hangoutId)
    .maybeSingle()
  if (error) die('could not read the Hangout back', error)
  return data
}

/* ---------------------------------------------------------------- *
 * 1. The provenance columns exist, and are readable.
 * ---------------------------------------------------------------- */
const { error: columnsErr } = await supabase
  .from('hangout')
  .select('created_by, edited_by, edited_at')
  .limit(1)
if (columnsErr) {
  die(
    'the provenance columns are not there yet.\n' +
      '  Paste `supabase/06-hangout-lifecycle.sql` into the Supabase SQL Editor and run it once.\n' +
      '  Nothing in this repo can add a column — `.env` holds the publishable key only (ADR-0001).',
    columnsErr
  )
}
ok('`created_by`, `edited_by` and `edited_at` are readable')

/* ---------------------------------------------------------------- *
 * 2. The insert policy — a `created_by` that records nothing is refused.
 *
 * "A column recording who did something, which anybody may set to anybody,
 * records nothing" (ticket 07). These two refusals ARE the provenance.
 * ---------------------------------------------------------------- */
const { error: noAuthorErr } = await supabase
  .from('hangout')
  .insert({ starts_at: romeAt(2030, 4, 1, 20), ends_at: romeAt(2030, 4, 1, 21) })
if (noAuthorErr?.code !== INSUFFICIENT_PRIVILEGE) {
  die(
    'A HANGOUT WAS CONFIRMED WITH NO AUTHOR — the insert policy has no `with check`, so ' +
      'provenance is decorative',
    noAuthorErr ?? undefined
  )
}
ok(`a Hangout with no \`created_by\` is refused with ${INSUFFICIENT_PRIVILEGE}`)

if (other) {
  const { error: forgedErr } = await supabase.from('hangout').insert({
    starts_at: romeAt(2030, 4, 1, 20),
    ends_at: romeAt(2030, 4, 1, 21),
    created_by: other.id,
  })
  if (forgedErr?.code !== INSUFFICIENT_PRIVILEGE) {
    die(
      "A FRIEND CONFIRMED A HANGOUT IN SOMEBODY ELSE'S NAME — `created_by` can be forged",
      forgedErr ?? undefined
    )
  }
  ok("another Friend's id as `created_by` is refused — the column is not forgeable")
}

/* ---------------------------------------------------------------- *
 * 3. The update policy, the stamp, and the column that will not move.
 * ---------------------------------------------------------------- */
const renamed = await plan('rename', romeAt(2030, 4, 2, 20), romeAt(2030, 4, 2, 22), [me])
if (renamed.created_by !== me) die('the insert did not record me as the author')
if (renamed.edited_by !== null || renamed.edited_at !== null) {
  die('a freshly confirmed Hangout is already marked edited')
}
ok('a confirmed Hangout records its author and is NOT marked edited')

const { error: unmarkedErr } = await supabase
  .from('hangout')
  .update({ title: 'Unmarked' })
  .eq('id', renamed.id)
if (unmarkedErr?.code !== INSUFFICIENT_PRIVILEGE) {
  die(
    'A HANGOUT WAS RENAMED WITHOUT BEING MARKED — the update policy has no `with check`, so ' +
      "ticket 08 §1's mark can be skipped",
    unmarkedErr ?? undefined
  )
}
ok('an update that does not set `edited_by` is refused — every update is an edit')

if (other) {
  const { error: forgedEditErr } = await supabase
    .from('hangout')
    .update({ title: 'Forged', edited_by: other.id })
    .eq('id', renamed.id)
  if (forgedEditErr?.code !== INSUFFICIENT_PRIVILEGE) {
    die(
      "A FRIEND EDITED A HANGOUT IN SOMEBODY ELSE'S NAME — `edited_by` can be forged",
      forgedEditErr ?? undefined
    )
  }
  ok("another Friend's id as `edited_by` is refused too")
}

const beforeRename = Date.now()
const { data: afterRename, error: renameErr } = await supabase
  .from('hangout')
  .update({ title: 'Pizza', edited_by: me })
  .eq('id', renamed.id)
  .select('title, created_by, edited_by, edited_at')
  .single()
if (renameErr) die('renaming a Hangout failed', renameErr)
if (afterRename.title !== 'Pizza' || afterRename.edited_by !== me) {
  die('the rename did not land, or did not mark the Hangout')
}
if (afterRename.edited_at === null) {
  die("`edited_at` was not stamped — §2's trigger did not run")
}
ok('a rename lands, and IS an edit — `edited_by` set, `edited_at` stamped')

/*
 * The stamp is the database's clock, not this script's. Asserted as a window
 * rather than an equality: the point is that nothing here sent a timestamp at
 * all, so a value inside it can only have come from `now()`.
 */
const stamped = new Date(afterRename.edited_at).getTime()
if (stamped < beforeRename - 60_000 || stamped > Date.now() + 60_000) {
  die(`\`edited_at\` is ${afterRename.edited_at}, which is not when this ran`)
}
ok('and `edited_at` came from the database — no client clock in the provenance')

if (other) {
  /*
   * The hole the two policies leave, closed by §2's trigger: an update that
   * signs itself honestly AND reassigns authorship satisfies both `with
   * check`s. No policy can refuse it — "`created_by` must not change" is a
   * comparison of the old row against the new, which is the one expression
   * `with check` cannot contain.
   */
  const { data: reauthored, error: reauthorErr } = await supabase
    .from('hangout')
    .update({ edited_by: me, created_by: other.id })
    .eq('id', renamed.id)
    .select('created_by')
    .single()
  if (reauthorErr) die('the re-authoring probe errored rather than being ignored', reauthorErr)
  if (reauthored.created_by !== me) {
    die(
      'A FRIEND REASSIGNED AUTHORSHIP OF A HANGOUT — `created_by` is mutable, so provenance ' +
        'records who last claimed it rather than who did it'
    )
  }
  ok('`created_by` refuses to move, even in an honestly signed update (§2)')
}

/* ---------------------------------------------------------------- *
 * 4. THE DROP TRIGGER, and how narrow it is.
 *
 * `hangout_participant` has NO delete grant (`05-hangout.sql` §4). Every row
 * that disappears below was removed by a `security definer` trigger, which is
 * the only thing in this product allowed to.
 * ---------------------------------------------------------------- */
const dropFrom = romeAt(2030, 4, 3, 20)
const dropTo = romeAt(2030, 4, 3, 23)
// One Slot wider than the Hangout, so there is an outside Slot to erase.
await hold('drop', romeAt(2030, 4, 3, 19), dropTo)
const dropped = await plan('drop', dropFrom, dropTo, other ? [me, other.id] : [me])

await erase('drop', [romeAt(2030, 4, 3, 19)])
const afterOutside = await participantsOf(dropped.id)
if (!afterOutside.some((row) => row.friend_id === me)) {
  die(
    'ERASING AVAILABILITY OUTSIDE A HANGOUT DROPPED ME FROM IT — the trigger is not narrowed ' +
      "by its transition table, and ticket 08 §10's dialog now under-reports every erase"
  )
}
ok('erasing Availability outside the range drops nobody')

await erase('drop', [romeAt(2030, 4, 3, 20, 30)])
const afterInside = await participantsOf(dropped.id)
if (afterInside.some((row) => row.friend_id === me)) {
  die(
    'ERASING ONE SLOT INSIDE A HANGOUT DID NOT DROP ME — the trigger is missing, or coverage ' +
      'is not exact slot-set containment (ticket 07 §7)'
  )
}
ok('erasing ONE Slot inside the range drops me — the rule is strict, not proportional')
note('  and a row went from a table this client holds no delete grant on')

if (other) {
  if (!afterInside.some((row) => row.friend_id === other.id)) {
    die(
      "MY ERASE DROPPED SOMEBODY ELSE — the trigger is not scoped to the Friend whose Slots " +
        'went, so one person tidying up empties everybody'
    )
  }
  ok("and it drops only the Friend whose Slots went — the other Participant is untouched")
  if (!(await hangoutById(dropped.id))) {
    die('the Hangout was auto-cancelled with a Participant still on it')
  }
  ok('the Hangout survives, because somebody is still on it')
}

/* ---------------------------------------------------------------- *
 * 5. The auto-cancel, from the drop.
 *
 * Ticket 08 §4, and ticket 07's amendment on why the UI path is not enough:
 * the trigger can empty a Hangout with nobody clicking anything.
 * ---------------------------------------------------------------- */
const emptyFrom = romeAt(2030, 4, 4, 20)
const emptyTo = romeAt(2030, 4, 4, 23)
await hold('auto-cancel', emptyFrom, emptyTo)
const soloDrop = await plan('auto-cancel', emptyFrom, emptyTo, [me])

// The whole range in one statement — which is also the statement-level trigger
// doing an eight-Slot erase once rather than six times.
await erase('auto-cancel', slotsOf(emptyFrom, emptyTo))
if (await hangoutById(soloDrop.id)) {
  die(
    "THE LAST PARTICIPANT WAS DROPPED AND THE HANGOUT SURVIVED — ticket 08 §4's auto-cancel " +
      'is missing, and an empty Hangout now holds its window against the exclusion constraint'
  )
}
ok('dropping the last Participant auto-cancels the Hangout (ticket 08 §4)')

/* ---------------------------------------------------------------- *
 * 6. The auto-cancel, from Leave — the other trigger.
 *
 * Leave is an `update` on `hangout_participant`, which the drop trigger cannot
 * see. Two paths, one `cancel_empty_hangouts`.
 * ---------------------------------------------------------------- */
const leaveAlone = await plan('leave', romeAt(2030, 4, 5, 20), romeAt(2030, 4, 5, 21), [me])
const { error: leaveErr } = await supabase
  .from('hangout_participant')
  .update({ left_at: new Date().toISOString() })
  .eq('hangout_id', leaveAlone.id)
  .eq('friend_id', me)
if (leaveErr) die('leaving failed', leaveErr)
if (await hangoutById(leaveAlone.id)) {
  die('THE LAST PARTICIPANT LEFT AND THE HANGOUT SURVIVED — the second trigger is missing')
}
ok('the last Participant LEAVING auto-cancels it too — a different statement, same rule')

if (other) {
  const shared = await plan('leave-shared', romeAt(2030, 4, 6, 20), romeAt(2030, 4, 6, 22), [
    me,
    other.id,
  ])
  await hold('leave-shared', romeAt(2030, 4, 6, 20), romeAt(2030, 4, 6, 22))

  const { error: sharedLeaveErr } = await supabase
    .from('hangout_participant')
    .update({ left_at: new Date().toISOString() })
    .eq('hangout_id', shared.id)
    .eq('friend_id', me)
  if (sharedLeaveErr) die('leaving a shared Hangout failed', sharedLeaveErr)

  if (!(await hangoutById(shared.id))) die('LEAVING CANCELLED A HANGOUT SOMEBODY ELSE IS ON')
  ok('leaving one somebody else is on cancels nothing')

  /*
   * "Leaving does not change your Availability" (issue 10, `CONTEXT.md`). It is
   * the whole distinction from a drop: a drop is the *consequence* of erasing,
   * and a Leave is a statement about the plan while the Slots underneath stand.
   */
  const { data: stillHeld, error: heldErr } = await supabase
    .from('availability')
    .select('slot_start')
    .eq('friend_id', me)
    .gte('slot_start', romeAt(2030, 4, 6, 20))
    .lt('slot_start', romeAt(2030, 4, 6, 22))
  if (heldErr) die('could not re-read my Availability after leaving', heldErr)
  if (stillHeld.length !== 4) {
    die(`LEAVING ERASED MY AVAILABILITY — ${stillHeld.length} of 4 Slots left`)
  }
  ok('and it leaves my Availability exactly as it was')

  const { data: rejoined, error: rejoinErr } = await supabase
    .from('hangout_participant')
    .update({ left_at: null })
    .eq('hangout_id', shared.id)
    .eq('friend_id', me)
    .select('left_at')
    .single()
  if (rejoinErr) die('re-joining failed', rejoinErr)
  if (rejoined.left_at !== null) die('re-joining did not clear `left_at`')
  ok('re-Join clears `left_at` — sticky, but the door is not locked (ticket 08 §9)')
}

/* ---------------------------------------------------------------- *
 * 7. The Past exemption — the drop is strict, the auto-cancel is not.
 *
 * Ticket 07 §7 makes any loss of coverage a drop, with no clock in it. Ticket
 * 08 §6 makes a Past Hangout uneditable — no join, no retime, **no cancel** —
 * and an auto-cancel is a cancel. So a Past Hangout can end up with nobody on
 * it, and it stays. Tidying up last month cannot erase last month's plans.
 * ---------------------------------------------------------------- */
const pastFrom = romeAt(2020, 4, 7, 20)
const pastTo = romeAt(2020, 4, 7, 21)
await hold('past', pastFrom, pastTo)
const past = await plan('past', pastFrom, pastTo, [me])

await erase('past', slotsOf(pastFrom, pastTo))
const pastParticipants = await participantsOf(past.id)
if (pastParticipants.length !== 0) die('the drop did not fire on a Past Hangout')
ok('the strict drop still fires on a Past Hangout — ticket 07 §7 has no clock in it')

if (!(await hangoutById(past.id))) {
  die(
    'A PAST HANGOUT WAS AUTO-CANCELLED — ticket 08 §6 makes it uneditable and ticket 01 says ' +
      'nothing is ever auto-deleted, so tidying old Availability now erases old plans'
  )
}
ok('and the Past Hangout itself stays — auto-cancel is a cancel, and Past refuses those')

/* ---------------------------------------------------------------- *
 * 8. ADR-0002's RPC. The locks first.
 * ---------------------------------------------------------------- */
const { error: anonRpcErr } = await anon.rpc('retime_hangout', {
  hangout_id: past.id,
  starts_at: romeAt(2030, 4, 9, 20),
  ends_at: romeAt(2030, 4, 9, 21),
})
if (!anonRpcErr) die('AN ANONYMOUS CLIENT CALLED THE RETIME RPC — the revoke did not run')
ok(`anonymous \`retime_hangout\` is refused (${anonRpcErr.code ?? 'no code'})`)

const retimed = await plan(
  'retime',
  romeAt(2030, 4, 10, 20),
  romeAt(2030, 4, 10, 22),
  other ? [me, other.id] : [me],
  'Moving'
)
await hold('retime', romeAt(2030, 4, 10, 20), romeAt(2030, 4, 10, 22))

/*
 * A missing Hangout is `P0002` rather than a silent zero-row update — the
 * sibling case of ticket 08 §8, where a hard delete leaves nothing to explain
 * the failure and the client has to supply the sentence.
 */
const GONE = '00000000-0000-4000-8000-000000000000'
const { error: goneErr } = await supabase.rpc('retime_hangout', {
  hangout_id: GONE,
  starts_at: romeAt(2030, 4, 11, 20),
  ends_at: romeAt(2030, 4, 11, 21),
})
if (goneErr?.code === NO_SUCH_FUNCTION) {
  die(
    'there is no `retime_hangout` function.\n' +
      '  Paste §4 of `supabase/06-hangout-lifecycle.sql` into the SQL Editor.'
  )
}
if (goneErr?.code !== NO_DATA_FOUND) {
  die('retiming a Hangout that does not exist did not raise `no_data_found`', goneErr ?? undefined)
}
ok(`retiming a cancelled Hangout raises ${NO_DATA_FOUND} — the client turns it into a sentence`)

/*
 * Off the 30-minute grid. Not checked inside the function on purpose: the table
 * constraint already refuses it (`05-hangout.sql` §1), and restating the rule
 * inside a `security definer` body would be a second place to get it wrong.
 */
const { error: offGridErr } = await supabase.rpc('retime_hangout', {
  hangout_id: retimed.id,
  starts_at: romeAt(2030, 4, 12, 20, 17),
  ends_at: romeAt(2030, 4, 12, 22),
})
if (offGridErr?.code !== CHECK_VIOLATION) {
  die('the RPC accepted an off-grid bound — coverage is now a fuzzy comparison', offGridErr ?? undefined)
}
ok(`an off-grid retime is refused with ${CHECK_VIOLATION} — by the table, not by the function`)

/*
 * The collision, which is ticket 08 §7's "rejected and surfaced in the editor".
 * The interesting half is what it leaves behind: nothing.
 */
await plan('collision', romeAt(2030, 4, 13, 20), romeAt(2030, 4, 13, 22), [me])
const { error: collisionErr } = await supabase.rpc('retime_hangout', {
  hangout_id: retimed.id,
  starts_at: romeAt(2030, 4, 13, 21),
  ends_at: romeAt(2030, 4, 13, 23),
})
if (collisionErr?.code !== EXCLUSION_VIOLATION) {
  die('retiming onto a booked window was accepted — two plans may not overlap (ticket 08 §7)', collisionErr ?? undefined)
}
ok(`retiming onto a booked window is refused with ${EXCLUSION_VIOLATION}`)

/*
 * Through `Date`, never through string comparison — PostgREST renders a
 * `timestamptz` as `2030-04-10T18:00:00+00:00` where `Date#toISOString` writes
 * `…000Z`. The same instant, two strings. This is the **third** time that trap
 * has bitten this repo (issue 07's realtime verify, the reason `slotKey`
 * exists, and this line, which reported a rolled-back transaction as a
 * half-moved Hangout on its first run).
 */
const unmoved = await hangoutById(retimed.id)
const stillAt = new Date(unmoved.starts_at).getTime()
if (stillAt !== new Date(romeAt(2030, 4, 10, 20)).getTime() || unmoved.edited_by !== null) {
  die(
    'A REFUSED RETIME LEFT THE HANGOUT HALF-MOVED — the move and the extension are not in one ' +
      'transaction, which is the whole reason the RPC takes the range as an argument'
  )
}
ok('and it leaves the Hangout exactly where it was — one statement, one transaction')

/* ---------------------------------------------------------------- *
 * 9. The retime that works, and the one write in this product that crosses
 *    Friends.
 *
 * The target is a single 30-minute Slot in 2020, deliberately: whatever this
 * writes into somebody else's calendar cannot be removed by this client
 * (`02-availability.sql` makes deletes self-only) and is never reverted
 * (ADR-0002), so the footprint is one row, in a year the Candidate scan's
 * now-forward horizon can never reach.
 * ---------------------------------------------------------------- */
const TARGET_FROM = romeAt(2020, 4, 14, 20)
const TARGET_TO = romeAt(2020, 4, 14, 20, 30)

const { data: moved, error: retimeErr } = await supabase.rpc('retime_hangout', {
  hangout_id: retimed.id,
  starts_at: TARGET_FROM,
  ends_at: TARGET_TO,
})
if (retimeErr) die('the retime failed', retimeErr)
if (new Date(moved.starts_at).getTime() !== new Date(TARGET_FROM).getTime()) {
  die('the RPC returned a row that had not moved')
}
ok('a retime moves the Hangout — to another day and another year, unrestricted (ticket 08 §2)')

if (moved.edited_by !== me) {
  die(
    'THE RPC DID NOT RECORD WHO MOVED IT — `auth.uid()` inside a `security definer` function ' +
      'must still be the calling Friend, and the owner bypasses the policy that would have said so'
  )
}
if (moved.edited_at === null) die('the retime was not stamped')
ok('and it records me as the editor — `auth.uid()` is the JWT claim, not the role')

const targetSlots = slotsOf(TARGET_FROM, TARGET_TO)
const { data: extended, error: extendedErr } = await supabase
  .from('availability')
  .select('friend_id, slot_start')
  .in('slot_start', targetSlots)
if (extendedErr) die('could not read the extension back', extendedErr)

const holdersAt = (friendId) => extended.filter((row) => row.friend_id === friendId).length
if (holdersAt(me) !== targetSlots.length) {
  die(`the retime did not extend MY Availability — ${holdersAt(me)} of ${targetSlots.length} Slots`)
}
ok('every Slot of the new range is now Availability for me')

if (other) {
  if (holdersAt(other.id) !== targetSlots.length) {
    die(
      'THE RETIME DID NOT WRITE THE OTHER PARTICIPANT\'S CALENDAR — ADR-0002\'s narrow hole is ' +
        'not open, so a retime can silently move a plan to a time a Participant does not cover ' +
        'and nothing will repair it'
    )
  }
  ok("and for the other Participant — the ONE cross-Friend write in the product (ADR-0002)")
  note('  this client cannot undo that row: `availability` deletes are self-only, by design')
}

/*
 * Insert-only, which is what makes "may extend, never shorten" a fact rather
 * than a rule the code has to remember: the range the Hangout LEFT is still
 * Availability. ADR-0002 accepts the residue openly — no provenance on
 * Availability rows means no way to know which half hour a Hangout added.
 */
const { data: leftBehind, error: leftBehindErr } = await supabase
  .from('availability')
  .select('slot_start')
  .eq('friend_id', me)
  .gte('slot_start', romeAt(2030, 4, 10, 20))
  .lt('slot_start', romeAt(2030, 4, 10, 22))
if (leftBehindErr) die('could not check the old range', leftBehindErr)
if (leftBehind.length !== 4) {
  die(
    `THE RETIME SHORTENED SOMEBODY — ${leftBehind.length} of 4 Slots left on the old range. The ` +
      'function must only ever insert (ADR-0002), and extensions are never reverted'
  )
}
ok('the old range is untouched — the RPC only inserts, so it cannot shorten anyone')

/*
 * And the Participants came with it. A retime "can never drop anyone" (issue
 * 10) — not as a guarantee this SQL makes, but because the extension is in the
 * same statement as the move, so coverage is restored before anything could
 * notice it was lost.
 */
const stillOn = await participantsOf(retimed.id)
if (stillOn.filter((row) => row.left_at === null).length !== (other ? 2 : 1)) {
  die('the retime dropped a Participant — the extension did not precede the move')
}
ok('and nobody was dropped by it')

/* ---------------------------------------------------------------- *
 * 10. Clean up — the same sweep the run opened with.
 * ---------------------------------------------------------------- */
await sweep('clean up')
ok('probe Hangouts and Availability deleted')

if (other) {
  note('')
  note("one row is left behind on purpose — the other Participant's extension:")
  note(`  delete from public.availability`)
  note(`   where friend_id = '${other.id}'`)
  note(`     and slot_start = '${TARGET_FROM}';`)
  note('  (2020, so no Candidate can ever include it — ADR-0002 never reverts an extension)')
}

await supabase.auth.signOut()

console.log('\nAll checks passed.\n')
process.exit(0)
