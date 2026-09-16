import { useSession } from '@/auth/use-session'
import { useCals } from '@/cal/use-cals'
import { useCurrentCal } from '@/cal/use-current-cal'
import { toast } from '@/components/ui/toast-manager'
import type { Commitment } from '@/hangouts/elsewhere'
import { PAGE_SIZE, readEveryPage } from '@/lib/paged-read'
import { supabase } from '@/lib/supabase'
import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * The Hangouts you are on **in your other cals** — the first read in this
 * product that wants data from a cal that is not on screen.
 *
 * ## It needs no RPC and no policy change
 *
 * ADR-0003's set stays at three. After the cutover `hangout` is
 * `cal_id in (select private.my_cal_ids())` and `hangout_participant` is the
 * same expression through its own column, so "the Hangouts I am on in cals I am
 * in" is already readable by a plain `select`. Narrowed to `friend_id = me`,
 * because the warning is about **you**: the app knows your commitments because
 * you made them, and it cannot know Marco's — that blindness is the entire
 * point of per-cal Availability, and a read that went looking for it would
 * spend the decision this product exists to keep.
 *
 * ## A snapshot, not a subscription
 *
 * Planning ticket 09 §9, deliberately, so the Realtime work is not bent around
 * a nicety. These are your own commitments, made by you, elsewhere; one landing
 * during the seconds you are looking at this grid is rare, and the cost of
 * missing it is one warning that was never binding anyway. There is no channel
 * here and no poll.
 *
 * It is re-read when the **cal on screen** changes, and when **what you hold in
 * this cal** changes — `heldKey`, which is the four acts as one signal. The
 * second one is the honest half of "snapshot": today it cannot return anything
 * different, because the set excludes the cal you just acted in, and it is
 * still the read that has to be right the moment anything else can make you a
 * Participant somewhere you are not looking.
 *
 * ## Invisible until somebody is in two cals
 *
 * With one Membership the query can only ever answer nothing, so it is not
 * issued: `cals.length < 2` returns an empty list with no request at all. That
 * is every Friend in the product today, and it is why this slice shows nothing
 * to anybody until the second cal exists.
 *
 * ## And when it fails it says so
 *
 * A failed read that quietly draws no marks converts *"nothing is not an
 * answer"* into an answer, and a wrong one. So it takes the same path the
 * Hangout read takes when it fails: a toast that stays until it is dismissed,
 * next to a Candidate list that is still perfectly usable and can no longer
 * warn about anything.
 */
export const useElsewhere = ({
  now,
  held,
}: {
  now: number
  held: string
}): readonly Commitment[] => {
  const { state } = useSession()
  const userId = state.status === 'signed-in' ? state.user.id : null
  const { calId } = useCurrentCal()
  const { cals, status: calsStatus } = useCals()

  const [rows, setRows] = useState<readonly ParticipationRow[]>([])

  /**
   * What has already been asked for — a **request log**, so it is a ref rather
   * than state: nothing renders it, and writing state from inside the effect
   * that reads it is the cascading render `eslint-plugin-react-hooks` v7
   * rejects. It is also what makes this StrictMode-safe for free.
   */
  const requested = useRef<{ key: string; from: number } | null>(null)

  useEffect(() => {
    if (userId === null) return
    /*
     * Waited for rather than raced, because the cal names are resolved against
     * this same list below: a row whose cal the list has not read yet would
     * render as a commitment in a cal with no name. One round trip, and it is
     * the same one the join-or-create page already pays.
     */
    if (calsStatus === 'loading') return
    /*
     * The whole feature, skipped. A Friend in one cal has no other cal to be
     * committed in, so the answer is known without asking — and asking anyway
     * would put a query on every calendar screen in the product to return zero
     * rows.
     */
    if (cals.length < 2) return

    const key = `${calId}|${held}`
    const alreadyRequested = requested.current
    if (alreadyRequested !== null && alreadyRequested.key === key && now >= alreadyRequested.from)
      return
    requested.current = { key, from: now }

    const page = (index: number) =>
      supabase
        .from('hangout_participant')
        .select(PARTICIPATION_COLUMNS)
        // Your own rows, and the policy has already narrowed the table to the
        // cals you are a Member of. The two together are why this exposes
        // nothing to anybody: you are a Participant in everything it returns.
        .eq('friend_id', userId)
        // Left is not a commitment. It is sticky and it outranks Availability
        // permanently (`CONTEXT.md`), so a Hangout you walked out of says
        // nothing about where you will be.
        .is('left_at', null)
        // Every cal but this one. The cal on screen satisfies the predicate and
        // can never fire in it — its own exclusion constraint makes the overlap
        // impossible — so it is left out here rather than special-cased later,
        // and one rule stays correct if that constraint ever moves.
        .neq('cal_id', calId)
        /*
         * `!inner` above is what lets this filter the rows rather than the
         * embedded object: without it a Hangout that fails the test comes back
         * as a null embed on a row that is still here.
         *
         * `ends_at`, not `starts_at`, for `useHangouts`' reason one table over:
         * a commitment that began before now and has not finished is exactly
         * the one still worth warning about. There is no upper bound, because
         * the retime dialog's date field has none either — its picker can reach
         * any future day, and a snapshot clipped to the week on screen would go
         * quiet precisely where somebody is moving a plan to.
         */
        .gte('hangout.ends_at', new Date(now).toISOString())
        // Ordered, because `range` is meaningless over an unordered result:
        // without it the pages may overlap and miss rows between them.
        .order('hangout_id')
        .range(index * PAGE_SIZE, index * PAGE_SIZE + PAGE_SIZE - 1)

    void readEveryPage(page).then(({ data, error }) => {
      if (error) {
        // Put the log back, or this key would never be asked for again.
        requested.current = alreadyRequested
        toast.add({
          type: 'error',
          title: "Couldn't check your other cals",
          description: `${error.message} — nothing here can warn you about a clash with a plan of yours elsewhere. Reload to try again.`,
          timeout: 0,
        })
        return
      }
      setRows(data)
    })
  }, [userId, calId, held, now, cals.length, calsStatus])

  /**
   * The rows as commitments, named.
   *
   * The name comes from the cal list rather than from a second embed, so the
   * read stays one flat query and a cal renamed in another tab is one list away
   * from being right here too.
   */
  const namesById = useMemo(() => new Map(cals.map((cal) => [cal.id, cal.name])), [cals])

  return useMemo(
    () =>
      rows.map((row) => ({
        hangoutId: row.hangout.id,
        calId: row.hangout.cal_id,
        /*
         * The fallback is a race nothing can reach today: the list holds every
         * cal you are a Member of and the policy returns rows from no others.
         * It is here because a name is not worth an exception, and `undefined`
         * in a sentence is worse than a vague one.
         */
        calName: namesById.get(row.hangout.cal_id) ?? 'another cal',
        title: row.hangout.title,
        startsAt: new Date(row.hangout.starts_at).getTime(),
        endsAt: new Date(row.hangout.ends_at).getTime(),
      })),
    [rows, namesById]
  )
}

/**
 * The embed, as one string.
 *
 * One query rather than two, and the join is the point: a flat read of
 * `hangout_participant` answers *which plans* with no times on them, so the
 * times would be a second round trip that depends on the first.
 */
const PARTICIPATION_COLUMNS = 'hangout!inner(id, cal_id, starts_at, ends_at, title)'

/** One Participation of yours, with the plan under it. */
type ParticipationRow = {
  hangout: {
    id: string
    cal_id: string
    starts_at: string
    ends_at: string
    title: string | null
  }
}
