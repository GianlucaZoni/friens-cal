import { cn } from '@/lib/utils'
import { WEEK_STARTS_ON, type CalendarViewState } from '@/shell/use-calendar-view'
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns'

/**
 * The centre column: an empty lattice at the density the real grid will have.
 *
 * A stub. Issue 05 reads Availability into the week grid, issue 07 makes it a
 * heatmap, and issue 11 builds the month view. What the shell owes them is the
 * scroll behaviour — the grid scrolls inside the inset, never the page — and
 * the week's column headers, which are its own.
 */
export const CalendarStub = ({ calendar }: { calendar: CalendarViewState }) =>
  calendar.view === 'week' ? (
    <WeekLattice days={calendar.days} />
  ) : (
    <MonthLattice anchor={calendar.anchor} />
  )

const WeekLattice = ({ days }: { days: Date[] }) => (
  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    {/* `pl-10` is the hour gutter's `w-10` below, so the columns line up. */}
    <div className="flex shrink-0 border-b pl-10">
      {days.map((day) => (
        <div
          key={day.toISOString()}
          className={cn(
            'flex-1 border-l py-1.5 text-center text-[11px] font-medium tabular-nums',
            isToday(day) ? 'text-foreground' : 'text-muted-foreground'
          )}
        >
          {/*
              "the date number after the three-letter weekday" (ticket 12
              decision 6), at every width — the ticket says three letters and
              names no exception, and issue 12 owns the phone. The bar's label
              is month and year only, so this is the only place day-level
              precision lives, and it sits next to the column it describes.
            */}
          {format(day, 'EEE d')}
        </div>
      ))}
    </div>

    <div className="flex min-h-0 flex-1 overflow-auto">
      <div className="w-10 shrink-0">
        {HOURS.map((hour) => (
          <div
            key={hour}
            className="h-10 pr-1 text-right text-[9px] tabular-nums text-muted-foreground/70"
          >
            {String(hour).padStart(2, '0')}
          </div>
        ))}
      </div>
      <div className="flex flex-1">
        {days.map((day) => (
          <div key={day.toISOString()} className="flex-1 border-l">
            {HOURS.map((hour) => (
              <div key={hour} className="h-10 border-b border-border/40" />
            ))}
          </div>
        ))}
      </div>
    </div>
  </div>
)

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

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
