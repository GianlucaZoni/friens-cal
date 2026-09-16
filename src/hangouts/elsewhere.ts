/**
 * Your own commitments in your **other** cals, and what a card may say about
 * them.
 *
 * Per-cal Hangouts mean the exclusion constraint stops protecting *you*: two
 * cals can each confirm 8pm Saturday and neither grid can see the other,
 * because that blindness is what per-cal Availability is for. This module is
 * the warning, and the whole of it is that the warning is about **you**. The
 * app knows your commitments because you made them; it cannot know Marco's,
 * and must not try.
 *
 * ## The one rule everything here follows
 *
 * **The mark is on a commitment you could take on, never on one you hold**
 * (planning ticket 09 §4). That is why `isOffered` exists rather than every
 * surface deciding for itself: a Hangout card offering `Join?` carries the
 * mark, and the instant you are a Participant it is not an offer, so the mark
 * is gone even though the clash is still true and now permanent. It is also
 * what keeps drawing Availability unmarked at both ends. A drawn Slot is an
 * offer, not a promise; only a Hangout is a commitment.
 *
 * ## And there is no all-clear
 *
 * Every function that has nothing to say answers `null` or `''` or `[]`. The
 * danger in a warning that covers only one of the people involved is somebody
 * reading its *absence* as a pass, so there is no cleared state anywhere: the
 * mark appears, or nothing appears, and nothing is not an answer.
 *
 * **No `@/` imports, deliberately** — the same split `hangout.ts`, `when.ts`
 * and `candidates.ts` already make, so `elsewhere.test.ts` runs under plain
 * Node. The relative imports carry their extensions because Node's own
 * resolver needs them.
 */
import { whenOf } from '../candidates/when.ts'
import type { ViewerZone } from '../shell/zone.ts'
import { isPast, nameOf, participantIds, stateOf, type Hangout } from './hangout.ts'

/**
 * One Hangout, in another of your cals, that you are on.
 *
 * Flatter than a `Hangout`, because nothing here can act on it: it is in a cal
 * that is not on screen, so it has no Participant list worth carrying, no
 * provenance and no lifecycle. What it has is a time and enough to name itself
 * with, which is exactly what the two surfaces render.
 *
 * `calName` is resolved against `useCals()` rather than read through the
 * Hangout, so the read stays one flat query.
 */
export type Commitment = {
  hangoutId: string
  calId: string
  /** The cal's name, which the detail and the retime dialog write out. */
  calName: string
  /** Nullable, like the column. `nameOf` is the one default. */
  title: string | null
  startsAt: number
  endsAt: number
}

/** A window somebody is proposing, in epoch milliseconds, half open. */
type Proposed = { start: number; end: number }

/**
 * Your commitments that collide with a proposed window, earliest first.
 *
 * **Any overlap, however small** — planning ticket 09 §3, mirroring v1 ticket
 * 08 §5's rule, which is already how `mayJoin` decides to offer itself. Half
 * open at both ends, matching `tstzrange`'s `[)`: a plan that ends exactly
 * where the window starts is not a clash, and saying it was would mark half
 * the evenings in a busy cal.
 *
 * Earliest first because the card names one of them (`busyMark`) and "the
 * earliest-starting one" is the honest choice: it is the one that collides
 * with the start of the window being offered.
 */
export const clashesWith = (
  commitments: readonly Commitment[],
  { start, end }: Proposed
): Commitment[] =>
  commitments
    .filter((commitment) => commitment.startsAt < end && commitment.endsAt > start)
    .sort((a, b) => a.startsAt - b.startsAt || a.endsAt - b.endsAt)

/**
 * Whether this Hangout is still **an offer** to the viewer rather than
 * something they already hold.
 *
 * The boundary planning ticket 09 §4 draws, in one place. A Friend who never
 * joined is being offered `Join?`; a Friend who Left is being offered Rejoin
 * from the detail, which is a different sentence but the same act. A
 * Participant is offered nothing, so a mark on their card would be commentary
 * on a decision that is already made.
 *
 * Past is excluded because a Past Hangout offers nothing at all (v1 ticket 08
 * §6's freeze), and a warning about a window that has already gone is noise.
 */
export const isOffered = (hangout: Hangout, viewerId: string, at: number): boolean =>
  !isPast(hangout, at) && stateOf(hangout, viewerId) !== 'participant'

