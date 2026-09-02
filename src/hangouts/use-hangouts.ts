import { useSession } from '@/auth/use-session'
import { floorOfView } from '@/availability/slots'
import { withRetries } from '@/availability/write-model'
import type { Candidate, HangoutRange } from '@/candidates/candidates'
import { whenOf } from '@/candidates/when'
import { toast } from '@/components/ui/toast-manager'
import { hangoutsFrom, isOverlapRejection, rangesOf, type Hangout } from '@/hangouts/hangout'
import type { HangoutParticipantRow, HangoutRow } from '@/lib/database.types'
import { PAGE_SIZE, readEveryPage } from '@/lib/paged-read'
import { supabase } from '@/lib/supabase'
import { GROUP_TIME_ZONE } from '@/shell/use-calendar-view'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type HangoutStore = {
  /**
   * Every Hangout the app has read, chronological — Past ones included, because
   * a Hangout stays on the grid forever (ticket 08 §6).
   */
  hangouts: readonly Hangout[]
  /**
   * Step 3 of the Candidate pipeline: *blank the Hangouts, for every Friend*.
   *
   * A **stable reference** while the store has not moved, which is not a
   * micro-optimisation: it is a dependency of the whole scan, so a fresh array
   * per render would re-run the pipeline whenever anything in the shell
   * re-rendered. It is the constant `AppShell` used to pass, now with rows in
   * it.
   */
  ranges: readonly HangoutRange[]
  /** `loading` until the range the view is pointed at has landed. */
  status: 'loading' | 'ready' | 'error'
  /**
   * Confirm a Candidate into a Hangout — **the only way a Hangout is ever
   * created** (ticket 01). Drawing one on the grid does not exist.
   */
  confirm: (candidate: Candidate) => void
  /** The Candidate whose confirm is in flight, by `Candidate['id']`. */
  confirming: string | null
}

/** The store's two key spaces. A Hangout is its uuid; a Participant is the pair. */
const participantKey = (hangoutId: string, friendId: string) => `${hangoutId}|${friendId}`

/**
 * Everybody's Hangouts, and the one write that makes one.
 *
 * Instantiated in `AppShell` beside `useAvailability`, and for the same reason:
 * **two columns need it.** The centre draws Hangouts on the grid for every
 * Friend, Participant or not, and the right pane pins them above the Candidate
 * list — and the Candidate pipeline needs their ranges to blank its own Slots.
 * Nowhere further down the tree holds all three.
 *
 * ## The read
 *
 * Two flat queries rather than one embedded `select`. PostgREST would happily
 * nest the participants under their Hangout, and it is the wrong shape here:
 * Realtime delivers the two tables as **separate event streams**, so the client
 * has to hold them flat anyway, and an embedded read cannot page its children.
 * `hangoutsFrom` is the one place they are put back together.
 *
 * Hangouts are read by `ends_at`, not `starts_at` — a Hangout that started
 * before the floor and has not finished is exactly the one the grid must draw.
 * Participants are read **unfiltered**: the table holds one row per Friend per
 * plan, orphans are simply never looked up (`hangoutsFrom`), and filtering them
 * by `hangout_id in (…)` would make the second query depend on the first,
 * turning one round trip into two.
 *
 * ## The write, and the race it cannot avoid
 *
 * `confirm` is **not optimistic**, and that is a departure from ticket 19 worth
 * saying out loud. Optimism there was for a 60fps gesture, where a frame of
 * lag is the whole complaint. A confirm is one click, and its entire point is
 * that it either won the race or lost it — painting a Hangout before the
 * database has agreed there is one would show a plan that may be about to
 * become somebody else's.
 *
 * ## Realtime
 *
 * Both tables, all three events. This is what makes the *other* Friends' screens
 * correct: the exclusion constraint resolves the race in the database, but only
 * the losing client learns from its own error. Everyone else finds out a plan
 * exists from this stream — and a Hangout blanks its Slots out of their
 * Candidate list, so without it their sidebar keeps offering a window that is
 * already booked.
 */
