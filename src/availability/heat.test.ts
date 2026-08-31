/**
 * The opacity ramp, asserted against the one property ticket 15 bought with it.
 *
 *     yarn test
 *
 * Ticket 15 replaced the composite with a single-hue heatmap specifically
 * because **opacity is monotonic in the count, so adding a Friend always *adds*
 * information** — which the mesh gradient it replaced did not do (eight
 * translucent gradients average into mud, and near-identical hues under-report
 * the count outright). That property is the whole reason the view is built this
 * way, so it is the thing worth a test rather than the numbers, which are
 * design.
 *
 * `installHeatTokens` is not tested here: it writes a `<style>` element, its
 * content is two numbers per theme, and the claim that matters about it — that
 * the cascade and not JavaScript decides which theme's numbers apply — is not
 * something a unit test can hold. It is verified in the browser, in both themes.
 */
import { heatFraction } from './heat.ts'
import assert from 'node:assert/strict'
import test from 'node:test'

/* ================================================================== *
 * Monotonic in the count — the property ticket 15 bought
 * ================================================================== */

test('one more Friend free is always stronger, across a whole group', () => {
  // Over 1..group, which is the ramp's whole domain — a count of zero is not a
  // faint wash, it is the *absence* of one (`segmentsOf` emits no segment for a
  // span nobody is free in), so it is not on the ramp at all.
  const group = 9
  const ramp = Array.from({ length: group }, (_, index) => heatFraction(index + 1, group))

  ramp.forEach((fraction, index) => {
    if (index === 0) return
    assert.ok(
      fraction > ramp[index - 1],
      `${index + 2} free must be stronger than ${index + 1}, got ${fraction} vs ${ramp[index - 1]}`
    )
  })
})

test('a count of zero clamps to the foot of the ramp rather than below it', () => {
  // Unreachable — see above — and clamped anyway, because the arithmetic on the
  // way there is `(count - 1) / (of - 1)` and an unclamped zero would come out
  // negative. A negative opacity is invalid, which means the browser drops the
  // whole declaration and paints the wash fully opaque: the solid block ticket
  // 15 removed, arriving by way of a nonsense argument.
  assert.equal(heatFraction(0, 9), 0)
})

/* ================================================================== *
 * The ends of the ramp
 * ================================================================== */

test('one Friend free sits at the bottom of the ramp, whatever the group size', () => {
  // Not at zero: the floor is tuned to be *just* visible, and a single Friend
  // free is the most ordinary thing on the grid. Not proportional either — with
  // 1/9 of a proportional ramp a lone Friend would be invisible in a group of
  // nine, which is the group this product has.
  assert.equal(heatFraction(1, 2), 0)
  assert.equal(heatFraction(1, 9), 0)
})

test('everybody free sits at the top of the ramp, whatever the group size', () => {
  // So the darkest thing on screen always means the same thing — a full house
  // of the Friends the viewer is trying to meet — and the ramp spends its whole
  // range on whatever the group actually is.
  assert.equal(heatFraction(2, 2), 1)
  assert.equal(heatFraction(9, 9), 1)
})

test('a group of one is a full house', () => {
  // The degenerate denominator, which is reachable: hide everyone but one
  // Friend and the wash is about that Friend alone.
  assert.equal(heatFraction(1, 1), 1)
})

test('more free than there are Friends is clamped, not extrapolated', () => {
  // Unreachable through the sweep — it counts a subset of the list it is given.
  // Clamped rather than trusted because an opacity above 1 is a rendering fault
  // and a wash that reads as "more than everyone" is a nonsense.
  assert.equal(heatFraction(12, 9), 1)
})

/* ================================================================== *
 * Hiding a Friend
 * ================================================================== */

test('hiding a Friend who is not free intensifies the rest', () => {
  // Named because it is a consequence, not an accident: the denominator is who
  // the viewer is trying to meet, so with one fewer of them the same two free
  // Friends are a larger share of the query. 2 of 3 is fainter than 2 of 2.
  assert.ok(heatFraction(2, 3) < heatFraction(2, 2))
})
