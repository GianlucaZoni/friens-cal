/**
 * The drag, as arithmetic: where a gesture began, where the pointer is, and
 * which Slots that covers.
 *
 * Everything here is pure and everything here is tested (`gesture.test.ts`),
 * because two of these rules are **measurements** rather than choices and a
 * component is a bad place to keep a measurement.
 *
 * **No `@/` imports, deliberately** — the same split `slots.ts`, `identity.ts`
 * and `roster.ts` already make, so `yarn test` can reach this under plain Node.
 * `./slots.ts` carries its extension for the same reason: Node's own resolver
 * needs it, and `allowImportingTsExtensions` means tsc and Vite do not mind.
 *
 * ## The four rules, and where they come from
 *
 * 1. **4px separates a click from a drag** (ticket 10). A bare click opens the
 *    slot popover and writes nothing; only a drag writes. That reversal of
 *    ticket 06's click-to-create is what makes ticket 01's *no undo, no reset*
 *    tolerable — no stray click can put Availability on the grid.
 * 2. **Hysteresis is anchor-relative, at 45px.** Ticket 01 prescribed a budget
 *    measured from the column *boundary*; ticket 10 measured that dead — the
 *    same 30px drift is rejected from a mid-column anchor and accepted from one
 *    94% across, because by then the boundary is 6px away. Measuring from the
 *    anchor gives every drag the same budget wherever it started.
 * 3. **Linear time walks the concatenated columns.** A day is 46, 48 or 50
 *    Slots (`slotsOfDay`), so a global row index is wrong twice a year: it would
 *    address rows 46 and 47 of a 23-hour day, which do not exist. Absolute
 *    indices are prefix sums over the columns' own lengths.
 * 4. **Multi-day is a WALL CLOCK rectangle.** "The same hours on every day
 *    crossed" (ticket 01) is a statement about clocks, not about row offsets,
 *    and on a DST week those part company. Selecting by label means the 25-hour
 *    Sunday gets 20:00–23:00 like everybody else — and gets *both* of its
 *    02:00s when the window covers them, which is correct: they are two real
 *    hours.
 *
 * There is **no column lock**. Ticket 01's corrections chose linear time over
 * ticket 06's recommendation, and rule 2 is the whole of the mitigation.
 */
import { SLOT_MS } from './slots.ts'
import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'

/** Which geometry a drag uses. The "Drawing mode:" tabbar picks it. */
export type DrawingMode = 'linear' | 'multi-day'

/**
 * A Slot on the grid: which day column, and which row of **that column's own**
 * slots array.
 *
 * The row is deliberately not a global index. Column 6 of an autumn week has 50
 * rows and its neighbours have 48; a number that did not say which column it
 * belonged to would be meaningless on those two weeks a year.
 */
export type SlotAddress = { column: number; row: number }

/** How many Slots each day column holds, left to right. */
export type ColumnLengths = readonly number[]

/** A point in client coordinates. */
export type Point = { x: number; y: number }

/**
 * The drag/click discriminator (ticket 10). Below it the gesture is a click and
 * opens the popover; at or above it, it draws.
 *
 * The prototype measured 3px of jitter still committing as a click, which is
 * the behaviour worth keeping — a hand resting on a mouse button moves.
 */
export const DRAG_THRESHOLD_PX = 4

/**
 * The lateral budget before a drag follows the pointer into another day, in
 * pixels **from the anchor**.
 *
 * Ticket 10 measured 40–50px as the band that rejects a thumb's drift while
 * still allowing a deliberate crossing at 110px columns. Desktop columns are
 * wider than that, so the budget is comfortable here; it is the phone that
 * cannot be rescued by any setting, and that is issue 13's problem.
 */
export const HYSTERESIS_PX = 45

/** Straight-line travel, so 3px on each axis is the drag that it is. */
export const isDrag = (from: Point, to: Point): boolean =>
  Math.hypot(to.x - from.x, to.y - from.y) >= DRAG_THRESHOLD_PX

/**
 * Which day column the drag is in — the anchor's, until the pointer has
 * travelled `budget` pixels sideways **from where the drag began**.
 *
 * Anchor-relative, never boundary-relative: see rule 2 above. The pointer's own
 * column is taken whole once the budget is spent rather than stepped towards,
 * because a fast drag can skip columns between two pointer events and a drag
 * that lagged behind the cursor would be its own bug.
 *
 * `lateralDrift` is signed and its sign is ignored — leftward drift is drift.
 */
