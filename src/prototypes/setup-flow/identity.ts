/**
 * PROTOTYPE — ticket 18: setup flow and profile editing. THROWAWAY.
 *
 * The colour/identity model ticket 11 decided, expressed as code and checked
 * against the real `blobatar@2.7.0` in this repo's node_modules.
 *
 * Everything in here is a pure function of the four values stored on a Friend:
 * `blobatar_seed`, `hue`, `tone`, `expression`. No resolved hex is stored.
 */
import { palette, traits } from 'blobatar'
import {
  happy,
  idle,
  sad,
  scared,
  sleepy,
  smug,
  surprised,
  thinking,
  unsure,
  wink,
  type Expression,
} from 'blobatar/expression'

/* ------------------------------------------------------------------ *
 * Tone — the six authored swatches, and the off-by-one that eats them
 * ------------------------------------------------------------------ */

/**
 * VERIFIED AGAINST THE LIBRARY, and it does not say what ticket 11 and the
 * research inventory (§5a) imply.
 *
 * `blobatar/src/color.ts` resolves a tone with
 *
 *     const toneAt = (v) => TONES.find(([edge]) => v < edge)?.[1] ?? TONES[0][1]
 *
 * so the numbers in that `TONES` table — 0.2, 0.36, 0.62, 0.8, 0.93, 1.0 — are
 * the **exclusive upper edge of each band**, not the swatch's own value.
 * Passing the table's number selects the *next* swatch along, and `tone: 1.0`
 * falls off the end and wraps to the *first* one.
 *
 * Measured at hue 210 (`palette(210, true, v).head`):
 *
 *   v = 0.20 → #c3dde2  pale neutral   (the table calls 0.20 "pastel")
 *   v = 0.36 → #00bcd3  mid            (the table calls 0.36 "pale neutral")
 *   v = 0.62 → #0097aa  deep           (the table calls 0.62 "mid")
 *   v = 0.80 → #66e9ff  bright         (the table calls 0.80 "deep")
 *   v = 0.93 → #213d42  ink            (the table calls 0.93 "bright")
 *   v = 1.00 → #8ce1f0  pastel  ← wraps. The table calls 1.0 "ink".
 *
 * So the six stored values must sit *inside* the bands, never on an edge. All
 * six swatches are reachable; only the addressing was wrong.
 */
export const TONE_SWATCHES = [
  { key: 'pastel', value: 0.1, label: 'Pastel', band: '[0.00, 0.20)' },
  { key: 'pale', value: 0.28, label: 'Pale', band: '[0.20, 0.36)' },
  { key: 'mid', value: 0.49, label: 'Mid', band: '[0.36, 0.62)' },
  { key: 'deep', value: 0.71, label: 'Deep', band: '[0.62, 0.80)' },
  { key: 'bright', value: 0.86, label: 'Bright', band: '[0.80, 0.93)' },
  { key: 'ink', value: 0.96, label: 'Ink', band: '[0.93, 1.00)' },
] as const

export type ToneKey = (typeof TONE_SWATCHES)[number]['key']

export const TONE_VALUES = TONE_SWATCHES.map((t) => t.value)

/** Which swatch a raw 0–1 tone lands in — the library's own band lookup. */
export const toneKeyFor = (value: number): ToneKey => {
  const edges = [0.2, 0.36, 0.62, 0.8, 0.93, 1.0]
  const index = edges.findIndex((edge) => value < edge)
  // `>= 1.0` wraps to the first swatch, exactly as `?? TONES[0]` does.
  return TONE_SWATCHES[index === -1 ? 0 : index]!.key
}

/** The canonical stored value for the swatch a raw tone lands in. */
export const snapTone = (value: number): number =>
  TONE_SWATCHES.find((t) => t.key === toneKeyFor(value))!.value

/* ------------------------------------------------------------------ *
 * Expression — ten, not fourteen
 * ------------------------------------------------------------------ */

/**
 * The ten untinted poses. `mad`, `love`, `shy` and `sick` are excluded because
 * they carry a `tint` that moves the rendered head/eye colours off
 * `palette(hue, true, tone)` — verified: those four are the only four whose
 * `.tint` is defined, and the only four whose rendered fills differ from the
 * untinted palette.
 */
export const EXPRESSIONS = [
  { key: 'idle', label: 'Idle', value: idle },
  { key: 'happy', label: 'Happy', value: happy },
  { key: 'sad', label: 'Sad', value: sad },
  { key: 'surprised', label: 'Surprised', value: surprised },
  { key: 'wink', label: 'Wink', value: wink },
  { key: 'sleepy', label: 'Sleepy', value: sleepy },
  { key: 'smug', label: 'Smug', value: smug },
  { key: 'unsure', label: 'Unsure', value: unsure },
  { key: 'scared', label: 'Scared', value: scared },
  { key: 'thinking', label: 'Thinking', value: thinking },
] as const

export type ExpressionKey = (typeof EXPRESSIONS)[number]['key']

export const expressionFor = (key: ExpressionKey): Expression =>
  EXPRESSIONS.find((e) => e.key === key)!.value

