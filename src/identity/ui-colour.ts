/**
 * A Friend's colour, everywhere except the blobatar itself.
 *
 *     oklch(L_theme, C_theme, hue)
 *
 * Two constants per theme; only `hue` varies between Friends (ticket 11). This
 * covers the three places a per-Friend colour still appears after ticket 15 —
 * the grid heatmap base (which is the *viewer's* colour), the Candidate glow
 * border, and the sidebar row. The blobatar is drawn by blobatar's own
 * `palette(hue, true, tone)` instead, and the two deliberately differ in
 * lightness while sharing hue: see `identity.ts`.
 *
 * ## Why `C_theme` is computed here rather than written down
 *
 * The scheme's whole selling point is uniform perceived contrast across all
 * 360°, and it only holds if `oklch(L C h)` is *renderable* at every hue.
 * sRGB's gamut is lumpy, so it is not: ticket 16 measured `oklch(0.62 0.15 h)`
 * arriving at C = 0.105 around hue 200 — about 30% duller than hue 25 — because
 * the browser gamut-maps in silence and reports nothing. A chroma picked by eye
 * does not fail loudly; it just makes some Friends quietly duller than others,
 * which is the exact failure this scheme exists to prevent.
 *
 * So the constant is the largest one every hue can actually hold:
 *
 *     C_theme = min over all h of maxChroma(L_theme, h)
 *
 * evaluated below, once, at module load. Nothing in this file is a measured
 * number typed back in — change `L_THEME` and the chroma follows.
 */

/* ------------------------------------------------------------------ *
 * The sRGB gamut boundary
 * ------------------------------------------------------------------ */

/**
 * OKLCh → linear sRGB, via OKLab (Björn Ottosson's matrices).
 *
 * Linear rather than gamma-encoded on purpose: the gamut test is whether each
 * channel lands in [0, 1], and that is true of the linear values before the
 * transfer function, which is monotonic and so cannot move a channel across
 * either boundary.
 */
const oklchToLinearSrgb = (l: number, c: number, hueDegrees: number): [number, number, number] => {
  const h = (hueDegrees * Math.PI) / 180
  const a = c * Math.cos(h)
  const b = c * Math.sin(h)

  const lc = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const mc = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const sc = (l - 0.0894841775 * a - 1.291485548 * b) ** 3

  return [
    4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
    -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
    -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
  ]
}

/** Slack for the binary search's own arithmetic, not a tolerance for clipping. */
const GAMUT_EPSILON = 1e-6

export const isInSrgbGamut = (l: number, c: number, hue: number): boolean =>
  oklchToLinearSrgb(l, c, hue).every((v) => v >= -GAMUT_EPSILON && v <= 1 + GAMUT_EPSILON)

const BISECTIONS = 40

/**
 * The largest chroma sRGB can hold at this lightness and hue.
 *
 * Binary search rather than an analytic solve: the boundary is the intersection
 * of a cubic with a cube, the search is 40 iterations of nine multiplications,
 * and it runs 1440 times per theme at startup. Closed form would be faster and
 * much harder to check against a browser.
 */
export const maxChroma = (l: number, hue: number): number =>
  // `reduce` over a fixed count rather than a loop, per the repo's coding
  // style. The bracket is the accumulator: 0.5 starts above any sRGB chroma at
  // any lightness, and each step keeps whichever half still contains the edge.
  Array.from({ length: BISECTIONS }).reduce<{ low: number; high: number }>(
    ({ low, high }) => {
      const mid = (low + high) / 2
      return isInSrgbGamut(l, mid, hue) ? { low: mid, high } : { low, high: mid }
    },
    { low: 0, high: 0.5 }
  ).low

/**
 * `min over all h of maxChroma(l, h)` — the chroma every hue can hold.
 *
 * The quarter-degree step is not arbitrary: the minimum sits in a smooth
 * trough (around hue 200 at the lightnesses below, which is where ticket 16
 * found it), so a coarser sweep would land near the floor and slightly above
 * it, and slightly above the floor is the clipping case. Erring fine costs
 * milliseconds once.
 */
export const minChromaOverHueCircle = (l: number, step = 0.25): number =>
  hueCircle(step).reduce((min, hue) => Math.min(min, maxChroma(l, hue)), Infinity)

/**
 * Every hue on the circle at `step` degrees, starting at 0.
 *
 * Shared with the tests, which sweep the same circle to assert that the
 * constants this module computes are renderable everywhere on it — two sweeps
 * that disagreed about which hues they covered would be a hole in that check.
 */
