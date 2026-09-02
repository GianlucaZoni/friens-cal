import type { Segment } from '@/availability/segments'
import { closingLabel, type Slot } from '@/availability/slots'
import type { SetUpFriend } from '@/roster/use-roster'

/**
 * The day panel's data model: **every** window of the day, and who is in each.
 *
 * The day-level counterpart to `slot-answer.ts`, and a sibling rather than a
 * function in it because the two answer different questions off the same sweep.
 * `answerAt` takes a Slot and returns the one segment containing it — *"these
 * Friends, from here to here"*. A month cell has no Slot to be clicked: its hit
 * target is a whole day, so the question is *"when is anybody free today, and
 * who"*, and the answer is the day's segments, all of them, in order.
 *
 * That is also why ticket 05's hover panel does not transfer, beyond its
 * placement: it was built to answer about a segment, and there is no segment
 * under a month click to answer about.
 *
 * It carries `@/` imports and has no test of its own — the claim worth testing
 * is the sweep's, and that lives in `segments.test.ts`.
 */

/** One stretch of the day where the same Friends were free. */
export type DayWindow = {
  /** The wall clock it opens at, in the group's zone. */
  from: string
  /** And closes at — `24:00` where that is midnight, never `00:00`. */
  to: string
  /** In roster order. Includes the viewer, if they are free here. */
  free: SetUpFriend[]
}

/**
 * The day's windows, resolved from the sweep of its own Slots.
 *
 * Swept against **that day's own** slots array, never a shared row count: a day
 * holds 46, 48 or 50 Slots and the autumn Sunday holds 02:00 twice, so an index
 * that did not belong to a stated day would be meaningless twice a year. It is
 * the same rule `segmentsOf`, `runInColumn` and `wholeDay` are all held to.
 *
 * The Friends are filtered out of `counted` rather than mapped from `friendIds`,
 * so each list arrives in roster order and cannot contain a hole — the same
 * reason `answerAt` does it that way.
 */
export const windowsOf = (
  segments: readonly Segment[],
  counted: readonly SetUpFriend[],
  slots: readonly Slot[]
): DayWindow[] =>
  segments.map((segment) => ({
    from: slots[segment.start].label,
    // `closingLabel`, so a window running to the end of the day reads
    // `23:30–24:00` rather than as a range that runs backwards.
    to: closingLabel(slots[segment.end]?.label),
    free: counted.filter((friend) => segment.friendIds.includes(friend.id)),
  }))
