import type { CalAction } from '@/cal/cal-menu'
import { CalCodeDialog } from '@/cal/code-dialog'
import { LeaveCalDialog } from '@/cal/leave-dialog'
import { RenameCalDialog } from '@/cal/rename-dialog'
import type { CalsState } from '@/cal/use-cals'
import type { Cal } from '@/lib/database.types'

/** A menu item that was picked, and the cal it was picked on. */
export type CalActing = { action: CalAction; cal: Cal }

/**
 * Whatever a cal menu just asked for, on screen.
 *
 * **Outside the menus rather than inside a row**, and that is the whole reason
 * this is a component of its own. A dialog mounted inside a `DropdownMenuItem`
 * unmounts with the menu the moment the item is clicked, so it would open and
 * vanish in the same frame; on the switcher there are two menus closing at
 * once. `FriendMenu` does the same thing one bar over, for the same reason.
 *
 * Mounted only while something is open, which is what makes the rename draft
 * start from the row as it is now with no effect to reset it.
 *
 * Both surfaces render this, so the two menus cannot answer the same item
 * differently — and only one of them ever asks for Leave, which is
 * `cal-menu.ts`'s business rather than this file's.
 *
 * It takes the whole `CalsState` rather than the writes it needs, which is what
 * made Leave a branch here instead of a second prop threaded through both call
 * sites. This component is the dispatcher for every act on a cal, so the cal
 * state is its input.
 */
export const CalActionDialogs = ({
  acting,
  cals,
  onClose,
}: {
  acting: CalActing | null
  cals: CalsState
  onClose: () => void
}) => {
  if (acting === null) return null

  const { action, cal } = acting
  if (action === 'rename')
    return <RenameCalDialog cal={cal} rename={cals.rename} onClose={onClose} />
  if (action === 'view-code') return <CalCodeDialog cal={cal} onClose={onClose} />
  if (action === 'leave') return <LeaveCalDialog cal={cal} leave={cals.leave} onClose={onClose} />

  // Unreachable while `CalAction` has three members, and a compile error the
  // day it has four without a branch here. `satisfies never` rather than a
  // `default:` that quietly renders nothing.
  action satisfies never
  return null
}