export const useHangouts = (days: readonly Date[]): HangoutStore => {
  const { state } = useSession()
  const userId = state.status === 'signed-in' ? state.user.id : null

  const [rows, setRows] = useState<ReadonlyMap<string, HangoutRow>>(() => new Map())
  const [people, setPeople] = useState<ReadonlyMap<string, HangoutParticipantRow>>(() => new Map())
  const [loadedFrom, setLoadedFrom] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)

  /** The floor both stores share, so neither can draw into a range the other has not read. */
  const wantedFrom = useMemo(() => floorOfView(days, GROUP_TIME_ZONE), [days])

  /**
   * How far back Postgres has already been asked — a **request log**, so it is
   * a ref rather than state: nothing renders it, and writing state from inside
   * the effect that reads it is the cascading render
   * `eslint-plugin-react-hooks` v7 rejects.
   *
   * It also makes this StrictMode-safe for free: the double-invoked effect
   * finds its own floor already recorded and does nothing.
   */
  const requestedFrom = useRef<number | null>(null)

  /**
   * Whether a confirm is already in the air — a ref, not `confirming`.
   *
   * `confirming` drives the spinner and is state, which means two clicks
   * arriving in the **same React batch** both read `null` from the same closure
   * and both write. That is not a theoretical double-click: the second insert
   * loses the exclusion constraint to the first, converts into a Join of the
   * Hangout this very Friend just created, and raises a *"somebody confirmed
   * that first"* toast about themselves.
   */
  const inFlight = useRef(false)

  useEffect(() => {
    if (userId === null) return

    const alreadyRequested = requestedFrom.current
    if (alreadyRequested !== null && wantedFrom >= alreadyRequested) return
    requestedFrom.current = wantedFrom

    const hangoutPage = (index: number) =>
      supabase
        .from('hangout')
        .select('id, starts_at, ends_at, title, created_at')
        // `ends_at`, not `starts_at`: a Hangout that began before the floor and
        // is still running is the one case where the two differ, and it is the
        // one the grid must not lose.
        .gte('ends_at', new Date(wantedFrom).toISOString())
        // Ordered because `range` is meaningless over an unordered result:
        // without it the pages may overlap and miss rows between them.
        .order('starts_at')
        .range(index * PAGE_SIZE, index * PAGE_SIZE + PAGE_SIZE - 1)

    const participantPage = (index: number) =>
      supabase
        .from('hangout_participant')
        .select('hangout_id, friend_id, left_at')
        .order('hangout_id')
        .range(index * PAGE_SIZE, index * PAGE_SIZE + PAGE_SIZE - 1)

    void Promise.all([readEveryPage(hangoutPage), readEveryPage(participantPage)]).then(
      ([hangouts, participants]) => {
        const error = hangouts.error ?? participants.error
        if (error) {
          // Put the floor back, or this range would never be asked for again.
          // Nothing re-runs on its own — the effect's inputs have not moved — so
          // the retry happens on the viewer's next navigation.
          requestedFrom.current = alreadyRequested
          setFailed(true)
          /*
           * Said out loud, unlike `useAvailability`'s read failure — which has
           * the grid's own `LoadState` corner to sit in. A failed Hangout read
           * has no such surface: the grid draws no blocks and the sidebar pins
           * nothing, which looks exactly like a group that has made no plans.
           * A silent failure here would have the app confidently offering a
           * window that is already booked.
           */
          toast.add({
            type: 'error',
            title: "Couldn't load your hangouts",
            description: `${error.message} — reload, or navigate the calendar to try again.`,
            timeout: 0,
          })
          return
        }
        setFailed(false)
        /*
         * Merged, not replaced, and with no `live` flag on the promise. Both
         * folds are keyed and therefore idempotent, so a result landing after a
         * StrictMode remount — or after the viewer has navigated on — is the
         * same rows arriving in the same store. A replace would blank the week
         * you were just looking at; discarding the result would be the only way
         * to lose it.
         */
        setRows((current) => merged(current, hangouts.data, (row) => row.id))
        setPeople((current) =>
          merged(current, participants.data, (row) => participantKey(row.hangout_id, row.friend_id))
        )
        setLoadedFrom((current) => (current === null ? wantedFrom : Math.min(current, wantedFrom)))
      }
    )
  }, [userId, wantedFrom])

  /**
   * Everyone else's confirmations, cancellations and departures, as they happen.
   *
   * `postgres_changes` and **unfiltered**, the choices `useAvailability`
   * documents at length: Broadcast's scale is three orders of magnitude past a
   * group of nine, and there is no filter expression for "rows overlapping the
   * visible week" that would not need the channel torn down on every calendar
   * navigation.
   *
   * All three events on both tables, and each one is reachable here where
   * `availability` could skip `update`:
   *
   * - `hangout` **update** is issue 10's retime, which moves a plan under
   *   everyone at once — the one event in this product that changes a fact
   *   somebody has already read.
   * - `hangout` **delete** is cancellation, which is a hard delete with no
   *   tombstone (ticket 08 §3), so this stream *is* the notification. The
   *   payload carries the primary key, which is what the store is keyed on —
   *   hence no `replica identity full` (`05-hangout.sql` §5).
   * - `hangout_participant` **update** is Leave and re-Join; its **delete** is
   *   the drop trigger (issue 10) removing somebody whose Availability shrank,
   *   and its payload carries `(hangout_id, friend_id)`, again the whole key.
   *
   * Your own echo is a no-op rather than filtered out, for the reason issue 07
   * settled: the keys are natural, so an echo folds onto the row it came from —
   * and filtering by session would break your own second device.
   */
  useEffect(() => {
    if (userId === null) return

    const channel = supabase
      .channel('hangout')
      .on<HangoutRow>(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'hangout' },
        ({ new: row }) => setRows((current) => merged(current, [row], (it) => it.id))
      )
      .on<HangoutRow>(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'hangout' },
        ({ new: row }) => setRows((current) => merged(current, [row], (it) => it.id))
      )
      .on<HangoutRow>(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'hangout' },
        ({ old: { id } }) => {
          // `old` is `Partial<HangoutRow>` in the types, and honestly so: under
          // a narrower replica identity than this table happens to have, it
          // would be. Nothing to do without the key.
          if (id === undefined) return
          setRows((current) => without(current, [id]))
          /*
           * The participants go with it. `on delete cascade` has already
           * removed them in Postgres, and their own DELETE events may or may
           * not arrive first — so the store drops them here rather than waiting,
           * or a cancelled plan would leave its Participant rows behind as
           * orphans that the next Hangout at the same id could never have.
           */
          setPeople((current) => withoutHangout(current, id))
        }
      )
      .on<HangoutParticipantRow>(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'hangout_participant' },
        ({ new: row }) =>
          setPeople((current) =>
            merged(current, [row], (it) => participantKey(it.hangout_id, it.friend_id))
          )
      )
      .on<HangoutParticipantRow>(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'hangout_participant' },
        ({ new: row }) =>
          setPeople((current) =>
            merged(current, [row], (it) => participantKey(it.hangout_id, it.friend_id))
          )
      )
      .on<HangoutParticipantRow>(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'hangout_participant' },
        ({ old: { hangout_id: hangoutId, friend_id: friendId } }) => {
          if (hangoutId === undefined || friendId === undefined) return
          setPeople((current) => without(current, [participantKey(hangoutId, friendId)]))
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId])

  const hangouts = useMemo(
    () => hangoutsFrom([...rows.values()], [...people.values()]),
    [rows, people]
  )

  const ranges = useMemo(() => rangesOf(hangouts), [hangouts])

  /**
   * Confirm a Candidate.
   *
   * Two statements, because PostgREST cannot span them and this project has no
   * server (ADR-0001). What each one is, and what happens when it fails, is the
   * whole of this function:
   *
   * 1. **One `hangout` row.** Not retried — see below.
   * 2. **One `hangout_participant` row per Friend in the Candidate**, seeded
   *    from its Friend set. Retried, because `insert ... on conflict do nothing`
   *    on the key is idempotent.
   *
   * **Nothing here writes Availability, and nothing here should.** Retime and
   * Join extend other Friends' calendars through ADR-0002's RPC; confirm does
   * not need to, because a Candidate is *by definition* a run in which every
   * one of its Friends already holds Availability at every Slot. That is what
   * makes confirm the simple one of the three, and the reason to reach for the
   * RPC here would be a misreading of the ADR rather than a requirement.
   *
   * ## Why step 1 is not retried
   *
   * Every other write in this app retries twice with backoff, because every
   * other write is idempotent. This one is the opposite: **a retry is
   * indistinguishable from losing the race.** If the first insert landed and
   * only its response was lost, the retry comes back `23P01` — and the
   * conversion below would then treat our *own* Hangout as somebody else's,
   * Join us to it, and leave every other Friend in the Candidate unseeded.
   * One attempt, and a toast if it fails.
   *
   * ## Losing the race (ticket 08 §8)
   *
   * `23P01` from the exclusion constraint means somebody else got there first.
   * The client turns the rejection into a **Join of the Hangout that won**,
   * because that was the intent — a Friend who clicks confirm wants to be at
   * the thing, not to be told about an index. It is one participant insert:
   * this is *not* issue 10's "Join?" affordance, which also writes the
   * Availability to cover the Hangout. There is nothing to write here, for the
   * same reason step 1 needs no RPC.
   *
   * `ignoreDuplicates` on that insert is load-bearing rather than defensive: if
   * the viewer had already **Left** the winning Hangout, `do nothing` leaves
   * `left_at` where it is. Left is sticky, and re-joining is a deliberate act
   * from the Hangout's own menu (ticket 08 §9) — never a side effect of a
   * button that did something else.
   */
  const confirm = useCallback(
    (candidate: Candidate) => {
      if (userId === null || inFlight.current) return
      inFlight.current = true
      setConfirming(candidate.id)
      void settle(candidate, userId)
        .then(({ hangout, participants }) => {
          /*
           * Folded in here rather than left to the Realtime echo. The echo is
           * coming — but it is a round trip away, and the card the viewer just
           * clicked would sit there unchanged in the meantime. Both folds are
           * keyed, so the echo lands on the same rows and changes nothing.
           */
          if (hangout !== null) {
            setRows((current) => merged(current, [hangout], (row) => row.id))
          }
          setPeople((current) =>
            merged(current, participants, (row) => participantKey(row.hangout_id, row.friend_id))
          )
        })
        .finally(() => {
          inFlight.current = false
          setConfirming(null)
        })
    },
    [userId]
  )

  return {
    hangouts,
    ranges,
    confirm,
    confirming,
    // Derived, never assigned from inside the effect — the shape issue 04 hit
    // with the mini calendar and solved the same way.
    status: failed
      ? 'error'
      : loadedFrom !== null && loadedFrom <= wantedFrom
        ? 'ready'
        : 'loading',
  }
}

