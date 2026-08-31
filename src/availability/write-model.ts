/**
 * What happens between a gesture ending and its rows landing — ticket 19.
 *
 * Two things live here, and they are the two the grid cannot answer for itself:
 * **how many times a failed write is retried**, and **what the toast calls the
 * thing it could not save**. Both are policy rather than geometry, which is why
 * they are not in `gesture.ts`; `use-availability.ts` is the only caller and
 * holds neither the timing nor the copy.
 *
 * **No `@/` imports, deliberately** — the same split `slots.ts`, `gesture.ts`,
 * `identity.ts` and `roster.ts` already make, so `yarn test` can reach this
 * under plain Node. `./slots.ts` carries its extension because Node's own
 * resolver needs it.
 */
import { SLOT_MS, closingLabel, runsOf } from './slots.ts'
import { TZDate } from '@date-fns/tz'
import { times } from 'lodash-es'
import { format } from 'date-fns'

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
 * Contiguous instants, grouped — which is all a "range" ever is (CONTEXT.md:
 * say **run**, not range).
 *
 * `runsOf` does the folding, over a slot index taken from the earliest instant:
 * one implementation of "adjacent things belong together", shared with the grid
 * that draws them. Sorted first, because a multi-day gesture arrives column by
 * column and a linear one arrives in whatever order the pointer moved.
 */
const runsOfInstants = (slots: readonly Date[]): Date[][] => {
  const held = [...new Set(slots.map((slot) => slot.getTime()))].sort((a, b) => a - b)
  const earliest = held[0]
  const latest = held[held.length - 1]
  if (earliest === undefined) return []

  const present = new Set(held)
  const at = (index: number) => earliest + index * SLOT_MS

  return runsOf((latest - earliest) / SLOT_MS + 1, (index) => present.has(at(index))).map((run) =>
    times(run.length, (step) => new Date(at(run.start + step)))
  )
}

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

/** The wall clock a run ends at, through the one place that knows about `24:00`. */
const endLabel = (run: Date[], timeZone: string): string =>
  closingLabel(wallClock(new Date(run[run.length - 1].getTime() + SLOT_MS), timeZone))

const wallClock = (instant: Date, timeZone: string): string =>
  format(new TZDate(instant.getTime(), timeZone), 'HH:mm')

const dayName = (instant: Date, timeZone: string): string =>
  format(new TZDate(instant.getTime(), timeZone), 'EEE')

/** The civil date, as a day count — so "the next day" is `+ 1`. */
const civilDay = (instant: Date, timeZone: string): number => {
  const local = new TZDate(instant.getTime(), timeZone)
  return Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()) / DAY_MS
}

/* ------------------------------------------------------------------ *
 * Two automatic retries, then give up
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
