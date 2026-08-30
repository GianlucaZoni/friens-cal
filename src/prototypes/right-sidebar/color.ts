/**
 * PROTOTYPE — ticket 16, the right sidebar. THROWAWAY.
 *
 * The Friend colour model settled in ticket 11: every non-avatar use of a
 * Friend's colour is `oklch(L_theme, C_theme, hue)` — two constants per theme,
 * only `hue` varying. Nothing here reads blobatar's palette.
 */

/**
 * The two constants per theme. Ticket 11 fixed the *form*, not the numbers;
 * these are this prototype's proposal and the thing the human is being asked
 * to look at.
 */
export const UI_TONE = {
  light: { l: 0.62, c: 0.15 },
  dark: { l: 0.75, c: 0.145 },
} as const

export type Theme = 'light' | 'dark'

/** A Friend's UI colour. The only per-Friend input is `hue`. */
export const friendColor = (hue: number, theme: Theme) => {
  const { l, c } = UI_TONE[theme]
  return `oklch(${l} ${c} ${hue})`
}

/** Same hue, dialled back — used for the non-glowing border experiment. */
export const friendColorMuted = (hue: number, theme: Theme, alpha = 0.45) => {
  const { l, c } = UI_TONE[theme]
  return `oklch(${l} ${c} ${hue} / ${alpha})`
}

/* ------------------------------------------------------------------ *
 * Gamut check.
 *
 * The claim under test from ticket 11 is "uniform perceived contrast across
 * all 360°, by construction". That only holds if `oklch(L C h)` is actually
 * *renderable* at every hue. It is not: sRGB's gamut is lumpy, and a constant
 * chroma that survives at hue 265 is out of gamut at hue 85. The browser then
 * gamut-maps, silently reducing chroma — so iso-chroma is an aspiration, not a
 * guarantee. This computes how far each hue is over the line.
 * ------------------------------------------------------------------ */

const OKLAB_TO_LMS = [
  [1, 0.3963377774, 0.2158037573],
  [1, -0.1055613458, -0.0638541728],
  [1, -0.0894841775, -1.291485548],
]

const LMS_TO_RGB = [
  [4.0767416621, -3.3077115913, 0.2309699292],
  [-1.2684380046, 2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147, 1.707614701],
]

/** Linear-light sRGB for an oklch triple. Values outside 0..1 are out of gamut. */
export const oklchToLinearRgb = (l: number, c: number, h: number) => {
  const hr = (h * Math.PI) / 180
  const lab = [l, c * Math.cos(hr), c * Math.sin(hr)]
  const lms = OKLAB_TO_LMS.map((row) => row[0]! * lab[0]! + row[1]! * lab[1]! + row[2]! * lab[2]!)
  const cubed = lms.map((v) => v * v * v)
  return LMS_TO_RGB.map((row) => row[0]! * cubed[0]! + row[1]! * cubed[1]! + row[2]! * cubed[2]!)
}

/** How far out of sRGB `oklch(l c h)` is. 0 means renderable as asked. */
export const gamutError = (l: number, c: number, h: number) => {
  const rgb = oklchToLinearRgb(l, c, h)
  return Math.max(0, ...rgb.map((v) => Math.max(-v, v - 1)))
}

/** The largest chroma sRGB can actually show at this lightness and hue. */
export const maxChroma = (l: number, h: number) => {
  let lo = 0
  let hi = 0.45
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (gamutError(l, mid, h) > 0) hi = mid
    else lo = mid
  }
  return lo
}

/* ------------------------------------------------------------------ *
 * Border geometry.
 *
 * Three techniques, all built from the same list of colours.
 *
 * `ring` is an SVG overlay rather than a conic-gradient because a conic
 * distributes by *angle*, and on a 300x84 card equal angles are wildly
 * unequal lengths — the two side segments end up hairlines. `pathLength="100"`
 * on the rect makes `stroke-dasharray` units percentages of the perimeter, so
 * the segments come out even at any card size with no measurement at all.
 * ------------------------------------------------------------------ */

export type BorderTechnique = 'ring' | 'bar' | 'stripe'

export type RingSegment = { color: string; dash: string; offset: number }

/** Even perimeter segments, starting at the top-left corner, clockwise. */
export const ringSegments = (colors: string[]): RingSegment[] => {
  const n = Math.max(1, colors.length)
  const len = 100 / n
  return colors.map((color, i) => ({
    color,
    // a hair of overlap, or antialiasing leaves a background-coloured seam
    dash: `${len + 0.35} ${100 - len - 0.35}`,
    offset: -i * len,
  }))
}

/** Hard-stop linear gradient — no blending, which is the whole point. */
export const hardStops = (colors: string[], direction: string) => {
  const n = Math.max(1, colors.length)
  const stops = colors
    .map((c, i) => `${c} ${(i / n) * 100}% ${((i + 1) / n) * 100}%`)
    .join(', ')
  return `linear-gradient(${direction}, ${stops})`
}
