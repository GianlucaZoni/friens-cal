/**
 * The slot popover's data model: who is free at the Slot that was clicked, and
 * over what span.
 *
 * Its own module, between `segments.ts` (the sweep) and `slot-popover.tsx` (the
 * component), because it belongs to neither. `week-grid.tsx` owns pixels and
 * only pixels, so this has no business there; and a component file that also
 * exports a function loses fast refresh, which `react-refresh/only-export-components`
 * says out loud.
 *
 * It carries `@/` imports and has no test of its own — the claim worth testing is
 * the sweep's, and that lives in `segments.test.ts`.
 */
import type { Segment } from '@/availability/segments'
import { closingLabel, type Slot } from '@/availability/slots'
import type { SetUpFriend } from '@/roster/use-roster'

/**
 * Who is free at the Slot that was clicked, and the span that answer holds for.
 *
 * `span` is the **segment's** wall clock, not the Slot's — see `answerAt` below
 * for why the hit target and the answer unit differ. One nullable field rather
 * than two, because a span is only ever wholly present or wholly absent: two
 * independently-nullable ends would make every reader re-derive an invariant
 * that is not theirs to check.
 */
export type SlotAnswer = {
  /** In roster order. Includes the viewer, if they are free here. */
  free: SetUpFriend[]
  span: { from: string; to: string } | null
}

/**
 * The answer for one Slot, resolved from the sweep of the column it sits in.
 *
 * Lives beside the popover it feeds rather than in `week-grid.tsx`, which owns
 * pixels and only pixels — this does no layout at all. It is the popover's own
 * input, assembled from a column's segments and the Friends the wash counted.
 *
 * ## The segment is the answer unit, and the Slot is the hit target
 *
 * That reconciles three documents which appear to disagree, and the
 * disagreement is real:
 *
 * - Issue 07's criterion says clicking a *Slot* opens the popover, and issue 06
 *   built it anchored to one.
 * - Prototype 05 Q5 recommends the *segment* as the answer unit and measured the
 *   slot layer as "objectively worse".
 * - Ticket 15 says who is answered "only by hovering", and ticket 10 then
 *   replaced hover with a click on both platforms.
 *
 * The prototype's measurement was **about hover**: the panel "re-renders on every
 * 24px of pointer travel through one continuous block whose answer never
 * changes, and flickers as you cross a boundary". Ticket 10 removed hover, and
 * with it that entire failure — a click fires once, and nothing re-renders while
 * the pointer moves. So the *hit target* stays the Slot, which is what issue 06
 * built and what a finger can address, and the *answer unit* is the segment,
 * which is what the prototype was actually protecting.
 *
 * The cost, named: clicking two different Slots inside one segment opens the same
 * answer in two different places, so the panel appears to move for no reason.
 * That is cheap next to the alternative, which is a hit target whose height
 * varies from 20px to 500px depending on data.
 */
export const answerAt = (
  segments: readonly Segment[],
  counted: readonly SetUpFriend[],
  slots: Slot[],
  row: number
): SlotAnswer => {
  const segment = segments.find((candidate) => row >= candidate.start && row < candidate.end)
  if (segment === undefined) return { free: [], span: null }

  return {
    // Filtered from `counted` rather than mapped from `friendIds`, so the list
    // arrives in roster order and cannot contain a hole — `segmentsOf` returns
    // the ids in the order it was handed them, which is that order.
    free: counted.filter((friend) => segment.friendIds.includes(friend.id)),
    span: {
      from: slots[segment.start].label,
      // `closingLabel`, so a segment that runs to the end of the day reads
      // `23:30–24:00` rather than as a range that runs backwards.
      to: closingLabel(slots[segment.end]?.label),
    },
  }
}
