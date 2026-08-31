import { useRoster } from '@/roster/use-roster'
import { CalendarStub } from '@/shell/calendar-stub'
import { LeftPane } from '@/shell/left-pane'
import { RightPane } from '@/shell/right-pane'
import { AppShellProvider, ShellInset, ShellSidebar } from '@/shell/shell'
import { TopBar } from '@/shell/top-bar'
import { useCalendarView } from '@/shell/use-calendar-view'

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
 * The two pieces of view state the whole app reads sit here, one hook each, and
 * travel by prop: where the calendar is pointed, and which Friends are Hidden.
 * The roster is here rather than inside the left pane because Hidden is a query
 * tool — issue 07's heatmap and issue 08's Candidate list are computed over
 * `roster.visible`, and neither of them is in the sidebar.
 */
export const AppShell = () => {
  const calendar = useCalendarView()
  const roster = useRoster()

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
              <CalendarStub calendar={calendar} />
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
