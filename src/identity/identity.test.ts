/**
 * The identity model's load-bearing claims, asserted against the real
 * `blobatar@2.7.0` rather than argued.
 *
 * ## Why this runs on Node's own test runner
 *
 * The repo has no test framework and issue 03 asks for one assertion to be
 * "asserted by a test". Installing vitest to hold four assertions would add a
 * dependency, a config file and a second module resolver to a repo whose
 * fifteen-issue build plan never mentions a test runner — a decision bigger
 * than this issue, and not one to make quietly.
 *
 * `node --test` is a test runner that is already here. Node strips the types
 * itself, `blobatar` resolves from `node_modules` as it does in the app, and
 * `yarn test` is the whole setup. If a framework arrives later these
 * assertions port over unchanged — they are `assert` calls about pure
 * functions, with no renderer and no DOM.
 *
 *     yarn test
 */
import {
  EXPRESSIONS,
  TONE_SWATCHES,
  avatarPalette,
  biasedHue,
  expressionFor,
  materialise,
  nearestTakenDistance,
  snapTone,
  toneKeyFor,
} from './identity.ts'
import { C_THEME, L_THEME, hueCircle, isInSrgbGamut, minChromaOverHueCircle } from './ui-colour.ts'
import { blobatar } from 'blobatar'
import { love, mad, shy, sick } from 'blobatar/expression'
import assert from 'node:assert/strict'
import test from 'node:test'

/** Every `fill` on the rendered figure, in document order. */
const fillsOf = (svg: string): string[] => svg.match(/fill="[^"]*"/g) ?? []

/** Every path's geometry, which is what the seed actually governs. */
const geometryOf = (svg: string): string[] => svg.match(/ d="[^"]*"/g) ?? []

const SEEDS = ['seed-alpha', 'seed-bravo', 'seed-charlie', 'zzz-9']

const THEMES = ['light', 'dark'] as const

/* ================================================================== *
 * The claim issue 03 asks for a test of
 * ================================================================== */

test('reroll changes shape and leaves colour untouched', () => {
  // A materialised identity: hue and tone are stored values, so the seed never
  // reaches blobatar's colour path — `opts.hue ?? t.num('hue', …)` takes the
  // left arm every time.
  const hue = 210
  const tone = 0.71

  const rendered = SEEDS.map((seed) => blobatar(seed, { hue, tone }))
  const [first, ...rest] = rendered

  rest.forEach((svg) => {
    assert.deepEqual(
      fillsOf(svg),
      fillsOf(first!),
      'a reroll moved the colour: hue and tone are stored, so nothing about a new seed may reach the palette'
    )
  })

  // And the shape really does move — an assertion that colour is stable is
  // worthless if reroll turns out to change nothing at all.
  const shapes = new Set(rendered.map((svg) => geometryOf(svg).join('|')))
  assert.equal(shapes.size, SEEDS.length, 'reroll produced a repeated shape')
})

test('the same seeds without stored hue and tone give unrelated colours', () => {
  // The control, and the reason step 1 must materialise rather than leave
  // nulls: this is what a Friend's first reroll would do to their colour.
  const heads = SEEDS.map((seed) => fillsOf(blobatar(seed))[0])
  assert.equal(new Set(heads).size, SEEDS.length, 'expected the seed to drive colour when unset')
})

/* ================================================================== *
 * Tone: the band-edge off-by-one
 * ================================================================== */

test('the six stored tones render as six distinct swatches', () => {
  const heads = TONE_SWATCHES.map((s) => avatarPalette(210, s.value).head)
  assert.equal(new Set(heads).size, 6, `two tone swatches collided: ${heads.join(' ')}`)
})

test('every stored tone lands on the swatch it is named after', () => {
  TONE_SWATCHES.forEach((swatch) => {
    assert.equal(toneKeyFor(swatch.value), swatch.key)
    assert.equal(snapTone(swatch.value), swatch.value, 'a stored tone must be its own snap')
  })
})

test('the published TONES numbers are band edges, which is why we store interiors', () => {
  // Regression guard on the trap, stated as the library behaves rather than as
  // the table reads. Each edge selects the NEXT swatch along...
  const edges = [0.2, 0.36, 0.62, 0.8, 0.93] as const
  edges.forEach((edge, i) => {
    assert.equal(
      toneKeyFor(edge),
      TONE_SWATCHES[i + 1]!.key,
      `${edge} is the top of ${TONE_SWATCHES[i]!.key}'s band, not its value`
    )
  })

  // ...and 1.0 falls off the find and wraps to the first swatch, which is the
  // opposite end of the scale from the ink anyone typing it was reaching for.
  assert.equal(toneKeyFor(1.0), 'pastel')
  assert.equal(avatarPalette(210, 1.0).head, avatarPalette(210, 0.0).head)
  assert.notEqual(avatarPalette(210, 1.0).head, avatarPalette(210, 0.96).head)
})

