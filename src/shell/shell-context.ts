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
  /** Toggles the pane: the sheet below the breakpoint, the column above it. */
  toggle: (pane: Pane) => void
  /** True below `SHEET_BREAKPOINT`. */
  isSheet: boolean
  /**
   * THE INVARIANT. At most one sheet, ever — because it is one slot, not two
   * booleans. Under nested `SidebarProvider`s each provider owns a private
   * `openMobile` and two simultaneous sheets are *representable*: two stacked
   * dialogs and two focus traps on a phone. That is the reason for the fork.
   */
  sheet: Pane | null
  setSheet: (pane: Pane | null) => void
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
