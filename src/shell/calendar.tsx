import { MonthGrid } from '@/availability/month-grid'
import type { AvailabilityStore } from '@/availability/use-availability'
import type { DrawingTools } from '@/availability/use-drawing-tools'
import { WeekGrid, type Viewer } from '@/availability/week-grid'
import type { Hangout } from '@/hangouts/hangout'
import type { RosterFriend, SetUpFriend } from '@/roster/use-roster'
import type { CalendarViewState } from '@/shell/use-calendar-view'
import { useCallback } from 'react'

/**
 * The centre column, and which of the two views is in it.
 *
 * Both are real as of issue 11, and they are **two visual languages over one
 * store** rather than one grid at two zoom levels. Ticket 05 prototyped the
 * week's composite at month-cell size and it reads as a corrupted thumbnail, so
 * the month has its own cell (`month-grid.tsx`) — but the measurement under both
 * washes is the same one, and `heat.ts` is the single ramp they share. The one
 * sentence that covers the pair:
 *
 * > opacity is how many of the Friends you are trying to meet are free **at
 * > once** — the week says it half hour by half hour, the month says it for the
 * > day's best half hour.
 *
 * Everything the month needs was already arriving here for the week, which is
 * why this file barely grew: the wash is `availability` and `visible`, the
 * Hangouts' faces are `friendsById`, the three time-dependent answers are `now`,
 * and what a drag means is `tools`. The one thing that is new is the route from
 * a month cell into a week — see `onShowWeek`.
 */
export const Calendar = ({
  calendar,
  availability,
  viewer,
  visible,
  friendsById,
  hangouts,
  now,
  tools,
}: {
  calendar: CalendarViewState
  availability: AvailabilityStore
  viewer: Viewer | null
  /** The Friends the viewer is trying to meet — the heatmap's query (issue 07). */
  visible: RosterFriend[]
  /** The whole roster by id — a Hangout draws Hidden Participants in full. */
  friendsById: ReadonlyMap<string, SetUpFriend>
  hangouts: readonly Hangout[]
  /** The start of the current Slot — the app's one clock. */
  now: number
  tools: DrawingTools
}) => {
  const { goToDate, setView } = calendar

  /**
   * Drill into a day: move the anchor to it **and** switch to the week.
   *
   * The two together, from one press, which is what makes it safe for a month
   * click to leave the anchor alone. There is no selected-day state in this app —
   * the selection *is* the anchor — so a cell click that moved it would re-label
   * the bar and change the week you return to as a side effect of reading a day.
   * A month click therefore only inspects, and this is the deliberate act that
   * navigates. See `MonthGrid`.
   */
  const onShowWeek = useCallback(
    (day: Date) => {
      goToDate(day)
      setView('week')
    },
    [goToDate, setView]
  )

  return calendar.view === 'week' ? (
    <WeekGrid
      days={calendar.days}
      availability={availability}
      viewer={viewer}
      visible={visible}
      friendsById={friendsById}
      hangouts={hangouts}
      now={now}
      tools={tools}
    />
  ) : (
    <MonthGrid
      /*
        `monthDays` rather than `days`, and it is the same array `AppShell`
        handed the two stores as `shownDays` — so a cell cannot be drawn from a
        range Postgres was never asked for.
      */
      days={calendar.monthDays}
      anchor={calendar.anchor}
      availability={availability}
      viewer={viewer}
      visible={visible}
      friendsById={friendsById}
      hangouts={hangouts}
      now={now}
      tools={tools}
      onShowWeek={onShowWeek}
    />
  )
}