/**
 * What the viewer holds **in this cal**, as one string — the snapshot's refresh
 * signal.
 *
 * The four acts that make you a Participant are confirm, Join, Rejoin and
 * retime (§5), and this moves under every one of them: confirm and Join and
 * Rejoin each add an id, and a retime changes the times beside one. Leaving
 * moves it too, which is the same fact read the other way.
 *
 * A signature rather than four callbacks threaded through five writes, and it
 * is the narrower dependency as well as the smaller one: another Friend
 * joining, leaving or being dropped churns the Hangout store constantly and
 * changes nothing here.
 */
export const heldKey = (hangouts: readonly Hangout[], viewerId: string | null): string =>
  viewerId === null
    ? ''
    : hangouts
        .filter((hangout) => participantIds(hangout).includes(viewerId))
        .map((hangout) => `${hangout.id}:${hangout.startsAt}-${hangout.endsAt}`)
        .sort()
        .join('|')

/**
 * The card's line: **the time only**, and how many others there are.
 *
 * Planning ticket 09 §7 re-tested the naming against a width and cut it here.
 * The card is a narrow sidebar card already carrying a date, an `everyone`
 * pill, a time, the faces and sometimes a container label, so a cal name plus a
 * title plus a range truncates — and a truncated cal name costs the width and
 * cannot be read. What is left is the part that says whether the clash matters
 * at all: a thirty-minute sliver of a four-hour Candidate is a different fact
 * from total overlap.
 *
 * **Bounded at exactly one range** however many there are and however anybody
 * names their cal. Two cals can each hold a 20:00 Hangout you are on, so a
 * third cal's Candidate can collide with both; the count is the honest
 * summary, and the detail one tap away carries the full list.
 */
export const busyMark = (clashes: readonly Commitment[], zone: ViewerZone): string | null => {
  const first = clashes[0]
  return first === undefined ? null : `Busy ${rangeOf(first, zone)}${others(clashes.length - 1)}`
}

/**
 * The same fact, appended to the accelerator's accessible name.
 *
 * §10: a mark rendered as a line in the card body is read when the body is
 * read, and somebody tabbing straight to the tick never hears it — which would
 * make this invisible to exactly the people who cannot glance at it. So
 * `Confirm Sat 6 Sep, 20:00 – 23:00` becomes
 * `… — you are busy 20:00 – 21:00 elsewhere`, and `Join?` says the same.
 *
 * Empty rather than a sentence when there is nothing to say, because the label
 * is a control's name and the absence of a clause is not a claim.
 */
export const busySuffix = (clashes: readonly Commitment[], zone: ViewerZone): string => {
  const first = clashes[0]
  if (first === undefined) return ''
  const rest = clashes.length - 1
  const times =
    rest === 0 ? '' : rest === 1 ? ', and at 1 other time' : `, and at ${rest} other times`
  return ` — you are busy ${rangeOf(first, zone)} elsewhere${times}`
}

/**
 * The full naming, for the two surfaces with room for it: **which cal, which
 * Hangout, and when**.
 *
 * §7 asked whether the mark names the other cal and answered that it does. The
 * screenshot objection does not hold: the person holding the screenshot is you,
 * you could type the cal's name into a message in a second, and `CONTEXT.md`
 * already has the Code as an address rather than a secret. What naming buys is
 * the difference between an actionable warning and a superstition — "you are
 * already busy then" sends you hunting through your own cals to find out
 * whether it even matters.
 *
 * Two strings rather than one sentence, so the detail can render them the way
 * `drop-dialog.tsx` renders the plans an erase would cost: the name, then when.
 */
export const clashNaming = (
  commitment: Commitment,
  zone: ViewerZone
): { what: string; when: string } => {
  const when = whenOf(commitment.startsAt, commitment.endsAt, frameless(zone))
  return {
    what: `${nameOf(commitment)} in ${commitment.calName}`,
    when: `${when.date} · ${when.range}`,
  }
}

/** `, and 1 other` — or nothing, which is the ordinary case. */
const others = (rest: number): string =>
  rest === 0 ? '' : rest === 1 ? ', and 1 other' : `, and ${rest} others`

const rangeOf = (commitment: Commitment, zone: ViewerZone): string =>
  whenOf(commitment.startsAt, commitment.endsAt, frameless(zone)).range

/**
 * **No `GMT+2` on any of these strings, ever** (§7).
 *
 * Ticket 08 fires the frame only when a Member's mirrored zone differs from
 * yours, which is a per-cal test — and two rosters could answer differently
 * about a string describing a *third* cal's Hangout. The question dissolves
 * rather than needing an answer: the frame exists to disambiguate between
 * Friends reading the same string, and this string is rendered for exactly one
 * person, in that person's own zone, and nobody else will ever see it.
 */
const frameless = (zone: ViewerZone): ViewerZone => ({ timeZone: zone.timeZone, frame: null })