/** What one confirm managed to put in the world, for the store to fold in. */
type Landed = {
  hangout: HangoutRow | null
  participants: HangoutParticipantRow[]
}

/**
 * The round trip, outside the hook: one Hangout, its Participants, and the two
 * ways it can end other than working.
 */
const settle = async (candidate: Candidate, userId: string): Promise<Landed> => {
  const when = whenOf(candidate.start, candidate.end, GROUP_TIME_ZONE)
  const range = `${when.date}, ${when.range}`

  const { data: hangout, error } = await supabase
    .from('hangout')
    .insert({
      starts_at: new Date(candidate.start).toISOString(),
      ends_at: new Date(candidate.end).toISOString(),
    })
    .select('id, starts_at, ends_at, title, created_at')
    .single()

  if (error !== null) {
    return isOverlapRejection(error)
      ? await joinTheWinner(candidate, userId, range)
      : failed(`Couldn't confirm ${range}`, error.message)
  }

  const seeded = candidate.friendIds.map((friendId) => ({
    hangout_id: hangout.id,
    friend_id: friendId,
  }))

  const failure = await withRetries(async () => {
    const { error: seedError } = await supabase
      .from('hangout_participant')
      .upsert(seeded, { onConflict: 'hangout_id,friend_id', ignoreDuplicates: true })
    return seedError === null ? null : { message: seedError.message }
  })

  if (failure !== null) {
    /*
     * Undo step 1. A Hangout with no Participants is the state ticket 08 §4
     * calls auto-cancel — and the trigger that enforces it is issue 10's, so
     * until then the client is the only thing that can keep this from
     * happening. It is also the honest shape: two statements outside a
     * transaction means the compensation belongs to whoever issued them.
     *
     * The cascade takes any participant rows that did land, so this needs no
     * second cleanup.
     */
    await supabase.from('hangout').delete().eq('id', hangout.id)
    return failed(`Couldn't confirm ${range}`, failure.message)
  }

  return { hangout, participants: seeded.map((row) => ({ ...row, left_at: null })) }
}

