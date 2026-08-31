import { useSession } from '@/auth/use-session'
import { useAvailability } from '@/availability/use-availability'
import { identityOf } from '@/identity/friend-row'
import { useRoster } from '@/roster/use-roster'
import { Calendar } from '@/shell/calendar'
import { LeftPane } from '@/shell/left-pane'
import { RightPane } from '@/shell/right-pane'
import { AppShellProvider, ShellInset, ShellSidebar } from '@/shell/shell'
import { TopBar } from '@/shell/top-bar'
import { useCalendarView } from '@/shell/use-calendar-view'
import { useMemo } from 'react'

/**
 * The three-column shell the whole app lives in.
 *
 * **Variant C** (ticket 12 decision 1): the left pane runs the full height of
 * the window and carries the product mark; the top bar spans the centre and the
 * right pane. Two other arrangements were prototyped and this is the one the
 * reference screenshot shows — the screenshot was a decision, not a sketch.
 *
 * Below 768px both panes leave the flow and become one sheet at a time; see
 * `shell.tsx`, which owns that invariant.
 *
 * The three pieces of view state the whole app reads sit here, one hook each,
 * and travel by prop: where the calendar is pointed, which Friends are Hidden,
 * and everyone's Availability. The roster is here rather than inside the left
 * pane because Hidden is a query tool — issue 07's heatmap and issue 08's
 * Candidate list are computed over `roster.visible`, and neither of them is in
 * the sidebar. Availability is here for the same reason twice over: issue 06
 * writes into it from the grid and issue 08 computes Candidates from it in the
 * right pane.
 */
export const AppShell = () => {
  const calendar = useCalendarView()
  const roster = useRoster()
  const availability = useAvailability(calendar.days)

  /**
   * Whose Availability the grid draws, and the one colour it draws in.
   *
   * `RequireSetup` stands between here and the route, so an identity is
   * guaranteed in practice — but the row's columns are nullable in the type,
   * and `identityOf` is the codebase's single predicate for "finished setup".
   * Null renders the lattice with nothing on it, which is the honest picture of
   * a Friend who has no colour yet.
   */
  const { state } = useSession()
  const viewer = useMemo(() => {
    if (state.status !== 'signed-in') return null
    const identity = identityOf(state.friend)
    return identity === null ? null : { id: state.user.id, hue: identity.hue }
  }, [state])

  return (
    <AppShellProvider>
      <div className="flex min-h-0 flex-1">
        <ShellSidebar side="left">
          <LeftPane calendar={calendar} roster={roster} />
        </ShellSidebar>

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar calendar={calendar} />
          <div className="flex min-h-0 flex-1">
            <ShellInset>
              <Calendar calendar={calendar} availability={availability} viewer={viewer} />
            </ShellInset>
            <ShellSidebar side="right">
              <RightPane />
            </ShellSidebar>
          </div>
        </div>
      </div>
    </AppShellProvider>
  )
}
