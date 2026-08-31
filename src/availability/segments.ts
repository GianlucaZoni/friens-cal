/**
 * The boundary sweep: where the *set* of free Friends changes, and what it
 * changes to.
 *
 * This is the unit the heatmap is drawn from and the unit the popover answers
 * about — and it is a different question from the one `runsOf` in `slots.ts`
 * answers. `runsOf` merges contiguous *held* slots into a block, which is the
 * right shape for one Friend's own Availability and the wrong shape here: a
 * wash needs a boundary wherever the **count** moves, and a block that spans
 * three different sets cannot say who is in it.
 *
 * Its own module rather than a third function in `slots.ts`, which would then
 * have two reasons to change: `slots.ts` is what a day is made of, and this is
 * what everybody's Availability adds up to.
 *
 * **No `@/` imports, deliberately** — the same split `slots.ts`, `gesture.ts`,
 * `identity.ts` and `roster.ts` already make, so `yarn test` can reach this
 * under plain Node. Bare package specifiers are fine; Node resolves those.
 *
 * ## Why the segment and not the slot
 *
 * Prototype 05 built both and measured them (Q1, Q5). One block per maximal
 * span where the set is constant beat one block per "somebody is free": the
 * cross-fade the latter needs is ~11px on each side and a 30-minute slot is
 * 20px tall, so any short segment is *entirely* fade and the moment a Friend
 * joined is smeared across twenty minutes of wall clock. And it left the block
 * unable to answer "who is free here", because a five-hour run holds three
 * different answers.
 *
 * With segmentation, **the segment IS the answer set**. That is the property
 * the popover, the wash and — next — issue 08's Candidate scan all lean on.
 *
 * ## Why segments group back into bands
 *
 * The same prototype's recommendation, and the half of it that survived ticket
 * 15: *segments inside runs*. Adjacent segments drawn as separate boxes read as
 * separate offers rather than one continuous window, so the boundaries where the
 * set changes are drawn hard and **internal**, inside one outline per contiguous
 * stretch. `bandsOf` is that grouping.
 *
 * **Called a band and not a run, deliberately.** `CONTEXT.md` defines a run as
 * *one Friend's* contiguous held Slots — "a Friend who is free all evening holds
 * a run" — and this is a stretch where *anybody* is free, which is a different
 * thing and is also not a Candidate (that needs two or more, and is issue 08's).
 * Three meanings for one word in a file that already draws the viewer's own
 * `runs` would be three ways to misread it.
 */
import { times } from 'lodash-es'

/**
 * A maximal span over which the same Friends are free.
 *
 * `start` and `end` are **row indices into one column's own slots**, half open —
 * the same coordinates `Run` uses, and for the same reason. A day is 46, 48 or
 * 50 slots (`slotsOfDay`), so an index that did not belong to a stated column
 * would be meaningless twice a year.
 *
 * `friendIds` is never empty: a span where nobody is free is a gap, and a gap
 * is the absence of a segment rather than a segment holding nobody.
 */
export type Segment = {
  /** First slot of the span, inclusive. */
  start: number
  /** One past its last slot. */
  end: number
  /** The Friends free throughout it, in the order they were handed in. */
  friendIds: readonly string[]
}

/**
 * Sweep `length` slots and cut a boundary wherever the set of free Friends
 * changes.
 *
 * `friendIds` is **the query** — "the Friends the viewer is currently trying to
 * meet" (`roster.visible`, CONTEXT.md's Hidden). Nothing here filters and
 * nothing here knows the word Hidden; a Friend left out of the list is simply
 * not in the sweep, which is what makes hiding one take effect on the next
 * render with no invalidation anywhere.
 *
 * Taking the list rather than a `(index) => friendIds` probe is what lets this
 * own the ordering invariant instead of asking a caller to honour it: the
 * comparison that decides where a boundary falls is order-sensitive, and the
 * order it compares is fixed here. It also lands the popover's list in roster
 * order for free.
 */
export const segmentsOf = (
  length: number,
  friendIds: readonly string[],
  isFree: (friendId: string, index: number) => boolean
): Segment[] =>
  times(length)
    .map((index) => friendIds.filter((friendId) => isFree(friendId, index)))
    .reduce<Segment[]>((segments, free, index) => {
      if (free.length === 0) return segments

      const last = segments[segments.length - 1]
      // Extended rather than appended only when it *touches* and the set is
      // identical. Both halves matter: a gap between two identical sets is two
      // segments, and a change of set with no change of count is two segments.
      return last !== undefined && last.end === index && sameFriends(last.friendIds, free)
        ? [...segments.slice(0, -1), { ...last, end: index + 1 }]
        : [...segments, { start: index, end: index + 1, friendIds: free }]
    }, [])

/**
 * Set equality, as a positional comparison.
 *
 * Sound because both sides are `friendIds.filter(…)` over the same array in the
 * same render, so equal sets are equal *sequences*. `segmentsOf` owning the
 * order is what buys that — with a caller-supplied order it would need a sort
 * or a `Set` per slot, once per row per column.
 */
const sameFriends = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((friendId, index) => friendId === b[index])

/**
 * A stretch of time where somebody — anybody — is free: contiguous segments,
 * drawn as one silhouette.
 *
 * Not a **run** (`CONTEXT.md`: that is one Friend's own contiguous Slots) and not
 * a **Candidate** (that needs two or more Friends, and is issue 08's). Its own
 * word because it is its own thing.
 */
export type Band = Segment[]

/**
 * Contiguous segments, grouped into bands.
 *
 * The grid gives each band one rounded outline and clips the segments to it, so
 * the silhouette says *when anyone is free* and the hard internal edges say
 * *when that changed*.
 */
export const bandsOf = (segments: readonly Segment[]): Band[] =>
  segments.reduce<Band[]>((bands, segment) => {
    const last = bands[bands.length - 1]
    const previous = last?.[last.length - 1]
    return previous !== undefined && previous.end === segment.start
      ? [...bands.slice(0, -1), [...last, segment]]
      : [...bands, [segment]]
  }, [])
