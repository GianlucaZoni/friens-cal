import { isExpressionKey, type Identity } from '@/identity/identity'
import type { Friend, FriendUpdate } from '@/lib/database.types'

/**
 * The bridge between the nullable `friend` row and the all-numbers `Identity`
 * the renderer wants.
 *
 * Kept apart from `identity.ts` on purpose: that module is the colour model and
 * knows nothing about Postgres, which is also what lets `identity.test.ts` run
 * it under plain Node with no path aliases to resolve.
 *
 * Every identity column is nullable because the trigger creates the row blank
 * the moment an account exists (issue 01). So the app never handles a *missing*
 * Friend — only an *unfinished* one, and this is where that distinction is made.
 */

/**
 * Has this Friend been through setup?
 *
 * The four values the renderer cannot do without. `expression` is excluded:
 * blobatar treats a missing pose as `idle` and emits byte-identical markup, so
 * a null there is a complete Friend with a resting face, not an unfinished one.
 */
export const isSetupComplete = (friend: Friend | null): boolean =>
  friend !== null &&
  friend.display_name !== null &&
  friend.display_name.trim() !== '' &&
  friend.blobatar_seed !== null &&
  friend.hue !== null &&
  friend.tone !== null

/**
 * The Friend's identity, or null if they have not finished setup.
 *
 * Null rather than filled-in defaults, because a default hue is a *colour* — it
 * would put a Friend on the sidebar in a colour nobody chose and no column
 * holds, and it would look exactly like a finished one.
 */
export const identityOf = (friend: Friend | null): Identity | null => {
  if (!isSetupComplete(friend) || friend === null) return null
  const { blobatar_seed, hue, tone, expression } = friend
  if (blobatar_seed === null || hue === null || tone === null) return null

  return {
    blobatar_seed,
    hue,
    tone,
    // The column is a text check constraint, so a value outside the ten can only
    // arrive from a hand-edited row. Falling back beats rendering nothing.
    expression: expression !== null && isExpressionKey(expression) ? expression : 'idle',
  }
}

/**
 * An `Identity` as the four blob columns, ready for `saveFriend`.
 *
 * All four together, always — never `hue` alone. Writing a partial identity is
 * how a row ends up with a hue and a null tone, which is the shape
 * `isSetupComplete` calls unfinished.
 */
export const asIdentityUpdate = (identity: Identity): FriendUpdate => ({
  blobatar_seed: identity.blobatar_seed,
  hue: identity.hue,
  tone: identity.tone,
  expression: identity.expression,
})

/** The same four, plus the name. What setup writes. */
export const asFriendUpdate = (identity: Identity, displayName: string): FriendUpdate => ({
  ...asIdentityUpdate(identity),
  display_name: displayName.trim(),
})
