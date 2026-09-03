import { Calendar } from '@/components/ui/calendar'
import { WEEK_STARTS_ON, type CalendarViewState } from '@/shell/use-calendar-view'
import { useState } from 'react'

/**
 * The date picker, and the only control in the app that jumps the calendar to an
 * arbitrary date.
 *
 * Two dates, not one, and they are allowed to disagree:
 *
 * - **the anchor** — where the grid is pointed. Clicking a day sets it.
 * - **the month on show** — what the picker is displaying. Browsable on its own,
 *   so looking at March does not move the grid there. It follows the anchor
 *   whenever the anchor moves, so the two never disagree about where the grid
 *   is; it just does not force the reverse.
 *
 * The follow is a *derivation*, not an effect: a browsed month is remembered
 * together with the anchor it was browsed under, and is only used while that
 * anchor still stands. Syncing it in an effect instead would set state during an
 * effect and render twice for every press of the top bar's arrows.
 *
 * In every view but the month, **the days the grid is showing carry a marker**
 * — because the grid's unit there is a block of days and a single selected day
 * would understate it. The month is the exception in the other direction: its
 * unit *is* a day, the picker below is already a month, and marking all 35 to
 * 42 lattice cells would say "everything" rather than "here". The anchor's own
 * `selected` mark is what answers it there, which is the same split
 * `month-grid.tsx` argues from its own side.
 *
 * **`onPicked` is the phone's**: issue 12 puts this same component behind the
 * top bar's chevron as the date navigator, in a popover that has to close on the
 * press that moved the anchor. In the left pane there is nothing to close, so
 * nothing passes it.
 */
export const MiniCalendar = ({
  calendar,
  onPicked,
}: {
  calendar: CalendarViewState
  onPicked?: () => void
}) => {
  // The anchor by value rather than by reference: "the anchor still stands"
  // is a claim about the date, and a `Date` identity check would also reset the
  // browsed month on any re-set of the same instant.
  const [browsed, setBrowsed] = useState<{ month: Date; anchorTime: number } | null>(null)
  const month = browsed?.anchorTime === calendar.anchor.getTime() ? browsed.month : calendar.anchor

  return (
    <Calendar
      mode="single"
      // Monday, the same as the grid's. A picker starting on Sunday would put
      // the highlighted week across two of its rows.
      weekStartsOn={WEEK_STARTS_ON}
      month={month}
      onMonthChange={(next) => setBrowsed({ month: next, anchorTime: calendar.anchor.getTime() })}
      selected={calendar.anchor}
      // `undefined` is day-picker deselecting; the calendar is always pointed
      // somewhere, so there is nothing to deselect to.
      onSelect={(date) => {
        if (!date) return
        calendar.goToDate(date)
        onPicked?.()
      }}
      modifiers={calendar.view === 'month' ? {} : { inView: calendar.days }}
      // `bg-accent` is oklch(0.97) — measured invisible against the pane.
      modifiersClassNames={{ inView: 'bg-primary/10 rounded-none' }}
      className="w-full bg-transparent p-1 [--cell-size:--spacing(8)]"
    />
  )
}