/* ================================================================== *
 * Expressions: ten, and exactly which four are excluded
 * ================================================================== */

test('the ten offered expressions leave the palette alone', () => {
  const base = fillsOf(blobatar('seed-alpha', { hue: 210, tone: 0.71 }))

  EXPRESSIONS.forEach((expression) => {
    assert.deepEqual(
      fillsOf(blobatar('seed-alpha', { hue: 210, tone: 0.71, expression: expression.value })),
      base,
      `${expression.key} tints, and so may not be offered: picking a face would recolour the grid`
    )
  })
})

test('the four excluded expressions are exactly the ones that tint', () => {
  const base = fillsOf(blobatar('seed-alpha', { hue: 210, tone: 0.71 }))

  const excluded = [
    ['mad', mad],
    ['love', love],
    ['shy', shy],
    ['sick', sick],
  ] as const

  excluded.forEach(([name, expression]) => {
    assert.notDeepEqual(
      fillsOf(blobatar('seed-alpha', { hue: 210, tone: 0.71, expression })),
      base,
      `${name} no longer tints — the exclusion list may have gone stale`
    )
  })

  assert.equal(EXPRESSIONS.length, 10)
})

test('expressionFor crosses from the stored string to the React object', () => {
  // The trap two prototypes hit: over HTTP a pose is a string, in React it is a
  // value. This function is the only crossing, so it is the only place the two
  // spellings may meet.
  EXPRESSIONS.forEach((expression) => {
    assert.equal(expressionFor(expression.key), expression.value)
  })
})

/* ================================================================== *
 * Materialising, and the hue bias
 * ================================================================== */

test('materialise writes every colour column as a number', () => {
  const identity = materialise([18, 96, 148, 262])

  assert.equal(typeof identity.hue, 'number')
  assert.ok(identity.hue >= 0 && identity.hue < 360, `hue out of range: ${identity.hue}`)
  assert.ok(
    TONE_SWATCHES.some((s) => s.value === identity.tone),
    `tone ${identity.tone} is not one of the six the column accepts`
  )
  assert.ok(identity.blobatar_seed.length > 0)
  assert.equal(identity.expression, 'idle')
})

test('the initial hue is biased away from the ones already taken', () => {
  const taken = [18, 96, 148, 262]
  // The widest gap in that set is 262→18, which wraps: 116° wide, centred on
  // 320°. Deterministic random so the assertion is about the bias, not luck.
  const hue = biasedHue(taken, () => 0.5)

  assert.equal(hue, 320)
  assert.ok(
    nearestTakenDistance(hue, taken) > 45,
    'the bias put a new Friend next to an existing one'
  )

  // Still only a default: an empty Group has nothing to bias against, and
  // nothing anywhere rejects a hue for being close to a taken one.
  assert.ok(biasedHue([], () => 0.5) >= 0)
  assert.equal(nearestTakenDistance(18, taken), 0, 'landing on a taken hue is allowed')
})

/* ================================================================== *
 * C_theme is the largest chroma every hue can hold
 * ================================================================== */

test('C_theme is renderable at every hue, in both themes', () => {
  THEMES.forEach((theme) => {
    hueCircle(0.5).forEach((hue) => {
      assert.ok(
        isInSrgbGamut(L_THEME[theme], C_THEME[theme], hue),
        `oklch(${L_THEME[theme]} ${C_THEME[theme]} ${hue}) clips in ${theme} — the browser would gamut-map it in silence`
      )
    })
  })
})

test('C_theme is not smaller than it has to be', () => {
  // The other half of "computed, not eyeballed": a constant that clips nowhere
  // is trivially satisfiable at C = 0, so this pins it to the gamut floor. The
  // floor is recomputed here rather than asserted as a literal, which is what
  // makes the pair of tests a real bracket: renderable everywhere, and no
  // slacker than it has to be.
  THEMES.forEach((theme) => {
    assert.equal(C_THEME[theme], minChromaOverHueCircle(L_THEME[theme]))
    // A hair above the floor must clip somewhere — otherwise "floor" is a claim
    // about our own arithmetic and not about sRGB.
    assert.ok(
      hueCircle(0.25).some((hue) => !isInSrgbGamut(L_THEME[theme], C_THEME[theme] + 0.002, hue)),
      `${theme} could hold more chroma than ${C_THEME[theme]} at every hue`
    )
  })

  // And it agrees with what ticket 16 measured in a browser, independently of
  // the matrices in ui-colour.ts — the only external check available on them.
  assert.ok(Math.abs(C_THEME.light - 0.105) < 0.002, `light: ${C_THEME.light}`)
  assert.ok(Math.abs(C_THEME.dark - 0.128) < 0.002, `dark: ${C_THEME.dark}`)
})
