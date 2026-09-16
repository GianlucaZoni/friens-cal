/**
 * Whether a run carries on past the column it is drawn in.
 *
 * A run is `CONTEXT.md`'s run: one Friend's contiguous held Slots, reassembled
 * at render time by `runsOf`. It reassembles them **within one column's rows**,
 * so an evening that crosses the viewer's midnight is two runs and nothing
 * above `runsOf` knows they are the same evening. This is the one fact that
 * puts them back in touch, and it is deliberately the smallest fact that will
 * do: two booleans, no identity, no pairing, no far end.
 *
 * ## Why the store and not the neighbouring column
 *
 * The grid draws seven columns and the store holds every instant anybody has
 * ever drawn. A Sunday evening whose remainder lands on the following Monday
 * has no neighbouring column to ask, because the week view stops at Sunday. A
 * marker derived from what is on screen could not exist for the case that
 * raised the ticket in the first place. Asking the store costs one probe per
 * column edge and answers off-screen and on-screen alike.
 *
 * This is also why the marker is a chevron pointing **down** rather than an
 * arrow pointing at the next column: *there is more below the bottom of this
 * day* is true whether or not that day is drawn (prototype 13 §1).
 *
 * ## Why the column's own edge, and not the run's
 *
 * The run on screen and the store are allowed to disagree. `runsOf` is handed
 * the gesture in flight as well as the committed Slots, so an erase draft opens
 * a hole at 23:30 in a block the store still holds whole. "The Slot after the
 * run is held" would put a chevron in the middle of the column; "the run
 * reaches the column's own last row **and** the store holds the Slot past it"
 * does not.
 *
 * ## Why no DST case
 *
 * The probe is the instant half an hour either side of the column, and a Slot
 * is an `epoch % 1800 = 0` instant (`slots.ts`). Columns are therefore flush in
 * absolute time whatever their row counts: the 50-row Sunday's last row plus
 * thirty minutes is the Monday's first row, exactly as an ordinary day's is.
 * Nothing here reads a wall clock, so nothing here has a spring or an autumn.
 *
 * **No `@/` imports, deliberately.** The same split `slots.ts` and `segments.ts`
 * already make, so `yarn test` can reach this under plain Node.
 */
import { SLOT_MS, type Run } from './slots.ts'

/**
 * A run, told whether the Slots either side of its column are held.
 *
 * Both false is the ordinary case and the drawing is byte-identical to what it
 * was: a capped block with a two-pixel ring all the way round.
 */
export type ContinuedRun = Run & {
  /** The run opens the column and the Slot before the column is held. */
  continuesBefore: boolean
  /** The run closes the column and the Slot after the column is held. */
  continuesAfter: boolean
}

/**
 * All a column's Slots are asked for here: when each of them begins.
 *
 * Structural rather than `Slot`, so the rule cannot come to depend on a label
 * or a DST flag. The two instants it needs are the first row's and the last
 * row's, and everything else on a `Slot` is a reading of the wall clock.
 */
type ColumnSlot = { start: Date }

/**
 * Mark the runs of one column that carry on past it.
 *
 * `isHeld` is the store, narrowed to one Friend: `isFree(viewer.id, …)` at the
 * call site. The two probes are taken once per column rather than once per run,
 * which is what the column's edges being the only candidates buys.
 */
export const withContinuation = (
  runs: readonly Run[],
  slots: readonly ColumnSlot[],
  isHeld: (instant: Date) => boolean
): ContinuedRun[] => {
  const before = isHeld(new Date(slots[0].start.getTime() - SLOT_MS))
  const after = isHeld(new Date(slots[slots.length - 1].start.getTime() + SLOT_MS))

  return runs.map((run) => ({
    ...run,
    continuesBefore: run.start === 0 && before,
    continuesAfter: run.start + run.length === slots.length && after,
  }))
}
