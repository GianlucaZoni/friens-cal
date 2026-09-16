/**
 * What each of the two cal menus holds.
 *
 * **Two surfaces, two menus, overlapping on Rename** (groups ticket 06). The
 * switcher's three dots is the shortcut from inside a cal, holding Rename and
 * View code. `/`'s row overflow is the complete set, and it is where Leave
 * lives and stays.
 *
 * The split is not tidiness. Renaming the cal you are standing in would
 * otherwise be two navigations away from it, out to `/` and back, for the one
 * act you are most likely to want while looking at the thing you are renaming.
 * View code is the switcher's alone because `/`'s row already shows the Code
 * with a copy button beside it, which is a shorter path than a menu and the
 * only one reachable by keyboard.
 *
 * Here rather than inside either component so the difference between the two
 * menus is one table a reader takes in at once.
 *
 * **No imports, deliberately**, the same split `cals.ts` and `roster.ts` make.
 * A test file here runs under plain Node, which cannot resolve the `@/` alias.
 */

/** One thing a menu does to one cal. */
export type CalAction = 'rename' | 'view-code' | 'leave'

/** Which menu: the shell's cal switcher, or a row on `/`. */
export type CalMenuSurface = 'switcher' | 'list'

/**
 * The items each menu shows, in the order it shows them.
 *
 * **Leave is on `/` and nowhere else** (groups ticket 10 §8, ticket 06 §1). `/`
 * is the only screen that shows the complete set of cals, and leaving is a
 * decision about that set rather than about the cal you are standing in.
 * Getting there is a deliberate navigation away from the calendar you are
 * leaving, which is the friction this act is owed, and it puts Leave beside its
 * inverse. The switcher's dots sits inside the row that switches cal, one slip
 * from it, which is exactly where this must not be.
 *
 * Leave is **last** on its menu, under Rename. Order is the only friction a
 * two-item menu has, and the row the pointer lands on first should not be the
 * one-way door.
 */
const MENUS: Record<CalMenuSurface, readonly CalAction[]> = {
  switcher: ['rename', 'view-code'],
  list: ['rename', 'leave'],
}

export const calMenu = (surface: CalMenuSurface): readonly CalAction[] => MENUS[surface]

/** What each item is called, wherever it is rendered. */
export const CAL_ACTION_LABEL: Record<CalAction, string> = {
  rename: 'Rename',
  'view-code': 'View code',
  leave: 'Leave',
}

/**
 * How each item is drawn — the second map this file was left room for.
 *
 * `DropdownMenuItem`'s own prop name and its own two values, so
 * `cal-overflow.tsx` hands it straight through and there is no third vocabulary
 * in between. A `Set` of destructive actions would say the same thing today and
 * would let a fourth item join a menu without anybody deciding its colour; a
 * `Record` makes the compiler ask.
 *
 * Leave is the only one, because it is the only act on either menu that
 * redrawing cannot undo.
 */
export const CAL_ACTION_VARIANT: Record<CalAction, 'default' | 'destructive'> = {
  rename: 'default',
  'view-code': 'default',
  leave: 'destructive',
}
