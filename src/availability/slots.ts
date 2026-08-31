/**
 * The slot row model: what a day is made of, how a slot is named, and how a
 * run of them is reassembled.
 *
 * **Availability is slot rows, not ranges** (ticket 07). One row per
 * `(friend, slot_start)`, thirty minutes each; a continuous Availability is a
 * run of adjacent slots put back together *at render time and only there*.
 * Merging does not exist in the data — which is what makes overlap a `group
 * by`, concurrent writes safe, and the ADR-0002 RPC structurally insert-only.
 * `CONTEXT.md` calls that run a **run**, and is explicit that it is not a range.
 *
 * **No `@/` imports, deliberately.** These are the claims worth a test, and
 * `slots.test.ts` runs under plain Node (`yarn test`), which cannot resolve the
 * alias — the same split `roster.ts` and `identity.ts` already make. Bare
 * package specifiers are fine; Node resolves those.
 *
 * ## Why the row count is not 48
 *
 * A day is 46, 48 or 50 slots, and only the time zone knows which. In
 * Europe/Rome the clocks go forward on 2027-03-28, so 02:00 never happens and
 * the day is 23 hours; they go back on 2026-10-25, so 02:00 happens twice and
 * the day is 25. A fixed 48-row grid shows an hour that does not exist in March
 * and hides one in October (ticket 07 §5). The stored data is correct either
 * way — only the drawing would be wrong.
 *
 * The time zone is a parameter rather than a constant here, because it is what
 * the tests vary. Its one home is `GROUP_TIME_ZONE` in `use-calendar-view.ts`.
 */
import { TZDate, tzOffset } from '@date-fns/tz'
import { groupBy, times } from 'lodash-es'

const SLOT_MINUTES = 30
export const SLOT_MS = SLOT_MINUTES * 60_000

/** One row of the grid: half an hour, in the group's time zone. */
export type Slot = {
  /** The instant it begins — a true point in time, which is what Postgres stores. */
  start: Date
  /** Its wall clock in the group time zone, `HH:mm`. */
  label: string
  /** True when it opens a wall-clock hour. The gutter labels these and no others. */
  opensHour: boolean
  /**
   * The UTC offset, as `+2` / `+1`, on the slots whose wall clock happens twice
   * that day — and null on every other slot, which is nearly all of them.
   *
   * This is the only thing that tells the two 02:00 rows of an autumn Sunday
   * apart. Without it the gutter reads `02:00, 02:30, 02:00, 02:30` and looks
   * like a rendering fault.
   */
  offset: string | null
  /**
   * True when the clocks moved immediately before this slot — the one row in a
   * DST day where the wall clock and the real elapsed time part company.
   *
   * It marks *both* transitions, which `offset` alone cannot: in October it
   * lands on the second 02:00, and in March on the 03:00 that follows the hour
   * that never happened. The skipped hour leaves no rows behind, so without
   * this the spring day would be two rows shorter with nothing to say why.
   */
  shiftsClock: boolean
}

/**
 * Midnight, in the group's time zone, on the calendar date this `Date` names.
 *
 * It reads the **civil date** — `getFullYear`/`getMonth`/`getDate`, the
 * viewer's own calendar — and not the instant. That is the right contract for
 * everything upstream: `useCalendarView` hands out system-local midnights that
 * *mean* "Sunday the 25th", and a viewer east of Rome would otherwise see the
 * 24th, because their midnight is still yesterday afternoon in Rome.
 */
export const startOfDayInZone = (day: Date, timeZone: string): Date =>
  civilMidnight(day.getFullYear(), day.getMonth(), day.getDate(), timeZone)

/**
 * `TZDate` mirrors the `Date` constructor, month-and-day overflow included, so
 * `date + 1` on the 31st rolls into the next month without any arithmetic here.
 * The plain `Date` on the way out is deliberate: a `TZDate` reports zone-local
 * wall clock from `getHours()`, which is useful exactly where it is asked for
 * and a trap everywhere else.
 */
const civilMidnight = (year: number, month: number, date: number, timeZone: string): Date =>
  new Date(new TZDate(year, month, date, timeZone).getTime())

/**
 * Every slot of one calendar day, in order.
 *
 * The count falls out of the two midnights rather than being asserted: whatever
 * the zone says the day is worth, divided by thirty minutes.
 */