export const columnUnderPointer = (
  anchorColumn: number,
  pointerColumn: number,
  lateralDrift: number,
  budget: number = HYSTERESIS_PX
): number => (Math.abs(lateralDrift) < budget ? anchorColumn : pointerColumn)

/* ------------------------------------------------------------------ *
 * Linear time
 * ------------------------------------------------------------------ */

/**
 * Where each column begins, counted in Slots from the start of the week.
 *
 * Prefix sums over the columns' **own** lengths, which is the one thing that
 * makes a drag through midnight land on the right rows on a DST week.
 */
const columnOffsets = (lengths: ColumnLengths): number[] =>
  lengths.reduce<number[]>(
    (offsets, length) => [...offsets, offsets[offsets.length - 1] + length],
    [0]
  )

/** How many Slots the whole week holds. */
const weekLength = (lengths: ColumnLengths): number =>
  lengths.reduce((total, length) => total + length, 0)

/** A `(column, row)` address as one index through the whole week. */
export const toAbsolute = (lengths: ColumnLengths, { column, row }: SlotAddress): number =>
  columnOffsets(lengths)[column] + row

/**
 * And back again, **clamped** to the week.
 *
 * Clamping rather than refusing: the pointer is allowed to be anywhere on
 * screen, including off the end of Sunday, and a drag that leaves the grid
 * should stop at its edge rather than throw.
 */
export const fromAbsolute = (lengths: ColumnLengths, absolute: number): SlotAddress => {
  const offsets = columnOffsets(lengths)
  const clamped = Math.min(Math.max(absolute, 0), weekLength(lengths) - 1)
  // The last column whose offset is at or below the index — which is the column
  // that holds it, because the offsets ascend.
  const column = lengths.reduce(
    (found, _length, index) => (offsets[index] <= clamped ? index : found),
    0
  )
  return { column, row: clamped - offsets[column] }
}

/**
 * Every Slot between the anchor and the pointer, as one continuous run through
 * the week.
 *
 * Both ends are included, so a drag that never leaves its first Slot still
 * paints that Slot — the alternative is a gesture that does nothing until it
 * has travelled half an hour.
 *
 * This is what makes Tuesday 23:00 → Wednesday 01:00 a single unbroken
 * Availability (ticket 01's corrections), and it removes ticket 06's
 * over-drag-past-the-bottom, which that prototype judged undiscoverable.
 */
export const linearSelection = (
  lengths: ColumnLengths,
  anchor: SlotAddress,
  pointer: SlotAddress
): SlotAddress[] => {
  const from = toAbsolute(lengths, anchor)
  const to = toAbsolute(lengths, pointer)
  const start = Math.min(from, to)

  return Array.from({ length: Math.abs(to - from) + 1 }, (_, index) =>
    fromAbsolute(lengths, start + index)
  )
}

/* ------------------------------------------------------------------ *
 * Multi-day: the rectangle
 * ------------------------------------------------------------------ */

/**
 * The same **hours** on every day crossed — selected by wall clock, not by row.
 *
 * `labels` is each column's own `Slot.label` list, which is where the DST
 * correctness comes from: two days that disagree about what time row 40 is
 * still agree about what `20:00` is.
 *
 * `HH:mm` compares lexicographically the way it reads, so the window is a plain
 * string range. Three consequences, all wanted:
 *
 * - the 25-hour Sunday contributes **both** its 02:00s to a window that covers
 *   02:00, because both hours happened;
 * - the 23-hour Sunday contributes **neither**, because that hour did not; and
 * - a rectangle never crosses midnight. That is Linear's geometry, and the two
 *   cannot coexist in one drag (ticket 06's prototype measured exactly this).
 */
