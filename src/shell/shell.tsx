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
 *      panes — which is what the `sheet` slot below is. Issue 12 narrows it and
 *      strengthens what it says; see the section at the foot of this comment.
 *
 * The fork is surgical. Of the sidebar's 23 exports, only 5 touch the context —
 * `SidebarProvider`, `Sidebar`, `SidebarTrigger`, `SidebarRail` and
 * `SidebarMenuButton`. Four of those are forked here; `SidebarRail` is dropped
 * outright, because a drag rail is not a control this shell has. `SidebarInset`
 * touches no context but is layout, so `ShellInset` replaces it. That leaves
 * **17 re-exported unchanged**, and upstream fixes to them still land.
 *
 * ## Issue 12: the right pane is not a sheet on a phone
 *
 * Point 4 above still decides the fork, and the invariant it names is now
 * stated more strongly rather than more weakly — see `sheet` in
 * `shell-context.ts`. Ticket 17 gives the right pane a **bottom drawer** below
 * the breakpoint: permanently peeking, draggable out to full height, and *not
 * modal* — no backdrop, no focus trap, the grid live behind it. Three things
 * follow, and none of them fits the sheet slot:
 *
 *   - it is **never absent**, where a sheet is absent by default;
 *   - it has **three states** (peek, dragging, full) where a sheet has two;
 *   - it must **not** be a `Sheet`, because `SheetContent` is Base UI's
 *     `Dialog` and every one of modal, backdrop and focus trap is wrong for a
 *     surface that is always on screen.
 *
 * So the slot narrows to `'left' | null` — a second sheet is unrepresentable
 * because there is only one pane left that can be one — and the drawer is a
 * positioned element the shell reserves room for. `AppShellProvider` pads its
 * own bottom by `DRAWER_PEEK`, so the peek sits in space nothing else is using
 * and only the part dragged out over it overlays the calendar.
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
import { DRAWER_PEEK, dragTo, fullHeightOf, snapOf, type DrawerState } from '@/shell/drawer'
import {
  SHEET_BREAKPOINT,
  ShellContext,
  shortcutPane,
  useAppShell,
  type Pane,
  type ShellValue,
} from '@/shell/shell-context'
import * as React from 'react'
import { GripHorizontalIcon, PanelLeftIcon, PanelRightIcon } from 'lucide-react'

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
 * The right pane is **the Hangouts pane** — named by the human, and it is a
 * topic and not a type: it holds committed Hangouts and the Candidates *for*
 * Hangouts, which is what a Candidate is. The pane's name is the one place the
 * two sit under one word; inside it they stay apart, in their own regions, as
 * CONTEXT.md requires. It is deliberately not "Candidates", which would fold
 * the committed ones into the computed ones.
 */
const PANE: Record<Pane, { title: string; shortcut: string; icon: typeof PanelLeftIcon }> = {
  left: { title: 'Friends', shortcut: '⌘B', icon: PanelLeftIcon },
  right: { title: 'Hangouts', shortcut: '⇧⌘B', icon: PanelRightIcon },
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
  const [sheet, setSheetState] = React.useState<'left' | null>(null)
  const [drawer, setDrawer] = React.useState<DrawerState>('peek')
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
      // The drawer comes back to its peek for the same reason one level down:
      // a drawer dragged out and then widened into a column would leave the
      // column open at whatever height a finger had left it at.
      if (!mql.matches) {
        setSheetState(null)
        setDrawer('peek')
      }
    }
    mql.addEventListener('change', sync)
    sync()
    return () => mql.removeEventListener('change', sync)
  }, [])

  /**
   * **Opening the left drawer collapses the bottom drawer to its peek**
   * (ticket 17). Every route into the sheet goes through here rather than
   * through `setSheetState`, so the rule cannot be got round by opening the
   * sheet from somewhere that had not heard about it.
   */
  const setSheet = React.useCallback((pane: 'left' | null) => {
    setSheetState(pane)
    if (pane !== null) setDrawer('peek')
  }, [])

  const toggle = React.useCallback(
    (pane: Pane) => {
      // No cookie, and none reinstated. View state in this app is deliberately
      // ephemeral (ticket 12); every load is left-open, right-open.
      if (!isSheet) return setOpen((previous) => ({ ...previous, [pane]: !previous[pane] }))
      /*
        Below the breakpoint the right pane IS the bottom drawer, so its toggle
        toggles the drawer. That keeps `⇧⌘B` meaning the one thing it has always
        meant — *show me the Hangouts pane* — on the rare phone with a keyboard
        attached, rather than becoming a shortcut for nothing.
      */
      if (pane === 'right') return setDrawer((current) => (current === 'full' ? 'peek' : 'full'))
      setSheet(sheet === 'left' ? null : 'left')
    },
    [isSheet, sheet, setSheet]
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
    () => ({ open, toggle, isSheet, sheet, setSheet, drawer, setDrawer }),
    [open, toggle, isSheet, sheet, setSheet, drawer]
  )

  return (
    <ShellContext.Provider value={value}>
      <div
        data-slot="shell"
        style={
          {
            '--sidebar-width': PANE_WIDTH,
            /*
              The peek's room, **reserved rather than overlaid**. A drawer that
              simply sat on top would permanently hide the bottom 120px of the
              grid — on the one screen where the grid has least of it — so the
              shell shortens itself instead, and only the part dragged out over
              that reservation covers anything.
            */
            paddingBottom: isSheet ? DRAWER_PEEK : undefined,
            ...style,
          } as React.CSSProperties
        }
        className={cn('flex h-svh w-full flex-col overflow-hidden bg-background', className)}
        {...props}
      >
        {children}
      </div>
    </ShellContext.Provider>
  )
}

