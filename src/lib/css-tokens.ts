/**
 * Computed constants, handed to the cascade as CSS custom properties.
 *
 * Two things in this app are numbers a human should not have typed twice: a
 * Friend's lightness and chroma (`identity/ui-colour.ts`, derived from the sRGB
 * gamut) and the heatmap's opacity ramp (`availability/heat.ts`, tuned per
 * theme). Both are computed in TypeScript and both need a **different value in
 * light and dark**, and this is the one mechanism that serves that.
 *
 * ## Why a stylesheet and not a `matchMedia` check
 *
 * **Nothing in this app can ask which theme is on.** There is no theme state —
 * light and dark are the `.dark` class and `index.css`, and ticket 18 ruled out
 * putting a switch in the profile menu because light/dark is not a Friend
 * column. So the values are written into a rule per theme and the cascade
 * resolves them the same way it resolves `--border`.
 *
 * A `matchMedia` read would be a second source of truth for a question the
 * stylesheet already answers, and it would be wrong in the one case that
 * matters: a `.dark` class applied to a subtree rather than to the root.
 *
 * ## Why injected rather than written into `index.css`
 *
 * Because the numbers are *computed*, and two copies of a constant is one copy
 * too many. A hand-kept `--friend-c: 0.105` in the stylesheet would be exactly
 * the eyeballed constant `ui-colour.ts` exists to eliminate, and it would drift
 * the first time the lightness it was derived from moved.
 *
 * **No `@/` imports, and this file is reached by a relative path with its
 * extension** — both callers are covered by `yarn test`, which runs under plain
 * Node and cannot resolve the alias. The same split `slots.ts`, `gesture.ts`,
 * `segments.ts`, `identity.ts` and `roster.ts` already make.
 */

/**
 * Install (or replace) one `<style>` element of custom properties.
 *
 * Idempotent, and it must be: `main.tsx` calls each installer once, but a
 * StrictMode remount or a hot reload can arrive at the same call twice, and two
 * `<style>` elements with the same tokens is a slow way to fight yourself.
 * Keyed on `id` so a second call *rewrites* the rules rather than appending.
 *
 * Call before the first render. A custom property that has not been installed is
 * not an error the browser reports: `oklch(var(--friend-l) …)` with an undefined
 * `var()` is invalid at computed-value time, which paints the inherited colour,
 * and an `opacity: calc(var(--heat-floor) …)` in the same state paints fully
 * opaque. Both fail by looking *nearly* right.
 */
export const installCssTokens = (id: string, css: string): void => {
  const existing = document.getElementById(id)
  const style = existing instanceof HTMLStyleElement ? existing : document.createElement('style')
  style.id = id
  style.textContent = css
  if (!existing) document.head.appendChild(style)
}

/**
 * One custom-property rule per theme, as the cascade wants them.
 *
 * `:root` carries light and `.dark` carries dark — the same shape `index.css`
 * uses for `--border` and everything else, so a token installed here is
 * indistinguishable from a token that was authored.
 */
export const themedTokensCss = (tokens: {
  light: Record<string, number | string>
  dark: Record<string, number | string>
}): string =>
  [`:root { ${declarations(tokens.light)} }`, `.dark { ${declarations(tokens.dark)} }`].join('\n')

const declarations = (values: Record<string, number | string>): string =>
  Object.entries(values)
    .map(([name, value]) => `${name}: ${value};`)
    .join(' ')
