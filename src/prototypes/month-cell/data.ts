/**
 * PROTOTYPE — throwaway. Ticket 14: fake month of Availability.
 *
 * Availability is stored the way ticket 07 settled it: **slot rows**. A day is
 * 48 half-hour slots, 00:00–24:00, and a Friend either owns a slot or does
 * not. No ranges, no merging — merging stopped existing.
 *
 * The month is September 2026 on a Monday-first grid: 5 rows of 7, leading
 * days from August and trailing days from October, exactly like a real month
 * view. Day 0 of the grid is Mon 31 Aug 2026.
 */

import { TONE_VALUES } from './color'

export type Friend = {
  id: number
  name: string
  /** 0–360, continuous and free (ticket 11 — collisions are acceptable). */
  hue: number
  /**
   * one of blobatar's six authored tones (ticket 11), stored as a **band
   * interior** — blobatar resolves tone with `find(edge => v < edge)`, so the
   * table numbers themselves address the wrong swatch. See `TONE_VALUES`.
   */
  tone: number
  /** governs SHAPE alone (ticket 11). */
  seed: string
  note?: string
}

/** Ticket 15: the grid heatmap renders in the VIEWER's colour. This is it. */
export const VIEWER: Friend = { id: 0, name: 'You', hue: 305, tone: TONE_VALUES.mid, seed: 'viewer-you' }

/**
 * Ordered so that 3 → 5 → 8 visible Friends introduces the nasty cases in the
 * order ticket 05 introduced them, so the two prototypes can be read side by
 * side.
 */
export const OTHERS: Friend[] = [
  { id: 1, name: 'Marco', hue: 28, tone: TONE_VALUES.deep, seed: 'marco-r', note: 'deep' },
  { id: 2, name: 'Sara', hue: 152, tone: TONE_VALUES.mid, seed: 'sara-k', note: 'mid' },
  { id: 3, name: 'Giulia', hue: 262, tone: TONE_VALUES.mid, seed: 'giulia-p', note: 'mid — collides with Luca' },
  { id: 4, name: 'Luca', hue: 268, tone: TONE_VALUES.mid, seed: 'luca-v', note: 'mid — collides with Giulia' },
  { id: 5, name: 'Elena', hue: 92, tone: TONE_VALUES.paleNeutral, seed: 'elena-m', note: 'pale neutral — l .90' },
  { id: 6, name: 'Dario', hue: 200, tone: TONE_VALUES.deep, seed: 'dario-t', note: 'deep' },
  { id: 7, name: 'Nadia', hue: 340, tone: TONE_VALUES.bright, seed: 'nadia-b', note: 'bright' },
  { id: 8, name: 'Teo', hue: 62, tone: TONE_VALUES.ink, seed: 'teo-z', note: 'ink — l .34' },
]

export const ALL_FRIENDS = [VIEWER, ...OTHERS]
export const friendById = (id: number) => ALL_FRIENDS.find((f) => f.id === id) ?? VIEWER

// ---------------------------------------------------------------------------
// The month grid
// ---------------------------------------------------------------------------

export const SLOTS_PER_DAY = 48 // 00:00–24:00 at 30 minutes (ticket 01: month drag = whole day)
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const MONTH_LABEL = 'September 2026'
/** "Today", as a grid index — the month view has to mark it, and that costs an edge. */
export const TODAY = 16

export type DayCell = {
  /** 0..34, index into the grid. */
  index: number
  /** day-of-month numeral shown in the corner. */
  date: number
  /** false for the Aug/Oct spill days. */
  inMonth: boolean
  weekend: boolean
}

export const DAYS: DayCell[] = (() => {
  const out: DayCell[] = []
  // Mon 31 Aug 2026 → Sun 4 Oct 2026, 35 cells.
  const start = new Date(Date.UTC(2026, 7, 31))
  for (let i = 0; i < 35; i++) {
    const d = new Date(start.getTime() + i * 86400000)
    out.push({
      index: i,
      date: d.getUTCDate(),
      inMonth: d.getUTCMonth() === 8,
      weekend: i % 7 >= 5,
    })
  }
  return out
})()

