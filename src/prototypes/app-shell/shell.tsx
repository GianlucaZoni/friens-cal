/**
 * PROTOTYPE — ticket 12: the app shell, two independently-toggled sidebars.
 * THROWAWAY. Do not promote to production; rewrite properly when folding in.
 *
 * THIS IS THE FORK. `src/components/ui/sidebar.tsx` is untouched.
 *
 * Why a fork and not two nested `SidebarProvider`s, in one line each:
 *
 *   1. KEYBOARD. Each provider registers its own `window` keydown listener on
 *      the hardcoded `SIDEBAR_KEYBOARD_SHORTCUT = "b"`. Two providers = two
 *      listeners = one `cmd+b` toggles both. There is no prop to remap or
 *      disable it, so nesting cannot be made correct from the outside.
 *   2. THE SHEET BREAKPOINT. Each provider owns a private `openMobile`. Nested,
 *      nothing stops both sheets being open at once — two stacked Base UI
 *      dialogs over a 390px screen. The invariant "at most one sheet" is only
 *      expressible if one object owns both.
 *   3. THE COOKIE. Both providers write the same `sidebar_state` cookie, and
 *      nothing in a Vite SPA ever reads it back. Dead code that clobbers itself.
 *   4. LAYOUT. `Sidebar` positions itself `fixed inset-y-0`, so a top bar that
 *      is not full-height-adjacent has to be coordinated with it by hand. This
 *      fork puts the sidebars back IN FLOW (a flex column whose width animates
 *      to 0), which is what lets the three top-bar variants differ at all.
 *
 * What is forked: the provider, `Sidebar`, `SidebarTrigger`, and a stripped
 * `SidebarMenuButton` (the shared one calls the shared `useSidebar()` and would
 * throw under our provider). Everything else — header, content, group, menu,
 * item, action, badge, separator — touches no context and is RE-EXPORTED from
 * the shared file unchanged. 5 forked, 11 borrowed.
 */
