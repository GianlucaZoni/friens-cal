/**
 * PROTOTYPE — ticket 16, the right sidebar. THROWAWAY. Synthetic data only.
 *
 * The Candidate pipeline is ticket 09's, implemented rather than faked, so the
 * list on screen has the real ordering, the real glow rule, the real Hangout
 * blanking and the real "clip to the current slot" behaviour. If a card looks
 * wrong here it is because the rule produces it, which is the only reason to
 * build this at all.
 */

export type Friend = {
  id: string
  name: string
  /** 0–360. The only per-Friend colour input (ticket 11). */
  hue: number
  /** blobatar seed — shape only. */
  seed: string
  expression: string
}

export type Hangout = {
  id: string
  title: string
  start: number
  end: number
  participantIds: string[]
  /** ticket 08: a retimed Hangout is marked permanently, like "edited". */
  edited: boolean
}

export type Candidate = {
  key: string
  start: number
  end: number
  friendIds: string[]
}

export const SLOT = 30 * 60 * 1000

/** Fixed so the prototype is deterministic. Thu 3 Sep 2026, 18:10. */
export const NOW = new Date(2026, 8, 3, 18, 10).getTime()

export const FRIENDS: Friend[] = [
  { id: 'marco', name: 'Marco', hue: 25, seed: 'marco-01', expression: 'happy' },
  { id: 'sara', name: 'Sara', hue: 145, seed: 'sara-04', expression: 'wink' },
  { id: 'luca', name: 'Luca', hue: 265, seed: 'luca-19', expression: 'smug' },
  { id: 'nadia', name: 'Nadia', hue: 330, seed: 'nadia-07', expression: 'idle' },
  { id: 'teo', name: 'Teo', hue: 85, seed: 'teo-12', expression: 'sleepy' },
  { id: 'bea', name: 'Bea', hue: 200, seed: 'bea-33', expression: 'thinking' },
]

/** The viewer. Hideable like anyone else (ticket 09). */
export const VIEWER_ID = 'marco'

export const friendById = (id: string) => FRIENDS.find((f) => f.id === id)!

/* ------------------------------------------------------------------ *
 * Availability, declared as ranges and expanded to slots.
 * `from`/`to` are decimal hours and may exceed 24 to cross midnight.
 * ------------------------------------------------------------------ */

type RangeSpec = { friendId: string; day: number; from: number; to: number }

const DAY0 = new Date(2026, 8, 3).getTime()

const at = (day: number, hours: number) => DAY0 + day * 86400000 + hours * 3600000

const expand = (specs: RangeSpec[]) => {
  const slots: { friendId: string; slot: number }[] = []
  for (const s of specs) {
    for (let t = at(s.day, s.from); t < at(s.day, s.to); t += SLOT) {
      slots.push({ friendId: s.friendId, slot: t })
    }
  }
  return slots
}

/** The main scenario: covers every hard case the ticket names. */
const BASE_RANGES: RangeSpec[] = [
  // today — partly in the past, so the top candidate is clipped to 18:00
  { friendId: 'marco', day: 0, from: 16, to: 23 },
  { friendId: 'sara', day: 0, from: 17.5, to: 23 },
  { friendId: 'bea', day: 0, from: 20, to: 22 },

  // Friday — crosses midnight into Saturday
  { friendId: 'marco', day: 1, from: 21, to: 26 },
  { friendId: 'nadia', day: 1, from: 22, to: 25 },
  { friendId: 'teo', day: 1, from: 22.5, to: 24.5 },

  // Saturday — the full house. Six colours in one border.
  { friendId: 'marco', day: 2, from: 19, to: 24 },
  { friendId: 'sara', day: 2, from: 19, to: 24 },
  { friendId: 'luca', day: 2, from: 20, to: 23 },
  { friendId: 'nadia', day: 2, from: 20, to: 23 },
  { friendId: 'teo', day: 2, from: 20, to: 23 },
  { friendId: 'bea', day: 2, from: 20, to: 23 },

  // Sunday — a staircase, four overlapping Candidates, one of them glowing
  { friendId: 'marco', day: 3, from: 10, to: 14 },
  { friendId: 'sara', day: 3, from: 10, to: 13 },
  { friendId: 'luca', day: 3, from: 11, to: 14 },
  { friendId: 'nadia', day: 3, from: 10, to: 12 },
  { friendId: 'teo', day: 3, from: 12, to: 14 },

  // Monday — feeds the pinned Hangout the viewer is not in
  { friendId: 'sara', day: 4, from: 18.5, to: 21 },
  { friendId: 'luca', day: 4, from: 18.5, to: 21 },
  { friendId: 'nadia', day: 4, from: 18, to: 20.5 },
  { friendId: 'teo', day: 4, from: 18.5, to: 22 },
  { friendId: 'bea', day: 4, from: 18.5, to: 21 },

  // Tuesday — a five-Friend Candidate with a full-house sub-Candidate inside it
  { friendId: 'marco', day: 5, from: 19, to: 21.5 },
  { friendId: 'sara', day: 5, from: 19, to: 21.5 },
  { friendId: 'luca', day: 5, from: 19, to: 21.5 },
  { friendId: 'nadia', day: 5, from: 19, to: 21.5 },
  { friendId: 'bea', day: 5, from: 19, to: 21.5 },
  { friendId: 'teo', day: 5, from: 20, to: 20.5 },

  // the tail: ordinary two- and three-Friend overlaps further out
  { friendId: 'marco', day: 7, from: 20, to: 23 },
  { friendId: 'luca', day: 7, from: 21, to: 23 },
  { friendId: 'sara', day: 9, from: 12, to: 15 },
  { friendId: 'bea', day: 9, from: 13, to: 16 },
  { friendId: 'teo', day: 11, from: 19, to: 22 },
  { friendId: 'nadia', day: 11, from: 19.5, to: 21 },
  { friendId: 'marco', day: 12, from: 9, to: 12 },
  { friendId: 'sara', day: 12, from: 9.5, to: 11 },
  { friendId: 'luca', day: 12, from: 10, to: 12 },
]