export const fmtSlot = (slot: number) =>
  `${String(Math.floor(slot / 2)).padStart(2, '0')}:${slot % 2 ? '30' : '00'}`

// ---------------------------------------------------------------------------
// Fake slot rows
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** `slots[day][friendId]` — a Set of owned half-hour slot indices. */
export type SlotTable = Record<number, Record<number, Set<number>>>

function buildSlots(): SlotTable {
  const rnd = mulberry32(20260914)
  const table: SlotTable = {}
  for (const day of DAYS) {
    const perFriend: Record<number, Set<number>> = {}
    const weekend = day.weekend
    for (const f of ALL_FRIENDS) {
      const owned = new Set<number>()
      // 0–2 windows a day; evenings on weekdays, wider on weekends.
      const windows = rnd() < (weekend ? 0.85 : 0.52) ? (rnd() < 0.3 ? 2 : 1) : 0
      for (let w = 0; w < windows; w++) {
        const anchor = weekend ? 20 + Math.floor(rnd() * 22) : 34 + Math.floor(rnd() * 8)
        const len = 3 + Math.floor(rnd() * (weekend ? 12 : 7))
        for (let s = anchor; s < Math.min(SLOTS_PER_DAY, anchor + len); s++) owned.add(s)
      }
      perFriend[f.id] = owned
    }
    table[day.index] = perFriend
  }

  // ---- hand-authored cells, so the interesting cases are always on screen ----

  const fill = (day: number, id: number, from: number, to: number) => {
    for (let s = from; s < to; s++) table[day][id].add(s)
  }
  const clear = (day: number, id: number) => table[day][id].clear()

  // Day 12 (Sat 12 Sep) — FULL HOUSE. Everyone free 20:00–23:00. peak = 9.
  for (const f of ALL_FRIENDS) {
    clear(12, f.id)
    fill(12, f.id, 40, 46)
  }

  // Day 5 (Sat 5 Sep) — the DISJOINT day. Eight Friends have Availability and
  // NOT ONE PAIR OVERLAPS. Peak concurrency is 1; there is no Candidate at all.
  // The dot row shows eight dots here. This cell is the whole argument.
  for (const f of ALL_FRIENDS) clear(5, f.id)
  ALL_FRIENDS.forEach((f, i) => fill(5, f.id, 2 + i * 5, 2 + i * 5 + 4))

  // Day 6 (Sun 6 Sep) — the MIRROR of day 5: same eight Friends, all free in
  // the SAME two hours. Identical dot row, completely different day.
  for (const f of ALL_FRIENDS) {
    clear(6, f.id)
    fill(6, f.id, 38, 42)
  }

  // Day 17 (Thu 17 Sep) — the near-collision pair alone. Giulia + Luca, 4° apart.
  for (const f of ALL_FRIENDS) clear(17, f.id)
  fill(17, 3, 38, 44)
  fill(17, 4, 39, 45)

  // Day 22 (Tue 22 Sep) — two Friends, all day. Long thin coverage, low peak.
  for (const f of ALL_FRIENDS) clear(22, f.id)
  fill(22, 1, 16, 46)
  fill(22, 2, 18, 44)

  // Day 26 (Sat 26 Sep) — the Hangout day. Underneath it is the joint-best day
  // of the month: every Friend free 20:00–23:00, and nothing else. The Hangout
  // sits on exactly that window, and ticket 09 blanks a Hangout's slots for
  // everyone — so the aggregate for this day collapses to nothing.
  for (const f of ALL_FRIENDS) {
    clear(26, f.id)
    fill(26, f.id, 40, 46)
  }

  // Viewer: a believable personal pattern, plus the days that matter.
  for (const day of DAYS) {
    const own = table[day.index][0]
    if (day.index !== 12 && day.index !== 5 && day.index !== 6 && day.index !== 26) {
      if (rnd() < 0.45) {
        const anchor = day.weekend ? 22 + Math.floor(rnd() * 16) : 36 + Math.floor(rnd() * 6)
        const len = 4 + Math.floor(rnd() * 8)
        for (let s = anchor; s < Math.min(SLOTS_PER_DAY, anchor + len); s++) own.add(s)
      } else if (rnd() < 0.25) {
        own.clear()
      }
    }
  }
  // Two whole-day drags — month view's own gesture (ticket 01).
  clear(19, 0)
  fill(19, 0, 0, 48)
  clear(20, 0)
  fill(20, 0, 0, 48)

  return table
}

