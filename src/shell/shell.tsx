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
 *     `Dialog`, and a dialog is open or closed.
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
import {
  DRAWER_PEEK,
  bodySwipe,
  dragTo,
  fullHeightOf,
  mayChainClose,
  snapOf,
  type DrawerState,
} from '@/shell/drawer'
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
 * `SheetContent` is Base UI's `Dialog`, and **it is the open-or-closed shape
 * rather than the modality that disqualifies it.** Worth stating precisely,
 * because the modality half is available: `Dialog.Root` takes
 * `modal?: boolean | 'trap-focus'`, and `false` allows *"user interaction with
 * the rest of the document"* — no focus trap, no scroll lock, no pointer
 * blocking outside. So a non-modal sheet is representable.
 *
 * What is not is this surface. It is **never absent**, it has **three states**
 * rather than two, and it is **dragged**. Held permanently open with the
 * backdrop removed, `Sheet` would contribute a portal and an `aria-labelledby`
 * — both of which the `<aside aria-label>` below gives more directly — and
 * every line of the pointer would still be ours.
 *
 * `vaul` is the library shaped for exactly this and it is **not** a dependency,
 * deliberately: it is built on `@radix-ui/react-dialog`, and a Radix drawer
 * containing the Base UI sheet that `CardDetail` opens inside it is two
 * focus-management systems on a 375px screen — the hazard this fork exists to
 * make unrepresentable, arriving by a new route. Issue 13's `## Addition`
 * carries the full evaluation and names vaul as the fallback if a hand-rolled
 * scroll-chained close does not survive a real-hardware run.
 *
 * So this is the one genuinely new mechanism in the slice — about seventy
 * lines, most of them the pointer.
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
 * ## `touch-action`, and the second arbitration issue 13 added
 *
 * `touch-action: none` still sits on **the handle only** — never on the drawer
 * body, and never on anything the grid owns. Issue 13 has now claimed drag on
 * this same screen (long-press-then-draw, with a horizontal swipe paging the
 * view) and the two coexist because neither declares a surface un-scrollable:
 * the grid's armed draw wins by `preventDefault` on a non-passive `touchmove`,
 * and so does the close below. The only `touch-action: none` that slice adds is
 * on its resize knobs, which is the one place its ticket asks for it.
 *
 * ## The scroll-chained close (issue 13's `## Addition`)
 *
 * The body **is** a drag surface now, which is the thing issue 12 stopped short
 * of and handed on deliberately: it is a second arbitration between a scroll
 * and a drag on the same pixels, and one ticket had to own both. The rule is
 * two sentences and lives in `drawer.ts` as `mayChainClose` and `bodySwipe`:
 *
 * > A drag on the body may **start** only while the scroller is at its top, and
 * > it stays refused for `SETTLE_MS` after the scroller *arrives* there.
 *
 * The first half is what keeps a continuous drag through the top from becoming
 * a close: the press happened when `scrollTop` was positive, so it never armed.
 * The second is for the discrete case — a flick that lands on the ceiling, then
 * another flick of the same motion, which is what vaul's `scrollLockTimeout`
 * exists for. `SETTLE_MS` is a **starting number**; issue 15 measures it.
 *
 * At the peek there is nothing to arbitrate — one card, `overflow-hidden`, and
 * the drawer is already down — so the gesture is not attached at all, and a
 * downward swipe there keeps doing nothing rather than becoming a second close.
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
  /** The body, which holds the scroller and is itself the second drag surface. */
  const body = React.useRef<HTMLDivElement | null>(null)
  /** The live pixel height while a finger is down, and null the rest of the time. */
  const [dragging, setDragging] = React.useState<number | null>(null)

  /**
   * How tall the drawer is when it is out — **one number in one unit**, used
   * both to draw the resting state and to clamp and snap the drag.
   *
   * It was briefly two: `85svh` in a class for the resting height and
   * `innerHeight * 0.85` in the arithmetic. Those agree on a desktop and not on
   * a phone, where `svh` is the *small* viewport (address bar showing) and
   * `innerHeight` is whatever the bar is doing right now — so a drag would
   * clamp to, and snap against, a height the drawer never actually rested at,
   * and let go with a jump. `innerHeight` is the right reference of the two,
   * because this element is `fixed` and the viewport is what it is positioned
   * against.
   */
  const [full, setFull] = React.useState(() => fullHeightOf(window.innerHeight))
  React.useEffect(() => {
    const sync = () => setFull(fullHeightOf(window.innerHeight))
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [])

  /**
   * Ends the drag in flight, if there is one — held in a ref so unmounting can
   * call it.
   *
   * `use-month-gesture.ts` sets this convention and the reason bites harder
   * here: **the shell itself unmounts this component mid-drag**. Crossing the
   * breakpoint upward stops `ShellSidebar` rendering a drawer at all, and a
   * phone rotated while a finger is down does exactly that — leaving
   * `pointermove` and `pointerup` bound to a window whose handlers write into a
   * tree that is gone.
   */
  const release = React.useRef<(() => void) | null>(null)
  React.useEffect(() => () => release.current?.(), [])

  const onPointerDown = (event: React.PointerEvent) => {
    // Secondary buttons have no business dragging, and neither has a second
    // finger: two pointers would register two listener sets whose two releases
    // toggle in opposite directions and cancel out. `use-month-gesture.ts`
    // filters by `pointerId` for the same reason.
    if (event.button !== 0 || release.current !== null) return
    const element = surface.current
    if (element === null) return

    const { pointerId } = event
    const startHeight = element.getBoundingClientRect().height
    const startY = event.clientY
    let height = startHeight

    const onMove = (move: PointerEvent) => {
      if (move.pointerId !== pointerId) return
      height = dragTo(startHeight, startY - move.clientY, full)
      setDragging(height)
    }

    const onUp = (up?: PointerEvent) => {
      if (up !== undefined && up.pointerId !== pointerId) return
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      release.current = null
      setDragging(null)
      /*
        A press that never moved is a **tap**, and it toggles. Same 4px as
        `gesture.ts`'s `isDrag`, for the same reason: a finger leaving a phone
        screen moves a pixel or two on the way, and a handle that snapped back
        to where it already was would read as a dead control.

        The toggle's target comes from the height the press *started* at rather
        than from `drawer`, which this closure captured at pointerdown and which
        three other things can move underneath it — the breakpoint sync,
        `setSheet`, and `⇧⌘B`. A measured start height cannot go stale.
      */
      if (Math.abs(height - startHeight) < 4)
        setDrawer(snapOf(startHeight, full) === 'full' ? 'peek' : 'full')
      else setDrawer(snapOf(height, full))
    }

    release.current = () => onUp()
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  /**
   * When the body's scroller was last **anywhere but** its top.
   *
   * `-Infinity` until it moves, so `performance.now() - away` is `Infinity` and
   * a scroller that has never been scrolled is settled by definition. It is a
   * timestamp rather than a boolean because the rule is about *how long ago*:
   * see `SETTLE_MS`.
   */
  const away = React.useRef(Number.NEGATIVE_INFINITY)

  /**
   * Whether the click after a close drag has to be swallowed.
   *
   * **Cleared by the next press, not only by the click it is waiting for.** A
   * latch that only a click can clear swallows the *next* press whenever that
   * click never arrives — which is what a browser does after a
   * `preventDefault`ed `touchmove`, and what `use-month-gesture.ts` says about
   * its own `dragged` flag for the same reason. Caught in the browser: a close
   * drag left it standing and the following tap on a card opened nothing.
   */
  const swallow = React.useRef(false)

  /**
   * The scroller inside the body, which is `RightPane`'s own `SidebarContent`.
   *
   * Asked for by `data-sidebar` rather than held in a ref, because the element
   * belongs to the pane and arrives here as `children` — the drawer owns the
   * surface and its height, and what is on it is the pane's business. It is
   * absent at the peek, which is one of the two reasons the gesture is not
   * attached there.
   */
  const scrollerOf = () => body.current?.querySelector<HTMLElement>('[data-sidebar="content"]')

  const out = drawer === 'full'

  /**
   * Watch the scroller so the settle window has something to measure.
   *
   * Re-run on `out` because the scroller does not exist at the peek: the pane
   * renders one card and no `SidebarContent` there. Passive, because this reads
   * `scrollTop` and never cancels anything.
   */
  React.useEffect(() => {
    const element = scrollerOf()
    if (element === undefined || element === null) return
    const onScroll = () => {
      if (element.scrollTop > 0) away.current = performance.now()
    }
    element.addEventListener('scroll', onScroll, { passive: true })
    return () => element.removeEventListener('scroll', onScroll)
  }, [out])

  /**
   * A downward swipe on the cards, which is what every native sheet does.
   *
   * **Touch only.** On a desktop the body is a mouse's scroller and a list of
   * cards to click; a mouse drag that collapsed the pane would take text
   * selection and card presses with it, and there is a grab handle two pixels
   * above with a keyboard route into the same state. This is the gesture a
   * finger expects and nothing else does.
   */
  const onBodyPointerDown = (event: React.PointerEvent) => {
    if (event.pointerType !== 'touch') return
    // Whatever the last gesture left waiting to be suppressed, this press is not
    // it — see `swallow`.
    swallow.current = false
    if (!out || release.current !== null) return
    const element = surface.current
    if (element === null) return
    // The rule, both halves. `drawer.ts` owns it; this is where it is asked.
    if (!mayChainClose(scrollerOf()?.scrollTop ?? 0, performance.now() - away.current)) return

    const { pointerId } = event
    const startHeight = element.getBoundingClientRect().height
    const origin = { x: event.clientX, y: event.clientY }
    let height = startHeight
    let closing = false

    const onMove = (move: PointerEvent) => {
      if (move.pointerId !== pointerId) return
      if (!closing) {
        const verdict = bodySwipe(move.clientX - origin.x, move.clientY - origin.y)
        if (verdict === 'waiting') return
        // Handed back to the scroller, which still has the gesture: nothing has
        // been `preventDefault`ed yet, so the list scrolls as it always did.
        if (verdict === 'scroll') return onUp()
        closing = true
        swallow.current = true
      }
      height = dragTo(startHeight, origin.y - move.clientY, full)
      setDragging(height)
    }

    /*
     * The same `preventDefault` the grid's armed draw uses, and the same reason:
     * once this is the drawer's gesture the scroller must not also have it. At
     * the top of a list there is usually nothing to scroll upwards, but there is
     * pull-to-refresh, and there is the rubber band.
     */
    const onTouchMove = (moving: TouchEvent) => {
      if (closing && moving.cancelable) moving.preventDefault()
    }

    const onUp = (up?: PointerEvent) => {
      if (up !== undefined && up.pointerId !== pointerId) return
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      body.current?.removeEventListener('touchmove', onTouchMove)
      release.current = null
      setDragging(null)
      if (closing) setDrawer(snapOf(height, full))
    }

    release.current = () => onUp()
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    body.current?.addEventListener('touchmove', onTouchMove, { passive: false })
  }

  return (
    <aside
      ref={surface}
      data-slot="sidebar"
      data-side="bottom"
      data-drawer={dragging === null ? drawer : 'dragging'}
      aria-label={PANE.right.title}
      /*
        Always a pixel height, and always from `full` — see the note on it. The
        transition is dropped while a finger is down so the drag does not lag a
        200ms animation behind it.
      */
      style={{ height: dragging ?? (out ? full : DRAWER_PEEK) }}
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 flex flex-col border-t bg-sidebar text-sidebar-foreground shadow-[0_-2px_12px_rgba(0,0,0,0.08)]',
        dragging === null && 'transition-[height] duration-200 ease-out'
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
        ref={body}
        onPointerDown={onBodyPointerDown}
        /*
          A close drag can end on a card, and a card tap opens a detail sheet.
          Browsers suppress the click after a `preventDefault`ed touchmove, but
          not on every platform and not for a drag that only just crossed the
          slop — so the one click after a close is swallowed here, in the capture
          phase, before the card it landed on hears about it.
        */
        onClickCapture={(event) => {
          if (!swallow.current) return
          swallow.current = false
          event.preventDefault()
          event.stopPropagation()
        }}
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
 * **Below it, only the left one is in the bar.** Ticket 12's prototype §4 asked
 * for both to be permanently visible because both panes were sheets and a sheet
 * with no trigger is unreachable (its live `## Decisions` never restates it, so
 * this is a finding being honoured rather than a decision being overturned). The right pane is no longer a sheet: it is the bottom drawer,
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