export const multiDaySelection = (
  labels: readonly (readonly string[])[],
  anchor: SlotAddress,
  pointer: SlotAddress
): SlotAddress[] => {
  const ends = [labels[anchor.column][anchor.row], labels[pointer.column][pointer.row]]
  const [from, to] = [...ends].sort()

  const first = Math.min(anchor.column, pointer.column)
  const last = Math.max(anchor.column, pointer.column)

  return Array.from({ length: last - first + 1 }, (_, index) => first + index).flatMap((column) =>
    labels[column]
      .map((label, row) => ({ label, row }))
      .filter(({ label }) => label >= from && label <= to)
      .map(({ row }) => ({ column, row }))
  )
}

/** The geometry the mode chose, and the only place the two are switched. */
export const selectionFor = (
  mode: DrawingMode,
  labels: readonly (readonly string[])[],
  anchor: SlotAddress,
  pointer: SlotAddress
): SlotAddress[] =>
  mode === 'linear'
    ? linearSelection(
        labels.map((column) => column.length),
        anchor,
        pointer
      )
    : multiDaySelection(labels, anchor, pointer)

/* ------------------------------------------------------------------ *
 * ⌥+drag duplicate
 * ------------------------------------------------------------------ */

/**
 * A run of Slots translated along linear time by `delta` Slots.
 *
 * `delta` is the pointer's absolute index minus the anchor's, which is what
 * preserves the grab offset — the block stays put under the cursor rather than
 * jumping its own top edge to it (ticket 06's prototype, and the distinction
 * that made ⌥+drag read as a *copy* rather than a move).
 *
 * Anything that lands outside the week is **dropped, not clamped**. Clamping
 * would stack the overhanging Slots on the last row of Sunday and quietly
 * change the copy's shape.
 */
export const shiftSelection = (
  lengths: ColumnLengths,
  addresses: readonly SlotAddress[],
  delta: number
): SlotAddress[] => {
  const total = weekLength(lengths)
  return addresses
    .map((address) => toAbsolute(lengths, address) + delta)
    .filter((absolute) => absolute >= 0 && absolute < total)
    .map((absolute) => fromAbsolute(lengths, absolute))
}

/* ------------------------------------------------------------------ *
 * Naming a range, for the toast
 * ------------------------------------------------------------------ */

/**
 * What the toast calls a gesture that could not be saved.
 *
 * Load-bearing copy, not decoration: ticket 19 requires the toast to **name the
 * range** because once the optimistic paint is reverted there is no trace of it
 * on screen, and ticket 01 left no undo stack to look it up in. "Couldn't save"
 * on its own tells a Friend that something they can no longer see is missing.
 *
 * Three shapes, in the order they are reached:
 *
 *   one run                    `Thu 20:00–23:00`      (`Thu 23:00 – Fri 01:00`)
 *   a rectangle of equal days  `Mon–Wed 20:00–22:00`
 *   anything else              `2 blocks from Mon 20:00`
 */
export const describeSlots = (slots: readonly Date[], timeZone: string): string => {
  const runs = runsOfInstants(slots)
  if (runs.length === 0) return 'nothing'
  if (runs.length === 1) return nameRun(runs[0], timeZone)

  const windows = runs.map((run) => ({
    from: wallClock(run[0], timeZone),
    to: endLabel(run, timeZone),
    day: civilDay(run[0], timeZone),
  }))

  const sameHours = windows.every(
    (window) => window.from === windows[0].from && window.to === windows[0].to
  )
  const consecutive = windows.every(
    (window, index) => index === 0 || window.day === windows[index - 1].day + 1
  )

  const first = windows[0]
  // Named off the run's own first instant, never off the day number — that is a
  // UTC midnight, and in a zone behind UTC it would name the evening before.
  const firstDay = dayName(runs[0][0], timeZone)
  const lastDay = dayName(runs[runs.length - 1][0], timeZone)

  return sameHours && consecutive
    ? `${firstDay}–${lastDay} ${first.from}–${first.to}`
    : `${runs.length} blocks from ${firstDay} ${first.from}`
}

const DAY_MS = 86_400_000

/**
 * Contiguous instants, grouped — the same reassembly `runsOf` does over grid
 * indices, but over the gesture's own Slots, which is all a "range" ever is
 * (CONTEXT.md: say **run**, not range).
 *
 * Sorted first, because a multi-day gesture arrives column by column and a
 * linear one arrives in whatever order the pointer moved.
 */
