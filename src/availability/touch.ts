/**
 * The touch gesture, as arithmetic: when a press arms, what a move before that
 * belongs to, how fast an edge drags the grid under a finger, and how long a
 * draft has got.
 *
 * `gesture.ts` is the *lattice* — where a drag began, which Slots it covers.
 * This is the **finger**, and the two are separable because none of it knows
 * about columns or rows: a verdict about a 12px move is the same verdict on the
 * week grid and on the month grid, and issue 13 needs it on both.
 *
 * **No `@/` imports, deliberately** — the same split `gesture.ts`, `slots.ts`
 * and `view.ts` already make, so `yarn test` reaches this under plain Node.
 *
 * Everything here is pure except the last function in the file, which is a
 * `console.warn`: it is issue 15's instrument, both gestures need it, and
 * neither of them owns it. See `reportCompositorLoss`.
 *
 * ## Every number here is a measurement or a stated guess, and it says which
 *
 * The four that came off prototype 10's driver are `ARM_MS`, `TOUCH_SLOT_PX`,
 * `EDGE_BAND_PX` and — through `gesture.ts` — the 45px lateral budget. The two
 * that did not are `TOUCH_SLOP_PX` and `SWIPE_PAGE_PX`, and they are the
 * conventional platform values rather than anything this project measured;
 * [issue 15](.scratch/friens-cal-v1/issues/15-verify-touch-on-hardware.md) is
 * the real-hardware run that can move them.
 *
 * ## The one thing arithmetic cannot settle
 *
 * Whether `preventDefault` on a non-passive `touchmove` still cancels a native
 * scroll at the moment a press arms. That is a compositor question, a synthetic
 * `touchmove` never makes a browser scroll, and issue 15 is the gate for it. So
 * there is no rule about it here — there is an instrument, `reportCompositorLoss`,
 * which prints the verdict where issue 15 can read it off a real phone.
 */

/**
 * Half an hour, in pixels, **on a touch screen**.
 *
 * Prototype 10 §5, measured: at 44px rows a week cell at 375px is 47×44, which
 * clears the 44×44 minimum target with no margin and fails below 360px width.
 * The desktop's 20px row is not a touch target under any view — and the cost is
 * named rather than hidden: 8 hours on screen instead of 16, three screens to
 * scan a day.
 *
 * It is the row *height* and not the drag's unit: the gesture divides each
 * column's measured height by its own row count, so the arithmetic stays right
 * for the column that holds 46 or 50 of them.
 */
export const TOUCH_SLOT_PX = 44

/**
 * How long a finger must be still before a drag draws, in milliseconds.
 *
 * Prototype 10 built and measured this at ~450ms: *"a drag with no hold draws
 * nothing and the browser keeps the gesture; a 520ms hold arms and then
 * draws"*. It recommended against the whole variant for the tax this number
 * *is*, and [issue 10](.scratch/shared-availability-calendar/issues/10-touch-drawing-gesture.md)
 * overrode that — so the number survives with its cost accepted rather than
 * argued away, and with the mitigation the prototype also built: the arming
 * signal is visual and is not under the finger.
 *
 * **It is also what makes swipe-paging safe.** Before it fires a horizontal
 * gesture pages and a vertical one scrolls; after it fires the drag draws. The
 * scroll-versus-draw conflict is resolved by the two together.
 */
export const ARM_MS = 450

/**
 * How far a finger may drift and still arm, in pixels.
 *
 * Not `DRAG_THRESHOLD_PX`. 4px is the mouse's click/drag discriminator and a
 * thumb resting on glass moves further than that without meaning anything —
 * Android's own `ViewConfiguration` touch slop is 8dp for the same reason. Too
 * tight and a long-press never arms; too loose and the pre-arm swipe cannot be
 * classified until the finger has already travelled somewhere.
 *
 * **It is the reason the compositor question is winnable at all**: arming
 * requires the finger to have stayed inside this circle, so no scroll has begun
 * by the time the draft appears.
 */
export const TOUCH_SLOP_PX = 10

/**
 * How far a pre-arm horizontal swipe must travel to page, in pixels.
 *
 * A commit distance rather than a velocity, the same choice `snapOf` makes for
 * the drawer and for the same reason: how fast a finger happened to be moving
 * is not an input anybody controls deliberately.
 *
 * It sits above `TOUCH_SLOP_PX` — a gesture must be classified as horizontal
 * before it can page, and then travel further to mean it — and well below the
 * 112px a 3-day column measures at 375px, which is the *other* axis's budget
 * and never competes with this one: paging is decided before arming and drawing
 * only after it.
 */
export const SWIPE_PAGE_PX = 48

/**
 * The band at the top and bottom of the scroller inside which an armed drag
 * drags the grid, in pixels. Prototype 10's number, measured carrying a draw
 * 380px of finger travel plus 51px of auto-scroll.
 *
 * The cost it named is real: two bands eat 140px of a 700px grid, which is why
 * this is the *extension* mechanism for a draft and not the way you scroll.
 */
export const EDGE_BAND_PX = 70

/**
 * The fastest the edge drags the grid, in pixels per frame — ~720px/s at 60fps,
 * a screen and a half of a phone's grid per second at the very edge.
 *
 * Proportional to how far into the band the finger is, so the last 10px of
 * travel are a nudge rather than a launch.
 */
export const EDGE_MAX_PX = 12

