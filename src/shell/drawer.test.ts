/**
 * The bottom drawer's geometry.
 *
 *     yarn test
 */
import { DRAWER_PEEK, dragTo, fullHeightOf, snapOf } from './drawer.ts'
import assert from 'node:assert/strict'
import test from 'node:test'

/** An iPhone 12/13/14 at 390×844 — one of the two widths the ticket names. */
const VIEWPORT = 844
const FULL = fullHeightOf(VIEWPORT)

test('full leaves a strip of the calendar showing, because the drawer has no backdrop', () => {
  assert.ok(FULL < VIEWPORT)
  assert.equal(VIEWPORT - FULL, 127)
})

test('dragging up grows the drawer by exactly how far the finger travelled', () => {
  assert.equal(dragTo(DRAWER_PEEK, 200, FULL), DRAWER_PEEK + 200)
})

test('dragging down from full shrinks it', () => {
  assert.equal(dragTo(FULL, -100, FULL), FULL - 100)
})

test('a drag never goes below the peek or above full — clamped, not rubber-banded', () => {
  assert.equal(dragTo(DRAWER_PEEK, -500, FULL), DRAWER_PEEK)
  assert.equal(dragTo(FULL, 500, FULL), FULL)
})

test('release snaps to the nearer resting height', () => {
  assert.equal(snapOf(DRAWER_PEEK + 10, FULL), 'peek')
  assert.equal(snapOf(FULL - 10, FULL), 'full')
})

test('the midpoint itself opens, so a drag exactly halfway is not a no-op', () => {
  const midpoint = (DRAWER_PEEK + FULL) / 2
  assert.equal(snapOf(midpoint, FULL), 'full')
  assert.equal(snapOf(midpoint - 1, FULL), 'peek')
})

test('a peek-height release from a peek-height start is still a peek', () => {
  // The tap path: pointerdown and pointerup with nothing between them. It must
  // not snap the drawer open by accident — `shell.tsx` treats a sub-4px travel
  // as a tap and toggles instead, and this is the half that has to agree.
  assert.equal(snapOf(dragTo(DRAWER_PEEK, 0, FULL), FULL), 'peek')
})
