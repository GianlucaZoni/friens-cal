import { DrawingControls } from '@/availability/drawing-controls'
import type { DrawingTools } from '@/availability/use-drawing-tools'
import { FriendRoster } from '@/roster/friend-roster'
import type { RosterState } from '@/roster/use-roster'
import { MiniCalendar } from '@/shell/mini-calendar'
import { SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarHeader } from '@/shell/shell'
import { useAppShell } from '@/shell/shell-context'
import type { CalendarViewState } from '@/shell/use-calendar-view'
import { ViewSelector } from '@/shell/view-selector'

/**
 * The left pane: where the grid is pointed, then what a drag means, then whose
 * Availability is on it.
 *
 * The drawing controls sit between the two because that is what they are about:
 * the first says *where* and the roster says *whose*, and the tabbar and erase
 * toggle say what happens when you drag. Ticket 01's corrections put them in
 * this pane; ticket 17 keeps them here on the phone, where the pane is a sheet.
 *
 * ## The top slot is the mini calendar on desktop and the view selector on a phone
 *
 * Ticket 17 lists the drawer's contents and the mini calendar is not among them
 * — *"the view selector (day / 3-day / week / month), the drawing-mode and erase
 * controls, and the Friend roster"* — and the reason is one level up: the phone's
 * bar grew a **chevron that opens this same picker** as a date navigator, so a
 * copy in the drawer would be the second of two, one of them behind a drawer you
 * have to open first. Ticket 12 decision 4 (*keep the mini calendar in the left
 * sidebar*) is about the desktop pane and stands there untouched.
 *
 * It is the same shape as ticket 12 decision 6 one level up: controls move
 * between the bar and the pane as the width changes, and the pair of them is
 * what has to stay complete.
 *
 * **There is no close button in this pane** (ticket 12 decision 5). The
 * `ShellTrigger` in the top bar is the only toggle; a second control inside the
 * pane it closes is redundant.
 */
export const LeftPane = ({
  calendar,
  roster,
  silent,
  tools,
}: {
  calendar: CalendarViewState
  roster: RosterState
  /** Ids of the Friends with no Availability in the current view (issue 07). */
  silent: ReadonlySet<string>
  tools: DrawingTools
}) => {
  const { isSheet } = useAppShell()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SidebarHeader className="h-12 shrink-0 justify-center border-b px-3">
        <span className="text-sm font-semibold">friens</span>
      </SidebarHeader>
      <SidebarContent>
        {isSheet ? (
          <SidebarGroup>
            <SidebarGroupLabel>View:</SidebarGroupLabel>
            {/*
              The words written out, not the bar's `D / 3D / W / M`: the drawer
              is 17rem at every width it exists at, so there is nothing here for
              a breakpoint to respond to and nothing to abbreviate for.
            */}
            <ViewSelector
              view={calendar.view}
              onView={calendar.setView}
              className="mx-2 w-[calc(100%-1rem)]"
            />
          </SidebarGroup>
        ) : (
          <div className="border-b p-1">
            <MiniCalendar calendar={calendar} />
          </div>
        )}
        <DrawingControls tools={tools} />
        <FriendRoster roster={roster} silent={silent} />
      </SidebarContent>
    </div>
  )
}
