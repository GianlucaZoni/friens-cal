/**
 * What leaving a cal costs, as the dialog has to state it.
 *
 * Leaving is one statement — `delete from membership` — and everything else is
 * consequence, spread across three triggers (`10-lifecycle-per-cal.sql` §4
 * traces the order). This module is the client's prediction of the first one,
 * and it is written as that trigger so the two cannot drift: a dialog that
 * named the wrong Hangouts would be believed.
 *
 * **Left, not dropped**, and the difference only shows up on the rejoin. A
 * dropped Participant is no row, and no row is indistinguishable from never
 * having joined — the state that gets re-offered. Leave, rejoin by Code next
 * month, draw a Saturday, and the sidebar would cheerfully offer you back onto
 * the plan you walked out of. Left is sticky and is never re-offered
 * (`CONTEXT.md`).
 *
 * **No `@/` imports, deliberately** — the same split `cals.ts`, `hangout.ts`
 * and `elsewhere.ts` already make, so `leaving.test.ts` runs under plain Node.
 * The relative import carries its extension because Node's own resolver needs
 * it.
 */
import { isPast, stateOf, type Hangout } from '../hangouts/hangout.ts'

/**
 * The Hangouts leaving would mark this Friend **Left** on — every one of them
 * named rather than counted, the way `droppedBy` feeds the erase's dialog.
 *
 * Two conditions, in the order `mark_left_on_leaving_cal` applies them:
 *
 * 1. **`h.ends_at > now()`.** Past Hangouts are untouched and keep the leaver
 *    as a plain Participant. Marking them Left is the tidy implementation and
 *    it rewrites history into a lie: it says you walked out of a dinner you
 *    ate. The drop rule answers *are you still coming*, and the past does not
 *    accept the question.
 * 2. **`p.left_at is null`.** A Hangout you already Left gains nothing, and a
 *    Hangout you were never on has no row to update. `stateOf` collapses both
 *    into one test.
 *
 * Chronological, because `hangoutsFrom` sorted the list and nothing here
 * reorders it.
 *
 * The read behind this is already narrowed to `ends_at > now` server-side, so
 * the `isPast` here looks redundant and is not: the list is rendered against
 * the client's clock, minutes may pass with the dialog open, and the one thing
 * this dialog may not do is name a plan that has since happened.
 */
export const markedLeftBy = (
  hangouts: readonly Hangout[],
  friendId: string,
  at: number
): Hangout[] =>
  hangouts.filter((hangout) => !isPast(hangout, at) && stateOf(hangout, friendId) === 'participant')

/**
 * The sentence above the list, which says how long the list is.
 *
 * It counts because the count is the thing somebody decides on, and the list
 * under it names them because a count alone is not checkable — the same split
 * `drop-dialog.tsx` makes, for the same reason.
 *
 * **Zero is a sentence rather than an empty list**, and the dialog still opens:
 * two of its three duties are left (the past keeps your name, and here is the
 * Code) and both matter most to somebody who is on nothing.
 */
export const leavingConsequence = (count: number): string => {
  if (count === 0) return 'You are not on any hangout here that has not happened yet.'
  if (count === 1) return 'Leaving takes you off one hangout here that has not happened yet:'
  return `Leaving takes you off ${count} hangouts here that have not happened yet:`
}
