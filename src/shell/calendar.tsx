import type { AvailabilityStore } from '@/availability/use-availability'
import type { DrawingTools } from '@/availability/use-drawing-tools'
import { WeekGrid, type Viewer } from '@/availability/week-grid'
import { WEEK_STARTS_ON, type CalendarViewState } from '@/shell/use-calendar-view'
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns'

/**
 * The centre column, and which of the two views is in it.
 *
 * The week is real as of issue 05 and lives in `@/availability/week-grid` —
 * with the shell's two obligations kept: the grid scrolls inside the inset and
 * the page never does, and the column headers carry the day number.
 *
 * The month is still a lattice. Issue 11 builds it.
 */
export const Calendar = ({
  calendar,
  availability,
  viewer,
  tools,
}: {
  calendar: CalendarViewState
  availability: AvailabilityStore
  viewer: Viewer | null
  tools: DrawingTools
}) =>
  calendar.view === 'week' ? (
    <WeekGrid days={calendar.days} availability={availability} viewer={viewer} tools={tools} />
  ) : (
    <MonthLattice anchor={calendar.anchor} />
  )

/**
 * Month cells carry **no numeral** (ticket 14) — the wash carries peak
 * concurrency and the avatars carry who. So the stub is a bare lattice: it
 * marks no cell in any way, because every way of marking one is issue 11's to
 * spend, and a wash on the out-of-month days would spend the wash first.
 */
const MonthLattice = ({ anchor }: { anchor: Date }) => {
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(anchor), { weekStartsOn: WEEK_STARTS_ON }),
    end: endOfWeek(endOfMonth(anchor), { weekStartsOn: WEEK_STARTS_ON }),
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 border-b">
        {days.slice(0, 7).map((day) => (
          <div
            key={day.toISOString()}
            className="flex-1 border-l py-1.5 text-center text-[11px] font-medium text-muted-foreground first:border-l-0"
          >
            {format(day, 'EEE')}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 overflow-auto">
        {days.map((day) => (
          <div key={day.toISOString()} className="min-h-20 border-b border-l first:border-l-0" />
        ))}
      </div>
    </div>
  )
}