/**
 * The losing half of the race: find the Hangout that won and join it.
 *
 * **Re-read rather than looked up locally.** The winner was inserted moments
 * ago somewhere else, so the local store almost certainly does not have it yet
 * — the Realtime event and this rejection are in flight at the same time. The
 * exclusion constraint guarantees at most one row can overlap, which is why
 * `maybeSingle` is honest here rather than optimistic.
 */
const joinTheWinner = async (
  candidate: Candidate,
  userId: string,
  range: string
): Promise<Landed> => {
  const { data: winner, error } = await supabase
    .from('hangout')
    .select('id, starts_at, ends_at, title, created_at')
    // Half-open, matching `tstzrange`'s `[)`: a plan ending exactly where this
    // Candidate starts is not the one that beat us to it.
    .lt('starts_at', new Date(candidate.end).toISOString())
    .gt('ends_at', new Date(candidate.start).toISOString())
    .maybeSingle()

  if (error !== null || winner === null) {
    /*
     * The overlap was rejected and then could not be found — a plan confirmed
     * and cancelled inside one round trip, or a read that failed. Reported
     * rather than retried: the Candidate is still on screen and clicking again
     * is the right move, which is more than an automatic retry could promise.
     */
    return failed(
      `Couldn't confirm ${range}`,
      error?.message ?? 'Something else was booked at that time, and is already gone.'
    )
  }

  const { error: joinError } = await supabase
    .from('hangout_participant')
    .upsert(
      { hangout_id: winner.id, friend_id: userId },
      { onConflict: 'hangout_id,friend_id', ignoreDuplicates: true }
    )

  if (joinError !== null) {
    return failed(
      `Couldn't confirm ${range}`,
      `Somebody else booked that time first, and adding you to their plan failed: ${joinError.message}`
    )
  }

  const booked = whenOf(
    new Date(winner.starts_at).getTime(),
    new Date(winner.ends_at).getTime(),
    GROUP_TIME_ZONE
  )

  /*
   * Said, never silent. The Friend clicked confirm on one range and is now on
   * a Hangout that may not be the same range, and with no notifications in v1
   * this toast is the only thing that can tell them.
   */
  toast.add({
    type: 'info',
    title: 'Somebody confirmed that first',
    description: `You're on ${winner.title ?? 'their hangout'}, ${booked.date}, ${booked.range}.`,
  })

  return {
    hangout: winner,
    participants: [{ hangout_id: winner.id, friend_id: userId, left_at: null }],
  }
}

