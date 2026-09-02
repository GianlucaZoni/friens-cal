/**
 * The Candidate pipeline: everybody's Availability, from now forward, turned
 * into ranked suggestions of when the group could actually meet.
 *
 * A **Candidate** is computed and has no identity (`CONTEXT.md`) — it exists
 * only as long as the Availability underneath it, and every recompute builds it
 * from scratch. There is nothing stored here and nothing to invalidate.
 *
 * **No `@/` imports, deliberately** — the same split `slots.ts`, `segments.ts`,
 * `gesture.ts`, `identity.ts` and `roster.ts` already make, so
 * `candidates.test.ts` can reach this under plain Node (`yarn test`). The two
 * relative imports carry their extensions because Node's own resolver needs
 * them.
 *
 * ## The eight steps, and where each one is
 *
 * Ticket 09 settled the algorithm as a pipeline over **one continuous timeline
 * of 30-minute slots**, and this file is that pipeline in that order:
 *
 * | Step | Here |
 * | --- | --- |
 * | 1 Horizon · 2 Visible · 3 Blank the Hangouts | `scanCandidates`, two filters |
 * | 4 Sweep into atomic runs | `segmentsOf`, issue 07's own sweep |
 * | 5 Extend | `extendedRuns` |
 * | 6 Prune dominated | `undominated` |
 * | 7 Sort | `ranked` |
 * | 8 Identity | `identify` |
 *
 * **Step 4 is not written here.** Issue 07 built the boundary sweep for the
 * heatmap and handed it over explicitly: `segmentsOf` cuts a boundary wherever
 * the *set* of free Friends changes or a slot is missing, which is exactly an
 * atomic run, and it owns the ordering invariant so `friendIds` arrives in
 * roster order without this file sorting anything. The one adaptation is the
 * axis: the heatmap sweeps **one column's own slot indices**, and a Candidate
 * may span days (ticket 09 step 4: *do not break at midnight*), so the sweep
 * runs here over indices into one continuous lattice anchored at the earliest
 * Slot anybody holds.
 *
 * ## Why the timeline is dense and the data is not
 *
 * `segmentsOf` walks every index from 0 to the span, and Availability is sparse
 * — a fortnight of evenings is a few hundred rows across a lattice of a
 * thousand. That is deliberate: the *gaps* are what step 4 needs to see, since
 * a missing slot is where one run ends and the next begins. The cost is one
 * pass over the span, and a year of Availability is ~17,500 indices.
 */
import { segmentsOf } from '../availability/segments.ts'
import { SLOT_MS, type FreeSlot } from '../availability/slots.ts'

/**
 * A confirmed Hangout, as narrow as step 3 needs it — half open, in epoch
 * milliseconds.
 *
 * Issue 09 builds the table, the confirm and the pinned region; this is the
 * shape it will hand back, and the pipeline is written against it now so that
 * step 3 is tested rather than retrofitted.
 */
export type HangoutRange = { startsAt: number; endsAt: number }

/**
 * A window in which two or more visible Friends are all free.
 *
 * `start` and `end` are half open, in epoch milliseconds, and `friendIds` is in
 * roster order — the order `visible` was handed in, which `segmentsOf` fixes.
 */
export type Candidate = {
  /**
   * `start | end | sorted friend ids` (ticket 09 step 8): the render key, and
   * the only identity a Candidate has. Sorted rather than in roster order, so
   * two Friends swapping places alphabetically is not a new Candidate.
   */
  id: string
  start: number
  end: number
  friendIds: readonly string[]
}

/**
 * What one pass of the pipeline produced, and the one fact about its input that
 * the empty states need.
 */
export type CandidateScan = {
  /** Ranked, and complete: nothing is capped and nothing is dropped. */
  candidates: Candidate[]
  /**
   * Whether any visible Friend holds Availability from the horizon forward.
   *
   * Measured **before** step 3, so a group whose every free evening is already
   * a confirmed Hangout reads as *"no overlaps"* rather than as *"nobody's free
   * yet — draw your availability"*. The second would be a lie told to people
   * who have drawn plenty. See `emptyReason`.
   */
  anyAvailability: boolean
}

/**
 * The pipeline.
 *
 * `visible` is **the query** — the Friends the viewer is currently trying to
 * meet (`CONTEXT.md`'s Hidden, `roster.visible`). Nothing here knows the word
 * Hidden: a Friend left out of the list is simply not swept, which is what
 * makes an eye toggle take effect on the next render with no refetch.
 *
 * `from` is the horizon — the start of the Slot containing now
 * (`slotContaining`), never the raw instant. Clipping to the Slot is what keeps
 * step 1 from ever producing a sub-30-minute Candidate out of this afternoon's
 * leftovers, and it is why the caller needs a timer: the answer changes on the
 * half hour with no data change at all.
 */
