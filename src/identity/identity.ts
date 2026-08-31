/**
 * A Friend's identity: the four values stored on their row, and the pure
 * functions over them.
 *
 * Everything here is a function of `blobatar_seed`, `hue`, `tone` and
 * `expression`. **No resolved hex is ever stored** (ticket 11): a stored colour
 * could not adapt to theme, and there are two derived colours per Friend per
 * theme, so one column would be wrong in three cases out of four — and it would
 * go stale in silence the day blobatar's authored constants moved.
 *
 * The two colour paths are deliberately separate. The blobatar is drawn by the
 * library, through `palette(hue, true, tone)`. Everything else is ours, through
 * `friendColour(hue)` in `ui-colour.ts`. They share a hue and differ in
 * lightness, which is the accepted divergence ticket 11 names: hue carries
 * recognition, lightness never did.
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
import { maxBy } from 'lodash-es'

/* ------------------------------------------------------------------ *
 * Tone — six swatches, addressed by band interior
 * ------------------------------------------------------------------ */

/**
 * The six values a client may write to `friend.tone`, and the only six.
 *
 * **blobatar's published `TONES` numbers are band UPPER EDGES, not swatch
 * values.** It resolves a tone with
 *
 *     TONES.find(([edge]) => v < edge)?.[1] ?? TONES[0][1]
 *
 * — strictly less than, against the top of each band. So passing the table's
 * own number selects the *next* swatch along: `0.2` gives pale neutral rather
 * than pastel, `0.62` gives deep rather than mid, and `1.0` falls off the
 * `find` entirely and wraps to the *first* swatch, which is the opposite end of
 * the scale from the ink anyone typing `1.0` was reaching for. The library's own
 * docs say "reach for ink with 0.999".
 *
 * These are band interiors, so each one lands on the swatch it is named after.
 * `supabase/01-friend.sql` constrains the column to exactly this set — not to
 * `0..1` — so a wrong value is rejected by Postgres rather than rendering as
 * somebody else's colour.
 */
export const TONE_SWATCHES = [
  { key: 'pastel', value: 0.1, label: 'Pastel' },
  { key: 'pale', value: 0.28, label: 'Pale' },
  { key: 'mid', value: 0.49, label: 'Mid' },
  { key: 'deep', value: 0.71, label: 'Deep' },
  { key: 'bright', value: 0.86, label: 'Bright' },
  { key: 'ink', value: 0.96, label: 'Ink' },
] as const

export type ToneKey = (typeof TONE_SWATCHES)[number]['key']

/** blobatar's band edges, reproduced so a raw trait tone can be placed. */
const TONE_BAND_EDGES = [0.2, 0.36, 0.62, 0.8, 0.93, 1.0] as const

/** Which swatch a raw 0–1 tone renders as, by the library's own lookup. */
export const toneKeyFor = (value: number): ToneKey => {
  const index = TONE_BAND_EDGES.findIndex((edge) => value < edge)
  // `>= 1.0` wraps to the first swatch, exactly as `?? TONES[0]` does.
  return TONE_SWATCHES[index === -1 ? 0 : index]!.key
}

/** The storable value for the swatch a raw tone renders as. */
export const snapTone = (value: number): number =>
  TONE_SWATCHES.find((t) => t.key === toneKeyFor(value))!.value

/* ------------------------------------------------------------------ *
 * Expression — ten of the fourteen
 * ------------------------------------------------------------------ */

/**
 * The ten untinted poses. `mad`, `love`, `shy` and `sick` are excluded, and the
 * reason is not the colour divergence itself but its route: under them,
 * **changing your face would silently recolour your entire grid**, which is a
 * startling outcome for a control that looks like picking an emoji. Colour is a
 * property of a person, not of their mood (ticket 11).
 *
 * The prop is `Expression`, an **object** — imported above, never the pose's
 * name as a string. Over HTTP an expression is a string and in React it is a
 * value, and two prototypes independently shipped
 * `Type 'string' is not assignable to type 'Expression'` on that difference.
 * `expressionFor` is the only crossing between the two, and the stored column
 * is the string form.
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

const EXPRESSION_KEYS: readonly string[] = EXPRESSIONS.map((e) => e.key)

export const isExpressionKey = (value: string): value is ExpressionKey =>
  EXPRESSION_KEYS.includes(value)

/** The stored string → the object the React prop wants. */
export const expressionFor = (key: ExpressionKey): Expression =>
  EXPRESSIONS.find((e) => e.key === key)!.value

