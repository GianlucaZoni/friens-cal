/**
 * The bottom drawer's geometry: how tall it is, and where a drag leaves it.
 *
 * **Pixels, and only pixels.** `shell.tsx` owns the state and the pointer; this
 * owns the arithmetic under them, which is the same split `gesture.ts` and
 * `month.ts` already make against their own grids — and the reason it is worth
 * making here is that the drawer has a *reserved* height as well as a drawn one:
 * the shell pads its own bottom by `DRAWER_PEEK` so the peek sits in space
 * nothing else is using, and only the part dragged out over it overlays the
 * grid. Two places have to agree about one number.
 *
 * **No `@/` imports**, so `drawer.test.ts` reaches this under plain Node.
 */

/**
 * How much of the drawer is always out, in pixels.
 *
 * It is a constant rather than the content's own height because it is *both*
 * halves of a layout: the drawer's resting height and the shell's bottom
 * padding. Measured against what it has to hold — ticket 17's one labelled card
 * — at the tightest of the three: a pinned Hangout card is 66px (two rows, the
 * lower one carrying 20px faces), the label above it 16px, the grab handle 18px,
 * and the padding between them 20px.
 *
 * The peek clips rather than growing, which is what makes this number true: a
 * Candidate card with six wrapped faces is taller than a Hangout card, and a
 * peek that resized itself would move the grid's bottom edge every time the
 * roster changed.
 */
export const DRAWER_PEEK = 120

/**
 * How much of the screen the drawer takes when it is out.
 *
 * Not all of it, deliberately. The strip left over is the only thing on a phone
 * that says the calendar is still behind this — the drawer is **not modal**
 * (see `shell.tsx`), so it has no backdrop to say it for it, and a full-height
 * drawer with no backdrop is indistinguishable from a navigation.
 */
const FULL_FRACTION = 0.85

/**
 * @param viewport `window.innerHeight`, and **not** a CSS `svh`.
 *
 * The two are the same on a desktop and not on a phone, where `svh` is the
 * *small* viewport — the height with the address bar showing — and
 * `innerHeight` is whatever the bar is doing right now. The drawer is a `fixed`
 * element, so `innerHeight` is what it is actually positioned against; a
 * resting height in `svh` with drag arithmetic in `innerHeight` clamps and
 * snaps against a height the drawer never rests at, and lets go with a jump.
 * `shell.tsx` holds one number from this and draws with it.
 */
export const fullHeightOf = (viewport: number) => Math.round(viewport * FULL_FRACTION)

export type DrawerState = 'peek' | 'full'

/**
 * Where a drag has got to: the height it started at, plus how far up the finger
 * has come, clamped to the two resting heights.
 *
 * Clamped rather than rubber-banded — an overdrag that shows a gap under the
 * drawer would expose the fact that this is a positioned element and not a
 * surface, and on the way up it would cover the top bar, which is the one thing
 * on a phone that says where you are.
 */
export const dragTo = (startHeight: number, travelled: number, full: number) =>
  Math.min(Math.max(startHeight + travelled, DRAWER_PEEK), full)

/**
 * Where the drag lets go: **the nearer of the two resting heights**.
 *
 * Distance rather than velocity, and it is the conservative choice on purpose.
 * A flick threshold would make the drawer's answer depend on how fast a finger
 * happened to be moving when it lifted, which is exactly the input a person
 * pulling a drawer open to *look at something* has no reason to control — and
 * getting it wrong costs a second gesture on the smallest screen in the product.
 */
export const snapOf = (height: number, full: number): DrawerState =>
  height >= (DRAWER_PEEK + full) / 2 ? 'full' : 'peek'
