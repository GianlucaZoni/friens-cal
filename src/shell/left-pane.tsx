import { DrawingControls } from '@/availability/drawing-controls'
import type { DrawingTools } from '@/availability/use-drawing-tools'
import { CalSwitcher } from '@/cal/cal-switcher'
import { FriendRoster } from '@/roster/friend-roster'
import type { RosterState } from '@/roster/use-roster'
import { MiniCalendar } from '@/shell/mini-calendar'
import { SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarHeader } from '@/shell/shell'
import { useAppShell } from '@/shell/shell-context'
import type { CalendarViewState } from '@/shell/use-calendar-view'
import { ViewSelector } from '@/shell/view-selector'
import { Link } from 'react-router'

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
  now,
  tools,
}: {
  calendar: CalendarViewState
  roster: RosterState
  /** Ids of the Friends with no Availability in the current view (issue 07). */
  silent: ReadonlySet<string>
  /**
   * The app's one clock — the roster's offsets are read at it. How far another
   * Friend's clock is from yours is a fact about a moment rather than about the
   * pair of zones, so it has to be asked of the same instant everything else is.
   */
  now: number
  tools: DrawingTools
}) => {
  const { isSheet } = useAppShell()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SidebarHeader className="h-12 shrink-0 flex-row items-center gap-2 border-b px-3">
        {/*
          The wordmark is the way out of a cal, which it did not need to be
          while there was only one. It goes to `/`, the join-or-create page —
          the complete list of cals and the only place their Codes are.

          A `Link`, not a `window.location`: a full reload would throw away the
          session read, the Friend row and both stores, and land on the same
          page a client-side navigation reaches in one frame.

          **It keeps its place beside the switcher rather than being replaced
          by it**, which is where this build departs from the prototype: groups
          ticket 06 was drawn before ticket 02 made this the route to `/`, and
          ticket 05 puts Leave there next. A switcher filling the header would
          leave the complete set of cals reachable only by typing the address.
          The cost is about six characters of visible name.
        */}
        <Link
          to="/"
          className="shrink-0 rounded-sm text-sm font-semibold outline-hidden hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          friens
        </Link>
        <CalSwitcher />
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
        <FriendRoster roster={roster} silent={silent} now={now} />
      </SidebarContent>
    </div>
  )
}