/* ------------------------------------------------------------------ *
 * The Friend's stored identity
 * ------------------------------------------------------------------ */

/** Exactly the four columns ticket 11 settled. No resolved hex. */
export type Identity = {
  blobatar_seed: string
  hue: number
  tone: number
  expression: ExpressionKey
}

export type Friend = Identity & { id: string; display_name: string }

/** A fresh seed. Shape only — colour never comes from here once materialised. */
export const newSeed = (): string =>
  `blob-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`

/* ------------------------------------------------------------------ *
 * Hue bias — a default, never a constraint
 * ------------------------------------------------------------------ */

/**
 * Ticket 11: "the initial hue at signup is biased away from hues already
 * taken. This is a default, not a constraint."
 *
 * Centre of the widest circular gap between taken hues, with a small jitter so
 * two Friends signing up into an empty Group do not both land on 0°. Nothing
 * downstream enforces it — the slider goes anywhere.
 */
export const biasedHue = (taken: number[], random = Math.random): number => {
  if (taken.length === 0) return Math.round(random() * 360)

  const sorted = [...taken].map((h) => ((h % 360) + 360) % 360).sort((a, b) => a - b)
  let bestStart = sorted[0]!
  let bestWidth = -1

  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i]!
    const next = sorted[(i + 1) % sorted.length]!
    const width = i === sorted.length - 1 ? next + 360 - start : next - start
    if (width > bestWidth) {
      bestWidth = width
      bestStart = start
    }
  }

  // Middle of the gap, jittered across its middle third.
  const jitter = (random() - 0.5) * (bestWidth / 3)
  return Math.round((((bestStart + bestWidth / 2 + jitter) % 360) + 360) % 360)
}

/** Angular distance to the nearest taken hue, 0–180. Used only to explain. */
export const nearestTakenDistance = (hue: number, taken: number[]): number =>
  taken.length === 0
    ? 180
    : Math.min(...taken.map((t) => Math.min(Math.abs(hue - t), 360 - Math.abs(hue - t))))

/**
 * Step 1's randomise. **Materialises** hue and tone into values rather than
 * leaving them null — ticket 11 is explicit that skipping this makes the next
 * reroll move the colour.
 *
 * The seed's own hue/tone are read through the public `traits()` and then
 * written down, so the first blobatar a Friend sees is the one the seed would
 * have produced — but from now on it is *stored*, and reroll cannot move it.
 */
export const materialise = (taken: number[], random = Math.random): Identity => {
  const seed = newSeed()
  const t = traits(seed)
  const seedHue = t.num('hue', 0, 360)
  const biased = biasedHue(taken, random)

  return {
    blobatar_seed: seed,
    // The seed's hue is only a starting point; the bias is what actually lands
    // in the column. Both are materialised either way.
    hue: taken.length === 0 ? Math.round(seedHue) : biased,
    tone: snapTone(t('tone')),
    expression: 'idle',
  }
}

/* ------------------------------------------------------------------ *
 * The two colour paths
 * ------------------------------------------------------------------ */

/** What the blobatar itself is drawn in. Library-owned. */
export const avatarColours = (id: Pick<Identity, 'hue' | 'tone'>) =>
  palette(id.hue, true, id.tone) as { bg: string; head: string; eye: string }

/**
 * Every *non-avatar* use of a Friend's colour: `oklch(L_theme, C_theme, hue)`.
 *
 * The two constants per theme are PROTOTYPE PLACEHOLDERS. Ticket 11 fixes the
 * form and says only `hue` varies; ticket 15's opacity ramp and ticket 16's
 * glow are what actually pin the numbers down.
 */
export const UI_COLOUR_CONSTANTS = {
  light: { l: 0.58, c: 0.15 },
  dark: { l: 0.74, c: 0.14 },
} as const

export const uiColour = (hue: number, theme: 'light' | 'dark'): string => {
  const { l, c } = UI_COLOUR_CONSTANTS[theme]
  return `oklch(${l} ${c} ${hue})`
}

/* ------------------------------------------------------------------ *
 * The Group as it stands when a new Friend arrives
 * ------------------------------------------------------------------ */

export const EXISTING_FRIENDS: Friend[] = [
  {
    id: 'f1',
    display_name: 'Nadia',
    blobatar_seed: 'nadia-8fk2',
    hue: 18,
    tone: 0.49,
    expression: 'happy',
  },
  {
    id: 'f2',
    display_name: 'Tom',
    blobatar_seed: 'tom-x41q',
    hue: 96,
    tone: 0.71,
    expression: 'smug',
  },
  {
    id: 'f3',
    display_name: 'Priya',
    blobatar_seed: 'priya-2wbn',
    hue: 148,
    tone: 0.28,
    expression: 'idle',
  },
  {
    id: 'f4',
    display_name: 'Marek',
    blobatar_seed: 'marek-p07d',
    hue: 262,
    tone: 0.96,
    expression: 'sleepy',
  },
]

export const TAKEN_HUES = EXISTING_FRIENDS.map((f) => f.hue)
