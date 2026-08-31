import { useSession } from '@/auth/use-session'
import { mergeSlots, slotKey, startOfDayInZone, type SlotRow } from '@/availability/slots'
import { supabase } from '@/lib/supabase'
import { GROUP_TIME_ZONE } from '@/shell/use-calendar-view'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type AvailabilityStore = {
  /**
   * Is this Friend free in the slot beginning at this instant?
   *
   * The store behind it is keyed `(friend_id, slot_start)` — the table's own
   * key (ticket 07), and the key that makes an optimistic row and its Realtime
   * echo the same row rather than two (ticket 19).
   */
  isFree: (friendId: string, slotStart: Date) => boolean
  /** `loading` while the range the view is pointed at is still in flight. */
  status: 'loading' | 'ready' | 'error'
}

/**
 * PostgREST's page size, and the reason this is not one `select`.
 *
 * Supabase caps every response at `db-max-rows`, 1000 by default, and it does
 * so **silently** — a truncated read is indistinguishable from a Friend who
 * drew less. Slot rows reach that fast: 1000 rows is 500 hours, so a Friend who
 * marks eight hours a day crosses it inside four months, and issue 07 multiplies
 * it by the size of the Group when the `friend_id` filter comes out.
 *
 * So the first page IS the one query the issue asks for, and the loop below
 * only continues when a page comes back full — which, until someone has drawn a
 * great deal, never happens.
 */
const PAGE_SIZE = 1000

/**
 * Everyone's Availability — which, in this slice, is your own.
 *
 * Instantiated in `AppShell` beside `useCalendarView` and `useRoster`, and
 * passed down by prop: the established place for state the whole view reaches.
 * It is a third hook rather than a branch of `useRoster` because the two answer
 * different questions and change at different rates — the roster is read once
 * and barely moves, while this one is written on every drag (issue 06) and
 * pushed to by Realtime (issue 07).
 *
 * ## Built for the two issues that consume it next
 *
 * - **Issue 06** paints into it optimistically the moment a gesture ends, with
 *   no pending treatment (ticket 19). That is an `add`/`delete` against `slots`
 *   and a revert on failure; the key is already the one the write uses.
 * - **Issue 07** fills it with *everyone's* rows. That is the removal of one
 *   `.eq('friend_id', …)` below — nothing else here is per-Friend, because the
 *   key carries the Friend.
 *
 * ## The read
 *
 * **One query, from the floor the view needs, unbounded above** — everything
 * from today forward in one go (ticket 07 §10), which is why navigating
 * *forwards* never refetches. Navigating backwards past the floor fetches the
 * strip below it and **merges** into the same store; a replace would blank the
 * week you were just looking at.
 *
 * No Realtime subscription, and no other Friend's rows. Both are issue 07's,
 * and both would be invisible here — there is nobody else to hear from yet.
 */
export const useAvailability = (days: readonly Date[]): AvailabilityStore => {
  const { state } = useSession()
  const userId = state.status === 'signed-in' ? state.user.id : null

  const [slots, setSlots] = useState<ReadonlySet<string>>(() => new Set())
  const [loadedFrom, setLoadedFrom] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)

  /**
   * The earliest instant the view needs.
   *
   * Today, or the first day on screen if the viewer has navigated behind it.
   * Taking the *minimum* rather than switching between them is what makes the
   * boot query cover the current week's earlier days as well: they are already
   * in the past by lunchtime, and fetching them as a separate strip a beat
   * later would make Monday flicker in every Friday afternoon.
   */
  const wantedFrom = useMemo(() => {
    const today = startOfDayInZone(new Date(), GROUP_TIME_ZONE).getTime()
    const firstVisible = days[0]
    return firstVisible === undefined
      ? today
      : Math.min(today, startOfDayInZone(firstVisible, GROUP_TIME_ZONE).getTime())
  }, [days])

  /**
   * How far back Postgres has already been asked. A ref, not state, because it
   * is a **request log** rather than something the render reads — and because
   * writing it from inside the effect that reads it is exactly the synchronous
   * `setState` that `eslint-plugin-react-hooks` calls a cascading render.
   *
   * It also makes this StrictMode-safe for free: the double-invoked effect
   * finds its own floor already recorded and does nothing.
   */
  const requestedFrom = useRef<number | null>(null)

  useEffect(() => {
    if (userId === null) return

    const alreadyRequested = requestedFrom.current
    if (alreadyRequested !== null && wantedFrom >= alreadyRequested) return
    requestedFrom.current = wantedFrom

    /**
     * Rebuilt per page rather than held: a PostgREST builder is single-use, and
     * `range` on a spent one throws rather than paging.
     */
    const page = (index: number) => {
      const query = supabase
        .from('availability')
        .select('friend_id, slot_start')
        // Issue 07 deletes this line and the grid becomes everyone's.
        .eq('friend_id', userId)
        .gte('slot_start', new Date(wantedFrom).toISOString())
        // Ordered because `range` is meaningless over an unordered result:
        // without it the pages may overlap and miss rows between them.
        .order('slot_start')
        .range(index * PAGE_SIZE, index * PAGE_SIZE + PAGE_SIZE - 1)

      return alreadyRequested === null
        ? // Unbounded above: today forward, all of it.
          query
        : // Only the strip of the past the store does not already hold.
          query.lt('slot_start', new Date(alreadyRequested).toISOString())
    }

    void readEveryPage(page).then(({ data, error }) => {
      if (error) {
        // Put the floor back, or this range would never be asked for again.
        // Nothing re-runs on its own, though — the effect's inputs have not
        // moved — so the retry happens on the viewer's next navigation.
        requestedFrom.current = alreadyRequested
        console.error('Could not read Availability:', error.message)
        setFailed(true)
        return
      }
      setFailed(false)
      // No `live` flag on this promise, deliberately. A merge is idempotent, so
      // a result that lands late — after a StrictMode remount, or after the
      // viewer has navigated on — is the same rows arriving in the same store.
      // Discarding it would be the only way to lose them.
      setSlots((current) => mergeSlots(current, data))
      setLoadedFrom((current) => (current === null ? wantedFrom : Math.min(current, wantedFrom)))
    })
  }, [userId, wantedFrom])

  const isFree = useCallback(
    (friendId: string, slotStart: Date) => slots.has(slotKey(friendId, slotStart)),
    [slots]
  )

  return {
    isFree,
    // Derived, never assigned from inside the effect — the shape issue 04 hit
    // with the mini calendar and solved the same way. `loading` therefore also
    // covers a backwards navigation whose strip has not landed, which is right:
    // an unloaded past week and a week you drew nothing in look identical.
    status: failed
      ? 'error'
      : loadedFrom !== null && loadedFrom <= wantedFrom
        ? 'ready'
        : 'loading',
  }
}

/**
 * Every page of one range, concatenated.
 *
 * A `while` rather than recursion or `reduce`: the page count is not known
 * before the last short page arrives, so there is nothing to iterate over. The
 * repo's style rule forbids `for`, `for...of` and `for...in`; this is none of
 * them.
 */
const readEveryPage = async (
  page: (
    index: number
  ) => PromiseLike<{ data: SlotRow[] | null; error: { message: string } | null }>
): Promise<{ data: SlotRow[]; error: { message: string } | null }> => {
  const rows: SlotRow[] = []
  let index = 0
  let full = true

  while (full) {
    const { data, error } = await page(index)
    if (error) return { data: rows, error }
    rows.push(...(data ?? []))
    full = (data?.length ?? 0) === PAGE_SIZE
    index += 1
  }

  return { data: rows, error: null }
}
