/**
 * The month lattice, and the two measurements the month cell is drawn from.
 *
 * **Month is not a shrunken week** (ticket 14). The week's composite was
 * prototyped at month-cell size and reads as a corrupted thumbnail, so the month
 * has its own visual language — but it is drawn from *the same data reduced a
 * different way*, and that is what this module holds. `month-grid.tsx` owns
 * pixels; this owns the arithmetic under them.
 *
 * ## The wash is the week's measurement, reduced over the day
 *
 * Ticket 15 settled the week grid as **one hue — the viewer's — with opacity
 * proportional to how many visible Friends are free in that Slot**. Ticket 14's
 * `## Decisions` settled the month as **opacity ∝ peak concurrency**. Those are
 * not two channels with two meanings: they are one measurement under two
 * reductions, and the one sentence that covers both grids is
 *
 * > opacity is how many of the Friends you are trying to meet are free **at
 * > once** — the week says it half hour by half hour, the month says it for the
 * > day's best half hour.
 *
 * So `peakOf` runs over the very same `segmentsOf` sweep the week's wash is
 * built from, and the ramp is the very same `heatFraction` / `heatOpacity`.
 * There is no second ramp to tune and no second denominator to keep in step.
 *
 * ## And the wash is raw Availability, not the Candidate pipeline's
 *
 * Ticket 14's `### Carried forward` says a Hangout day would read as **peak 0 —
 * the emptiest cell of the month**, because ticket 09 blanks a Hangout's Slots.
 * That is not what happens, and it is worth being exact about why: **blanking is
 * step 3 of the *Candidate* pipeline** (`scanCandidates` in `candidates.ts`) and
 * nothing else in the app is drawn from its output. The week's wash is raw
 * `isFree` over the Availability store — `segmentsOf` blanks nothing, and
 * `HangoutBlock` merely paints over it. The month's is the same store.
 *
 * So a Hangout day is the **darkest** cell of the month, not the emptiest: the
 * Availability that produced the plan is still there, and a Hangout does not
 * make people busy, it makes them booked.
 *
 * **The chip stays mandatory, for the opposite reason.** Under blanking it would
 * have stopped the cell reading as empty; under raw Availability it stops the
 * cell *overselling* — the darkest day of the month is the one you are most
 * likely to aim at, and without the chip nothing says its best window is already
 * spoken for. Either way the wash alone lies, and either way the chip is what
 * stops it.
 *
 * **No `@/` imports, deliberately** — the same split `slots.ts`, `segments.ts`,
 * `hangout.ts` and `when.ts` already make, so `month.test.ts` can reach this
 * under plain Node (`yarn test`). The relative imports carry their extensions
 * because Node's own resolver needs them.
 */
import type { Segment } from './segments.ts'
import { slotsOfDay } from './slots.ts'
import { chunk } from 'lodash-es'
import { eachDayOfInterval, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from 'date-fns'

/** The seven cells of one row of the month grid. */
export type MonthWeek = Date[]

/**
 * Every day the month grid draws: the anchor's month, padded out to whole weeks.
 *
 * Five rows or six, depending on where the 1st falls and how long the month is —
 * counted from the two edges rather than assumed, exactly as `slotsOfDay` counts
 * a day's rows rather than asserting 48.
 *
 * `weekStartsOn` is a parameter rather than a constant here for the reason the
 * time zone is one in `slots.ts`: it is what the tests vary, and its one home is
 * `WEEK_STARTS_ON` in `use-calendar-view.ts`.
 */
export const monthLattice = (anchor: Date, weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6): Date[] =>
  eachDayOfInterval({
    start: startOfWeek(startOfMonth(anchor), { weekStartsOn }),
    end: endOfWeek(endOfMonth(anchor), { weekStartsOn }),
  })

/**
 * The lattice as rows of seven.
 *
 * A row rather than a flat grid because **two things are drawn per row and not
 * per cell**: the merged rectangle marking a stretch of your own Availability,
 * and the panel's anchor. Both are absolutely positioned inside the row they sit
 * in, so the row is the box their percentages are of.
 */
export const monthWeeks = (days: readonly Date[]): MonthWeek[] => chunk([...days], DAYS_IN_WEEK)

export const DAYS_IN_WEEK = 7

/**
 * **The day's own Slots**, which is what "drawing in month view means 00:00–24:00"
 * actually means (ticket 01, ticket 11).
 *
 * Never 48. A day is 46, 48 or 50 Slots and only the time zone knows which
 * (`slotsOfDay`): a hardcoded 48 writes an hour that does not exist on the
 * spring Sunday and misses one on the autumn Sunday — and the first of those is
 * not merely wrong on screen, it is an off-grid bound that
 * `hangout_on_the_slot_grid` answers with `23514`.
 *
 * A whole-day stroke is therefore the largest single write in the product: 50
 * rows in one statement on the worst day of the year.
 */
export const wholeDay = (day: Date, timeZone: string): Date[] =>
  slotsOfDay(day, timeZone).map((slot) => slot.start)

/**
 * **Peak concurrency** — the most Friends free at any one moment of the day.
 *
 * The number the wash carries, and the reason the cell needs no numeral.
 * Ticket 14's decisive finding was that two days with *identical avatar rows*
 * can hold peak 1 and peak 9 — nine people free and not one pair overlapping,
 * against nine people free together — and a month built from identity alone
 * advertises the emptiest day exactly as loudly as the best one. The avatars say
 * who; this says whether it is worth anything.
 *
 * Read off the segments rather than off the Slots because `segmentsOf` has
 * already cut a boundary wherever the *set* changes, so the maximum over
 * segments is the maximum over Slots by construction — and the same sweep feeds
 * the day panel's windows, so the cell and the panel cannot disagree.
 *
 * **0 when nobody is free**, which is the absence of a wash rather than the foot
 * of the ramp: `segmentsOf` emits no segment for a span nobody is free in, so a
 * quiet day has no segments at all and there is nothing to paint.
 */
export const peakOf = (segments: readonly Segment[]): number =>
  segments.reduce((peak, segment) => Math.max(peak, segment.friendIds.length), 0)

/**
 * The days a drag covers: every index between its anchor and the pointer,
 * inclusive, in either direction.
 *
 * **Linear in date order, across the row boundary.** A drag from Saturday to the
 * following Monday covers the Sunday between them, because the month's unit is a
 * day and the rows are a wrapping of one continuous sequence — the same reading
 * that makes the week grid's Linear mode "true linear time with no column lock"
 * (ticket 01's corrections). A rectangle would be a second geometry with no
 * gesture asking for it.
 *
 * Clamped, so a pointer that has left the grid resolves to its nearest edge
 * rather than to an index that is not a day.
 */
export const daysBetween = (count: number, anchor: number, pointer: number): number[] => {
  const low = Math.max(0, Math.min(anchor, pointer))
  const high = Math.min(count - 1, Math.max(anchor, pointer))
  return high < low ? [] : Array.from({ length: high - low + 1 }, (_, step) => low + step)
}