const runsOfInstants = (slots: readonly Date[]): Date[][] =>
  [...new Set(slots.map((slot) => slot.getTime()))]
    .sort((a, b) => a - b)
    .reduce<Date[][]>((runs, time) => {
      const current = runs[runs.length - 1]
      const previous = current?.[current.length - 1]
      return previous !== undefined && previous.getTime() + SLOT_MS === time
        ? [...runs.slice(0, -1), [...current, new Date(time)]]
        : [...runs, [new Date(time)]]
    }, [])

const nameRun = (run: Date[], timeZone: string): string => {
  const from = wallClock(run[0], timeZone)
  const to = endLabel(run, timeZone)
  const endsOnAnotherDay = civilDay(lastInstant(run), timeZone) !== civilDay(run[0], timeZone)

  return endsOnAnotherDay
    ? `${dayName(run[0], timeZone)} ${from} – ${dayName(lastInstant(run), timeZone)} ${to}`
    : `${dayName(run[0], timeZone)} ${from}–${to}`
}

/**
 * The instant a run ends, minus a millisecond — the last moment it *covers*.
 *
 * A run ending at midnight ends on the day it was drawn on, not on the next
 * one, and comparing the bare end instant would say otherwise.
 */
const lastInstant = (run: Date[]): Date => new Date(run[run.length - 1].getTime() + SLOT_MS - 1)

/**
 * The wall clock a run ends at, `24:00` where that is midnight.
 *
 * `Thu 23:30–00:00` reads as a range that runs backwards. The grid's own
 * aria-labels already say `24:00` for the same reason.
 */
const endLabel = (run: Date[], timeZone: string): string => {
  const end = wallClock(new Date(run[run.length - 1].getTime() + SLOT_MS), timeZone)
  return end === '00:00' ? '24:00' : end
}

const wallClock = (instant: Date, timeZone: string): string =>
  format(new TZDate(instant.getTime(), timeZone), 'HH:mm')

const dayName = (instant: Date | number, timeZone: string): string =>
  format(new TZDate(new Date(instant).getTime(), timeZone), 'EEE')

/** The civil date, as a day count — so "the next day" is `+ 1`. */
const civilDay = (instant: Date, timeZone: string): number => {
  const local = new TZDate(instant.getTime(), timeZone)
  return Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()) / DAY_MS
}

/* ------------------------------------------------------------------ *
 * Two automatic retries, then give up (ticket 19)
 * ------------------------------------------------------------------ */

/** A failed round trip, as narrow as this module needs it. */
export type WriteFailure = { message: string }

/**
 * The backoff, and therefore the retry count: **two** retries after the first
 * attempt, which is what ticket 19 settled.
 *
 * Retrying forever was rejected there — it "leaves the screen permanently
 * lying" — and so was reverting silently. Both retries are free of consequence
 * because the write is `on conflict do nothing` on the natural key: a retry
 * that duplicates a landed row is a no-op, and so is an erase of a row already
 * gone.
 */
export const RETRY_DELAYS = [400, 1600] as const

/**
 * How long a write may be outstanding before the app says anything.
 *
 * Ticket 19: paint optimistically with **no** pending treatment, and only after
 * ~400ms show something — in a channel the grid does not own, because ticket 15
 * spent opacity on *how many Friends are free* and a faded block would read as
 * "fewer people".
 */
export const SLOW_WRITE_MS = 400

/**
 * Run `attempt` until it stops failing, or until the delays run out.
 *
 * Returns the last failure, or `null` on success — the shape PostgREST already
 * answers in, so the caller does not have to translate anything. `sleep` is a
 * parameter so the test does not have to wait two seconds to prove the count.
 */
export const withRetries = async (
  attempt: (index: number) => PromiseLike<WriteFailure | null>,
  {
    delays = RETRY_DELAYS,
    sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  }: {
    delays?: readonly number[]
    sleep?: (ms: number) => Promise<void>
  } = {}
): Promise<WriteFailure | null> => {
  /*
   * A `while` rather than a fold: the attempt count is not known in advance —
   * it stops at the first success — and the repo's style rule forbids `for`,
   * `for...of` and `for...in`, which this is none of.
   */
  let index = 0
  let failure = await attempt(0)

  while (failure !== null && index < delays.length) {
    await sleep(delays[index])
    index += 1
    failure = await attempt(index)
  }

  return failure
}
