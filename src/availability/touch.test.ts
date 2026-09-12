/**
 * The touch gesture's arithmetic.
 *
 *     yarn test
 */
import { DRAG_THRESHOLD_PX } from './gesture.ts'
import {
  ARM_MS,
  EDGE_BAND_PX,
  EDGE_MAX_PX,
  SWIPE_PAGE_PX,
  TOUCH_SLOP_PX,
  TOUCH_SLOT_PX,
  durationLabel,
  edgeScrollBy,
  onCompositorLoss,
  pageDirection,
  preArmVerdict,
  reportCompositorLoss,
} from './touch.ts'
import assert from 'node:assert/strict'
import test from 'node:test'

/* ------------------------------------------------------------------ *
 * What a move before arming belongs to
 * ------------------------------------------------------------------ */

test('a finger inside the slop circle is still holding, in every direction', () => {
  assert.equal(preArmVerdict(0, 0), 'hold')
  assert.equal(preArmVerdict(9, 0), 'hold')
  assert.equal(preArmVerdict(0, -9), 'hold')
  // 6,6 is 8.49px away — inside the circle, though outside a 6px square.
  assert.equal(preArmVerdict(6, 6), 'hold')
})

test('the slop is wider than the mouse threshold, because a thumb on glass moves', () => {
  assert.ok(TOUCH_SLOP_PX > DRAG_THRESHOLD_PX)
})

test('the dominant axis decides: sideways pages, downwards scrolls', () => {
  assert.equal(preArmVerdict(30, 4), 'page')
  assert.equal(preArmVerdict(-30, 4), 'page')
  assert.equal(preArmVerdict(4, 30), 'scroll')
  assert.equal(preArmVerdict(4, -30), 'scroll')
})

test("a thumb's arc scrolls rather than paging — it is vertical with drift, not the reverse", () => {
  // Prototype 10's 30px of lateral drift, on a 120px downward swipe.
  assert.equal(preArmVerdict(30, 120), 'scroll')
})

test('a diagonal at exactly 45° scrolls, so the browser keeps the ambiguous case', () => {
  assert.equal(preArmVerdict(20, 20), 'scroll')
})

/* ------------------------------------------------------------------ *
 * Paging
 * ------------------------------------------------------------------ */

test('a swipe pages only once it has travelled the commit distance', () => {
  assert.equal(pageDirection(SWIPE_PAGE_PX - 1), null)
  assert.equal(pageDirection(SWIPE_PAGE_PX), -1)
})

test('the content follows the finger: dragging right brings the previous block on', () => {
  assert.equal(pageDirection(120), -1)
  assert.equal(pageDirection(-120), 1)
})

test('the commit distance is above the slop, so a classified swipe can still be abandoned', () => {
  assert.ok(SWIPE_PAGE_PX > TOUCH_SLOP_PX)
})

/* ------------------------------------------------------------------ *
 * Edge auto-scroll
 * ------------------------------------------------------------------ */

/** A phone's grid: the scroller between a top bar and the drawer's peek. */
const TOP = 90
const BOTTOM = 690

test('nothing happens in the middle of the scroller', () => {
  assert.equal(edgeScrollBy(400, TOP, BOTTOM), 0)
  assert.equal(edgeScrollBy(TOP + EDGE_BAND_PX, TOP, BOTTOM), 0)
  assert.equal(edgeScrollBy(BOTTOM - EDGE_BAND_PX, TOP, BOTTOM), 0)
})

test('the band pulls upwards at the top and downwards at the bottom', () => {
  assert.ok(edgeScrollBy(TOP + 10, TOP, BOTTOM) < 0)
  assert.ok(edgeScrollBy(BOTTOM - 10, TOP, BOTTOM) > 0)
})

test('speed is proportional to how far into the band the finger is', () => {
  const nudge = edgeScrollBy(BOTTOM - EDGE_BAND_PX + 7, TOP, BOTTOM)
  const middle = edgeScrollBy(BOTTOM - EDGE_BAND_PX / 2, TOP, BOTTOM)
  assert.ok(nudge > 0 && nudge < middle)
  assert.equal(middle, Math.round(EDGE_MAX_PX / 2))
})

test('it tops out rather than accelerating past the edge, however far the finger goes', () => {
  assert.equal(edgeScrollBy(BOTTOM, TOP, BOTTOM), EDGE_MAX_PX)
  assert.equal(edgeScrollBy(BOTTOM + 500, TOP, BOTTOM), EDGE_MAX_PX)
  assert.equal(edgeScrollBy(TOP - 500, TOP, BOTTOM), -EDGE_MAX_PX)
})

test('the bands are the scroller’s own, not the viewport’s', () => {
  // The same client y is nothing at all in a scroller that starts at the top of
  // the window, and inside the band in the phone's, which starts under the bar.
  assert.equal(edgeScrollBy(100, 0, BOTTOM), 0)
  assert.ok(edgeScrollBy(100, TOP, BOTTOM) < 0)
})

/* ------------------------------------------------------------------ *
 * The draft's tag
 * ------------------------------------------------------------------ */

test('the tag says how long the draft is, in the shortest true form', () => {
  assert.equal(durationLabel(1), '30m')
  assert.equal(durationLabel(2), '1h')
  assert.equal(durationLabel(3), '1h30')
  assert.equal(durationLabel(16), '8h')
  assert.equal(durationLabel(49), '24h30')
})

test('an autumn day is 25 hours long, and the tag says so', () => {
  // 50 Slots is what `slotsOfDay` hands the column the clocks go back on.
  assert.equal(durationLabel(50), '25h')
})

/* ------------------------------------------------------------------ *
 * The two numbers that came off a measurement
 * ------------------------------------------------------------------ */

test('a touch row clears the 44px minimum target, and the desktop row does not', () => {
  assert.equal(TOUCH_SLOT_PX, 44)
})

test('arming is prototype 10’s ~450ms, accepted with its cost named', () => {
  assert.equal(ARM_MS, 450)
})

/* ------------------------------------------------------------------ *
 * The instrument issue 15 reads
 * ------------------------------------------------------------------ */

test('the instrument hands each loss to its watchers, once per reason', () => {
  // Issue 15 put a readout on the glass because a phone has no console, and it
  // is only as good as this subscription. The once-per-reason rule is asserted
  // here rather than trusted: it is the reason a tester must do a full reload
  // between attempts, and a regression that made it once-per-*loss* would turn
  // a screen that already spoke into a screen that looks like a pass.
  const spoken = console.warn
  console.warn = () => {}

  const heard: string[] = []
  const unsubscribed: string[] = []
  const stop = onCompositorLoss((loss) => heard.push(loss))
  onCompositorLoss((loss) => unsubscribed.push(loss))()

  try {
    reportCompositorLoss('uncancelable-touchmove', 'phase live')
    reportCompositorLoss('uncancelable-touchmove', 'phase live, a second time')
    reportCompositorLoss('pointercancel', 'armed draw cancelled')
  } finally {
    console.warn = spoken
    stop()
  }

  assert.deepEqual(heard, ['uncancelable-touchmove', 'pointercancel'])
  assert.deepEqual(unsubscribed, [])
})
