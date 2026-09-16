import { CAL_ACTION_LABEL, calMenu, type CalAction, type CalMenuSurface } from '@/cal/cal-menu'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Cal } from '@/lib/database.types'
import { cn } from '@/lib/utils'
import { MoreHorizontalIcon } from 'lucide-react'

/**
 * The three dots on a cal's row, and the menu behind it.
 *
 * One component for both surfaces, because the items are the only thing worth
 * varying and `cal-menu.ts` already holds those. What the surface decides here
 * is three things, and all three come from the same fact: on the switcher this
 * button lives **inside a menu item that navigates**, and on `/` it is a
 * sibling in a flex row with nothing above it.
 *
 * ## The hit target, which is what the prototype was for
 *
 * At `icon-xs` the dots is 24x24 in a 40-tall menu row: 5.8% of the row's area,
 * 12px of horizontal slack, 8px of vertical slack either side. Driven at 375px,
 * a click 16 CSS px left of its centre **switched cal** instead. `-my-2 h-10
 * w-9` claws back the row's own `py-2` and makes the target the row's full
 * height by **36** wide: no vertical miss is available inside the row at all,
 * and it costs about one character of visible name. The glyph does not move.
 *
 * The ticket says 34, and 34 is what a `getBoundingClientRect` reads while the
 * popup's `zoom-in-95` enter animation is stopped at its first frame, which is
 * what a browser pane running hidden does to every Base UI popup. `offsetWidth`
 * and `offsetHeight` say 36 and 40 in the same session. Measure the layout box
 * rather than the painted one, or the number moves under you.
 *
 * `size-6` from `icon-xs` and `h-10 w-9` both survive `cn`: tailwind-merge
 * drops a `size-*` that a later `w-*`/`h-*` overrides but not the reverse, so
 * the 40x36 wins on stylesheet order rather than on the merge. Measured, not
 * assumed. Anybody rewriting this line should measure it again.
 *
 * `/`'s row gets none of that. Nothing there swallows a near miss, the row is
 * shorter than a menu item, and a 40-tall control beside a 24-tall copy button
 * would set the height of a row it is the least important thing in.
 *
 * ## Three propagation guards, not one
 *
 * Base UI's menus act on the **press** rather than on the release, so stopping
 * `click` alone still switches cal on the way into this menu. `pointerdown`,
 * `click` and `keydown`, and the wrapper only exists on the switcher: a
 * `stopPropagation` on `/` would have nothing above it to stop and would go
 * stale the first time somebody rearranged that row.
 *
 * The `keydown` guard is narrower in practice than it looks, and that was
 * checked rather than reasoned about: while either menu is open, focus is
 * inside a popup that is portalled to the body, so Escape and the arrows never
 * pass through this span at all. One Escape closes both menus and returns
 * focus to the switcher's trigger. What the guard catches is the Enter or
 * Space that would otherwise reach the `Menu.Item` this button sits in.
 *
 * ## The cost this carries, recorded rather than solved
 *
 * **The three dots cannot be reached by keyboard, and nothing fixes it in
 * place.** A button nested inside a `Menu.Item` is skipped by the composite
 * roving focus: `ArrowRight` does nothing, and seven `Tab`s walk the rows of
 * the switcher's menu one at a time and never land on a dots. (The prototype
 * found `Tab` throwing focus out of the menu entirely; either way the dots is
 * not on the path.) Both escapes fail structurally. A **submenu** is
 * keyboard-reachable, but a `SubmenuTrigger` *is* the item, so the row would
 * stop switching cal. **Two items side by side** in one visual row breaks the
 * arrow model, because Base UI's menu is one-dimensional.
 *
 * So this menu is a pointer-only shortcut and the keyboard path lives on `/`,
 * where Rename is a second time and the Code has a copy button. Do not
 * re-litigate it here; groups ticket 06 did, with both escapes in hand.
 *
 * The screen-reader pass ticket 02 owed is still owed, and this makes it
 * sharper rather than softer: the label below is right, and the control it
 * labels cannot be reached by the keyboard a screen reader drives.
 */
export const CalOverflow = ({
  cal,
  surface,
  onAction,
}: {
  cal: Cal
  surface: CalMenuSurface
  onAction: (action: CalAction) => void
}) => {
  const nested = surface === 'switcher'

  const dots = (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`More for ${cal.name}`}
            className={cn('text-muted-foreground', nested && '-my-2 h-10 w-9')}
          />
        }
      >
        <MoreHorizontalIcon />
      </DropdownMenuTrigger>
      {/*
        `w-auto min-w-28` rather than the popup's default `w-(--anchor-width)`,
        which would pin a two-item menu to the width of a 36px button. The
        switcher's own popup keeps the pinning; see `cal-switcher.tsx`.
      */}
      <DropdownMenuContent
        align="end"
        side={nested ? 'right' : 'bottom'}
        className="w-auto min-w-28"
      >
        {calMenu(surface).map((action) => (
          <DropdownMenuItem key={action} onClick={() => onAction(action)}>
            {CAL_ACTION_LABEL[action]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  if (!nested) return dots

  return (
    <span
      className="shrink-0"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {dots}
    </span>
  )
}
