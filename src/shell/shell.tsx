/**
 * THE FORK. `src/components/ui/sidebar.tsx` is untouched and stays that way.
 *
 * shadcn's sidebar keeps its state on `SidebarProvider`, so two sidebars under
 * one provider toggle together. Two nested providers do not fix it, for four
 * reasons — and the fourth is the one that decides it (ticket 12):
 *
 *   1. KEYBOARD. Each provider registers its own `window` keydown listener on
 *      a hardcoded `"b"`. Two providers = two listeners = one ⌘B toggles both.
 *      No prop remaps or disables it, so nesting cannot be corrected from
 *      outside the component.
 *   2. THE COOKIE. Both write the same `sidebar_state`, and nothing in a Vite
 *      SPA ever reads it back. Dead code that clobbers itself.
 *   3. LAYOUT. `Sidebar` positions itself `fixed inset-y-0` plus a spacer, to
 *      serve the `floating`/`inset` variants we do not use. A top bar that is
 *      not full-height-adjacent then has to be coordinated with it by hand.
 *   4. THE SHEET, and this is the decisive one. Each provider owns a private
 *      `openMobile`, so under nesting *nothing prevents both sheets being open
 *      at once*: two stacked dialogs, two backdrops, two focus traps, on a
 *      390px screen. "At most one sheet" is not a rule you can enforce from
 *      outside a component. It is only expressible if ONE object owns both
 *      panes — which is what `sheet: Pane | null` below is.
 *
 * The fork is surgical. Of the sidebar's 23 exports, only 5 touch the context —
 * `SidebarProvider`, `Sidebar`, `SidebarTrigger`, `SidebarRail` and
 * `SidebarMenuButton`. Four of those are forked here; `SidebarRail` is dropped
 * outright, because a drag rail is not a control this shell has. `SidebarInset`
 * touches no context but is layout, so `ShellInset` replaces it. That leaves
 * **17 re-exported unchanged**, and upstream fixes to them still land.
 */
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import {
  SHEET_BREAKPOINT,
  ShellContext,
  shortcutPane,
  useAppShell,
  type Pane,
  type ShellValue,
} from '@/shell/shell-context'
import * as React from 'react'
import { PanelLeftIcon, PanelRightIcon } from 'lucide-react'

/** The 18 exports that touch no context. Presentation keyed off `data-*`. */
export {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
} from '@/components/ui/sidebar'

const PANE_WIDTH = '17rem'

/** The one media query. The same 768px the `md:` utilities below resolve to. */
const SHEET_QUERY = `(max-width: ${SHEET_BREAKPOINT - 1}px)`

/**
 * Everything that differs between the two panes, in one place.
 *
 * `title` is deliberately not "Candidates": the right pane holds pinned
 * Hangouts as well, and a Candidate and a Hangout are entirely different things
 * (CONTEXT.md) — a live derivation and a fact that was written down. Naming the
 * pane after one of them would fold the other into it.
 */
const PANE: Record<Pane, { title: string; shortcut: string; icon: typeof PanelLeftIcon }> = {
  left: { title: 'Friends', shortcut: '⌘B', icon: PanelLeftIcon },
  right: { title: 'Candidates and Hangouts', shortcut: '⇧⌘B', icon: PanelRightIcon },
}

/** Ticket 12 decision 3, and not a knob: both panes open, every load. */
const BOTH_OPEN: Record<Pane, boolean> = { left: true, right: true }

export const AppShellProvider = ({
  className,
  style,
  children,
  ...props
}: React.ComponentProps<'div'>) => {
  const [open, setOpen] = React.useState(BOTH_OPEN)
  const [sheet, setSheet] = React.useState<Pane | null>(null)
  // Read synchronously rather than through `useIsMobile`, which returns `false`
  // until its first effect runs — that would render three columns for a frame
  // on a phone.
  const [isSheet, setIsSheet] = React.useState(() => window.matchMedia(SHEET_QUERY).matches)

  React.useEffect(() => {
    const mql = window.matchMedia(SHEET_QUERY)
    const sync = () => {
      setIsSheet(mql.matches)
      // Crossing the breakpoint upward force-closes the sheet. Otherwise a
      // dialog sits over a layout that has already grown its columns back.
      if (!mql.matches) setSheet(null)
    }
    mql.addEventListener('change', sync)
    sync()
    return () => mql.removeEventListener('change', sync)
  }, [])

  const toggle = React.useCallback(
    (pane: Pane) => {
      // No cookie, and none reinstated. View state in this app is deliberately
      // ephemeral (ticket 12); every load is left-open, right-open.
      if (isSheet) setSheet((current) => (current === pane ? null : pane))
      else setOpen((previous) => ({ ...previous, [pane]: !previous[pane] }))
    },
    [isSheet]
  )

  // ONE listener, both panes, owned rather than inherited.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const pane = shortcutPane(event)
      if (!pane) return
      // ⇧⌘B is also Chrome's show/hide-bookmarks-bar. Accepted, with eyes open
      // (ticket 12 decision 2) — `preventDefault` is measured to win.
      event.preventDefault()
      toggle(pane)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggle])

  const value = React.useMemo<ShellValue>(
    () => ({ open, toggle, isSheet, sheet, setSheet }),
    [open, toggle, isSheet, sheet]
  )

  return (
    <ShellContext.Provider value={value}>
      <div
        data-slot="shell"
        style={{ '--sidebar-width': PANE_WIDTH, ...style } as React.CSSProperties}
        className={cn('flex h-svh w-full flex-col overflow-hidden bg-background', className)}
        {...props}
      >
        {children}
      </div>
    </ShellContext.Provider>
  )
}