export const slotsOfDay = (day: Date, timeZone: string): Slot[] => {
  const start = startOfDayInZone(day, timeZone).getTime()
  const end = civilMidnight(
    day.getFullYear(),
    day.getMonth(),
    day.getDate() + 1,
    timeZone
  ).getTime()

  const rows = times(Math.round((end - start) / SLOT_MS), (index) => {
    const instant = new Date(start + index * SLOT_MS)
    return {
      start: instant,
      label: wallClock(instant, timeZone),
      offsetMinutes: tzOffset(timeZone, instant),
    }
  })

  // Which wall clocks repeat is a fact about *this day*, not about the zone, so
  // it is counted rather than predicted — an autumn Sunday has two, every other
  // day has none, and a zone with a half-hour shift would have its own answer.
  const byLabel = groupBy(rows, (row) => row.label)

  return rows.map(({ offsetMinutes, ...row }, index) => ({
    ...row,
    opensHour: row.label.endsWith(':00'),
    offset: byLabel[row.label].length > 1 ? formatOffset(offsetMinutes) : null,
    // `index > 0` rather than a comparison against the day before: midnight has
    // no previous slot here, and a day that *begins* at a transition is not a
    // discontinuity anyone reading this column can see.
    shiftsClock: index > 0 && rows[index - 1].offsetMinutes !== offsetMinutes,
  }))
}

const pad = (value: number): string => String(value).padStart(2, '0')

const wallClock = (instant: Date, timeZone: string): string => {
  const local = new TZDate(instant.getTime(), timeZone)
  return `${pad(local.getHours())}:${pad(local.getMinutes())}`
}

/** `+2`, `+1`, `-5`, and `+5:30` where a zone is not on the hour. */
const formatOffset = (minutes: number): string => {
  const sign = minutes < 0 ? '-' : '+'
  const hours = Math.floor(Math.abs(minutes) / 60)
  const rest = Math.abs(minutes) % 60
  return rest === 0 ? `${sign}${hours}` : `${sign}${hours}:${pad(rest)}`
}

/**
 * A slot's identity in the store: the Friend it belongs to and the instant it
 * begins — the table's own key (ticket 07), which is what makes an optimistic
 * row and its Realtime echo the same row rather than two (ticket 19).
 *
 * Keyed on the **instant**, never on the text. PostgREST returns
 * `2026-10-25T00:00:00+00:00` and `Date#toISOString` writes
 * `2026-10-25T00:00:00.000Z`; those are the same moment and would be two
 * different keys.
 */
export const slotKey = (friendId: string, slotStart: Date | string | number): string =>
  `${friendId}|${new Date(slotStart).getTime()}`

/** One `availability` row, as narrow as this module needs it. */
export type SlotRow = { friend_id: string; slot_start: string }

/**
 * Rows folded into the store — **added, never replacing**.
 *
 * The store is filled by more than one query: everything from today forward at
 * boot, then a strip of the past each time the viewer navigates back into one
 * (ticket 07 §10). A replace would blank whatever is already on screen every
 * time, so the only fold that works is a union.
 *
 * It is also what makes a repeated fetch free. Two effects racing, a
 * StrictMode double-mount, a retry, or the Realtime echo of your own insert
 * (ticket 19) all land on the same key and change nothing — which is the
 * property `(friend_id, slot_start)` was chosen for.
 *
 * The cost, named: a union cannot express a *deletion* that happened elsewhere.
 * So it does not try — the Realtime subscription in `use-availability.ts` routes
 * a DELETE event through the store's removal path instead of through this fold.
 * A fold that could also subtract would have to be told which rows are *absent*
 * from a result it was never given, which is not a thing a merge can know.
 */
export const mergeSlots = (
  current: ReadonlySet<string>,
  rows: readonly SlotRow[]
): ReadonlySet<string> => {
  const next = new Set(current)
  rows.forEach((row) => next.add(slotKey(row.friend_id, row.slot_start)))
  return next
}

/**
 * The wall clock the end of a day reads as.
 *
 * `23:30–00:00` reads as a range that runs backwards, so the closing edge of a
 * day is spelled `24:00` — in the grid's aria-labels, on a draft's time tag, and
 * in the toast that names a range it could not save. One rule, one spelling,
 * one place: three call sites had it written out before.
 */
export const DAY_END_LABEL = '24:00'

/** A wall clock, with midnight read as the *end* of a day rather than its start. */
export const closingLabel = (label: string | undefined): string =>
  label === undefined || label === '00:00' ? DAY_END_LABEL : label

/** A block on the grid: where in the day's slots it starts, and how many it covers. */
export type Run = { start: number; length: number }

/**
 * Adjacent held slots, put back together.
 *
 * This is where merging lives now — at render time, over indices, with no
 * database involvement at all. Ticket 07 traded the stored range for this, and
 * this is the whole of what it cost.
 */
export const runsOf = (length: number, isHeld: (index: number) => boolean): Run[] =>
  times(length).reduce<Run[]>((runs, index) => {
    if (!isHeld(index)) return runs
    const last = runs[runs.length - 1]
    return last !== undefined && last.start + last.length === index
      ? [...runs.slice(0, -1), { start: last.start, length: last.length + 1 }]
      : [...runs, { start: index, length: 1 }]
  }, [])
