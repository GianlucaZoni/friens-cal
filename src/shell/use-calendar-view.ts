import { useCallback, useMemo, useState } from 'react'
import {
  addDays,
  addMonths,
  addWeeks,
  format,
  isSameMonth,
  isSameYear,
  startOfWeek,
} from 'date-fns'

export type CalendarView = 'week' | 'month'

/** Monday. The grid the whole product is drawn on starts the week here. */
export const WEEK_STARTS_ON = 1

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
 * The date range the calendar is showing, and the label for it.
 *
 * **Month and year only, never a day range** (ticket 12 decision 6). Day-level
 * precision belongs on the week view's column headers, where it sits next to
 * the column it describes, rather than in a bar label that has to be re-read.
 * A week that straddles two months names both — that is still month and year.
 */
const rangeLabel = (view: CalendarView, anchor: Date, days: Date[]): string => {
  if (view === 'month') return format(anchor, 'LLLL yyyy')

  const [first] = days
  const last = days[days.length - 1]
  if (isSameMonth(first, last)) return format(first, 'LLLL yyyy')
  if (isSameYear(first, last)) return `${format(first, 'LLL')} – ${format(last, 'LLL yyyy')}`
  return `${format(first, 'LLL yyyy')} – ${format(last, 'LLL yyyy')}`
}

/**
 * Which dates the calendar is pointed at, and the four controls in the top-right
 * cluster that move it.
 *
 * Ephemeral, like every other piece of view state here: reloading lands you on
 * today's week.
 */
export const useCalendarView = () => {
  const [view, setView] = useState<CalendarView>('week')
  const [anchor, setAnchor] = useState(() => new Date())

  /** The seven days of the anchor's week, Monday first. */
  const days = useMemo(() => {
    const first = startOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON })
    return Array.from({ length: 7 }, (_, index) => addDays(first, index))
  }, [anchor])

  // Prev/next step by whatever the view is showing — a week, or a month.
  const step = useCallback(
    (direction: -1 | 1) =>
      setAnchor((current) =>
        view === 'week' ? addWeeks(current, direction) : addMonths(current, direction)
      ),
    [view]
  )

  const goPrevious = useCallback(() => step(-1), [step])
  const goNext = useCallback(() => step(1), [step])
  const goToday = useCallback(() => setAnchor(new Date()), [])

  /**
   * Jump to an arbitrary date — what the left pane's mini calendar drives
   * (issue 04). Wrapped rather than handing out `setAnchor`, whose updater
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