/* ------------------------------------------------------------------ *
 * The identity
 * ------------------------------------------------------------------ */

/** Exactly the four columns ticket 11 settled, all non-null. */
export type Identity = {
  blobatar_seed: string
  hue: number
  tone: number
  expression: ExpressionKey
}

/** A fresh seed. Shape only, once step 1 has materialised hue and tone. */
export const newSeed = (): string =>
  `blob-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`

/* ------------------------------------------------------------------ *
 * The hue bias — a default, never a constraint
 * ------------------------------------------------------------------ */

/**
 * A starting hue biased away from the ones already taken.
 *
 * The centre of the widest circular gap between taken hues, jittered across
 * that gap's middle third so two Friends signing up minutes apart into the same
 * Group do not land on the same degree.
 *
 * **This is a default and nothing enforces it.** Collisions are settled as
 * acceptable — hue is continuous and free, and the blobatar's shape is what
 * disambiguates — so the slider in step 2 moves anywhere, including straight
 * onto someone else's hue. What the bias forbids is only the thing an
 * *assignment* scheme would do: change a Friend's colour as the Group grows.
 */
export const biasedHue = (taken: readonly number[], random: () => number = Math.random): number => {
  if (taken.length === 0) return Math.round(random() * 360) % 360

  const sorted = [...taken].map((h) => ((h % 360) + 360) % 360).sort((a, b) => a - b)

  // Every gap between consecutive taken hues, the last one wrapping through
  // 360°. A single taken hue's "gap" is the whole circle back to itself, which
  // this gets right for free.
  const gaps = sorted.map((start, i) => {
    const next = sorted[(i + 1) % sorted.length]!
    return { start, width: i === sorted.length - 1 ? next + 360 - start : next - start }
  })

  const widest = maxBy(gaps, (gap) => gap.width)!
  const jitter = (random() - 0.5) * (widest.width / 3)
  return Math.round((((widest.start + widest.width / 2 + jitter) % 360) + 360) % 360) % 360
}

/** Angular distance to the nearest taken hue, 0–180. Used only to explain. */
export const nearestTakenDistance = (hue: number, taken: readonly number[]): number =>
  taken.length === 0
    ? 180
    : Math.min(...taken.map((t) => Math.min(Math.abs(hue - t), 360 - Math.abs(hue - t))))

/**
 * Step 1's randomise. **Materialises** hue and tone as numbers rather than
 * leaving them null.
 *
 * That is load-bearing, not tidiness. blobatar derives colour from the seed
 * with `opts.hue ?? t.num('hue', 0, 360)`, so a Friend whose columns are null
 * has a colour that comes from their seed — and the first reroll in step 2
 * would move it. Written down, the seed never reaches the colour path again and
 * reroll can only change shape. The ticket 18 prototype measured both halves of
 * that: four seeds at a fixed hue and tone render byte-identical fills, and the
 * same four seeds with no explicit hue and tone give four unrelated colours.
 * `identity.test.ts` keeps it measured.
 *
 * The seed's own tone is read through the public `traits()` and snapped to the
 * swatch it renders as, so the first blob a Friend sees is the one their seed
 * would have produced. Its hue is *not* used when the Group is non-empty: the
 * bias is the better default, and both end up in columns either way.
 */
export const materialise = (
  taken: readonly number[],
  random: () => number = Math.random
): Identity => {
  const seed = newSeed()
  const t = traits(seed)

  return {
    blobatar_seed: seed,
    hue: taken.length === 0 ? Math.round(t.num('hue', 0, 360)) % 360 : biasedHue(taken, random),
    tone: snapTone(t('tone')),
    expression: 'idle',
  }
}

/* ------------------------------------------------------------------ *
 * The avatar's own colours
 * ------------------------------------------------------------------ */

/** What the blobatar is drawn in. Library-owned — never the UI colour. */
export type AvatarPalette = { bg: string; head: string; eye: string }

/**
 * `palette` is typed `Partial<Record<ColorKey, string>>` because a caller may
 * override individual slots, so all three arrive optional. We override nothing,
 * and the library fills all three — but the fallbacks are here rather than a
 * cast, because a cast would turn a future missing slot into `undefined`
 * reaching CSS as the string "undefined".
 */
export const avatarPalette = (hue: number, tone: number): AvatarPalette => {
  const p = palette(hue, true, tone)
  return {
    bg: p.bg ?? 'transparent',
    head: p.head ?? 'currentColor',
    eye: p.eye ?? 'currentColor',
  }
}