export const hueCircle = (step: number): number[] =>
  Array.from({ length: Math.ceil(360 / step) }, (_, i) => i * step)

/* ------------------------------------------------------------------ *
 * The two constants per theme
 * ------------------------------------------------------------------ */

/**
 * The lightnesses, which are a design choice rather than a derivation — this is
 * the one pair of numbers here that a human picked.
 *
 * They are the two ticket 16 measured its gamut findings at, and the two whose
 * resulting chromas ticket 11's amendment quotes ("≈0.105 in light and ≈0.128
 * in dark"). Reusing them means the computation below is checkable against an
 * independent measurement instead of only against itself — and it agrees, to
 * three decimals, which is the strongest evidence available that the matrices
 * above are right.
 *
 * Light is the darker of the two because the colour sits on a near-white
 * surface and dark on a near-black one. 0.75 is also close to where
 * `minChromaOverHueCircle` peaks (it falls away above ~0.77, where the blue
 * corner of the gamut starts to bind instead of the cyan one), so the dark
 * theme gets very nearly the most saturated iso-chroma ring sRGB has.
 */
export const L_THEME = { light: 0.62, dark: 0.75 } as const

/**
 * Computed, once, at module load. ~1440 binary searches — under a millisecond,
 * and it happens while the bundle is still evaluating.
 */
export const C_THEME = {
  light: minChromaOverHueCircle(L_THEME.light),
  dark: minChromaOverHueCircle(L_THEME.dark),
} as const

/* ------------------------------------------------------------------ *
 * Reaching them from CSS
 * ------------------------------------------------------------------ */

/**
 * The constants as CSS custom properties, so a Friend's colour switches theme
 * without any code asking which theme is on.
 *
 * That question has no good answer in JavaScript here. The app has no theme
 * state — light and dark are the `.dark` class and the stylesheet, and ticket
 * 18 ruled out putting a theme switch in the profile menu because light/dark is
 * not a Friend column. So `friendColour()` returns a colour whose lightness and
 * chroma are `var()`s and whose hue is the only literal, and the cascade
 * resolves the theme the same way it resolves `--border`.
 *
 * Injected rather than written into `index.css` because the numbers are
 * computed above and two copies of a constant is one copy too many: a hand-kept
 * `--friend-c: 0.105` in the stylesheet would be exactly the eyeballed
 * constant this file exists to eliminate, and it would drift the first time
 * `L_THEME` moved.
 */
const TOKEN_STYLE_ID = 'friend-colour-tokens'

const friendColourTokensCss = (): string =>
  [
    `:root { --friend-l: ${L_THEME.light}; --friend-c: ${C_THEME.light}; }`,
    `.dark { --friend-l: ${L_THEME.dark}; --friend-c: ${C_THEME.dark}; }`,
  ].join('\n')

/**
 * Call once, at startup, before the first render. Idempotent.
 *
 * `friendColour()` is meaningless until this has run — an `oklch()` with an
 * undefined `var()` in it is invalid at computed-value time, which paints the
 * inherited colour rather than throwing. Hence one call site, in `main.tsx`,
 * next to the stylesheet import.
 */
export const installFriendColourTokens = (): void => {
  const existing = document.getElementById(TOKEN_STYLE_ID)
  const style = existing instanceof HTMLStyleElement ? existing : document.createElement('style')
  style.id = TOKEN_STYLE_ID
  style.textContent = friendColourTokensCss()
  if (!existing) document.head.appendChild(style)
}

/* ------------------------------------------------------------------ *
 * The colour itself
 * ------------------------------------------------------------------ */

/**
 * A Friend's UI colour, as a CSS colour usable anywhere a colour is.
 *
 * Every non-avatar use of a Friend's colour comes from here — the sidebar row
 * (issue 04), the heatmap wash (issue 07), the Candidate glow (issue 08).
 * Never from blobatar's `head`: that carries the tone's lightness, which is
 * free per Friend, and the whole point of this model is that lightness is not.
 */
export const friendColour = (hue: number): string => `oklch(var(--friend-l) var(--friend-c) ${hue})`

/**
 * The same colour at partial opacity, for a wash or a glow.
 *
 * `color-mix` rather than an alpha slot in the `oklch()` because the hue is the
 * only literal in that function and an alpha would have to be one too; this
 * keeps a single spelling of the colour.
 */
export const friendColourAlpha = (hue: number, alpha: number): string =>
  `color-mix(in oklab, ${friendColour(hue)} ${Math.round(alpha * 100)}%, transparent)`