export const scanCandidates = ({
  slots,
  visible,
  hangouts,
  from,
}: {
  slots: readonly FreeSlot[]
  visible: readonly string[]
  hangouts: readonly HangoutRange[]
  from: number
}): CandidateScan => {
  /* Steps 1 and 2: the horizon, and the query. */
  const inHorizon = slots.filter((slot) => slot.start >= from && visible.includes(slot.friendId))

  /*
   * Step 3: blank the Hangouts — for **every** Friend, not only the
   * Participants. Issue 09's exclusion constraint forbids a second Hangout at
   * that time, so a Candidate there is one the database would refuse to
   * confirm; offering it would be offering an action that cannot succeed.
   */
  const free = inHorizon.filter(
    (slot) =>
      !hangouts.some(({ startsAt, endsAt }) => slot.start >= startsAt && slot.start < endsAt)
  )

  return {
    anyAvailability: inHorizon.length > 0,
    candidates: identify(ranked(undominated(extendedRuns(atomicRuns(free, visible))))),
  }
}

/* ------------------------------------------------------------------ *
 * Step 4 — the sweep, over one continuous lattice
 * ------------------------------------------------------------------ */

/** A span of the timeline over which the same Friends are free. Half open, in ms. */
type Interval = { start: number; end: number; friendIds: readonly string[] }

/**
 * Atomic runs of `{start, end, friendIds}`, in time order.
 *
 * The lattice is anchored at the **earliest Slot anybody holds** rather than at
 * the horizon: the two are usually days apart (the horizon is now, the first
 * Availability may be Friday evening), and anchoring at the horizon would sweep
 * thousands of empty indices to reach the first one that says anything.
 */
const atomicRuns = (free: readonly FreeSlot[], visible: readonly string[]): Interval[] => {
  /*
   * `reduce` rather than `Math.min(...starts)`: a year of a nine-Friend group's
   * evenings is tens of thousands of Slots, and a spread that wide is an
   * argument list every engine has its own limit on.
   */
  const bounds = free.reduce<{ earliest: number; latest: number } | null>(
    (span, slot) =>
      span === null
        ? { earliest: slot.start, latest: slot.start }
        : {
            earliest: Math.min(span.earliest, slot.start),
            latest: Math.max(span.latest, slot.start),
          },
    null
  )
  if (bounds === null) return []

  /*
   * The sweep's probe. A `Set` per Slot rather than a scan of `free` per
   * (Friend, index): the sweep asks `visible.length` questions at every index,
   * and over a fortnight that is tens of thousands of them.
   */
  const bySlot = free.reduce<Map<number, Set<string>>>((byStart, slot) => {
    const at = byStart.get(slot.start)
    if (at === undefined) byStart.set(slot.start, new Set([slot.friendId]))
    else at.add(slot.friendId)
    return byStart
  }, new Map())

  const span = (bounds.latest - bounds.earliest) / SLOT_MS + 1
  const at = (index: number) => bounds.earliest + index * SLOT_MS

  return segmentsOf(
    span,
    visible,
    (friendId, index) => bySlot.get(at(index))?.has(friendId) ?? false
  ).map((segment) => ({
    start: at(segment.start),
    end: at(segment.end),
    friendIds: segment.friendIds,
  }))
}

/* ------------------------------------------------------------------ *
 * Step 5 — extend
 * ------------------------------------------------------------------ */

/** A Candidate needs two Friends. One Friend free is not a suggestion. */
const MINIMUM_FRIENDS = 2

/**
 * Every run of two or more Friends, grown outward to the largest interval where
 * all of them are continuously free — then deduped.
 *
 * This and step 6 are together the answer to *what counts as one Candidate*.
 * A sub-Candidate is **not absorbed** by the window around it: "all three free
 * 21:00–21:30" is a different offer from "Marco and Sara free 20:00–22:00", and
 * a person asked to choose would name both.
 *
 * Deduping is not an optimisation — it is load-bearing. Two runs holding the
 * same Friend set on either side of a third that merely *contains* it both
 * extend to the identical interval, and the worked example in the tests is
 * exactly that shape.
 */