/**
 * A pane. In flow above the breakpoint — a flex column whose width animates to
 * zero — and a Sheet below it. The `data-*` attributes match the shared
 * component's, so every borrowed subcomponent's `group-data-[…]` selector still
 * resolves.
 */
export const ShellSidebar = ({
  side,
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & { side: Pane }) => {
  const { open, isSheet, sheet, setSheet } = useAppShell()

  if (isSheet) {
    return (
      <Sheet open={sheet === side} onOpenChange={(next) => setSheet(next ? side : null)}>
        <SheetContent
          side={side}
          data-slot="sidebar"
          data-mobile="true"
          className="w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground sm:max-w-(--sidebar-width)"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{PANE[side].title}</SheetTitle>
            <SheetDescription>The {side} pane.</SheetDescription>
          </SheetHeader>
          <div className="flex h-full w-full flex-col overflow-hidden">{children}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <div
      data-slot="sidebar"
      data-side={side}
      data-state={open[side] ? 'expanded' : 'collapsed'}
      className={cn(
        'group peer hidden h-full shrink-0 overflow-hidden text-sidebar-foreground transition-[width] duration-200 ease-linear md:block',
        'w-(--sidebar-width) data-[state=collapsed]:w-0',
        className
      )}
      {...props}
    >
      {/*
        Fixed width, so the contents do not reflow while the outer width
        animates. Which edge carries the border is the one thing still read off
        `side` directly — it is a fact about the layout, not about the pane.
      */}
      <div
        data-sidebar="sidebar"
        className={cn(
          'flex h-full w-(--sidebar-width) flex-col bg-sidebar',
          side === 'left' ? 'border-r' : 'border-l'
        )}
      >
        {children}
      </div>
    </div>
  )
}

/** The centre column. Scrolls on its own; the page never does. */
export const ShellInset = ({ className, ...props }: React.ComponentProps<'main'>) => (
  <main
    data-slot="shell-inset"
    className={cn('flex min-w-0 flex-1 flex-col overflow-hidden bg-background', className)}
    {...props}
  />
)

/**
 * A trigger, per pane. Two of them, because one `SidebarTrigger` reading an
 * ambient "the sidebar" is the assumption this file exists to break.
 *
 * Both live in the top bar and are visible at every width — below the
 * breakpoint there is no keyboard, so the shortcuts cannot be the only way in.
 */
export const ShellTrigger = ({
  side,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { side: Pane }) => {
  const { toggle, open, isSheet, sheet } = useAppShell()
  const { title, shortcut, icon: Icon } = PANE[side]
  const expanded = isSheet ? sheet === side : open[side]
  return (
    <Button
      data-slot="shell-trigger"
      data-side={side}
      variant="ghost"
      size="icon-sm"
      aria-expanded={expanded}
      title={`${title} (${shortcut})`}
      className={className}
      onClick={() => toggle(side)}
      {...props}
    >
      <Icon />
      {/* The same name the sighted user reads off the tooltip, not "left panel". */}
      <span className="sr-only">Toggle {title}</span>
    </Button>
  )
}

/**
 * The last forked export, and the only one with no call site yet — the roster
 * rows that will use it are issue 04's.
 *
 * It is here rather than deferred because the shared `SidebarMenuButton` calls
 * the shared `useSidebar()` unconditionally, for a tooltip it shows when the
 * sidebar is collapsed to icons, and so **throws under this provider**. Left
 * out, it is neither forked nor re-exported, and the next Friend to build a
 * roster row imports the one that throws. We never collapse to icons, so the
 * tooltip has nothing to do: same classes, that branch gone.
 */
export const ShellMenuButton = ({
  className,
  isActive = false,
  ...props
}: React.ComponentProps<'button'> & { isActive?: boolean }) => (
  <button
    type="button"
    data-slot="sidebar-menu-button"
    data-sidebar="menu-button"
    data-size="default"
    data-active={isActive || undefined}
    className={cn(
      'peer/menu-button group/menu-button flex h-8 w-full items-center gap-2 overflow-hidden rounded-none p-2 text-left text-xs ring-sidebar-ring outline-hidden transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pr-8 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent disabled:pointer-events-none disabled:opacity-50 data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-accent-foreground [&>span:last-child]:truncate [&_svg]:size-4 [&_svg]:shrink-0',
      className
    )}
    {...props}
  />
)
