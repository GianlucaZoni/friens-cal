import { Calendar } from '@/components/ui/calendar'
import { FriendRoster } from '@/roster/friend-roster'
import type { RosterState } from '@/roster/use-roster'
import { SidebarContent, SidebarHeader } from '@/shell/shell'
import { useAppShell } from '@/shell/shell-context'
import { WEEK_STARTS_ON, type CalendarViewState } from '@/shell/use-calendar-view'
import { useState } from 'react'

/**
 * The left pane: the date picker above the Friend roster.
 *
 * **There is no close button in this pane** (ticket 12 decision 5). The
 * `ShellTrigger` in the top bar is the only toggle; a second control inside the
 * pane it closes is redundant.
 */
export const LeftPane = ({
  calendar,
  roster,
}: {
  calendar: CalendarViewState
  roster: RosterState
}) => {
  const { isSheet } = useAppShell()
  const [hovering, setHovering] = useState(false)

  /*
    Roster blobatars animate **while the cursor is over the sidebar** (ticket 12
    decision 9) — one crowd at a time, rather than a wall of permanent motion.
    Below the sheet breakpoint there is no cursor, so the drawer being open is
    the condition instead, which is the same decision's other half.

    Only a mouse counts. A tap fires `pointerenter` too and never fires the
    matching leave, so a touch user above the breakpoint would leave the roster
    animating for the rest of the session.
  */
  const animate = isSheet || hovering

  return (
    <>
      <SidebarHeader className="h-12 shrink-0 justify-center border-b px-3">
        <span className="text-sm font-semibold">friens</span>
      </SidebarHeader>
      <SidebarContent
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') setHovering(true)
        }}
        onPointerLeave={() => setHovering(false)}
      >
        <MiniCalendar calendar={calendar} />
        <FriendRoster roster={roster} animate={animate} />
      </SidebarContent>
    </>
  )
}

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
 * anchor still stands. Syncing it in an effect instead would set state during
 * an effect and render twice for every step of the top bar's arrows.
 *
 * In week view the seven days the grid is showing carry a marker, because the
 * grid's unit is a week and a single selected day would understate it.
 */
const MiniCalendar = ({ calendar }: { calendar: CalendarViewState }) => {
  const [browsed, setBrowsed] = useState<{ month: Date; anchor: Date } | null>(null)
  const month = browsed?.anchor === calendar.anchor ? browsed.month : calendar.anchor

  return (
    <div className="border-b p-1">
      <Calendar
        mode="single"
        // Monday, the same as the grid's. A picker starting on Sunday would put
        // the highlighted week across two of its rows.
        weekStartsOn={WEEK_STARTS_ON}
        month={month}
        onMonthChange={(next) => setBrowsed({ month: next, anchor: calendar.anchor })}
        selected={calendar.anchor}
        // `undefined` is day-picker deselecting; the calendar is always pointed
        // somewhere, so there is nothing to deselect to.
        onSelect={(date) => date && calendar.goToDate(date)}
        modifiers={calendar.view === 'week' ? { inView: calendar.days } : {}}
        // `bg-accent` is oklch(0.97) — measured invisible against the pane.
        modifiersClassNames={{ inView: 'bg-primary/10 rounded-none' }}
        className="w-full bg-transparent p-1 [--cell-size:--spacing(8)]"
      />
    </div>
  )
}
