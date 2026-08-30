/**
 * PROTOTYPE — ticket 10: drawing Availability by touch. THROWAWAY.
 * Do not promote to production; rewrite properly when folding in.
 *
 * Time model is deliberately identical to ticket 06's prototype: absolute
 * minutes from the start of the displayed week (Mon 00:00 = 0), midnight is
 * not special, the renderer splits a Range into per-day rectangles.
 */

export const SNAP = 30
export const SLOTS_PER_DAY = 48
export const DAY_MIN = 1440
export const WEEK_MIN = 7 * DAY_MIN
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export type Range = { id: string; start: number; end: number }

let seq = 0
export const rid = () => `av${++seq}`

export const dayOf = (m: number) => Math.floor(m / DAY_MIN)
export const minOf = (m: number) => ((m % DAY_MIN) + DAY_MIN) % DAY_MIN
export const hhmm = (m: number) => {
  const o = minOf(m)
  return `${String(Math.floor(o / 60)).padStart(2, '0')}:${String(o % 60).padStart(2, '0')}`
}
export const endLabel = (m: number) => (minOf(m) === 0 ? '24:00' : hhmm(m))
export const fmtRange = (r: Range) => {
  const a = dayOf(r.start)
  const b = dayOf(r.end - 1)
  return a === b
    ? `${DAYS[a] ?? '??'} ${hhmm(r.start)}–${endLabel(r.end)}`
    : `${DAYS[a] ?? '??'} ${hhmm(r.start)} → ${DAYS[b] ?? '??'} ${endLabel(r.end)}`
}
export const durationLabel = (mins: number) => {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h${m}`
}

/** Availability is binary and merging (CONTEXT.md). */
export const merge = (rs: Range[]): Range[] => {
  const sorted = [...rs].sort((a, b) => a.start - b.start || a.end - b.end)
  const out: Range[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end)
    else out.push({ ...r })
  }
  return out
}

/** Erase drag (ticket 01's correction): remove [a, b) from every range. */
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

export type DayPiece = { day: number; from: number; to: number; first: boolean }

export const dayPieces = (r: Range): DayPiece[] => {
  const out: DayPiece[] = []
  let cur = r.start
  while (cur < r.end) {
    const d = dayOf(cur)
    const to = Math.min(r.end, (d + 1) * DAY_MIN)
    out.push({ day: d, from: cur - d * DAY_MIN, to: to - d * DAY_MIN, first: cur === r.start })
    cur = to
  }
  return out
}

export const findAt = (rs: Range[], abs: number) => rs.find((r) => abs >= r.start && abs < r.end)

export const spanFromSlots = (a: number, b: number) => {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  return { start: lo * SNAP, end: (hi + 1) * SNAP }
}

// ---------------------------------------------------------------- hysteresis

export type HystModel = 'anchor' | 'edge'

/**
 * Ticket 01 asked for "hysteresis at the column boundary, so the pointer must
 * travel meaningfully into the next day before the range follows".
 *
 * There are two readings of that and they are NOT equivalent on a phone:
 *
 *  - `edge`   measures from the column boundary. The budget depends on where
 *             inside the column the finger went down, so a drag begun near a
 *             boundary has almost no protection at all.
 *  - `anchor` measures absolute px from where the finger went down. Same
 *             budget wherever you start. Measured: this is the one that works.
 *
 * `escaped` latches — once a drag has deliberately crossed, it tracks the
 * finger normally for the rest of the gesture.
 */
export type HystState = { curCol: number; escaped: boolean }

export const nextColumn = (
  st: HystState,
  opts: {
    rawCol: number // fractional column under the finger
    anchorX: number // px, surface-relative
    x: number // px, surface-relative
    colW: number
    cols: number
    hystPct: number // 0..90, % of a column width
    model: HystModel
    enabled: boolean
  },
): number => {
  const raw = Math.max(0, Math.min(opts.cols - 1, Math.floor(opts.rawCol)))
  if (!opts.enabled || opts.hystPct === 0) return raw
  if (st.escaped) return raw
  if (opts.model === 'anchor') {
    if (Math.abs(opts.x - opts.anchorX) >= (opts.hystPct / 100) * opts.colW) {
      st.escaped = true
      st.curCol = raw
    }
    return st.curCol
  }
  if (raw === st.curCol) return st.curCol
  const frac = opts.rawCol - Math.floor(opts.rawCol)
  const into = raw > st.curCol ? frac : 1 - frac
  if (into >= opts.hystPct / 100) st.curCol = raw
  return st.curCol
}

// ------------------------------------------------------------------ fixtures

export const seedMine = (): Range[] =>
  merge([
    { id: rid(), start: 0 * DAY_MIN + 9 * 60, end: 0 * DAY_MIN + 11 * 60 },
    // cross-midnight, stored as ONE Availability
    { id: rid(), start: 1 * DAY_MIN + 23 * 60, end: 2 * DAY_MIN + 1 * 60 },
    // the ticket-06 monolith
    { id: rid(), start: 2 * DAY_MIN + 8 * 60, end: 2 * DAY_MIN + 22 * 60 },
    { id: rid(), start: 4 * DAY_MIN + 18 * 60, end: 4 * DAY_MIN + 23 * 60 },
  ])

export type Friend = { name: string; hue: number; abs: Range[] }

const F = (name: string, hue: number, spans: [number, number, number][]): Friend => ({
  name,
  hue,
  abs: merge(spans.map(([d, a, b]) => ({ id: rid(), start: d * DAY_MIN + a, end: d * DAY_MIN + b }))),
})

export const FRIENDS: Friend[] = [
  F('Ada', 30, [[0, 540, 780], [2, 480, 1320], [4, 1080, 1380], [5, 600, 1200]]),
  F('Bo', 120, [[0, 600, 720], [2, 720, 1140], [3, 1020, 1260], [5, 540, 840]]),
  F('Cy', 200, [[1, 1200, 1410], [2, 780, 960], [4, 1140, 1320], [5, 660, 1080]]),
  F('Dee', 300, [[2, 540, 660], [2, 840, 1080], [5, 720, 960], [6, 600, 900]]),
  F('Eli', 350, [[2, 900, 1200], [4, 1200, 1380], [5, 780, 1140]]),
]

/** group size counts every Friend, Hidden included (ticket 09). */
export const GROUP_SIZE = FRIENDS.length + 1

/** Count of visible Friends free in each 30-minute slot of the week. */
export const buildCounts = (friends: Friend[]) => {
  const counts = new Int8Array(7 * SLOTS_PER_DAY)
  for (const f of friends)
    for (const r of f.abs) for (let s = r.start / SNAP; s < r.end / SNAP; s++) counts[s]++
  return counts
}

export const friendsFreeAt = (friends: Friend[], abs: number) =>
  friends.filter((f) => findAt(f.abs, abs))