/**
 * A pane, and **below the breakpoint the two panes are different surfaces**.
 *
 * In flow above it — a flex column whose width animates to zero — and below it
 * a left-side Sheet for `left`, a bottom drawer for `right`. The `data-*`
 * attributes match the shared component's, so every borrowed subcomponent's
 * `group-data-[…]` selector still resolves in all three.
 *
 * The asymmetry is ticket 17's and it is the answer to a question ticket 12
 * deliberately left open: it guaranteed one-at-a-time and keyboard-free
 * reachability and handed 17 *"whether a side sheet is the right idiom at
 * all"*. It is not, for the right pane — Candidates are the thing you consult
 * *while* looking at the calendar, and a side sheet with a backdrop is the one
 * shape that makes consulting them mean covering it.
 */
export const ShellSidebar = ({
  side,
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & { side: Pane }) => {
  const { open, isSheet, sheet, setSheet } = useAppShell()

  if (isSheet && side === 'right') return <BottomDrawer>{children}</BottomDrawer>

  if (isSheet) {
    /*
      `'left'` written out rather than `side`, because by here it is the only
      value that can reach this branch and the slot's type says so. It is the
      invariant being enforced by the compiler instead of by a convention: a
      right-side sheet is not something this shell can be asked for any more.
    */
    return (
      <Sheet open={sheet === 'left'} onOpenChange={(next) => setSheet(next ? 'left' : null)}>
        <SheetContent
          side="left"
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

/**
 * The right pane, on a phone: **permanently peeking, draggable out to full
 * height, and not modal** (ticket 17).
 *
 * ## Why it is not a `Sheet`
 *
 * `SheetContent` is Base UI's `Dialog`. Every one of modal, backdrop and focus
 * trap is wrong here: the ticket wants the Candidates *"permanently peeking"*
 * with the grid live behind them, which is a surface and not a dialog. `vaul` is
 * not a dependency and `src/components/ui/` has no drawer, so this is the one
 * genuinely new mechanism in the slice — about sixty lines, most of them the
 * pointer.
 *
 * ## The pointer, and why it does not capture
 *
 * `setPointerCapture` is what a drag handle normally reaches for, and
 * `use-month-gesture.ts` already argues the other way for a reason that applies
 * twice over here: **window listeners registered on pointerdown** make a drag
 * released outside the element commit rather than hang, and they leave the
 * handle a real `<button>` that a keyboard can reach. Issue 11 found a third
 * consequence worth keeping — it is the only drag in the app that a synthetic
 * pointer event can drive, which is the difference between a verified surface
 * and a described one.
 *
 * ## `touch-action`, decided with issue 13 in mind rather than after it
 *
 * `touch-action: none` sits on **the handle only**, never on the drawer body
 * and never on anything the grid owns. Issue 13 is about to claim drag on this
 * same screen — long-press-then-draw, with a horizontal swipe paging the view —
 * and the way the two coexist is that they never share a surface: the drawer's
 * drag target is an 18px strip with a grip in it, and the calendar keeps its
 * default touch behaviour entirely. That is also the same rule issue 13 states
 * for its own resize knobs (*"`touch-action: none` on the knob only"*).
 *
 * ## What the peek shows
 *
 * Nothing here decides that — `RightPane` reads `drawer` and renders one
 * labelled card instead of the list. The drawer owns the surface and its
 * height; what is on it is the pane's own business, exactly as it is above the
 * breakpoint.
 */
const BottomDrawer = ({ children }: { children: React.ReactNode }) => {
  const { drawer, setDrawer } = useAppShell()
  const surface = React.useRef<HTMLElement | null>(null)
  /** The live pixel height while a finger is down, and null the rest of the time. */
  const [dragging, setDragging] = React.useState<number | null>(null)

  const onPointerDown = (event: React.PointerEvent) => {
    // Secondary buttons have no business dragging.
    if (event.button !== 0) return
    const element = surface.current
    if (element === null) return

    const startHeight = element.getBoundingClientRect().height
    const startY = event.clientY
    const full = fullHeightOf(window.innerHeight)
    let height = startHeight

    const onMove = (move: PointerEvent) => {
      height = dragTo(startHeight, startY - move.clientY, full)
      setDragging(height)
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      setDragging(null)
      /*
        A press that never moved is a **tap**, and it toggles. Same 4px as
        `gesture.ts`'s `isDrag`, for the same reason: a finger leaving a phone
        screen moves a pixel or two on the way, and a handle that snapped back
        to where it already was would read as a dead control.
      */
      if (Math.abs(height - startHeight) < 4) setDrawer(drawer === 'full' ? 'peek' : 'full')
      else setDrawer(snapOf(height, full))
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const out = drawer === 'full'

  return (
    <aside
      ref={surface}
      data-slot="sidebar"
      data-side="bottom"
      data-drawer={dragging === null ? drawer : 'dragging'}
      aria-label={PANE.right.title}
      /*
        Height in pixels while a finger is down, and a class the rest of the
        time — so the two resting states animate and the drag does not lag a
        transition behind the finger.
      */
      style={{ height: dragging ?? (out ? undefined : DRAWER_PEEK) }}
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 flex flex-col border-t bg-sidebar text-sidebar-foreground shadow-[0_-2px_12px_rgba(0,0,0,0.08)]',
        dragging === null && 'transition-[height] duration-200 ease-out',
        dragging === null && out && 'h-[85svh]'
      )}
    >
      <button
        type="button"
        onPointerDown={onPointerDown}
        onClick={(event) => {
          /*
            **Keyboard only.** A tap fires pointerdown, pointerup and then
            `click`, so the pointer path above and this one would toggle in the
            same frame and cancel out. `detail` is the discriminator the DOM
            already has: it counts clicks for a real press and is 0 for one the
            keyboard or a script produced. A latch would have to be cleared by
            something, and the something is a click that a cancelled gesture
            never sends.
          */
          if (event.detail !== 0) return
          setDrawer(out ? 'peek' : 'full')
        }}
        aria-expanded={out}
        aria-label={out ? `Collapse ${PANE.right.title}` : `Expand ${PANE.right.title}`}
        /* `touch-action: none` HERE and nowhere else — see the note above. */
        className="flex h-[18px] shrink-0 touch-none items-center justify-center text-muted-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <GripHorizontalIcon aria-hidden className="size-4" />
      </button>

      {/*
        Scrolls only when it is out. At the peek there is one card and nothing
        to scroll, and a scroller there would compete with the grid behind it
        for a vertical swipe that belongs to neither.
      */}
      <div
        className={cn('flex min-h-0 flex-1 flex-col', out ? 'overflow-y-auto' : 'overflow-hidden')}
      >
        {children}
      </div>
    </aside>
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
 * Both live in the top bar above the breakpoint, and are visible there at every
 * width it exists at — below the breakpoint there is no keyboard, so the
 * shortcuts cannot be the only way in.
 *
 * **Below it, only the left one is in the bar.** Ticket 12 required both to be
 * permanently visible because both panes were sheets and a sheet with no trigger
 * is unreachable. The right pane is no longer a sheet: it is the bottom drawer,
 * which is on screen already and carries its own grab handle. A second control
 * for it in the bar would be a button that says *open the thing you are looking
 * at* — and ticket 17's bar has three groups and no room for a fourth. This
 * still works if it is rendered there, which is what keeps `⇧⌘B` honest.
 */
export const ShellTrigger = ({
  side,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { side: Pane }) => {
  const { toggle, open, isSheet, sheet, drawer } = useAppShell()
  const { title, shortcut, icon: Icon } = PANE[side]
  /*
    What "expanded" means depends on which surface the pane currently is: a
    column above the breakpoint, the left sheet below it, and — for the right
    pane below it — the bottom drawer, which is expanded when it is out and not
    when it is peeking. It is never *closed*; that is the point of it.
  */
  const expanded = !isSheet ? open[side] : side === 'right' ? drawer === 'full' : sheet === 'left'
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
