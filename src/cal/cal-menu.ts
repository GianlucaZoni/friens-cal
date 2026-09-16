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
 * menus is one table a reader takes in at once, and so ticket 05 adds Leave by
 * editing a list rather than by editing two `.tsx` files.
 *
 * **No imports, deliberately**, the same split `cals.ts` and `roster.ts` make.
 * A test file here runs under plain Node, which cannot resolve the `@/` alias.
 */

/** One thing a menu does to one cal. Ticket 05 adds `'leave'`. */
export type CalAction = 'rename' | 'view-code'

/** Which menu: the shell's cal switcher, or a row on `/`. */
export type CalMenuSurface = 'switcher' | 'list'

/**
 * The items each menu shows, in the order it shows them.
 *
 * Ticket 05 adds `'leave'` to `list` and to `CalAction` above, and a branch to
 * `CalActionDialogs`. It does not touch `switcher`.
 */
const MENUS: Record<CalMenuSurface, readonly CalAction[]> = {
  switcher: ['rename', 'view-code'],
  list: ['rename'],
}

export const calMenu = (surface: CalMenuSurface): readonly CalAction[] => MENUS[surface]

/** What each item is called, wherever it is rendered. */
export const CAL_ACTION_LABEL: Record<CalAction, string> = {
  rename: 'Rename',
  'view-code': 'View code',
}