/** More of the same, further out — makes the list long enough to scroll. */
const LONG_TAIL: RangeSpec[] = Array.from({ length: 14 }, (_, i) => i + 14).flatMap((day) => {
  const a = FRIENDS[day % 6]!
  const b = FRIENDS[(day * 3 + 1) % 6]!
  const c = FRIENDS[(day * 5 + 2) % 6]!
  const start = 9 + (day % 5) * 2.5
  return [
    { friendId: a.id, day, from: start, to: start + 3 },
    { friendId: b.id, day, from: start + 0.5, to: start + 4 },
    ...(day % 3 === 0 ? [{ friendId: c.id, day, from: start + 1, to: start + 2.5 }] : []),
  ]
})

const HANGOUTS: Hangout[] = [
  {
    id: 'h-coffee',
    title: 'Coffee',
    start: at(0, 17.5),
    end: at(0, 19),
    participantIds: ['marco', 'sara'],
    edited: false,
  },
  {
    id: 'h-pizza',
    title: 'Pizza at Marco’s',
    start: at(0, 21),
    end: at(0, 23),
    participantIds: ['marco', 'sara', 'bea', 'nadia'],
    edited: false,
  },
  {
    id: 'h-climbing',
    title: 'Climbing',
    start: at(4, 18.5),
    end: at(4, 20.5),
    participantIds: ['sara', 'luca', 'nadia', 'teo', 'bea'],
    edited: true,
  },
]

/* ------------------------------------------------------------------ *
 * Datasets. The three empty states are data, not a rendering mode —
 * they have to be *reachable*, or they get designed in a vacuum.
 * ------------------------------------------------------------------ */

export type DatasetKey = 'normal' | 'long' | 'noOverlap' | 'noAvailability' | 'oneVisible'

export type Dataset = {
  label: string
  ranges: RangeSpec[]
  hangouts: Hangout[]
  /** Friends the viewer has hidden. */
  hidden: string[]
}

export const DATASETS: Record<DatasetKey, Dataset> = {
  normal: { label: 'Normal week', ranges: BASE_RANGES, hangouts: HANGOUTS, hidden: [] },
  long: {
    label: 'Long list',
    ranges: [...BASE_RANGES, ...LONG_TAIL],
    hangouts: HANGOUTS,
    hidden: [],
  },
  noOverlap: {
    label: 'Empty · nothing overlaps',
    ranges: [
      { friendId: 'marco', day: 1, from: 19, to: 22 },
      { friendId: 'sara', day: 2, from: 10, to: 13 },
      { friendId: 'luca', day: 4, from: 20, to: 22 },
    ],
    hangouts: [],
    hidden: [],
  },
  noAvailability: {
    label: 'Empty · nobody has drawn',
    ranges: [{ friendId: 'marco', day: -3, from: 19, to: 22 }],
    hangouts: [],
    hidden: [],
  },
  oneVisible: {
    label: 'Empty · one Friend visible',
    ranges: BASE_RANGES,
    hangouts: HANGOUTS,
    hidden: ['sara', 'luca', 'nadia', 'teo', 'bea'],
  },
}

/* ------------------------------------------------------------------ *
 * The pipeline (ticket 09, steps 1–8).
 * ------------------------------------------------------------------ */

export const nowSlot = (now: number) => Math.floor(now / SLOT) * SLOT

