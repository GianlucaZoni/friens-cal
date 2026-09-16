import { useSession } from '@/auth/use-session'
import { useSharedCals } from '@/cal/use-cals'
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
  /*
   * The shell's one instance. It used to be a `useCals()` of its own, which was
   * a second read of the same rows on every cal screen and, worse, a separate
   * state: a rename in the switcher did not reach `namesById` below, so a clash
   * warning kept naming the cal by the name it no longer had.
   */
  const { cals, status: calsStatus } = useSharedCals()

  /**
   * The rows, **tagged with the cal they were read for** — issue 04's shape,
   * one table over.
   *
   * The tag is what keeps a snapshot read for the cal you just left from
   * describing the one you just arrived at. Every row in it was chosen by
   * `cal_id != <the cal it was read for>`, so held against a *different* cal it
   * is not merely stale: it can contain that cal's own Hangouts, and the retime
   * dialog would then have a plan colliding with itself.
   *
   * `setRows(null)` at the top of the effect would say the same thing and is a
   * `setState` in an effect body, which the lint gate refuses. This also stops
   * the hook leaning on slice 02's `key={calId}`, which remounts the tree and
   * would hide the window rather than close it.
   */
  const [read, setRead] = useState<{ calId: string; rows: readonly ParticipationRow[] } | null>(
    null
  )

  /**
   * What has already been asked for — a **request log**, so it is a ref rather
   * than state: nothing renders it, and writing state from inside the effect
   * that reads it is the cascading render `eslint-plugin-react-hooks` v7
   * rejects. It is also what makes this StrictMode-safe for free.
   */
  const requested = useRef<{ key: string; from: number } | null>(null)

  /**
   * Which failure has already been said out loud.
   *
   * The effect's dependencies include the app's half-hour clock, so without
   * this a failure that persists would raise a fresh `timeout: 0` toast every
   * thirty minutes — a stack of identical complaints about one broken read.
   * `useHangouts` needs no equivalent because nothing re-runs its effect on its
   * own.
   */
  const reported = useRef<string | null>(null)

  useEffect(() => {
    if (userId === null) return
    /*
     * Waited for rather than raced, because the cal names are resolved against
     * this same list below: a row whose cal the list has not read yet would
     * render as a commitment in a cal with no name. One round trip, and it is
     * the one the Candidate list is waiting on anyway — no card can be drawn
     * before the Availability and Hangout reads land, and both are strictly
     * larger than this.
     */
    if (calsStatus === 'loading') return
    /*
     * A failed cal list is a failed cross-cal read, and it has to say so.
     * `useCals` logs its error to the console and hands back an empty list,
     * which down here is indistinguishable from a Friend in one cal — and §1's
     * rule is that an unmarked list is only honest when the marks were actually
     * checked for.
     */
    if (calsStatus === 'error') {
      if (reported.current !== CALS_FAILED) {
        reported.current = CALS_FAILED
        sayItFailed('Your cals could not be read, so nothing here can warn you about a clash.')
      }
      return
    }
    /*
     * The whole feature, skipped. A Friend in one cal has no other cal to be
     * committed in, so the answer is known without asking — and asking anyway
     * would put a query on every calendar screen in the product to return zero
     * rows.
     */
    if (cals.length < 2) return

    /*
     * Asked again when the cal on screen changes, and when what the viewer
     * holds in it does — the four acts, as one value.
     *
     * The floor is compared as well as the key, the way `useHangouts` compares
     * its own: `now` only ever advances, so a request already logged covers
     * everything a later one would ask for. It is a comparison rather than a
     * bare key match because the day it stops being true — a device clock going
     * backwards — asking again is the right answer.
     */
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
        /*
         * Every cal but this one, and this is the one place the build departs
         * from planning ticket 09 §3, which asked for the current cal to be
         * *left in* rather than special-cased: it satisfies the predicate and
         * can never fire in it, since its own exclusion constraint makes the
         * overlap impossible, so one predicate would stay correct if that
         * constraint ever moved.
         *
         * It is filtered out anyway because §8's retime arrived after §3 was
         * written and breaks it: the plan being moved is a commitment of yours
         * in the cal on screen, and the range the picker starts on is its own,
         * so a snapshot holding it would open every retime dialog with the plan
         * colliding with itself. Excluding it by id instead would be a second
         * special case, in the one surface that recomputes.
         */
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
        /*
         * The log stays where it is, so this key is not asked for again. The
         * retry is a reload, or the next cal, or the next act — never this
         * effect firing itself on the half-hour tick, which would stack a
         * second `timeout: 0` toast about the same broken read.
         */
        if (reported.current !== key) {
          reported.current = key
          sayItFailed(
            `${error.message} — nothing here can warn you about a clash with a plan of yours elsewhere.`
          )
        }
        return
      }
      setRead({ calId, rows: data })
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

  /*
   * Nothing at all until a read for **this** cal has landed. A snapshot read
   * for another one is not a slow answer about this cal, and marking nothing is
   * the state this whole feature is built to be readable as: nothing is not an
   * answer.
   */
  const rows = read !== null && read.calId === calId ? read.rows : NOTHING_READ

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

/** The key `reported` holds when the failure was the cal list rather than a read. */
const CALS_FAILED = 'cals'

/**
 * The failure path, which is the Hangout read's: one toast that stays until it
 * is dismissed.
 *
 * The Candidate list has no failure state of its own — `useHangouts` raises
 * exactly this when its own read fails, for the reason that applies twice over
 * here: a list rendered with no marks on it looks precisely like a list that was
 * checked and found clear, and §1 says nothing in this feature may be readable
 * as an all-clear.
 */
const sayItFailed = (description: string) =>
  toast.add({
    type: 'error',
    title: "Couldn't check your other cals",
    description: `${description} Reload to try again.`,
    timeout: 0,
  })

/**
 * The empty read, as one constant.
 *
 * A fresh `[]` would be a new identity every render, and this value is a
 * dependency of every card's `clashesWith` memo — which is what makes it worth
 * the name.
 */
const NOTHING_READ: readonly ParticipationRow[] = []

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
