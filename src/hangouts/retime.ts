/**
 * The time editor's arithmetic — what a retime may be set to, and how each
 * choice is spelled.
 *
 * Its own module for the reason `when.ts` is one: **the two spellings that are
 * easy to get wrong live here** (a range ending at midnight, and one that
 * crosses it) and so does the DST day, and all three are worth a test rather
 * than a careful read. `retime-dialog.tsx` is then only controls.
 *
 * ## Every choice is on the 30-minute grid, by construction
 *
 * Ticket 07 §6 attaches the snap to "the manual time editor", which is this
 * one — force-write lets a human type arbitrary times, and off-grid bounds make
 * coverage a *fuzzy* comparison every downstream rule has to qualify.
 * `05-hangout.sql` says the same thing structurally and rejects an off-grid
 * bound with `23514`. So this module offers nothing else: the starts come from
 * `slotsOfDay` and the ends are whole Slots forward of one. There is no
 * free-text time field to snap, which is the strongest form of snapping there
 * is.
 *
 * That also handles DST with no case of its own. A 23-hour day offers 46 starts
 * and a 25-hour day offers 50 — `slotsOfDay` counts them from the two midnights
 * rather than assuming 48 — and the ends step by real half hours, so an end
 * "three hours later" is three hours later even across a transition.
 *
 * **No `@/` imports, deliberately** — `retime.test.ts` runs under plain Node
 * (`yarn test`), the same split `slots.ts`, `when.ts` and `hangout.ts` make.
 */
import { SLOT_MS, closingLabel, slotsOfDay, startOfDayInZone } from '../availability/slots.ts'
import { TZDate } from '@date-fns/tz'
import { times } from 'lodash-es'
import { format } from 'date-fns'

/** One option in the editor: the instant, and how the list spells it. */
export type TimeChoice = {
  /** Epoch ms, always on the Slot lattice. */
  at: number
  label: string
}

const DAY_MS = 86_400_000

/**
 * How far ahead an end may be set from its start: **24 hours**, 48 Slots.
 *
 * A cap rather than a rule, and it is a real limit worth naming: a Hangout
 * longer than a day is not something this editor can express. Nothing else in
 * the product forbids one — the schema takes any `ends_at > starts_at` on the
 * grid — so a longer plan seeded by a script stays legal and simply cannot be
 * *lengthened* here. The alternative is a second date field for the end, which
 * spends a control on a case a group planning dinner does not have.
 */
const MAX_SLOTS = 48

/**
 * Every start this civil day offers, in order.
 *
 * Asked of the day rather than generated from midnight, so the count is the
 * zone's: 46 rows in March, 50 in October, and the repeated 02:00 of an autumn
 * Sunday appears twice with its own instant. Which of the two you picked is
 * then unambiguous even though the labels agree — the two options carry
 * different `at`s, and the list shows the offset beside the pair.
 */
export const startChoices = (day: Date, timeZone: string): TimeChoice[] =>
  slotsOfDay(day, timeZone).map((slot) => ({
    at: slot.start.getTime(),
    label: slot.offset === null ? slot.label : `${slot.label} (${slot.offset})`,
  }))

/**
 * Every end a start allows: half-hourly, from half an hour after it.
 *
 * The first option is `start + 30 minutes` because `ends_at > starts_at` is a
 * check constraint and a Hangout that ends where it starts is not a plan
 * (`05-hangout.sql` §1). There is no "same as the start" to guard against.
 */
export const endChoices = (startsAt: number, timeZone: string): TimeChoice[] =>
  times(MAX_SLOTS, (step) => {
    const at = startsAt + (step + 1) * SLOT_MS
    return { at, label: endLabel(startsAt, at, timeZone) }
  })

/**
 * How one end is spelled — three cases, in the order the code reaches them.
 *
 * 1. **`HH:mm`** while it is still on the start's own day.
 * 2. **`24:00`** when it is the midnight closing that day. `23:30 – 00:00`
 *    reads as a range running backwards, and `closingLabel` in `slots.ts` owns
 *    that spelling for the grid's aria-labels and the failed-write toast
 *    already.
 * 3. **`HH:mm Sat`** beyond it. A bare `01:00` under a Friday start names a
 *    time that, read literally, has already been and gone.
 */
