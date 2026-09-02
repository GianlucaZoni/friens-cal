import { useSession } from '@/auth/use-session'
import { floorOfView } from '@/availability/slots'
import { withRetries } from '@/availability/write-model'
import type { Candidate, HangoutRange } from '@/candidates/candidates'
import { whenOf } from '@/candidates/when'
import { toast } from '@/components/ui/toast-manager'
import {
  hangoutsFrom,
  isOverlapRejection,
  rangesOf,
  wouldAutoCancel,
  type Hangout,
} from '@/hangouts/hangout'
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
  /* ------------------------------------------------------------------ *
   * The lifecycle, as five writes
   *
   * Every one of them resolves to **a message to show, or null** — the shape
   * `useSaveAction` already consumes, which is what lets the detail and the
   * retime dialog hold their own pending state and report the outcome *in
   * place* rather than through a toast. Issue 10's last acceptance criterion
   * asks for that explicitly about the retime, and it is the right shape for
   * all five: each one is a control inside a surface that is still open when
   * the answer arrives.
   *
   * **None of them is optimistic**, for the reason `confirm` is not (ticket 19's
   * optimism was for a 60fps drag): each is one deliberate press whose whole
   * point is whether the database agreed. What they do instead is fold the row
   * they get back, so the surface does not sit unchanged waiting for a Realtime
   * echo that is a round trip away.
   * ------------------------------------------------------------------ */

  /** Set or clear the title. A rename **is** an edit, and marks the Hangout. */
  rename: (hangout: Hangout, title: string | null) => Promise<string | null>
  /**
   * Move it, and extend every current Participant to cover the new time —
   * ADR-0002's one narrow hole, in one transaction.
   */
  retime: (hangout: Hangout, startsAt: number, endsAt: number) => Promise<string | null>
  /** Hard delete, no tombstone, no undo (ticket 08 §3). */
  cancel: (hangout: Hangout) => Promise<string | null>
  /** Set your own `left_at`. Leaves your Availability untouched. */
  leave: (hangout: Hangout) => Promise<string | null>
  /**
   * Become a Participant, and write the Availability to cover the Hangout —
   * *"joining is a statement that you are free"* (`CONTEXT.md`).
   *
   * `missing` is the Slots the viewer does not hold, computed by the caller
   * because the caller is what holds the Availability store. The same call is
   * the re-Join of a Friend who Left.
   */
  join: (hangout: Hangout, missing: readonly number[]) => Promise<string | null>
}

/**
 * Every column the store folds, as one string.
 *
 * Four reads and three writes ask for it, and a column missing from one of them
 * is a Hangout whose provenance is silently null on whichever path fetched it —
 * which looks exactly like a Hangout nobody has edited.
 */
const HANGOUT_COLUMNS =
  'id, starts_at, ends_at, title, created_at, created_by, edited_by, edited_at'

/** The three Participant columns, for the same reason. */
const PARTICIPANT_COLUMNS = 'hangout_id, friend_id, left_at'

/**
 * The sibling case of ticket 08 §8, and it needs client copy because there is
 * nothing left to read.
 *
 * A Hangout cancelled while somebody had its editor open is a **hard delete**
 * (§3): no row, no tombstone, no error from Postgres to explain it. So the
 * update matches nothing, or the RPC raises `P0002`, and this sentence is the
 * only thing that can say what happened.
 */
const CANCELLED_ELSEWHERE = 'That hangout was cancelled while this was open.'

/** Unreachable behind `RequireAuth`, and not worth a non-null assertion. */
const SIGNED_OUT = 'You are signed out. Sign in again and try that once more.'

