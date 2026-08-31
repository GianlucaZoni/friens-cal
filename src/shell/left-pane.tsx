import { DrawingControls } from '@/availability/drawing-controls'
import type { DrawingTools } from '@/availability/use-drawing-tools'
import { FriendRoster } from '@/roster/friend-roster'
import type { RosterState } from '@/roster/use-roster'
import { MiniCalendar } from '@/shell/mini-calendar'
import { SidebarContent, SidebarHeader } from '@/shell/shell'
import { useAppShell } from '@/shell/shell-context'
import type { CalendarViewState } from '@/shell/use-calendar-view'
import { useState } from 'react'

/**
 * The left pane: the date picker, then what a drag means, then the roster.
 *
 * The drawing controls sit between the two because that is what they are about:
 * the mini calendar says *where* the grid is pointed and the roster says *whose*
 * Availability is on it, and the tabbar and erase toggle say what happens when
 * you drag on it. Ticket 01's corrections put them in this pane; ticket 17 keeps
 * them here on the phone, where the pane is a sheet.
 *
 * **There is no close button in this pane** (ticket 12 decision 5). The
 * `ShellTrigger` in the top bar is the only toggle; a second control inside the
 * pane it closes is redundant.
 */
export const LeftPane = ({
  calendar,
  roster,
  tools,
}: {
  calendar: CalendarViewState
  roster: RosterState
  tools: DrawingTools
}) => {
  const { sheet } = useAppShell()
  const [hovering, setHovering] = useState(false)

  /*
    Roster blobatars animate **while the cursor is over the sidebar**, and on
    mobile **while the drawer is open** (ticket 12 decision 9) — one crowd at a
    time, rather than a wall of permanent motion.

    `sheet === 'left'` rather than "we are below the breakpoint": below it the
    pane only exists while the drawer is open today, because Base UI unmounts a
    closed sheet, but that is the sheet's implementation and not the decision.
    This is the condition the decision actually names.
  */
  const animate = sheet === 'left' || hovering

  return (
    // The handlers sit here rather than on `SidebarContent`, so the header the
    // mark lives in counts as "over the sidebar" too.
    //
    // Only a mouse counts: a tap fires `pointerenter` and never the matching
    // leave, so a touch user above the breakpoint would leave the roster
    // animating for the rest of the session.
    <div
      className="flex h-full min-h-0 flex-col"
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') setHovering(true)
      }}
      onPointerLeave={() => setHovering(false)}
    >
      <SidebarHeader className="h-12 shrink-0 justify-center border-b px-3">
        <span className="text-sm font-semibold">friens</span>
      </SidebarHeader>
      <SidebarContent>
        <MiniCalendar calendar={calendar} />
        <DrawingControls tools={tools} />
        <FriendRoster roster={roster} animate={animate} />
      </SidebarContent>
    </div>
  )
}
