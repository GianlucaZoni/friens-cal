import { App } from '@/App'
import { installHeatTokens } from '@/availability/heat'
import { installFriendColourTokens } from '@/identity/ui-colour'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/index.css'
/**
 * blobatar's idle motion is a stylesheet, a class and a set of `@property`
 * declarations — `animate` on the component only emits the class. Without this
 * import every `animate="always"` blobatar renders as inline SVG (paying the
 * dozen extra nodes) and then sits perfectly still.
 *
 * The package marks `*.css` as having side effects precisely so a bundler
 * cannot drop this line as dead weight.
 */
import 'blobatar/motion.css'

/**
 * The two `oklch(L_theme, C_theme, hue)` constants, as CSS custom properties.
 *
 * Before the first render, because a Friend's colour is `oklch(var(--friend-l)
 * var(--friend-c) <hue>)` and an `oklch()` holding an undefined `var()` is
 * invalid at computed-value time — it paints the inherited colour rather than
 * failing loudly. The chroma is computed from the sRGB gamut on this call; see
 * `identity/ui-colour.ts` for why it is not a number typed into the stylesheet.
 */
installFriendColourTokens()

/**
 * The heatmap's opacity ramp, per theme, for the same reason and in the same
 * shape.
 *
 * Ticket 15 requires the ramp to be tuned twice — "the alpha that whispers on
 * white shouts on near-black" — and nothing in this app can ask which theme is
 * on: light and dark are the `.dark` class and the stylesheet, and ticket 18
 * ruled out a theme switch. So the cascade picks the pair, exactly as it picks
 * `--border`. See `availability/heat.ts`.
 */
installHeatTokens()

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
)