const extendedRuns = (runs: readonly Interval[]): Interval[] => {
  const seen = new Set<string>()

  return runs.flatMap((run, index) => {
    if (run.friendIds.length < MINIMUM_FRIENDS) return []

    const grown = {
      start: reach(runs, index, run.friendIds, -1),
      end: reach(runs, index, run.friendIds, 1),
      friendIds: run.friendIds,
    }

    const key = keyOf(grown)
    if (seen.has(key)) return []
    seen.add(key)
    return [grown]
  })
}

/**
 * How far this Friend set reaches in one direction: the edge of the last
 * adjacent run that still holds all of them.
 *
 * Recursive rather than a loop, and bounded by the run count. Adjacency is
 * checked as well as membership — two runs holding the same Friends with a gap
 * between them are two Candidates, because nobody is free in the gap.
 */
const reach = (
  runs: readonly Interval[],
  index: number,
  friendIds: readonly string[],
  direction: -1 | 1
): number => {
  const here = runs[index]
  const next = runs[index + direction]
  const edge = direction === -1 ? here.start : here.end

  const adjacent =
    next !== undefined && (direction === -1 ? next.end === here.start : next.start === here.end)

  return adjacent && friendIds.every((friendId) => next.friendIds.includes(friendId))
    ? reach(runs, index + direction, friendIds, direction)
    : edge
}

/* ------------------------------------------------------------------ *
 * Step 6 — prune dominated
 * ------------------------------------------------------------------ */

/**
 * Drop `C` when some other `D` has `D.friends ⊇ C.friends` **and**
 * `C interval ⊆ D interval` — a card that says strictly less than a card
 * already on screen.
 *
 * Mutual elimination is not reachable: two intervals that each cover the other
 * are equal, and with equal Friend sets they are the same interval, which step
 * 5 deduped.
 */
const undominated = (intervals: readonly Interval[]): Interval[] =>
  intervals.filter(
    (candidate) => !intervals.some((other) => other !== candidate && dominates(other, candidate))
  )

const dominates = (dominant: Interval, weak: Interval): boolean =>
  weak.start >= dominant.start &&
  weak.end <= dominant.end &&
  weak.friendIds.every((friendId) => dominant.friendIds.includes(friendId))

/* ------------------------------------------------------------------ *
 * Step 7 — sort
 * ------------------------------------------------------------------ */

/**
 * Friend count descending → start ascending → duration descending → sorted
 * Friend ids.
 *
 * **Count strictly dominates duration**: a 30-minute window with four Friends
 * outranks a four-hour window with three, permanently. Ticket 09 settled that
 * and ticket 16 looked at it once more without reopening it.
 *
 * The last two keys are not cosmetic. Without them a Realtime update that
 * changes nothing about two tied cards still visibly reshuffles them, because
 * `Array#sort` is only stable with respect to the *input* order, and the input
 * order here is whatever the sweep produced from a set that just changed.
 *
 * Sorted-ids-as-a-string is computed once per Candidate rather than inside the
 * comparator, which would build it O(n log n) times.
 */
const ranked = (intervals: readonly Interval[]): Interval[] =>
  intervals
    .map((interval) => ({ interval, ids: sortedIds(interval) }))
    .sort(
      (a, b) =>
        b.interval.friendIds.length - a.interval.friendIds.length ||
        a.interval.start - b.interval.start ||
        b.interval.end - b.interval.start - (a.interval.end - a.interval.start) ||
        a.ids.localeCompare(b.ids)
    )
    .map(({ interval }) => interval)

/* ------------------------------------------------------------------ *
 * Step 8 — identity
 * ------------------------------------------------------------------ */

const sortedIds = (interval: Interval): string => [...interval.friendIds].sort().join(',')

const keyOf = (interval: Interval): string =>
  `${interval.start}|${interval.end}|${sortedIds(interval)}`

const identify = (intervals: readonly Interval[]): Candidate[] =>
  intervals.map((interval) => ({ id: keyOf(interval), ...interval }))

/* ------------------------------------------------------------------ *
 * What the cards read off the result
 * ------------------------------------------------------------------ */

/**
 * The glow: `2 × friends > groupSize`.
 *
 * `groupSize` counts the **whole Group, Hidden included**, which is the point —
 * hiding can only ever *suppress* a glow, never manufacture one. Hide three of
 * five and nothing left can reach three.
 *
 * That is deliberately the opposite denominator from the heatmap's ramp
 * (`heatFraction`, which divides by the *visible* set). The two answer different
 * questions: the glow asks "is this a big deal for the Group", where the whole
 * Group is the yardstick, and the wash asks "how much of who I am looking for is
 * free here", where it is not.
 *
 * Known degenerate case, from ticket 09: in a **three-person group the threshold
 * is 2**, which is the minimum Candidate size, so every Candidate glows. It
 * self-corrects when a fourth Friend joins.
 */
