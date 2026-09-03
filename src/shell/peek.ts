/**
 * What the bottom drawer shows while it is peeking: **one labelled card**.
 *
 * Ticket 17: *"'Upcoming' with the nearest Hangout that has not yet ended, if
 * there is one; otherwise 'Best Candidate' with the first element of the
 * Candidate list; otherwise whichever of ticket 09's three empty states
 * applies."* And its reason, which is the whole of why this is one card rather
 * than a count: *"the peek is the scarcest space on the smallest screen, and a
 * card answers* when are we meeting *without opening anything."*
 *
 * **A fact outranks an offer**, which is the same ordering the right pane
 * already draws in: Hangouts sit above Candidates there because *a Candidate and
 * a Hangout look alike on screen and are entirely different things*
 * (`CONTEXT.md`). In 120 pixels there is room for exactly one of them, so the
 * ordering stops being a layout and becomes a choice — and *Saturday is booked*
 * beats *Saturday could work* every time.
 *
 * **No `@/` imports**, so `peek.test.ts` reaches this under plain Node.
 */
import type { Candidate, EmptyReason } from '../candidates/candidates.ts'
import type { Hangout } from '../hangouts/hangout.ts'

export type Peek =
  | { kind: 'hangout'; hangout: Hangout }
  | { kind: 'candidate'; candidate: Candidate }
  | { kind: 'empty'; reason: EmptyReason }
  | null

/**
 * @param pinned Every Hangout that has not ended — `pinned(hangouts, now)`,
 *   which is the same `ends_at > now` set the right pane's region is built from,
 *   so the peek and the drawer behind it can never name different plans.
 * @param candidates The ranked list, best first — `list.all` rather than
 *   `list.shown`, because the peek promises the *best* Candidate and the
 *   show-more cut is about how much of the tail is worth scrolling.
 * @param empty Which of ticket 09's three empty states applies, or null while
 *   the read is still in flight.
 *
 * Null means **nothing to say yet**, which is not the same as an empty state:
 * `empty` is null while the query is loading, and a peek that guessed
 * *"nobody's free yet"* over a read that has not landed is precisely the
 * confusion ticket 09 wrote three separate messages to avoid.
 */
export const peekOf = (
  pinned: readonly Hangout[],
  candidates: readonly Candidate[],
  empty: EmptyReason | null
): Peek => {
  /*
   * Nearest by **start**, computed here rather than taken off the head of the
   * list. The store reads `.order('starts_at')`, but a realtime insert arrives
   * wherever it arrives, and the peek is the one place in the app where being
   * one card wrong is being entirely wrong — there is no second card under it
   * to correct the impression.
   *
   * Start rather than end, given that the set is defined by `ends_at > now`: a
   * Hangout happening right now has the earliest start of anything unfinished,
   * and it is unarguably the nearest.
   */
  const soonest = pinned.reduce<Hangout | null>(
    (nearest, hangout) =>
      nearest === null || hangout.startsAt < nearest.startsAt ? hangout : nearest,
    null
  )
  if (soonest !== null) return { kind: 'hangout', hangout: soonest }

  const [best] = candidates
  if (best !== undefined) return { kind: 'candidate', candidate: best }

  return empty === null ? null : { kind: 'empty', reason: empty }
}