export const computeCandidates = (
  dataset: Dataset,
  hidden: string[],
  now: number,
): Candidate[] => {
  const floor = nowSlot(now)
  const visible = new Set(FRIENDS.filter((f) => !hidden.includes(f.id)).map((f) => f.id))
  const live = dataset.hangouts.filter((h) => h.end > now)

  // 1 horizon · 2 visible · 3 blank the Hangouts (for everyone, not only Participants)
  const bySlot = new Map<number, string[]>()
  for (const { friendId, slot } of expand(dataset.ranges)) {
    if (slot < floor) continue
    if (!visible.has(friendId)) continue
    if (live.some((h) => slot >= h.start && slot < h.end)) continue
    const list = bySlot.get(slot) ?? []
    list.push(friendId)
    bySlot.set(slot, list)
  }

  // 4 sweep into atomic runs — does not break at midnight
  const slots = [...bySlot.keys()].sort((a, b) => a - b)
  type Run = { start: number; end: number; friends: string[] }
  const runs: Run[] = []
  for (const slot of slots) {
    const friends = bySlot.get(slot)!.slice().sort()
    const prev = runs[runs.length - 1]
    if (prev && prev.end === slot && prev.friends.join() === friends.join()) {
      prev.end = slot + SLOT
    } else {
      runs.push({ start: slot, end: slot + SLOT, friends })
    }
  }

  // 5 extend each run's Friend-set maximally
  const seen = new Map<string, Candidate>()
  runs.forEach((run, i) => {
    if (run.friends.length < 2) return
    const has = (r: Run) => run.friends.every((f) => r.friends.includes(f))
    let start = run.start
    let end = run.end
    for (let j = i - 1; j >= 0; j--) {
      const r = runs[j]!
      if (r.end !== start || !has(r)) break
      start = r.start
    }
    for (let j = i + 1; j < runs.length; j++) {
      const r = runs[j]!
      if (r.start !== end || !has(r)) break
      end = r.end
    }
    const key = `${start}|${end}|${run.friends.join(',')}`
    if (!seen.has(key)) seen.set(key, { key, start, end, friendIds: run.friends })
  })

  // 6 prune dominated
  const all = [...seen.values()]
  const kept = all.filter(
    (c) =>
      !all.some(
        (d) =>
          d.key !== c.key &&
          c.friendIds.every((f) => d.friendIds.includes(f)) &&
          c.start >= d.start &&
          c.end <= d.end,
      ),
  )

  // 7 sort: count desc → start asc → duration desc → friend ids
  return kept.sort(
    (a, b) =>
      b.friendIds.length - a.friendIds.length ||
      a.start - b.start ||
      b.end - b.start - (a.end - a.start) ||
      a.friendIds.join().localeCompare(b.friendIds.join()),
  )
}

/** Ticket 09: pinned while `end > now`, chronological, unaffected by hiding. */
export const pinnedHangouts = (dataset: Dataset, now: number) =>
  dataset.hangouts.filter((h) => h.end > now).sort((a, b) => a.start - b.start)

/* ------------------------------------------------------------------ *
 * The two rules the cards render.
 * ------------------------------------------------------------------ */

export const GROUP_SIZE = FRIENDS.length

/** ticket 09, overriding ticket 01. groupSize counts Hidden Friends too. */
export const glows = (count: number) => 2 * count > GROUP_SIZE

export const isEveryone = (count: number) => count === GROUP_SIZE

export type EmptyStateKey = 'tooFewVisible' | 'noAvailability' | 'noOverlap' | null

/** The three empty states, evaluated in ticket 09's order. */
export const emptyState = (
  dataset: Dataset,
  hidden: string[],
  now: number,
  candidates: Candidate[],
): EmptyStateKey => {
  if (candidates.length > 0) return null
  if (GROUP_SIZE - hidden.length < 2) return 'tooFewVisible'
  const floor = nowSlot(now)
  const any = expand(dataset.ranges).some(
    (s) => s.slot >= floor && !hidden.includes(s.friendId),
  )
  if (!any) return 'noAvailability'
  return 'noOverlap'
}

export const EMPTY_COPY: Record<Exclude<EmptyStateKey, null>, { title: string; action?: string }> =
  {
    tooFewVisible: {
      title: 'Show more friends to see when you can meet',
      action: 'Show everyone',
    },
    noAvailability: { title: 'Nobody’s free yet — draw your availability' },
    noOverlap: { title: 'No overlaps yet — nobody’s free at the same time' },
  }

/* ------------------------------------------------------------------ *
 * Formatting. Every card states its own date and time (no day headers).
 * ------------------------------------------------------------------ */

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const sameDay = (a: number, b: number) =>
  new Date(a).toDateString() === new Date(b).toDateString()

export const dayLabel = (t: number, now: number) => {
  const d = new Date(t)
  if (sameDay(t, now)) return 'Today'
  if (sameDay(t, now + 86400000)) return 'Tomorrow'
  const within = t - now < 6 * 86400000
  return within
    ? DAY_NAMES[d.getDay()]!
    : `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export const hhmm = (t: number) => {
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Cross-midnight ranges say so, because a bare "22:00–01:00" is a lie. */
export const timeRange = (start: number, end: number, now: number) => {
  const crosses = !sameDay(start, end - 1)
  return crosses ? `${hhmm(start)} – ${hhmm(end)} ${dayLabel(end, now).toLowerCase()}` : `${hhmm(start)} – ${hhmm(end)}`
}

export const duration = (start: number, end: number) => {
  const mins = Math.round((end - start) / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/** "Marco, Sara and Luca" — ticket 08's dialogs name people, never count them. */
export const nameList = (ids: string[]) => {
  const names = ids.map((id) => friendById(id).name)
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
