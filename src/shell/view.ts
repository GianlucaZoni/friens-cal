/**
 * The four views, and the arithmetic that differs between them.
 *
 * Issue 11 shipped two — week and month — and issue 12 adds **day** and
 * **3-day**, which are not new grids: `WeekGrid` derives its columns, its shared
 * hour gutter, the DST odd-day's own gutter and the gesture's hit-testing from
 * `days` alone, so a day view *is* that grid with one column and a 3-day view is
 * that grid with three. Nothing about the time axis changes. What has to learn
 * about them is exactly what is in this file: which days a view draws, and how
 * far one press of the arrows moves.
 *
 * **Why they exist at all**, since ticket 01 settled month and week as the two
 * views and adding a third is a real change: issue 13's touch drawing needs
 * them. Its own measured objection is that at a phone's 47px week columns a 30px
 * lateral drift at release turns a 2-hour Availability into a 26-hour one, and
 * no hysteresis budget can exceed a column width — and the two things that make
 * that acceptable are a deliberate long-press and *"the view selector gives an
 * escape to 3-day (110px), where a 40–50px anchor-relative budget measurably
 * works"*. So 3-day is not a convenience; it is the escape hatch the next slice
 * is built on. Day comes with it for one line of code, and issue 13's acceptance
 * criteria name all four.
 *
 * **No `@/` imports, deliberately** — the split `month.ts`, `slots.ts`,
 * `candidates.ts` and `roster.ts` already make, so `view.test.ts` can reach this
 * under plain Node (`yarn test`). `weekStartsOn` therefore arrives as an
 * argument rather than being read from `use-calendar-view.ts`, which is the same
 * shape `monthLattice` already has and the reason it has it.
 */
import { monthLattice } from '../availability/month.ts'
import { addDays, addMonths, format, isSameMonth, isSameYear, startOfWeek } from 'date-fns'

export type CalendarView = 'day' | '3-day' | 'week' | 'month'

/** `date-fns`' own weekday index, as `monthLattice` already spells it. */
export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6

/**
 * How far one press of `‹` or `›` moves, in days — **and therefore what a
 * horizontal swipe pages by**, which is what issue 13 means by *"pages by the
 * current view's block"*. The two are the same move and there is one spelling of
 * it: `stepBy`.
 *
 * The month is absent because its block is a month and not a number of days: a
 * 31-day step from 31 January lands in March. `addMonths` is what keeps the
 * anchor on the same day-of-month it started on, clamping at the short end.
 */
const BLOCK: Record<Exclude<CalendarView, 'month'>, number> = {
  day: 1,
  '3-day': 3,
  week: 7,
}

/**
 * **Every day the view on screen actually draws**, which is also the range the
 * stores are read over — one array, so the cells drawn and the rows fetched
 * cannot disagree by construction.
 *
 * Issue 11 reached that invariant by adding a second array (`shownDays`) beside
 * a `days` that was always the anchor's *week*, because the month grid drew from
 * up to five weeks earlier and `floorOfView` reads the first day it is handed —
 * so navigating back rendered cells from a range Postgres had never been asked
 * for, with `status` already `ready`. With four views there is no longer any
 * reading under which "the anchor's week" is the right answer, so the two arrays
 * collapse into this one and the hole is closed by the type rather than by a
 * second field somebody has to remember to pass.
 *
 * **Day and 3-day start at the anchor, not at a floor.** A week is a named
 * object with an edge (Monday), so its view snaps to that edge; three days are
 * not, so the block is *these* three days and paging moves it whole. That is
 * also the only reading under which `goToDate` from the navigator does what it
 * looks like it does — jumping to Thursday in 3-day view shows Thursday first
 * rather than showing Tuesday because Thursday happens to fall mid-block.
 */
export const daysOf = (view: CalendarView, anchor: Date, weekStartsOn: WeekStart): Date[] => {
  if (view === 'month') return monthLattice(anchor, weekStartsOn)
  const first = view === 'week' ? startOfWeek(anchor, { weekStartsOn }) : anchor
  return Array.from({ length: BLOCK[view] }, (_, index) => addDays(first, index))
}

/** Where `‹` and `›` — and issue 13's horizontal swipe — put the anchor. */
export const stepBy = (view: CalendarView, anchor: Date, direction: -1 | 1): Date =>
  view === 'month' ? addMonths(anchor, direction) : addDays(anchor, direction * BLOCK[view])

/**
 * The bar's label: **month and year only, never a day range** (ticket 12
 * decision 6). Day-level precision belongs on the grid's column headers, where
 * it sits next to the column it describes.
 *
 * That holds for a single day too, and it is worth saying out loud because it
 * looks like the case for an exception: a day view labelled `September 2026`
 * says less than the column header two pixels below it already says
 * (`Mon 7`). Restating it in the bar would be the third spelling of one date,
 * and the bar is the one place in the product that answers *roughly where am I*
 * rather than *exactly which day*.
 *
 * A block that straddles two months names both — that is still month and year.
 */
export const rangeLabel = (view: CalendarView, anchor: Date, days: readonly Date[]): string => {
  if (view === 'month') return format(anchor, 'LLLL yyyy')

  const [first] = days
  const last = days[days.length - 1]
  if (isSameMonth(first, last)) return format(first, 'LLLL yyyy')
  if (isSameYear(first, last)) return `${format(first, 'LLL')} – ${format(last, 'LLL yyyy')}`
  return `${format(first, 'LLL yyyy')} – ${format(last, 'LLL yyyy')}`
}
