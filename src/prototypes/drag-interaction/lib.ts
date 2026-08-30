/**
 * PROTOTYPE — ticket 06. Throwaway. Do not promote to production.
 *
 * Time model: absolute minutes from the start of the displayed week
 * (Mon 00:00 = 0). Midnight is NOT special — a Range may span it, and the
 * renderer splits it into per-day rectangles. This is deliberate: it is the
 * proposed answer to edge case 1.
 */

export const SNAP = 30
export const SLOTS_PER_DAY = 48
export const DAY_MIN = 1440
export const WEEK_MIN = 7 * DAY_MIN
export const SLOT_PX = 22
export const PX_PER_MIN = SLOT_PX / SNAP
export const TOTAL_SLOTS = 7 * SLOTS_PER_DAY

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export type Range = { id: string; start: number; end: number }

let seq = 0
export const rid = () => `av${++seq}`

export const dayOf = (m: number) => Math.floor(m / DAY_MIN)
export const minOf = (m: number) => ((m % DAY_MIN) + DAY_MIN) % DAY_MIN
export const clampWeek = (m: number) => Math.max(0, Math.min(WEEK_MIN, m))
export const clampSlot = (s: number) => Math.max(0, Math.min(TOTAL_SLOTS - 1, s))

export const hhmm = (m: number) => {
  const mo = minOf(m)
  return `${String(Math.floor(mo / 60)).padStart(2, '0')}:${String(mo % 60).padStart(2, '0')}`
}

/** An end that lands exactly on midnight reads as 24:00 of the day before. */
export const endLabel = (m: number) => (minOf(m) === 0 ? '24:00' : hhmm(m))

export const fmtRange = (r: Range) => {
  const sd = dayOf(r.start)
  const ed = dayOf(r.end - 1)
  if (sd === ed) return `${DAYS[sd] ?? '??'} ${hhmm(r.start)}–${endLabel(r.end)}`
  return `${DAYS[sd] ?? '??'} ${hhmm(r.start)} → ${DAYS[ed] ?? '??'} ${endLabel(r.end)}`
}

export const durationLabel = (mins: number) => {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h${m}`
}

/**
 * Availability is binary and merging: adjacent (`end === start`) or
 * overlapping ranges by the same Friend collapse into one.
 */
export const merge = (rs: Range[]): Range[] => {
  const sorted = [...rs].sort((a, b) => a.start - b.start || a.end - b.end)
  const out: Range[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end)
    } else {
      out.push({ ...r })
    }
  }
  return out
}

/** Remove [a, b) from every range, splitting where it lands in the middle. */
export const subtract = (rs: Range[], a: number, b: number): Range[] => {
  const out: Range[] = []
  for (const r of rs) {
    if (b <= r.start || a >= r.end) {
      out.push(r)
      continue
    }
    if (a > r.start) out.push({ id: r.id, start: r.start, end: a })
    if (b < r.end) out.push({ id: rid(), start: b, end: r.end })
  }
  return out
}

export type DayPiece = { day: number; from: number; to: number; first: boolean; last: boolean }

/** Split a Range into the per-day rectangles the week grid can actually draw. */
export const dayPieces = (r: Range): DayPiece[] => {
  const pieces: DayPiece[] = []
  let cur = r.start
  while (cur < r.end) {
    const d = dayOf(cur)
    const to = Math.min(r.end, (d + 1) * DAY_MIN)
    pieces.push({
      day: d,
      from: cur - d * DAY_MIN,
      to: to - d * DAY_MIN,
      first: cur === r.start,
      last: to === r.end,
    })
    cur = to
  }
  return pieces
}

export const rangeContains = (r: Range, abs: number) => abs >= r.start && abs < r.end

export const findAt = (rs: Range[], abs: number) => rs.find((r) => rangeContains(r, abs))

/** Every range covering `abs` — variant C can stack several. */
export const findAllAt = (rs: Range[], abs: number) => rs.filter((r) => rangeContains(r, abs))

export const slotOf = (abs: number) => Math.floor(abs / SNAP)

/** Slot-index selection: both endpoint slots are always fully included. */
export const spanFromSlots = (a: number, b: number) => {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  return { start: lo * SNAP, end: (hi + 1) * SNAP }
}

export const seedRanges = (): Range[] => [
  { id: rid(), start: 0 * DAY_MIN + 9 * 60, end: 0 * DAY_MIN + 11 * 60 },
  { id: rid(), start: 0 * DAY_MIN + 14 * 60, end: 0 * DAY_MIN + 15 * 60 + 30 },
  // cross-midnight, stored as ONE Availability
  { id: rid(), start: 1 * DAY_MIN + 23 * 60, end: 2 * DAY_MIN + 1 * 60 },
  // the item-7 monolith: everything merged into 08:00–22:00
  { id: rid(), start: 2 * DAY_MIN + 8 * 60, end: 2 * DAY_MIN + 22 * 60 },
  { id: rid(), start: 3 * DAY_MIN + 18 * 60, end: 3 * DAY_MIN + 20 * 60 },
  { id: rid(), start: 4 * DAY_MIN + 18 * 60, end: 4 * DAY_MIN + 23 * 60 },
]

/**
 * Variant C only: the same week, but the monolith is still six separate
 * Availability records that happen to abut. Same picture, different records.
 */
export const seedSegments = (): Range[] => [
  { id: rid(), start: 0 * DAY_MIN + 9 * 60, end: 0 * DAY_MIN + 11 * 60 },
  { id: rid(), start: 0 * DAY_MIN + 14 * 60, end: 0 * DAY_MIN + 15 * 60 + 30 },
  { id: rid(), start: 1 * DAY_MIN + 23 * 60, end: 2 * DAY_MIN + 1 * 60 },
  { id: rid(), start: 2 * DAY_MIN + 8 * 60, end: 2 * DAY_MIN + 12 * 60 },
  { id: rid(), start: 2 * DAY_MIN + 12 * 60, end: 2 * DAY_MIN + 14 * 60 },
  { id: rid(), start: 2 * DAY_MIN + 13 * 60, end: 2 * DAY_MIN + 18 * 60 },
  { id: rid(), start: 2 * DAY_MIN + 18 * 60, end: 2 * DAY_MIN + 22 * 60 },
  { id: rid(), start: 3 * DAY_MIN + 18 * 60, end: 3 * DAY_MIN + 20 * 60 },
  { id: rid(), start: 4 * DAY_MIN + 18 * 60, end: 4 * DAY_MIN + 23 * 60 },
]
