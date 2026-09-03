import type { DrawerState } from '@/shell/drawer'
import { createContext, useContext } from 'react'

/**
 * The two panes. Named rather than booleaned so that every call site has to say
 * which one it means — the assumption this whole fork exists to break is that
 * there is one ambient "the sidebar".
 */
export type Pane = 'left' | 'right'

/**
 * The sheet breakpoint. The same 768px as `@/hooks/use-mobile`, restated here
 * because the shell means something specific by it: below this width there is
 * no three-column layout and no keyboard.
 */
export const SHEET_BREAKPOINT = 768

export type ShellValue = {
  /** Desktop open state, per pane. Independent — that is the point. */
  open: Record<Pane, boolean>
  /**
   * Toggles the pane: the column above the breakpoint, and below it **whichever
   * surface that pane has become** — the left drawer for `left`, the bottom
   * drawer for `right`.
   */
  toggle: (pane: Pane) => void
  /** True below `SHEET_BREAKPOINT`. */
  isSheet: boolean
  /**
   * THE INVARIANT, and issue 12 changes its shape rather than adding a second
   * mechanism beside it.
   *
   * Ticket 12 made this `Pane | null` so that two simultaneous sheets were
   * *unrepresentable* rather than merely discouraged: under nested
   * `SidebarProvider`s each provider owns a private `openMobile`, so two stacked
   * dialogs and two focus traps on a phone were reachable, and "at most one
   * sheet" is only expressible if one object owns both panes. That is the reason
   * for the fork and it has not changed.
   *
   * What changed is that ticket 17 gave the right pane a **different surface**
   * below the breakpoint: a bottom drawer that is permanently peeking, never
   * absent, and **not modal** — no backdrop and no focus trap, with the grid
   * live behind it. So the slot narrows to `'left'`, and the invariant it now
   * states is the stronger one:
   *
   * > **At most one modal surface, and the bottom drawer is not one.**
   *
   * A second *sheet* is unrepresentable because there is only one pane left that
   * can be one. The drawer sits outside the slot because it is outside the class
   * of thing the slot governs — which is also why the cross-surface rule below
   * has to be written down rather than falling out of the type.
   */
  sheet: 'left' | null
  setSheet: (pane: 'left' | null) => void
  /**
   * How far the bottom drawer is out. Meaningless above the breakpoint, where
   * the right pane is a column.
   *
   * Three states, not two, and the third is transient: peek, dragging, full.
   * Only the two resting ones are state — the drag lives in `ShellSidebar`'s own
   * pixel height, because nothing outside the drawer has any use for a number
   * that changes every pointermove.
   */
  drawer: DrawerState
  /**
   * **Opening the left drawer collapses the bottom drawer to its peek**
   * (ticket 17), which is why this is here rather than inside the drawer: it is
   * a rule about two surfaces, and the shell is the only object that holds both.
   * Ticket 12 settled one sheet slot precisely so two draggable surfaces could
   * not be open at once on a 375px screen — two competing drag targets, and one
   * of them behind a focus trap. Collapsing keeps the drawer *visible* and not
   * interactive, which is the difference between this and closing it.
   */
  setDrawer: (state: DrawerState) => void
}

export const ShellContext = createContext<ShellValue | null>(null)

export const useAppShell = () => {
  const value = useContext(ShellContext)
  if (!value) throw new Error('useAppShell must be used inside an <AppShellProvider>')
  return value
}

/**
 * Which pane, if any, this keydown asks for. Pure, and separate from the
 * listener, because it is the part that has to be *right*: the shipped shadcn
 * handler is wrong in three measured ways (ticket 12), and every one of them is
 * a missing line in a function this size.
 *
 *   - it ignores `shiftKey`, so `⇧⌘B` toggles the LEFT pane under any
 *     synthetic `{ key: 'b', shiftKey: true }` — which is what test harnesses
 *     and some assistive-tech paths emit;
 *   - it never checks that no *other* modifier is held, so it also eats `⌥⌘B`
 *     and `⌃⌘B`;
 *   - it matches `key` only, so a Cyrillic or Greek layout (`key` is `"и"`)
 *     never reaches it at all.
 */
export const shortcutPane = (
  event: Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>
): Pane | null => {
  // Exactly one of meta/ctrl. `!==` rejects both-held (⌃⌘B) and neither-held in
  // one line; the shipped handler's `metaKey || ctrlKey` accepts both.
  if (event.metaKey === event.ctrlKey) return null
  if (event.altKey) return null
  // `key` first, so a Dvorak user gets the key they see printed. `code` as the
  // fallback, so a layout where `key` is not a Latin letter still works off the
  // physical position.
  if (event.key.toLowerCase() !== 'b' && event.code !== 'KeyB') return null
  // Shift is READ, not ignored. This line is the whole bug in the shipped one.
  return event.shiftKey ? 'right' : 'left'
}
