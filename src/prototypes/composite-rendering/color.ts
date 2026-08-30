/**
 * PROTOTYPE — throwaway. Ticket 05, composite Availability rendering.
 *
 * Colour model per ticket 01 Corrections: a Friend's colour is a pure function
 * of `hue` (0-360) and `tone` (0-1). Blobatar is NOT installed here, so this
 * re-implements the published TONES ramp from blobatar 2.7.0 `src/color.ts`
 * (quoted in research/base-lyra-component-inventory.md §5a) in `oklch()`.
 *
 * Lightness and chroma are authored constants; hue is the only free axis.
 */

/** blobatar 2.7.0 TONES, verbatim. */
export const TONES: [number, { l: number; c: number }][] = [
  [0.2, { l: 0.86, c: 0.085 }], // pastel
  [0.36, { l: 0.9, c: 0.028 }], // pale neutral
  [0.62, { l: 0.73, c: 0.135 }], // mid
  [0.8, { l: 0.62, c: 0.165 }], // deep
  [0.93, { l: 0.87, c: 0.16 }], // bright
  [1.0, { l: 0.34, c: 0.035 }], // ink
]

export const toneName = (tone: number) =>
  ['pastel', 'pale neutral', 'mid', 'deep', 'bright', 'ink'][
    TONES.findIndex(([t]) => t === nearestTone(tone))
  ] ?? 'mid'

function nearestTone(tone: number) {
  let best = TONES[0][0]
  let dist = Infinity
  for (const [t] of TONES) {
    const d = Math.abs(t - tone)
    if (d < dist) {
      dist = d
      best = t
    }
  }
  return best
}

export function ramp(tone: number) {
  const hit = TONES.find(([t]) => t === nearestTone(tone))
  return hit ? hit[1] : TONES[2][1]
}

/** The Friend's block colour. `alpha` 0..1. */
export function hueToneColor(hue: number, tone: number, alpha = 1) {
  const { l, c } = ramp(tone)
  return `oklch(${l} ${c} ${hue} / ${alpha})`
}

/**
 * Same colour, nudged toward legibility on the current surface. Used only by
 * the "assisted" toggle so the human can see how much the raw hue+tone model
 * costs versus one that clamps lightness per theme.
 */
export function hueToneColorAssisted(hue: number, tone: number, alpha: number, dark: boolean) {
  const { l, c } = ramp(tone)
  const clamped = dark ? Math.max(l, 0.6) : Math.min(l, 0.72)
  const chroma = Math.max(c, 0.09)
  return `oklch(${clamped} ${chroma} ${hue} / ${alpha})`
}