export const SLOTS = buildSlots()

// ---------------------------------------------------------------------------
// Hangouts
// ---------------------------------------------------------------------------

export type Hangout = {
  day: number
  from: number
  to: number
  title: string
  participants: number[]
}

export const HANGOUTS: Hangout[] = [
  // Short title. Fits.
  { day: 26, from: 40, to: 45, title: 'Pizza', participants: [0, 1, 2, 6] },
  // Long title + six Participants. Does not fit, and that is the finding.
  {
    day: 9,
    from: 38,
    to: 43,
    title: 'Aperitivo da Giulia',
    participants: [0, 2, 3, 4, 5, 7],
  },
]

export const hangoutFor = (day: number) => HANGOUTS.find((h) => h.day === day)

// ---------------------------------------------------------------------------
// Metrics — everything a month cell could possibly show, computed once per day
// ---------------------------------------------------------------------------

export type DayMetrics = {
  /** count of visible Friends (viewer included) free in each slot, Hangout slots BLANKED. */
  perSlot: number[]
  /** max of perSlot. "How many Friends were free at the best moment." */
  peak: number
  /** the visible Friend ids free at the first slot that achieves `peak`. */
  atPeak: number[]
  /** every visible Friend with ANY Availability that day — what a dot row shows. */
  anyone: number[]
  /** fraction of the day with >= 2 Friends free — i.e. that could hold a Candidate. */
  coverage: number
  /** fraction of the day with >= 1 Friend free. */
  reach: number
  /** does the viewer have any Availability that day. */
  youFree: boolean
  /** how much of the day the viewer owns, 0..1 — for the "own = fill" treatments. */
  youFraction: number
  hangout?: Hangout
}

/**
 * `ignoreHangout` exists for one probe only: it shows what the cell WOULD have
 * said if ticket 09's blanking did not apply, so the size of the lie a Hangout
 * tells about its own day is visible rather than argued.
 */
export function metricsFor(
  day: number,
  visibleIds: number[],
  ignoreHangout = false,
): DayMetrics {
  const h = ignoreHangout ? undefined : hangoutFor(day)
  const perFriend = SLOTS[day]
  const ids = visibleIds
  const perSlot: number[] = []
  let coveredSlots = 0
  let reachedSlots = 0
  const anyone = new Set<number>()

  for (let s = 0; s < SLOTS_PER_DAY; s++) {
    // Ticket 09: a Hangout blanks out its slots for everyone.
    const blanked = !!h && s >= h.from && s < h.to
    let n = 0
    for (const id of ids) {
      if (perFriend[id]?.has(s)) {
        if (!blanked) n++
        anyone.add(id)
      }
    }
    perSlot.push(blanked ? 0 : n)
    if (!blanked && n >= 2) coveredSlots++
    if (!blanked && n >= 1) reachedSlots++
  }

  const peak = perSlot.reduce((a, b) => Math.max(a, b), 0)
  const peakSlot = perSlot.indexOf(peak)
  const atPeak =
    peak > 0 ? ids.filter((id) => perFriend[id]?.has(peakSlot)).sort((a, b) => a - b) : []

  const ownSlots = perFriend[0]?.size ?? 0

  return {
    perSlot,
    peak,
    atPeak,
    anyone: [...anyone].sort((a, b) => a - b),
    coverage: coveredSlots / SLOTS_PER_DAY,
    reach: reachedSlots / SLOTS_PER_DAY,
    youFree: (perFriend[0]?.size ?? 0) > 0,
    youFraction: ownSlots / SLOTS_PER_DAY,
    hangout: ignoreHangout ? undefined : hangoutFor(day),
  }
}