import * as React from 'react'
import { PanelLeftIcon, PanelRightIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

export {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar'

export type Pane = 'left' | 'right'

/**
 * The sheet breakpoint. Same 768px as `@/hooks/use-mobile`, restated here so the
 * fork is legible on its own and so the prototype can say what it means: below
 * this width there is no three-column layout and no keyboard.
 */
export const SHEET_BREAKPOINT = 768

const PANE_WIDTH = '17rem'

type ShellContextValue = {
  /** Desktop open state, per pane. Independent. */
  open: Record<Pane, boolean>
  setOpen: (pane: Pane, open: boolean) => void
  /** Toggles the pane — the sheet below the breakpoint, the column above it. */
  toggle: (pane: Pane) => void
  /** True below SHEET_BREAKPOINT. */
  isSheet: boolean
  /**
   * THE INVARIANT. At most one sheet, ever. Opening the other closes the first.
   * This is the whole answer to ticket 12 item 4 and it is unrepresentable
   * under nested providers, where each owns a private boolean.
   */
  sheet: Pane | null
  setSheet: (pane: Pane | null) => void
}

const ShellContext = React.createContext<ShellContextValue | null>(null)

export function useAppShell() {
  const ctx = React.useContext(ShellContext)
  if (!ctx) throw new Error('useAppShell must be used within an AppShellProvider.')
  return ctx
}

/** Does this keydown mean "b" for our purposes? See the notes below. */
export function isShortcutKey(event: Pick<KeyboardEvent, 'key' | 'code'>) {
  // `key` first, so a Dvorak user gets the key they see printed. `code` as the
  // fallback, so a Cyrillic or Greek layout — where `key` is "и" or "β" — still
  // works off the physical position. Verified against both in a browser.
  return event.key.toLowerCase() === 'b' || event.code === 'KeyB'
}

export function AppShellProvider({
  defaultOpen = { left: true, right: true },
  className,
  style,
  children,
  ...props
}: React.ComponentProps<'div'> & { defaultOpen?: Record<Pane, boolean> }) {
  const [open, setOpenState] = React.useState<Record<Pane, boolean>>(defaultOpen)
  const [sheet, setSheet] = React.useState<Pane | null>(null)
  const [isSheet, setIsSheet] = React.useState(
    () => typeof window !== 'undefined' && window.innerWidth < SHEET_BREAKPOINT
  )

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${SHEET_BREAKPOINT - 1}px)`)
    const sync = () => {
      const next = window.innerWidth < SHEET_BREAKPOINT
      setIsSheet(next)
      // Crossing the boundary upward must drop any open sheet, or the dialog
      // sits over a layout that has already grown its columns back.
      if (!next) setSheet(null)
    }
    mql.addEventListener('change', sync)
    sync()
    return () => mql.removeEventListener('change', sync)
  }, [])

  const setOpen = React.useCallback((pane: Pane, value: boolean) => {
    setOpenState((prev) => ({ ...prev, [pane]: value }))
    // NO COOKIE. Ticket 01 says view state is deliberately ephemeral. The
    // shared component's `sidebar_state` write is dead code in a Vite SPA
    // (nothing reads it) and it is deleted here rather than reimplemented.
  }, [])

  const toggle = React.useCallback(
    (pane: Pane) => {
      if (isSheet) setSheet((cur) => (cur === pane ? null : pane))
      else setOpenState((prev) => ({ ...prev, [pane]: !prev[pane] }))
    },
    [isSheet]
  )

  // ONE listener for both panes, owned explicitly. Not two, not inherited.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      // The shared component omits this and therefore fires on cmd+alt+b too,
      // which is somebody else's shortcut.
      if (event.altKey) return
      if (!isShortcutKey(event)) return
      event.preventDefault()
      toggle(event.shiftKey ? 'right' : 'left')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggle])

  const value = React.useMemo<ShellContextValue>(
    () => ({ open, setOpen, toggle, isSheet, sheet, setSheet }),
    [open, setOpen, toggle, isSheet, sheet]
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
 * A pane. In flow on desktop (a flex column whose width animates to zero), a
 * Sheet below the breakpoint. Same `data-*` attributes as the shared component,
 * so every borrowed subcomponent's `group-data-[…]` selectors still resolve.
 */
export function ShellSidebar({
  side,
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & { side: Pane }) {
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
            <SheetTitle>{side === 'left' ? 'Friends' : 'Candidates'}</SheetTitle>
            <SheetDescription>Displays the {side} panel.</SheetDescription>
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

/** The centre column. Scrolls on its own; never the page. */
export function ShellInset({ className, ...props }: React.ComponentProps<'main'>) {
  return (
    <main
      data-slot="shell-inset"
      className={cn('flex min-w-0 flex-1 flex-col overflow-hidden bg-background', className)}
      {...props}
    />
  )
}

/**
 * A trigger, per pane. Two of them, because one `SidebarTrigger` reading an
 * ambient "the sidebar" is exactly the assumption this ticket exists to break.
 */
export function ShellTrigger({
  side,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { side: Pane }) {
  const { toggle, open, isSheet, sheet } = useAppShell()
  const expanded = isSheet ? sheet === side : open[side]
  const Icon = side === 'left' ? PanelLeftIcon : PanelRightIcon
  return (
    <Button
      data-slot="shell-trigger"
      data-side={side}
      variant="ghost"
      size="icon-sm"
      aria-expanded={expanded}
      title={side === 'left' ? 'Friends (⌘B)' : 'Candidates (⇧⌘B)'}
      className={cn(className)}
      onClick={() => toggle(side)}
      {...props}
    >
      <Icon />
      <span className="sr-only">Toggle {side} panel</span>
    </Button>
  )
}

/**
 * The shared `SidebarMenuButton` calls the shared `useSidebar()` unconditionally
 * (for its collapsed-state tooltip) and throws under our provider. We never
 * collapse to icons, so the tooltip has nothing to do — this is the same cva
 * classes with that branch removed.
 */
export function ShellMenuButton({
  className,
  isActive = false,
  ...props
}: React.ComponentProps<'button'> & { isActive?: boolean }) {
  return (
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
}
