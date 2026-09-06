import { daysOf, rangeLabel, stepBy, type CalendarView, type WeekStart } from '@/shell/view'
import { useCallback, useMemo, useState } from 'react'

/** Monday. The grid the whole product is drawn on starts the week here. */
export const WEEK_STARTS_ON: WeekStart = 1

/**
 * The one time zone the product renders in.
 *
 * `slot_start` is a `timestamptz` — a true instant — and every instant in the
 * database is drawn in **this** zone, whoever is looking and wherever they are
 * (ticket 07 §5). Per-viewer time zones are explicitly out of scope for v1:
 * "is Saturday 9pm his Saturday or mine" is where all the confusion lives, and
 * a group that shares a city does not have the problem.
 *
 * A constant rather than configuration because there is no settings UI to
 * change it and no column to hold it. Stored UTC keeps the door open if that
 * ever changes — this is the only line that would move.
 *
 * It lives beside `WEEK_STARTS_ON` because they are the same kind of fact: the
 * two conventions the grid's geometry is built from. The row *count* comes from
 * this one — see `slotsOfDay` in `@/availability/slots`.
 */
export const GROUP_TIME_ZONE = 'Europe/Rome'

/**
 * Which dates the calendar is pointed at, and the controls in the top bar that
 * move it.
 *
 * The arithmetic is `view.ts`, which is `@/`-free and tested — this holds the
 * two pieces of state and nothing else. Both are ephemeral, like every other
 * piece of view state here: reloading lands you on today's week.
 */
export const useCalendarView = () => {
  const [view, setView] = useState<CalendarView>('week')
  const [anchor, setAnchor] = useState(() => new Date())

  /**
   * **Every day the view on screen draws**, and therefore the range the stores
   * are read over — one array rather than issue 11's three.
   *
   * That slice needed `days` (the anchor's week), `monthDays` (the lattice) and
   * `shownDays` (whichever the view was actually drawing) because `days` had a
   * second job: it was the week grid's columns *and* the store's range, and the
   * month's lattice starts up to five weeks earlier than the anchor's Monday.
   * `floorOfView` reads the first day it is handed, so the month rendered cells
   * from a range Postgres had never been asked for, with `status` already
   * `ready` — a month of unfetched Availability is indistinguishable from a
   * month nobody drew anything in.
   *
   * With four views there is no reading under which "the anchor's week" is the
   * right answer to anything, so `daysOf` answers the one question all three
   * fields were circling and the hole is closed by there being nothing to
   * disagree with.
   */
  const days = useMemo(() => daysOf(view, anchor, WEEK_STARTS_ON), [view, anchor])

  /**
   * Prev/next step by **the current view's block** — a day, three days, a week,
   * or a month. That is also what issue 13's horizontal swipe pages by, and it
   * calls these rather than measuring anything itself: one spelling of "the next
   * block", in `stepBy`.
   */
  const step = useCallback(
    (direction: -1 | 1) => setAnchor((current) => stepBy(view, current, direction)),
    [view]
  )

  const goPrevious = useCallback(() => step(-1), [step])
  const goNext = useCallback(() => step(1), [step])
  const goToday = useCallback(() => setAnchor(new Date()), [])

  /**
   * Jump to an arbitrary date — what the left pane's mini calendar drives on
   * desktop (issue 04) and what the top bar's date navigator drives on a phone
   * (issue 12). Wrapped rather than handing out `setAnchor`, whose updater
   * overload would let a caller pass a function and step relatively; the only
   * relative moves this view has are the three above.
   */
  const goToDate = useCallback((date: Date) => setAnchor(date), [])

  return {
    view,
    setView,
    anchor,
    days,
    label: rangeLabel(view, anchor, days),
    goPrevious,
    goNext,
    goToday,
    goToDate,
  }
}

export type CalendarViewState = ReturnType<typeof useCalendarView>