/** What a move before arming turns out to have been. */
export type PreArm =
  /** Still inside the slop circle: the long-press is still coming. */
  | 'hold'
  /** Horizontal, and therefore the view's — it pages by the current block. */
  | 'page'
  /** Vertical, and therefore the browser's — the grid scrolls, as it always did. */
  | 'scroll'

/**
 * Which of the three a pre-arm move belongs to.
 *
 * **The dominant axis decides, and it decides once.** A thumb swiping down a
 * phone travels sideways as it goes, so a rule like "any horizontal component
 * pages" would page on every scroll; and the mirror rule would refuse to page
 * the moment a swipe drooped. Comparing the two components answers both, and
 * the caller latches the answer so a gesture that starts horizontal stays
 * horizontal.
 */
export const preArmVerdict = (dx: number, dy: number): PreArm => {
  if (Math.hypot(dx, dy) < TOUCH_SLOP_PX) return 'hold'
  return Math.abs(dx) > Math.abs(dy) ? 'page' : 'scroll'
}

/**
 * Which way a released horizontal swipe pages, or `null` if it never earned it.
 *
 * **Content-following, not button-following**: dragging the grid rightwards
 * brings the *previous* block onto the screen, which is what every calendar and
 * every map does. `-1` and `1` are `stepBy`'s own directions, so the swipe hands
 * its answer straight to `goPrevious`/`goNext` and measures nothing itself.
 */
export const pageDirection = (dx: number): -1 | 1 | null => {
  if (Math.abs(dx) < SWIPE_PAGE_PX) return null
  return dx > 0 ? -1 : 1
}

/**
 * How far the scroller should move this frame, signed, for a finger at `y`.
 *
 * Zero in the middle, which is the whole of the "is the finger at an edge"
 * question — so a caller can run this every frame and let the arithmetic decide
 * whether anything happens.
 *
 * The bands are measured **inside the scroller's own box** rather than the
 * window's: the grid on a phone has a top bar above it and a drawer peeking
 * below it, and a band pinned to the viewport would put the bottom one under the
 * drawer where a thumb cannot reach it.
 */
export const edgeScrollBy = (y: number, top: number, bottom: number): number => {
  const above = top + EDGE_BAND_PX - y
  if (above > 0) return -Math.round(EDGE_MAX_PX * Math.min(above / EDGE_BAND_PX, 1))
  const below = y - (bottom - EDGE_BAND_PX)
  if (below > 0) return Math.round(EDGE_MAX_PX * Math.min(below / EDGE_BAND_PX, 1))
  return 0
}

/**
 * How long a draft is, as the tag says it: `30m`, `1h30`, `2h`.
 *
 * **Slots, not clock arithmetic.** A Slot is half an hour of real time wherever
 * it lands, so a draft crossing the autumn transition is genuinely 30 minutes
 * longer than the wall clock says and this reports the longer number. That is
 * the same reading `slotsOfDay` gives the row axis, and disagreeing with it here
 * would put a tag on the grid that contradicts the grid.
 */
export const durationLabel = (slots: number): string => {
  const hours = Math.floor(slots / 2)
  const half = slots % 2 === 1
  if (hours === 0) return '30m'
  return half ? `${hours}h30` : `${hours}h`
}

/* ------------------------------------------------------------------ *
 * The instrument issue 15 reads
 * ------------------------------------------------------------------ */

/** Which way the compositor took a gesture the grid had already armed. */
export type Loss =
  /** A `touchmove` arrived with `cancelable === false` — the scroll had begun. */
  | 'uncancelable-touchmove'
  /** A `pointercancel` arrived mid-draw — the scroller took the gesture outright. */
  | 'pointercancel'

const reported = new Set<Loss>()

const listeners = new Set<(loss: Loss, detail: string) => void>()

/**
 * Watch the instrument, and get an unsubscribe back.
 *
 * **Issue 15 added this, and it is the difference between the instrument being
 * readable and not.** `reportCompositorLoss` writes to `console.warn`, which on
 * a desktop is a keypress away and on a phone is a Mac, a cable and Safari's
 * Web Inspector, so the one line this whole ticket turns on is invisible to
 * the person actually holding the phone. `CompositorLossReadout` subscribes
 * here and puts it on the glass.
 *
 * Deliberately a plain callback rather than a DOM event: `touch.ts` reaches
 * `yarn test` under plain Node, where there is no `window` to dispatch on.
 */
export const onCompositorLoss = (listener: (loss: Loss, detail: string) => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * The one impure thing in this file, and it is here rather than in a hook
 * because **both** gestures need it and neither owns it.
 *
 * Issue 15's gate is a single question — *can `preventDefault` still cancel a
 * native scroll once a long-press arms?* — and it is instrumented rather than
 * measured, because a synthetic `touchmove` never makes a browser scroll.
 * Prototype 10 printed the verdict into a page of its own; this prints it into
 * the console of the real build, which is the only place issue 15 can read it
 * from on a phone.
 *
 * **Once per reason per page load.** A lost gesture is not an error the user can
 * act on and a flood of them would bury the first one, which is the only one
 * whose timing matters. It fires only when the design has actually failed, so a
 * clean console is still the claim it always was.
 */
export const reportCompositorLoss = (loss: Loss, detail: string): void => {
  if (reported.has(loss)) return
  reported.add(loss)
  for (const listener of listeners) listener(loss, detail)
  console.warn(
    `[touch] the scroller took an armed draw (${loss}): ${detail}. ` +
      'This is issue 15’s gate — preventDefault did not win. See ' +
      '.scratch/friens-cal-v1/issues/15-verify-touch-on-hardware.md'
  )
}
