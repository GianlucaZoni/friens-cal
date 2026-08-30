/** PROTOTYPE — ticket 12. THROWAWAY. Fake data, enough to give the shell density. */

export type Friend = {
  id: string
  name: string
  /** 0–360, continuous. The only per-Friend colour input (ticket 11). */
  hue: number
  /** 0–1 swatch position. Drives the blobatar only — never the UI colour. */
  tone: number
  /** CONTEXT.md: "The sidebar marks Friends who are entirely silent." */
  silent?: boolean
}

/**
 * Ticket 11: every non-avatar use of a Friend's colour is `oklch(L_theme,
 * C_theme, hue)` — two constants per theme, only hue varying. The two constants
 * live as CSS custom properties on the shell root so the light and dark values
 * are one `dark:` variant apart instead of two branches in JS. That is the whole
 * point of the decision: nothing to clamp, nothing to correct at render time.
 */
export const friendColor = (hue: number) => `oklch(var(--friend-l) var(--friend-c) ${hue})`

/** Same hue, a wash — for row hovers and fills that sit behind text. */
export const friendWash = (hue: number) =>
  `oklch(var(--friend-l) var(--friend-c) ${hue} / var(--friend-wash))`

export const FRIENDS: Friend[] = [
  { id: 'gz', name: 'Gianluca', hue: 262, tone: 0.62 },
  { id: 'ml', name: 'Marta', hue: 24, tone: 0.8 },
  { id: 'st', name: 'Stefano', hue: 148, tone: 0.62 },
  { id: 'ch', name: 'Chiara', hue: 328, tone: 0.93 },
  { id: 'da', name: 'Davide', hue: 88, tone: 0.62 },
  { id: 'el', name: 'Elena', hue: 205, tone: 0.8 },
  { id: 'fr', name: 'Francesco', hue: 44, tone: 0.36, silent: true },
]

/** The viewer. The top-right blobatar is theirs. */
export const ME = FRIENDS[0]!

/** Right-sidebar stubs. Ticket 16 owns what these actually look like. */
export type CardStub = {
  id: string
  when: string
  range: string
  friendIds: string[]
  title?: string
  everyone?: boolean
}

export const PINNED_HANGOUTS: CardStub[] = [
  { id: 'h1', when: 'Sat 6 Sep', range: '20:00 – 23:30', friendIds: ['gz', 'ml', 'st', 'ch'], title: 'Pizza' },
  { id: 'h2', when: 'Wed 10 Sep', range: '19:00 – 21:00', friendIds: ['gz', 'da'] },
]

export const CANDIDATES: CandidateStub[] = [
  { id: 'c1', when: 'Tue 2 Sep', range: '18:30 – 22:00', friendIds: ['gz', 'ml', 'st', 'ch', 'da', 'el'], everyone: true },
  { id: 'c2', when: 'Thu 4 Sep', range: '21:00 – 23:00', friendIds: ['ml', 'st', 'ch', 'da'] },
  { id: 'c3', when: 'Fri 5 Sep', range: '19:30 – 22:30', friendIds: ['gz', 'ch', 'el'] },
  { id: 'c4', when: 'Sun 7 Sep', range: '11:00 – 14:00', friendIds: ['gz', 'st', 'da'] },
  { id: 'c5', when: 'Mon 8 Sep', range: '20:00 – 21:30', friendIds: ['ml', 'el'] },
  { id: 'c6', when: 'Tue 9 Sep', range: '18:00 – 19:30', friendIds: ['st', 'ch'] },
  { id: 'c7', when: 'Fri 12 Sep', range: '22:00 – 23:59', friendIds: ['gz', 'ml'] },
]

export type CandidateStub = CardStub

export const byId = (id: string) => FRIENDS.find((f) => f.id === id)!