export const glows = (candidate: Candidate, groupSize: number): boolean =>
  2 * candidate.friendIds.length > groupSize

/**
 * A true full house — every Friend in the Group, Hidden ones included. The
 * `everyone` pill and nothing else: ticket 09 chose a *word* over more visual
 * intensity, because stacking glow on glow is hard to tune and easy to miss.
 *
 * `>=` rather than `===` so that a Group that shrinks between two renders
 * cannot produce a Candidate holding more Friends than the Group and silently
 * lose its pill.
 */
export const isFullHouse = (candidate: Candidate, groupSize: number): boolean =>
  candidate.friendIds.length >= groupSize

/**
 * The list, cut at the glow threshold: what is worth looking at, and the tail
 * behind *show more*.
 *
 * **Not a cap** — nothing is removed — and the cut line is the *same*
 * `2 × friends > groupSize` the glow already uses, so the list shows exactly the
 * Candidates the product calls worth looking at. In a busy fortnight a group of
 * six generates ~38 Candidates whose tail is two-Friend cards nobody scrolls to;
 * ticket 16 measured that the tedium arrives long before the slowness.
 *
 * The cut is a prefix rather than a filter because step 7 sorts by count first,
 * so every glowing Candidate already precedes every non-glowing one.
 *
 * **One deviation, named.** When *nothing* glows — a group of six whose only
 * overlaps are pairs — a literal cut collapses the entire list, and a pane
 * holding one *show more* button is indistinguishable from the three empty
 * states. So the cut only applies when there is something above the line. The
 * alternative was a sidebar that looks broken in the exact case where the group
 * most needs to see its thin options.
 */
export const splitAtGlow = (
  candidates: readonly Candidate[],
  groupSize: number
): { shown: Candidate[]; tail: Candidate[] } => {
  const above = candidates.filter((candidate) => glows(candidate, groupSize))
  return above.length === 0
    ? { shown: [...candidates], tail: [] }
    : { shown: above, tail: candidates.filter((candidate) => !glows(candidate, groupSize)) }
}

/**
 * The Candidate this one sits inside, or null.
 *
 * Ticket 09 chose deliberately not to absorb sub-Candidates, and ticket 16
 * measured the cost of that: `6 · Tue 20:00–20:30` directly above
 * `5 · Tue 19:00–21:30` is the same evening twice with nothing on screen saying
 * so, and the pair reads as the list repeating itself. The card annotates the
 * relation instead — *"inside 19:00–21:30"*.
 *
 * Step 6 guarantees any container has a Friend set that is *not* a superset of
 * this one's, so a container is always the longer window with fewer people in
 * it. Ranked by Friend count descending then duration ascending: the tightest
 * enclosing offer, which is the one a reader is comparing against.
 */
export const containerOf = (
  candidate: Candidate,
  candidates: readonly Candidate[]
): Candidate | null =>
  candidates
    .filter(
      (other) =>
        other.id !== candidate.id &&
        candidate.start >= other.start &&
        candidate.end <= other.end &&
        (other.start < candidate.start || other.end > candidate.end)
    )
    .sort(
      (a, b) =>
        b.friendIds.length - a.friendIds.length ||
        a.end - a.start - (b.end - b.start) ||
        a.id.localeCompare(b.id)
    )[0] ?? null

/* ------------------------------------------------------------------ *
 * The empty states
 * ------------------------------------------------------------------ */

/**
 * Which of ticket 09's three empty states the sidebar is in, or null when it
 * has something to show.
 *
 * Evaluated in ticket 09's order, and the order is the whole design: each one
 * names the *reason* there is nothing, and the reasons are nested. "No overlaps
 * yet" shown to somebody who has hidden four Friends would be true and useless.
 */
export type EmptyReason = 'too-few-friends' | 'no-availability' | 'no-overlap'

export const emptyReason = (visibleCount: number, scan: CandidateScan): EmptyReason | null => {
  if (visibleCount < MINIMUM_FRIENDS) return 'too-few-friends'
  if (!scan.anyAvailability) return 'no-availability'
  return scan.candidates.length === 0 ? 'no-overlap' : null
}
