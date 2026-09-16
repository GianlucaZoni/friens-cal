/**
 * How a Candidate card says *when*.
 *
 * Two strings, because the card is a two-line box with the date on the first
 * line and the time range on the second (ticket 16's final answer: date
 * top-left, `everyone` pill top-right, time range bottom-left, blobatars
 * bottom-right).
 *
 * Its own module rather than a corner of the component, for the reason
 * `write-model.ts` keeps `describeSlots` out of the grid: **the list has no day
 * headers**, so every card states its own date and this copy is the only thing
 * that says which evening an offer is on. It is also where the two spellings
 * that are easy to get wrong live — a range ending at midnight, and a range
 * that crosses one — and both are worth a test.
 *
 * ## Where the `GMT+2` goes, and why only here
 *
 * This is the one function feeding the Candidate card, Hangout card, Hangout
 * detail, drop dialog, retime dialog and day panel, so putting the frame on
 * `range` is what makes **every string a person copies as text carry its own
 * frame**. A screenshot pasted into the group chat otherwise says `Sat 20:00`
 * with no way for the reader to tell whose evening that is.
 *
 * The suppression is already decided by the time it arrives: `zone.frame` is
 * null unless at least one other Member reads a different clock, so every cal
 * in existence today renders exactly what v1 rendered. `describeSlots` is
 * deliberately left out — the "2 blocks from Mon 20:00" toast is gone in four
 * seconds and nobody screenshots it.
 *
 * **No `@/` imports, deliberately** — `when.test.ts` runs under plain Node.
 * `./…` and `../…` carry their extensions because Node's own resolver needs
 * them.
 */
import { closingLabel } from '../availability/slots.ts'
import type { ViewerZone } from '../shell/zone.ts'
import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'

/** What one card writes on its two lines. */
export type When = {
  /** `Sat 6 Sep` — the date, which no header is going to say for it. */
  date: string
  /**
   * `20:00 – 23:30`, or `22:00 – 01:00 Sun` when it crosses midnight, or
   * `22:00 – 24:00` when it ends at one — and `20:00 – 23:30 GMT+2` in a cal
   * that spans zones.
   */
  range: string
}

/**
 * A half-open interval, in epoch milliseconds, as the card reads it.
 *
 * The **end** is where both interesting spellings come from. A Candidate that
 * runs to midnight ends at 00:00 of the next day, which as a range reads
 * backwards (`23:30 – 00:00`) and as a date is the wrong day; both are answered
 * by asking about the last moment the interval *covers* rather than the instant
 * it ends at. `closingLabel` in `slots.ts` owns the `24:00` spelling and three
 * other call sites already use it.
 */
export const whenOf = (start: number, end: number, zone: ViewerZone): When => {
  const { timeZone, frame } = zone
  return {
    date: format(zoned(start, timeZone), 'EEE d LLL'),
    range: `${wallClock(start, timeZone)} – ${endLabel(end, timeZone)}${
      crossesMidnight(start, end, timeZone) ? ` ${format(zoned(end, timeZone), 'EEE')}` : ''
    }${frame === null ? '' : ` ${frame}`}`,
  }
}

/**
 * How a card names the Candidate it sits inside — ticket 16's annotation, so
 * that `6 · Tue 20:00–20:30` above `5 · Tue 19:00–21:30` does not read as the
 * list repeating itself.
 *
 * The container's date is written out only when it differs from the card's own,
 * which is the case a bare range could not survive: a window running 22:00–02:00
 * contains one at 00:30, and *"inside 22:00 – 02:00"* on a card dated the next
 * day names a window that, read literally, has already ended.
 */
export const insideLabel = (
  container: { start: number; end: number },
  card: { start: number },
  zone: ViewerZone
): string => {
  const { date, range } = whenOf(container.start, container.end, zone)
  return civilDay(container.start, zone.timeZone) === civilDay(card.start, zone.timeZone)
    ? `inside ${range}`
    : `inside ${date}, ${range}`
}

const zoned = (instant: number, timeZone: string): TZDate => new TZDate(instant, timeZone)

const wallClock = (instant: number, timeZone: string): string =>
  format(zoned(instant, timeZone), 'HH:mm')

/** The wall clock an interval ends at, through the one place that knows `24:00`. */
const endLabel = (end: number, timeZone: string): string => closingLabel(wallClock(end, timeZone))

/**
 * Whether the interval ends on a later day than it began — asked of the last
 * moment it covers, so ending *at* midnight is not crossing it.
 */
const crossesMidnight = (start: number, end: number, timeZone: string): boolean =>
  civilDay(end - 1, timeZone) !== civilDay(start, timeZone)

/** The civil date in the viewer's zone, as a comparable string. */
const civilDay = (instant: number, timeZone: string): string =>
  format(zoned(instant, timeZone), 'yyyy-MM-dd')