/** Postgres's `no_data_found`, which is §4's "that Hangout is gone" raise. */
const NO_DATA_FOUND = 'P0002'

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
        .select(HANGOUT_COLUMNS)
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
        .select(PARTICIPANT_COLUMNS)
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
      void performConfirm(candidate, userId)
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

  /* ------------------------------------------------------------------ *
   * The three folds the lifecycle needs, and nothing else does
   *
   * Named rather than inlined because five writes reach for them and the
   * Realtime handlers already do the same three things. A cancel has to drop
   * the Participants with the Hangout for the reason the DELETE handler does:
   * `on delete cascade` has already removed them in Postgres and their own
   * events may arrive in any order, so a cancelled plan would otherwise leave
   * orphans behind.
   * ------------------------------------------------------------------ */

  const foldHangout = useCallback((row: HangoutRow) => {
    setRows((current) => merged(current, [row], (it) => it.id))
  }, [])

  const forgetHangout = useCallback((hangoutId: string) => {
    setRows((current) => without(current, [hangoutId]))
    setPeople((current) => withoutHangout(current, hangoutId))
  }, [])

  const foldParticipant = useCallback((row: HangoutParticipantRow) => {
    setPeople((current) =>
      merged(current, [row], (it) => participantKey(it.hangout_id, it.friend_id))
    )
  }, [])

  /**
   * Rename — **and it is an edit**, which is the human's answer to ticket 07's
   * `Needs the human` and the reason this is one statement rather than two
   * paths.
   *
   * `edited_by` is sent by the client and enforced by the policy's
   * `with check (edited_by = (select auth.uid()))`. `edited_at` is *not* sent:
   * `06-hangout-lifecycle.sql` §2 stamps it from a trigger, so provenance never
   * carries a browser's clock.
   *
   * `title` is nullable on purpose — clearing the field is a legal way to leave
   * a Hangout unnamed, and `nameOf` is what makes that render as *"Hangout"*
   * rather than as a gap. An empty string would be a different thing: a title
   * that is present and blank.
   */
  const rename = useCallback(
    async (hangout: Hangout, title: string | null): Promise<string | null> => {
      if (userId === null) return SIGNED_OUT

      const { data, error } = await supabase
        .from('hangout')
        .update({ title, edited_by: userId })
        .eq('id', hangout.id)
        .select(HANGOUT_COLUMNS)
        .maybeSingle()

      if (error !== null) return error.message
      if (data === null) return CANCELLED_ELSEWHERE
      foldHangout(data)
      return null
    },
    [userId, foldHangout]
  )

  /**
   * Retime — the one action in this product that writes other people's data.
   *
   * **One `rpc` call, because it has to be one transaction.** The move and the
   * Availability extension cannot be two statements: PostgREST cannot span them
   * (ADR-0001), and if the second failed the Hangout would sit at a time nobody
   * covers with nothing to repair it — the drop trigger only fires on an
   * `availability` delete. ADR-0002's amendment records why the function
   * therefore takes the range as an argument.
   *
   * **It cannot drop anyone**, which is ticket 08 §2's consequence rather than a
   * guarantee this code makes: the extension runs in the same statement as the
   * move, so coverage is restored before anything could notice it was lost.
   *
   * Nothing about the *Availability* it writes is folded in here. Those rows
   * belong to `useAvailability`, including the viewer's own, and they arrive on
   * its Realtime channel — which is also the only way the other Friends' screens
   * were ever going to hear about them.
   */
  const retime = useCallback(
    async (hangout: Hangout, startsAt: number, endsAt: number): Promise<string | null> => {
      if (userId === null) return SIGNED_OUT

      const { data, error } = await supabase.rpc('retime_hangout', {
        hangout_id: hangout.id,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: new Date(endsAt).toISOString(),
      })

      if (error !== null) {
        /*
         * Two failures with copy of their own, and both are product rules
         * rather than plumbing:
         *
         * - `23P01` is ticket 08 §7's collision. Force-writing a time that
         *   overlaps an existing Hangout "must be rejected and surfaced in the
         *   editor, not silently dropped" — which is the whole reason ticket 16
         *   made this a Dialog rather than a Popover: the rejection needs
         *   somewhere to land.
         * - `P0002` is §4's raise for a Hangout that is no longer there.
         */
        if (isOverlapRejection(error)) {
          return 'Something else is already booked at that time. Pick another slot.'
        }
        return error.code === NO_DATA_FOUND ? CANCELLED_ELSEWHERE : error.message
      }

      if (data === null) return CANCELLED_ELSEWHERE
      foldHangout(data)
      return null
    },
    [userId, foldHangout]
  )

  /**
   * Cancel — a **hard delete**, and there is nothing else to it.
   *
   * No tombstone and no undo (ticket 08 §3): the row and its Participants go,
   * the title is unrecoverable, and the other Friends find out by noticing an
   * absence. A tombstone with undo was recommended and the human chose this with
   * the trade-off in front of them, which is why the warning dialog in front of
   * it is not optional.
   *
   * A delete matching **no rows is a success**, not a case to report. Somebody
   * else cancelling it first is the outcome this call was asking for; the only
   * thing to do is forget it locally, which is what the Realtime DELETE would
   * have done a round trip later.
   */
  const cancel = useCallback(
    async (hangout: Hangout): Promise<string | null> => {
      const { error } = await supabase.from('hangout').delete().eq('id', hangout.id)
      if (error !== null) return error.message
      forgetHangout(hangout.id)
      return null
    },
    [forgetHangout]
  )

  /**
   * Leave — your own `left_at`, and **your Availability is untouched**.
   *
   * That is the whole distinction from a drop (ticket 08's transition table):
   * a drop is the consequence of erasing Availability, and a Leave is a
   * statement about the plan while the Availability underneath it stands.
   *
   * The timestamp comes from this client rather than from `now()`, which
   * PostgREST cannot express in an update payload. Nothing renders it — it is
   * read as a boolean (`stateOf`) — and the column-scoped grant means only the
   * Friend themselves can write it, so a wrong clock costs nothing here in a
   * way it would have cost `edited_at`.
   *
   * **If they were the last Participant the Hangout is gone**, from
   * `06-hangout-lifecycle.sql`'s second trigger. Predicted here rather than
   * waited for, using the same `wouldAutoCancel` the dialog used to say so:
   * `RETURNING` runs before the statement trigger, so the row we get back is a
   * Left Participant on a Hangout that no longer exists, and folding it in
   * would draw exactly that for a round trip.
   */
  const leave = useCallback(
    async (hangout: Hangout): Promise<string | null> => {
      if (userId === null) return SIGNED_OUT

      const { data, error } = await supabase
        .from('hangout_participant')
        .update({ left_at: new Date().toISOString() })
        .eq('hangout_id', hangout.id)
        .eq('friend_id', userId)
        .select(PARTICIPANT_COLUMNS)
        .maybeSingle()

      if (error !== null) return error.message
      if (data === null) return 'You are not on that hangout any more.'

      if (wouldAutoCancel(hangout, userId, Date.now())) forgetHangout(hangout.id)
      else foldParticipant(data)
      return null
    },
    [userId, foldParticipant, forgetHangout]
  )

  /**
   * Join, and re-Join, which are the same three statements.
   *
   * **Availability first.** `CONTEXT.md`: joining "also writes the Availability
   * to cover it — joining is a statement that you are free". The order is the
   * safe one: a Participant row without the Availability under it is precisely
   * the state the drop rule exists to prevent, and nothing would repair it —
   * the trigger fires on a delete, and there would not have been one. The
   * reverse failure leaves the viewer holding Availability they meant to state
   * anyway.
   *
   * **Then a row, then `left_at = null`.** Two statements rather than a
   * merge-duplicates upsert, which the column-scoped `update (left_at)` grant
   * would refuse (it would try to write the key columns too). Both are
   * idempotent, so this is one path for all three starting states instead of a
   * branch on possibly-stale client state — and `ignoreDuplicates` on the
   * insert is what keeps it from being the thing issue 09 forbade, a button
   * clearing somebody's Left as a side effect: the clear here is the *point*,
   * asked for by name from the detail.
   *
   * Nothing writes `edited_by`. Joining changes the Participant list, not the
   * Hangout — ticket 08 §1's mark is about the plan having moved or been
   * renamed, and a card marked `edited` because somebody joined would spend the
   * signal on the one transition that is already visible as a new face.
   */
  const join = useCallback(
    async (hangout: Hangout, missing: readonly number[]): Promise<string | null> => {
      if (userId === null) return SIGNED_OUT

      if (missing.length > 0) {
        const { error: drawError } = await supabase.from('availability').upsert(
          missing.map((slotStart) => ({
            friend_id: userId,
            slot_start: new Date(slotStart).toISOString(),
          })),
          { onConflict: 'friend_id,slot_start', ignoreDuplicates: true }
        )
        if (drawError !== null) return drawError.message
      }

      const { error: seatError } = await supabase
        .from('hangout_participant')
        .upsert(
          { hangout_id: hangout.id, friend_id: userId },
          { onConflict: 'hangout_id,friend_id', ignoreDuplicates: true }
        )
      if (seatError !== null) return seatError.message

      const { data, error } = await supabase
        .from('hangout_participant')
        .update({ left_at: null })
        .eq('hangout_id', hangout.id)
        .eq('friend_id', userId)
        .select(PARTICIPANT_COLUMNS)
        .maybeSingle()

      if (error !== null) return error.message
      if (data === null) return CANCELLED_ELSEWHERE
      foldParticipant(data)
      return null
    },
    [userId, foldParticipant]
  )

  return {
    hangouts,
    ranges,
    confirm,
    confirming,
    rename,
    retime,
    cancel,
    leave,
    join,
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
 *
 * Named for `useAvailability`'s `perform`, which is the same shape one table
 * over — the async half of a write, lifted out of the hook so the synchronous
 * half stays synchronous.
 */
const performConfirm = async (candidate: Candidate, userId: string): Promise<Landed> => {
  const when = whenOf(candidate.start, candidate.end, GROUP_TIME_ZONE)
  const range = `${when.date}, ${when.range}`

  const { data: hangout, error } = await supabase
    .from('hangout')
    .insert({
      starts_at: new Date(candidate.start).toISOString(),
      ends_at: new Date(candidate.end).toISOString(),
      /*
       * **Not optional, and the policy is why.**
       * `06-hangout-lifecycle.sql` §1 makes the insert policy
       * `with check (created_by = (select auth.uid()))`, so an insert that
       * omitted this would fail with `42501` — every confirm in the app, from
       * the moment that migration ran. A column recording who did something,
       * which anybody may set to anybody, records nothing; the `with check` is
       * what makes it provenance, and this is the line it checks.
       *
       * It records **who confirmed**, and gates nothing. The confirmer is
       * seeded as a Participant by exactly the same route as everybody else,
       * from the Candidate's Friend set, and every policy on this table is
       * still `using (true)`.
       */
      created_by: userId,
    })
    .select(HANGOUT_COLUMNS)
    .single()

  if (error !== null) {
    return isOverlapRejection(error)
      ? await joinTheWinner(candidate, userId, range)
      : reportFailure(`Couldn't confirm ${range}`, error.message)
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
     * Undo step 1 — **its own half-finished write**, not ticket 08 §4's
     * auto-cancel rule. That rule is about a Hangout whose *last Participant*
     * leaves or is dropped, and it belongs to the drop trigger (issue 10)
     * because the trigger can empty a Hangout with nobody clicking anything.
     * This is the narrower obligation that comes with issuing two statements
     * outside a transaction: PostgREST cannot span them and this project has
     * no server, so the compensation belongs to whoever issued them.
     *
     * Leaving it would be worse than a failed confirm. An empty Hangout holds
     * its window against the exclusion constraint — so nobody can confirm that
     * evening — and renders as a card with no faces on it.
     *
     * The cascade takes any participant rows that did land, so this needs no
     * second cleanup.
     */
    await supabase.from('hangout').delete().eq('id', hangout.id)
    return reportFailure(`Couldn't confirm ${range}`, failure.message)
  }

  return { hangout, participants: seeded.map((row) => ({ ...row, left_at: null })) }
}

/**
 * The losing half of the race: find the Hangout that won and join it.
 *
 * **Re-read rather than looked up locally.** The winner was inserted moments
 * ago somewhere else, so the local store almost certainly does not have it yet
 * — the Realtime event and this rejection are in flight at the same time.
 *
 * **`limit(1)`, not `maybeSingle` alone, and the difference is a bug that read
 * as a guarantee.** The exclusion constraint forbids two Hangouts overlapping
 * *each other*; it says nothing about how many may sit inside one Candidate's
 * range. A 20:00–23:00 Candidate happily contains 20:00–21:00 and 21:30–22:00.
 * The sidebar cannot normally offer such a Candidate — step 3 of the pipeline
 * blanks a Hangout's Slots, so the window would already be cut in two — but the
 * reachable case is precisely the one this function exists for: the store is
 * stale, and the two Hangouts arrive after the render. A bare `maybeSingle`
 * then answers `PGRST116` on two rows and falls through to the error this whole
 * path exists to avoid.
 *
 * **The earliest** of them, which is the honest reading of "the Hangout that
 * won": it is the one that took the start of the window the Friend clicked on.
 */
const joinTheWinner = async (
  candidate: Candidate,
  userId: string,
  range: string
): Promise<Landed> => {
  const { data: winner, error } = await supabase
    .from('hangout')
    .select(HANGOUT_COLUMNS)
    // Half-open, matching `tstzrange`'s `[)`: a plan ending exactly where this
    // Candidate starts is not the one that beat us to it.
    .lt('starts_at', new Date(candidate.end).toISOString())
    .gt('ends_at', new Date(candidate.start).toISOString())
    .order('starts_at')
    .limit(1)
    .maybeSingle()

  if (error !== null || winner === null) {
    /*
     * The overlap was rejected and then could not be found — a plan confirmed
     * and cancelled inside one round trip, or a read that failed. Reported
     * rather than retried: the Candidate is still on screen and clicking again
     * is the right move, which is more than an automatic retry could promise.
     */
    return reportFailure(
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
    return reportFailure(
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
const reportFailure = (title: string, description: string): Landed => {
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
