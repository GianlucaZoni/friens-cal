import { SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarHeader } from '@/shell/shell'

/**
 * The left pane: the date picker above the Friend roster.
 *
 * A stub. Issue 04 fills it in, and the shell owes it only what is here — a
 * full-height pane carrying the product mark, and the roster's place in it.
 *
 * **There is no close button in this pane** (ticket 12 decision 5). The
 * `ShellTrigger` in the top bar is the only toggle; a second control inside the
 * pane it closes is redundant, and it was in the way of the header the mark
 * wants.
 */
export const LeftPane = () => (
  <>
    <SidebarHeader className="h-12 shrink-0 justify-center border-b px-3">
      <span className="text-sm font-semibold">friens</span>
    </SidebarHeader>
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Friends</SidebarGroupLabel>
      </SidebarGroup>
    </SidebarContent>
  </>
)
