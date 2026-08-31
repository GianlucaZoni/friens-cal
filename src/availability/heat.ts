/**
 * The heatmap's opacity ramp — how many Friends are free, as one number
 * between 0 and 1, and how that becomes an opacity in the theme that is on.
 *
 * Ticket 15 replaced the composite with **one hue — the viewer's own — with
 * opacity proportional to how many visible Friends are free in that slot**.
 * The hue comes from `friendColour(hue)` in `identity/ui-colour.ts`, which is
 * the single spelling of a Friend's colour and stays that way; this module owns
 * only the *strength*.
 *
 * Its own module rather than a corner of `week-grid.tsx` because two things here
 * are decisions with reasons, and a component is a bad place to keep either: the
 * shape of the ramp (below), and the fact that it is tuned **twice**.
 *
 * **No `@/` imports, deliberately**, so `heat.test.ts` can reach `heatFraction`
 * under plain Node.
 *
 * ## Why the ramp is normalised, and what that costs
 *
 * `heatFraction` puts **one** Friend free at the bottom of the ramp and **all
 * of them** at the top, whatever "all of them" currently is. The alternative —
 * a fixed step per Friend — would have to be tuned for a group of nine, and
 * this Group has two Friends today: every wash on screen would sit in the
 * bottom fifth of the range, which is the mesh gradient's failure (information
 * the viewer cannot see) arriving by a different road.
 *
 * The cost is real and worth naming: **the same absolute count reads
 * differently as the query changes.** Two Friends free is the darkest thing on
 * screen in a group of two and a middling wash in a group of nine, and
 * **hiding a Friend intensifies the wash** for everyone who is left. That last
 * one is coherent rather than surprising — hiding is a query tool, not a
 * blocklist (CONTEXT.md), so the denominator *is* "who I am trying to meet",
 * and the wash answers "how much of them is free". A full house is always the
 * darkest, which is the reading the grid exists for.
 *
 * ## Why the two per-theme numbers are CSS custom properties
 *
 * Ticket 15 requires the ramp to be tuned twice: "the alpha that whispers on
 * white shouts on near-black" (prototype 05, finding 1). And **nothing in this
 * app can ask which theme is on** — there is no theme state, light and dark are
 * the `.dark` class and the stylesheet, and ticket 18 ruled out a theme switch
 * because light/dark is not a Friend column.
 *
 * So the numbers are injected as custom properties and the *cascade* picks the
 * pair, exactly as `installFriendColourTokens()` does for `--friend-l` and
 * `--friend-c`. A `matchMedia` check would be a second source of truth for a
 * question the stylesheet already answers, and would be wrong in the one case
 * that matters — a `.dark` class applied to a subtree rather than the root.
 */

/**
 * The two ends of the ramp, per theme. The one pair of numbers here a human
 * picked, and the reason this module exists twice over.
 *
 * `floor` is one Friend free: tuned to be *just* legible, because a lone Friend
 * is the most ordinary thing on the grid and it must not disappear. `ceil` is a
 * full house.
 *
 * Dark is fainter at both ends. That is the prototype's measurement, not a
 * guess: on a near-black surface the same alpha reads as a solid colour, so the
 * light theme needs *more* to be visible and the dark theme needs *less* to
 * stay faint. Both floors were pushed *up* off their first values by the same
 * probe — below ~0.11 a lone Friend disappears into near-black.
 *
 * **What set the ceiling is your own border, not the wash.** The border and ring
 * marking your own Availability are `friendColour(hue)` at full strength, drawn
 * over this — the *same hue*. So a ceiling high enough to read as a block is also
 * high enough to swallow the outline on top of it, and ticket 15 kept that
 * outline precisely so the density stays legible through it. Measured on a probe
 * of the real stack (wash, then border and ring over it) at five ramp steps in
 * both themes: 0.62 in light reads as a solid block with the outline barely
 * separable, and the values below keep the outline legible at a full house
 * while adjacent steps still differ.
 *
 * The wash does not have to carry the count *precisely*, which is what makes
 * that trade cheap: opacity is a comparative channel — it says "more here than
 * there" — and the exact number is written out as a numeral in the popover
 * (prototype 05's third contradiction, and where it is answered).
 */
export const HEAT_ALPHA = {
  light: { floor: 0.14, ceil: 0.48 },
  dark: { floor: 0.12, ceil: 0.42 },
} as const

/**
 * Where a count sits on the ramp: 0 at one Friend free, 1 at all of them.
 *
 * `of` is the size of the query — `roster.visible`, the Friends the viewer is
 * trying to meet — and not the size of the Group. Hidden Friends are not in the
 * numerator or the denominator, which is what makes hiding one take effect on
 * the very next render.
 *
 * Monotonic in `count` by construction, which is the property ticket 15 chose
 * this whole view for: adding a Friend always *adds* information, where the
 * mesh gradient it replaced removed it.
 */
export const heatFraction = (count: number, of: number): number =>
  count <= 0 ? 0 : of <= 1 ? 1 : Math.min(1, (count - 1) / (of - 1))

/**
 * That fraction as a CSS `opacity`, resolved against whichever theme is on.
 *
 * The arithmetic is deliberately left to the browser: the two ends are `var()`s,
 * so the only thing crossing from JavaScript is the fraction, and nothing here
 * has to know or ask which theme it is in.
 *
 * `opacity` rather than an alpha inside the colour: the wash element is a bare
 * box with no children, so fading it is exactly fading its background — and it
 * keeps `friendColour(hue)` as the *only* spelling of a Friend's colour, which
 * is the invariant `ui-colour.ts` was written to protect. Folding an alpha in
 * would mean a second expression that has to be kept in step with it.
 */
export const heatOpacity = (fraction: number): string =>
  `calc(var(${FLOOR}) + (var(${CEIL}) - var(${FLOOR})) * ${fraction})`

const FLOOR = '--heat-floor'
const CEIL = '--heat-ceil'

const TOKEN_STYLE_ID = 'heat-ramp-tokens'

const heatTokensCss = (): string =>
  [
    `:root { ${FLOOR}: ${HEAT_ALPHA.light.floor}; ${CEIL}: ${HEAT_ALPHA.light.ceil}; }`,
    `.dark { ${FLOOR}: ${HEAT_ALPHA.dark.floor}; ${CEIL}: ${HEAT_ALPHA.dark.ceil}; }`,
  ].join('\n')

/**
 * Call once, at startup, before the first render. Idempotent.
 *
 * `heatOpacity()` is meaningless until this has run — an `opacity` whose
 * `calc()` holds an undefined `var()` is invalid at computed-value time, which
 * paints the element fully opaque rather than throwing, and a fully opaque wash
 * is precisely the solid block ticket 15 got rid of. Hence one call site, in
 * `main.tsx`, beside `installFriendColourTokens()`.
 */
export const installHeatTokens = (): void => {
  const existing = document.getElementById(TOKEN_STYLE_ID)
  const style = existing instanceof HTMLStyleElement ? existing : document.createElement('style')
  style.id = TOKEN_STYLE_ID
  style.textContent = heatTokensCss()
  if (!existing) document.head.appendChild(style)
}
