import { markedLeftBy } from '@/cal/leaving'
import { hangoutsFrom, type Hangout } from '@/hangouts/hangout'
import { PAGE_SIZE, readEveryPage } from '@/lib/paged-read'
import { supabase } from '@/lib/supabase'
import { useEffect, useMemo, useState } from 'react'

/** What the leave dialog has to say, and whether it knows it yet. */
export type LeavingState = {
  status: 'loading' | 'ready' | 'error'
  /** The cal's future Hangouts the viewer is on, chronological. Empty until `ready`. */
  hangouts: readonly Hangout[]
}

/**
 * The cal's future Hangouts, read so the leave dialog can name the ones leaving
 * takes you off.
 *
 * ## Its own read, on a page that has no Hangout store
 *
 * Leave lives on `/`, which is outside `CurrentCalProvider` and outside the
 * shell: there is no `useHangouts` here and no `useElsewhere` — the second is
 * the same query with `neq` where this has `eq`, and it needs a cal on screen.
 * So this is a fourth reader of `hangout`, issued when the dialog mounts and
 * never again.
 *
 * **One read, not a subscription.** The dialog is open for seconds, and the
 * thing it is deciding is about to be settled in one statement. A plan
 * confirmed in the cal during those seconds would not change the answer to
 * *should I leave*.
 *
 * ## It reads the whole cal, not just the viewer's rows
 *
 * `useElsewhere` narrows to `friend_id = me` because its question is about the
 * viewer alone. This one needs the **other** Participants too, for
 * `wouldAutoCancel`: a future Hangout the viewer is alone on is deleted
 * outright by the auto-cancel the Left marker sets off, and *"leaving cancels
 * it for everybody"* is a different sentence from *"you come off it"*. The
 * embed is what makes that one query. `hangout_participant`'s select policy is
 * `cal_id in (select private.my_cal_ids())`, so a Member reads their own cal's
 * rows and this exposes nothing new.
 *
 * `cal_id` is in the filter as well as in the policy, and here it is load
 * bearing rather than a restatement: the policy admits every cal the viewer is
 * in, and this dialog is about one of them.
 *
 * ## Paged, because a silent truncation would be a lie
 *
 * A dialog that names the wrong Hangouts would be believed, and PostgREST caps
 * a response at `db-max-rows` with no error and no flag. One page covers every
 * cal that exists today; the loop is what stops the cap from quietly shortening
 * the list somebody is about to act on.
 */
export const useLeaving = (
  calId: string,
  /** The viewer, or null while there is no session — which renders as `error`. */
  friendId: string | null,
  /**
   * The instant the dialog opened, and it does not tick.
   *
   * A clock here would re-run the filter under somebody who is reading the
   * list, and a plan dropping off it mid-read is worse than one that is half a
   * minute stale. `ends_at > now` is also the trigger's own test, so the value
   * the read is issued with is the value the list is filtered by.
   */
  now: number
): LeavingState => {
  /**
   * The rows, **tagged with the cal they were read for** — issue 04's shape,
   * which `use-elsewhere.ts` carries for the same reason one table over.
   *
   * Nothing can reach it today: this hook lives in a dialog that is mounted on
   * open and unmounted on close, so `calId` cannot change under it. The tag is
   * here because the day something does change it, the failure is a dialog
   * naming another cal's plans while somebody presses the destructive button,
   * and this dialog's whole worth is that it is believed. Clearing the rows at
   * the top of the effect would say the same thing and is a `setState` in an
   * effect body, which the lint gate refuses.
   */
  const [read, setRead] = useState<{ calId: string; rows: HangoutRow[] } | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (friendId === null) return

    let live = true
    const page = (index: number) =>
      supabase
        .from('hangout')
        .select(HANGOUT_COLUMNS)
        .eq('cal_id', calId)
        // `ends_at`, not `starts_at`: a plan that began before now and has not
        // finished is one leaving still takes you off, which is exactly what
        // `mark_left_on_leaving_cal`'s `h.ends_at > now()` says.
        .gt('ends_at', new Date(now).toISOString())
        // Ordered, because `range` is meaningless over an unordered result:
        // without it the pages may overlap and miss rows between them.
        .order('id')
        .range(index * PAGE_SIZE, index * PAGE_SIZE + PAGE_SIZE - 1)

    void readEveryPage(page).then(({ data, error }) => {
      if (!live) return
      if (error) {
        // A permission-denied here is almost always the grant rather than the
        // query — this project does not expose new tables automatically. See
        // supabase/08-cal-and-membership.sql §5.
        console.error('Could not read what leaving would cost:', error.message)
        setFailed(true)
        return
      }
      setFailed(false)
      setRead({ calId, rows: data })
    })

    return () => {
      live = false
    }
  }, [calId, friendId, now])

  return useMemo(() => {
    /*
     * No session is `error` rather than `loading`, and it is derived here
     * rather than set in the effect — a `setState` in an effect body is the
     * cascading render the lint gate refuses, and there is nothing
     * asynchronous about this answer anyway. It is unreachable behind
     * `RequireAuth`; what it must not do is spin forever.
     */
    if (failed || friendId === null) return { status: 'error', hangouts: NOTHING }
    // A read for another cal is not a slow answer about this one.
    if (read === null || read.calId !== calId) return { status: 'loading', hangouts: NOTHING }

    /*
     * The embed flattened back out, because `hangoutsFrom` takes the two reads
     * the store issues separately and this one is a join. Each nested row
     * carries its own `hangout_id`, so the fold is the same fold.
     */
    const participants = read.rows.flatMap((row) => row.hangout_participant)
    return {
      status: 'ready',
      hangouts: markedLeftBy(hangoutsFrom(read.rows, participants), friendId, now),
    }
  }, [read, failed, calId, friendId, now])
}

/** The empty list, as one constant, so a loading render is not a new identity. */
const NOTHING: readonly Hangout[] = []

/**
 * The Hangout with its Participants nested, as one string.
 *
 * `created_by`, `edited_by` and `edited_at` are asked for because
 * `hangoutsFrom` folds them and the dialog would otherwise be the one caller
 * handing it a different shape. Nothing here renders them.
 */
const HANGOUT_COLUMNS =
  'id, starts_at, ends_at, title, created_by, edited_by, edited_at, hangout_participant(hangout_id, friend_id, left_at)'

/** One future Hangout of the cal, with everybody on it. */
type HangoutRow = {
  id: string
  starts_at: string
  ends_at: string
  title: string | null
  created_by: string | null
  edited_by: string | null
  edited_at: string | null
  hangout_participant: { hangout_id: string; friend_id: string; left_at: string | null }[]
}
