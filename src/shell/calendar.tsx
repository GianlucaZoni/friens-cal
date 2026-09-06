import { MonthGrid } from '@/availability/month-grid'
import type { AvailabilityStore } from '@/availability/use-availability'
import type { DrawingTools } from '@/availability/use-drawing-tools'
import { WeekGrid, type Viewer } from '@/availability/week-grid'
import type { Hangout } from '@/hangouts/hangout'
import type { RosterFriend, SetUpFriend } from '@/roster/use-roster'
import { useAppShell } from '@/shell/shell-context'
import type { CalendarViewState } from '@/shell/use-calendar-view'
import { useCallback } from 'react'

/**
 * The centre column, and which of the four views is in it.
 *
 * **Four views, two grids.** Issue 12 adds day and 3-day, and they are not new
 * components: `WeekGrid` derives its columns, the shared hour gutter, the DST
 * odd-day's own gutter and the gesture's hit-testing from `days` alone, so a day
 * view is that grid with one column and a 3-day view is that grid with three.
 * Everything that had to learn about them is in `view.ts`. They exist because
 * issue 13 needs them: at a phone's 47px week columns no hysteresis budget can
 * exceed a column width, and 3-day's 110px is the measured escape.
 *
 * The two grids are **two visual languages over one store** rather than one grid
 * at two zoom levels. Ticket 05 prototyped the
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
  const { goToDate, setView, goPrevious, goNext } = calendar

  /**
   * What a horizontal swipe on the grid does — **issue 12 decision 8, paid
   * back**.
   *
   * That slice took `‹ ›` off the phone's bar because a fourth group does not
   * fit at 375px, and the first thing a fourth group eats is the date label. So
   * moving a week on a phone became *open the navigator, tap a day*, with issue
   * 13's swipe named as what would pay for it. This is that swipe, and it costs
   * nothing new: `goPrevious` / `goNext` already step by the current view's
   * block through `stepBy`, so the gesture measures nothing and the four views
   * need no cases.
   */
  const onPage = useCallback(
    (direction: -1 | 1) => (direction === -1 ? goPrevious() : goNext()),
    [goPrevious, goNext]
  )

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

  /*
    **The mobile month drops the avatars** (ticket 17), and it is a prop rather
    than a fork — the cell is the same cell. At ~50×60px a phone cell puts
    wrapped faces below the 12px floor prototype 14 measured, which is the exact
    failure that killed the dot row: shape stops disambiguating and two near
    hues read as one Friend. `AVATAR`'s own measurement table is the argument —
    12px is the *largest* size at which nine Friends still fit in a 78×80 cell
    carrying a chip, so a cell two thirds that size cannot hold them at any size
    that is still a face. Dropping them removes the floor rather than fighting
    it, and costs nothing, because a tap already answers *who* — the cells are
    real buttons and the day panel opens as a bottom sheet on the `(hover: none)`
    path.
  */
  const { isSheet } = useAppShell()

  return calendar.view !== 'month' ? (
    <WeekGrid
      days={calendar.days}
      availability={availability}
      viewer={viewer}
      visible={visible}
      friendsById={friendsById}
      hangouts={hangouts}
      now={now}
      tools={tools}
      onPage={onPage}
    />
  ) : (
    <MonthGrid
      /*
        The lattice, and it is the same array `AppShell` handed the two stores —
        `daysOf` answers both questions with one value, so a cell cannot be
        drawn from a range Postgres was never asked for.
      */
      days={calendar.days}
      anchor={calendar.anchor}
      faces={!isSheet}
      availability={availability}
      viewer={viewer}
      visible={visible}
      friendsById={friendsById}
      hangouts={hangouts}
      now={now}
      tools={tools}
      onPage={onPage}
      onShowWeek={onShowWeek}
    />
  )
}