/**
 * Report and give up.
 *
 * `timeout: 0` so it stays until dismissed — ticket 01 left no undo stack, and
 * a toast that names something no longer on screen is the only record that it
 * was ever attempted. No **Retry** action, unlike a failed drag: a confirm is
 * one click on a card that is still in the sidebar, so the retry is the card.
 */
const failed = (title: string, description: string): Landed => {
  toast.add({ type: 'error', title, description, timeout: 0 })
  return { hangout: null, participants: [] }
}

/** The same map with these rows folded in, keyed by whatever names them. */
const merged = <Row>(
  current: ReadonlyMap<string, Row>,
  rows: readonly Row[],
  keyOf: (row: Row) => string
): ReadonlyMap<string, Row> => {
  if (rows.length === 0) return current
  const next = new Map(current)
  rows.forEach((row) => next.set(keyOf(row), row))
  return next
}

/** The same map without these keys — the removal a fold cannot express. */
const without = <Row>(
  current: ReadonlyMap<string, Row>,
  keys: readonly string[]
): ReadonlyMap<string, Row> => {
  if (!keys.some((key) => current.has(key))) return current
  const next = new Map(current)
  keys.forEach((key) => next.delete(key))
  return next
}

/** Every Participant of one Hangout, dropped — what a cascade did in Postgres. */
const withoutHangout = (
  current: ReadonlyMap<string, HangoutParticipantRow>,
  hangoutId: string
): ReadonlyMap<string, HangoutParticipantRow> =>
  without(
    current,
    [...current.values()]
      .filter((row) => row.hangout_id === hangoutId)
      .map((row) => participantKey(row.hangout_id, row.friend_id))
  )
