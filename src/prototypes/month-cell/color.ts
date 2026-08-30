/**
 * PROTOTYPE — throwaway. Ticket 14, month cell.
 *
 * Two colour systems live here, and keeping them apart is the whole point.
 *
 * 1. `uiColour(hue, dark)` — ticket 11's settled model. `oklch(L_theme,
 *    C_theme, hue)`: two constants per theme, only hue varies between Friends.
 *    Iso-lightness and iso-chroma by construction, so every Friend is equally
 *    visible at every size in both themes. This is what the grid heatmap, the
 *    Candidate glow and the sidebar row use.
 *
 * 2. `avatarColour(hue, tone, dark)` — what a *blobatar* actually renders as,
 *    via blobatar's own six authored tones. Lightness varies wildly (l .34 for
 *    `ink`, l .90 for `pale neutral`), which is exactly why ticket 15 threw it
 *    out of the grid.
 *
 * The month-cell dot row is the one place the two collide: a dot is supposed
 * to be a miniature blobatar (system 2) but has to survive as a 8px mark on a
 * calendar (system 1). The `dotColour` toggle in the prototype flips between
 * them so the human can see the cost of each.
 *
 * L/C constants below are MINE, not the ticket's — ticket 11 settled the
 * *shape* `oklch(L_theme, C_theme, hue)` and left the numbers open.
 */

/** Ticket 11's UI colour. Two constants per theme, hue is the only free axis. */
export const UI_L = { light: 0.58, dark: 0.74 }
export const UI_C = { light: 0.152, dark: 0.132 }

export function uiColour(hue: number, dark: boolean, alpha = 1) {
  const l = dark ? UI_L.dark : UI_L.light
  const c = dark ? UI_C.dark : UI_C.light
  return `oklch(${l} ${c} ${hue} / ${alpha})`
}

/**
 * blobatar 2.7.0 TONES, verbatim — but read the way blobatar reads them.
 *
 * **The numbers are band UPPER EDGES, not values.** blobatar resolves a tone
 * with `TONES.find(([edge]) => v < edge) ?? TONES[0]`, so `0.62` lands in the
 * *deep* band, not *mid*, and `1.0` falls off the end and wraps to *pastel*,
 * not *ink*. Ticket 05's prototype (and this one, at first) used a
 * nearest-number lookup and therefore rendered the wrong swatch for every
 * Friend — including disarming the two contrast landmines it was built to
 * demonstrate. Verified against the installed `blobatar@2.7.0`, not assumed.
 *
 * Friends in `data.ts` consequently store band *interiors*, not edges.
 */
export const TONES: [number, { l: number; c: number }, string][] = [
  [0.2, { l: 0.86, c: 0.085 }, 'pastel'],
  [0.36, { l: 0.9, c: 0.028 }, 'pale neutral'],
  [0.62, { l: 0.73, c: 0.135 }, 'mid'],
  [0.8, { l: 0.62, c: 0.165 }, 'deep'],
  [0.93, { l: 0.87, c: 0.16 }, 'bright'],
  [1.0, { l: 0.34, c: 0.035 }, 'ink'],
]

/** The midpoint of each band — the value to STORE if you want that swatch. */
export const TONE_VALUES = {
  pastel: 0.1,
  paleNeutral: 0.28,
  mid: 0.49,
  deep: 0.71,
  bright: 0.86,
  ink: 0.96,
} as const

/** blobatar's own lookup: first band whose upper edge the value is under. */
const toneAt = (tone: number) => TONES.find(([edge]) => tone < edge) ?? TONES[0]

export const toneName = (tone: number) => toneAt(tone)[2]

/** Roughly the blobatar's own head colour. Lightness is NOT clamped — on purpose. */
export function avatarColour(hue: number, tone: number, _dark: boolean, alpha = 1) {
  const { l, c } = toneAt(tone)[1]
  return `oklch(${l} ${c} ${hue} / ${alpha})`
}

/**
 * Ticket 15's heatmap ramp, reused for the month cell's density wash. Base is
 * the VIEWER's own hue; opacity is the only thing that moves.
 *
 * Two constants per theme, tuned by eye against `--card`. Ticket 15 explicitly
 * says one ramp still needs tuning twice — this is that.
 */
export const WASH = {
  light: { min: 0.07, max: 0.62 },
  dark: { min: 0.1, max: 0.5 },
}

export function washColour(viewerHue: number, t: number, dark: boolean) {
  const { min, max } = dark ? WASH.dark : WASH.light
  const clamped = Math.max(0, Math.min(1, t))
  if (clamped <= 0) return 'transparent'
  return uiColour(viewerHue, dark, min + (max - min) * clamped)
}