const endLabel = (startsAt: number, endsAt: number, timeZone: string): string => {
  const clock = wallClock(endsAt, timeZone)
  if (civilDay(endsAt, timeZone) === civilDay(startsAt, timeZone)) return clock
  return clock === '00:00'
    ? closingLabel(clock)
    : `${clock} ${format(zoned(endsAt, timeZone), 'EEE')}`
}

/**
 * The same start, moved to another civil day — **keeping its wall clock**.
 *
 * Which is what somebody changing the date means: *this plan, but on Tuesday*.
 * Recomputing from the wall clock rather than adding a day in milliseconds is
 * what makes that true across a transition, where "the same time next day" is
 * 23 or 25 hours away.
 *
 * **And the wall clock may not exist.** On the spring Sunday 02:00–02:59 never
 * happens in Rome, so a 02:30 start moved onto it has nowhere to land; the
 * answer is then the day's **last** Slot at or before it, which is 01:30. Never
 * null: the editor's date field cannot be allowed to produce an empty state.
 *
 * On the *autumn* Sunday the wall clock happens twice and this takes the
 * **first** of the two — the one before the clocks went back. Either is a
 * defensible answer to "02:30 on that day"; picking the earlier one keeps the
 * function monotonic, and the editor's start list shows both with their offsets
 * so the other is one click away.
 */
export const sameClockOn = (startsAt: number, day: Date, timeZone: string): number => {
  const wanted = wallClock(startsAt, timeZone)
  const slots = slotsOfDay(day, timeZone)
  const exact = slots.find((slot) => slot.label === wanted)
  if (exact !== undefined) return exact.start.getTime()

  const before = slots.filter((slot) => slot.label < wanted)
  const fallback = before[before.length - 1] ?? slots[0]
  return fallback.start.getTime()
}

/**
 * An instant as the date input's `yyyy-MM-dd`, in the group's zone.
 *
 * Read off the wall clock, not off the UTC date: a 00:30 Slot in Rome is the
 * *previous* day in UTC, and a date field that jumped back a day at half past
 * midnight would be the kind of bug nobody reproduces on purpose.
 */
export const dateValueOf = (instant: number, timeZone: string): string =>
  format(zoned(instant, timeZone), 'yyyy-MM-dd')

/**
 * The reverse: a `yyyy-MM-dd` back into the `Date` whose **civil fields** name
 * that date.
 *
 * A plain `new Date('2027-09-10')` is UTC midnight, and read as civil fields
 * west of UTC that is the 9th. Midday is what makes the three getters
 * `startOfDayInZone` reads say what the string said, in every zone the viewer
 * might be sitting in — `slots.ts` documents the same contract for the dates
 * `useCalendarView` hands out.
 *
 * Null on anything that is not a date, which the native input can produce by
 * being cleared.
 */
export const dayFromValue = (value: string): Date | null => {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (parts === null) return null
  const day = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), 12)
  return Number.isNaN(day.getTime()) ? null : day
}

/**
 * Today, in the group's zone, as the date field's `min`.
 *
 * A hint rather than a rule: ticket 08 §2 makes retime **unrestricted**, and
 * §6 freezes a Hangout only once it is *Past*. Moving a live plan backwards
 * into last week is legal and nothing here refuses it; the `min` simply stops
 * the date picker from opening onto a decade nobody wants.
 */
export const todayValue = (timeZone: string): string =>
  dateValueOf(startOfDayInZone(new Date(), timeZone).getTime(), timeZone)

const zoned = (instant: number, timeZone: string): TZDate => new TZDate(instant, timeZone)

const wallClock = (instant: number, timeZone: string): string =>
  format(zoned(instant, timeZone), 'HH:mm')

/** The civil date as a day count, so "the next day" is `+ 1`. */
const civilDay = (instant: number, timeZone: string): number => {
  const local = zoned(instant, timeZone)
  return Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()) / DAY_MS
}
