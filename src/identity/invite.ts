/**
 * Inviting a Friend, as three pure functions.
 *
 * **No imports, deliberately**, the same way `roster.ts` has none: every shape
 * here is the smallest one that carries the rule, so the test runs under plain
 * `node --test` with nothing to resolve. `canInvite` takes `{ id }` rather than
 * a `Friend` for that reason and loses nothing by it.
 *
 * The write itself is in `invite-dialog.tsx`, beside the confirm step that is
 * its only safeguard. See `supabase/13-invite.sql` for what the table will and
 * will not accept.
 */

/** What the product is called in a sentence somebody pastes into a chat. */
const PRODUCT = 'friens cal'

/**
 * An address, in the one spelling `public.allowlist` accepts.
 *
 * The constraint on the other side is `check (email = lower(btrim(email)))`,
 * and it refuses anything else with a message naming a constraint. Worse, an
 * address that got past the older, looser constraint with a trailing space
 * matched the signup hook never: `07-allowlist.sql` §1 calls that the one
 * failure nobody could debug from the outside.
 *
 * `trim()` removes more than `btrim` does, tabs and newlines included, and that
 * asymmetry is safe in this direction only. Whatever comes out of here has no
 * leading or trailing space left for `btrim` to find, so the constraint holds.
 * A client trimming LESS than Postgres would be the bug.
 *
 * The inside of the address is untouched. This is not a sanitiser: a space in
 * the middle is a typo, and the confirm step is where a human sees it.
 */
export const normaliseAddress = (raw: string): string => raw.trim().toLowerCase()

/**
 * Enough of an address to let the button light up.
 *
 * Deliberately not RFC 5322 and deliberately not the browser's `type="email"`
 * rule either. It guards one control, and the thing that actually stops a
 * mistyped address is the confirm step, which shows it back at a size you can
 * proofread. Anything this lets through that the table refuses comes back as a
 * sentence rather than as a wrong row.
 */
export const looksLikeAnAddress = (raw: string): boolean => {
  const email = normaliseAddress(raw)
  const [local, domain, ...rest] = email.split('@')
  if (rest.length > 0) return false
  if (local === undefined || domain === undefined) return false
  if (local === '' || domain === '') return false
  return !/\s/.test(email)
}

/**
 * May this Friend invite anybody yet?
 *
 * `allowlist.invited_by` references `friend(id)`, so the write is a `23503`
 * until the row exists, and a foreign-key error is not a sentence anybody can
 * act on. A new account reaching the shell in the beat before its row lands is
 * the case this covers.
 *
 * **Not `identityOf(friend) === null`**, which is the other disabled item in
 * the same menu and a different question. "How you look" waits for a finished
 * profile so nobody keeps a colour they never chose. This waits for a row to
 * point a foreign key at, and an unfinished profile can vouch for somebody
 * perfectly well.
 */
export const canInvite = (friend: { id: string } | null): boolean => friend !== null

/**
 * The sentence a Friend pastes into a group chat, which is the half of an
 * Invite this product cannot send for them.
 *
 * There is no email anywhere in friens cal and there will not be, so writing
 * the row does nothing to anybody. The invited person waits for a message that
 * only a human can send, and this is it.
 *
 * **The Code is in the sentence and not in the row.** An Invite admits somebody
 * to the product, not to a cal, and `allowlist` has no `cal_id` and never will.
 * What a human pastes into a chat is a different object from what Postgres
 * holds, and that distinction is what lets both be true.
 *
 * `origin` is handed in rather than read here, so the function stays testable
 * and so a preview deploy sends its own address instead of production's.
 */
export const pasteableInvite = ({
  origin,
  inviterName,
  cal,
}: {
  /** `window.location.origin`. On production that is the product's URL. */
  origin: string
  /** The inviter's display name, or null before setup has filled one in. */
  inviterName: string | null
  /** The cal on screen, or null on a page that has none. */
  cal: { name: string; code: string } | null
}): string => {
  const name = inviterName?.trim() ?? ''
  const opening =
    name === '' ? `You are invited to ${PRODUCT}` : `${name} invited you to ${PRODUCT}`

  const join = cal === null ? '' : `, then enter the code ${cal.code} to join ${cal.name}`

  return `${opening}: ${origin}. Sign up with this email address${join}.`
}
