/** PROTOTYPE — throwaway. Fake Friends + Availability for ticket 05. */

export type Friend = {
  id: number
  name: string
  hue: number
  tone: number
  note?: string
}

/**
 * Friend 0 is the viewer. The rest are ordered so that raising the "visible
 * Friends" control from 2 -> 4 -> 6 -> 8 introduces the nasty cases in order:
 *   at 4, a near-identical hue pair (Giulia 262 / Luca 268) — collisions are
 *   explicitly acceptable per ticket 01, this is what "acceptable" looks like;
 *   at 6, a `pale neutral` tone (l .9 c .028) that all but vanishes in light;
 *   at 8, an `ink` tone (l .34) that all but vanishes in dark.
 */
export const VIEWER: Friend = { id: 0, name: 'You', hue: 305, tone: 0.62 }

export const OTHERS: Friend[] = [
  { id: 1, name: 'Marco', hue: 28, tone: 0.8, note: 'deep' },
  { id: 2, name: 'Sara', hue: 152, tone: 0.62, note: 'mid' },
  { id: 3, name: 'Giulia', hue: 262, tone: 0.62, note: 'mid — collides with Luca' },
  { id: 4, name: 'Luca', hue: 268, tone: 0.62, note: 'mid — collides with Giulia' },
  { id: 5, name: 'Elena', hue: 92, tone: 0.36, note: 'pale neutral — vanishes in light' },
  { id: 6, name: 'Dario', hue: 200, tone: 0.8, note: 'deep' },
  { id: 7, name: 'Nadia', hue: 340, tone: 0.93, note: 'bright' },
  { id: 8, name: 'Teo', hue: 62, tone: 1.0, note: 'ink — vanishes in dark' },
]

export const ALL_FRIENDS = [VIEWER, ...OTHERS]
export const friendById = (id: number) => ALL_FRIENDS.find((f) => f.id === id) ?? VIEWER

export type Availability = { friendId: number; day: number; start: number; end: number }

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const GRID_START = 8 * 60
export const GRID_END = 24 * 60
export const SLOT = 30
export const SLOTS = (GRID_END - GRID_START) / SLOT

export const fmt = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

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

/** Deterministic 0..1 from any pair of ints — used for stable gradient seeds. */
export function hash2(a: number, b: number) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x165667b1, 0xc2b2ae35)
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Merge a single Friend's overlapping/adjacent ranges — Availability is binary. */
function mergeOwn(ranges: { start: number; end: number }[]) {
  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  const out: { start: number; end: number }[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end)
    else out.push({ ...r })
  }
  return out
}

/** 35 days of fake Availability, deterministic. Day 9 is the hand-authored case. */
export function buildAvailability(): Availability[] {
  const rnd = mulberry32(20260829)
  const out: Availability[] = []
  for (let day = 0; day < 35; day++) {
    for (const f of ALL_FRIENDS) {
      const ranges: { start: number; end: number }[] = []
      const weekend = day % 7 >= 5
      const n = rnd() < (weekend ? 0.82 : 0.5) ? (rnd() < 0.35 ? 2 : 1) : 0
      for (let i = 0; i < n; i++) {
        const start = GRID_START + Math.floor(rnd() * 22) * SLOT
        const len = (2 + Math.floor(rnd() * 8)) * SLOT
        ranges.push({ start, end: Math.min(GRID_END, start + len) })
      }
      for (const r of mergeOwn(ranges)) out.push({ friendId: f.id, day, ...r })
    }
  }

  // Day 9 (Wed of the prototype week) = the ticket's segmentation case, verbatim.
  const day = 9
  const kept = out.filter((a) => a.day !== day)
  kept.push(
    { friendId: 1, day, start: 18 * 60, end: 22 * 60 }, // Marco 18:00-22:00
    { friendId: 2, day, start: 20 * 60, end: 23 * 60 }, // Sara  20:00-23:00
    { friendId: 3, day, start: 19 * 60, end: 21 * 60 },
    { friendId: 4, day, start: 19 * 60 + 30, end: 23 * 60 },
    { friendId: 5, day, start: 17 * 60, end: 20 * 60 },
    { friendId: 6, day, start: 20 * 60 + 30, end: 24 * 60 },
    { friendId: 7, day, start: 18 * 60, end: 19 * 60 },
    { friendId: 8, day, start: 21 * 60, end: 23 * 60 + 30 },
    { friendId: 0, day, start: 19 * 60, end: 22 * 60 }, // viewer, solid on top
    { friendId: 0, day, start: 9 * 60, end: 11 * 60 },
  )
  return kept
}

export const AVAILABILITY = buildAvailability()

/** The week the prototype shows: days 7..13. */
export const WEEK_OFFSET = 7

/** A confirmed Hangout, so the human can check it stays distinct from a heatmap. */
export const HANGOUT = {
  day: 12,
  start: 20 * 60 + 30,
  end: 22 * 60 + 30,
  title: 'Pizza',
  participants: [0, 1, 2, 6],
}

// ---------------------------------------------------------------------------
// Segmentation — the crux of the ticket.
// ---------------------------------------------------------------------------

/** A maximal interval over which the SET of free Friends does not change. */
export type Segment = { start: number; end: number; friendIds: number[] }

/** A maximal interval over which SOMEONE is free. Holds its own segments. */
export type Run = { start: number; end: number; segments: Segment[]; friendIds: number[] }

export function segmentsFor(ranges: Availability[]): Segment[] {
  if (ranges.length === 0) return []
  const points = new Set<number>()
  for (const r of ranges) {
    points.add(r.start)
    points.add(r.end)
  }
  const sorted = [...points].sort((a, b) => a - b)
  const segs: Segment[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i]
    const end = sorted[i + 1]
    const friendIds = ranges
      .filter((r) => r.start <= start && r.end >= end)
      .map((r) => r.friendId)
      .sort((a, b) => a - b)
    if (friendIds.length > 0) segs.push({ start, end, friendIds })
  }
  return segs
}

export function runsFor(segments: Segment[]): Run[] {
  const runs: Run[] = []
  for (const s of segments) {
    const last = runs[runs.length - 1]
    if (last && last.end === s.start) {
      last.end = s.end
      last.segments.push(s)
    } else {
      runs.push({ start: s.start, end: s.end, segments: [s], friendIds: [] })
    }
  }
  for (const r of runs) r.friendIds = [...new Set(r.segments.flatMap((s) => s.friendIds))].sort()
  return runs
}

export function availabilityFor(day: number, friendIds: number[]) {
  return AVAILABILITY.filter((a) => a.day === day && friendIds.includes(a.friendId))
}

/** Who is free at an exact instant — used by 30-minute-slot hover. */
export function freeAt(day: number, min: number, friendIds: number[]) {
  return AVAILABILITY.filter(
    (a) => a.day === day && friendIds.includes(a.friendId) && a.start <= min && a.end > min,
  )
    .map((a) => a.friendId)
    .sort((a, b) => a - b)
}
