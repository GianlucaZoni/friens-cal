/**
 * The Hangout, as the app holds it.
 *
 * A **committed** record that a set of Friends is meeting at a given time,
 * created by confirming a Candidate (`CONTEXT.md`). It survives changes to the
 * Availability that produced it, which is the whole reason it is a *range* with
 * a start and an end of its own where Availability is slot rows: a run
 * disappears when its Slots do, and a Hangout does not.
 *
 * *A Candidate and a Hangout look alike on screen and are entirely different
 * things.* This module is the second half of that sentence — a Candidate has no
 * identity and is rebuilt from scratch on every recompute, and everything here
 * is keyed by a uuid that came back from Postgres.
 *
 * **No `@/` imports, deliberately** — the same split `slots.ts`, `segments.ts`,
 * `candidates.ts` and `when.ts` already make, so `hangout.test.ts` can reach
 * this under plain Node (`yarn test`). The relative imports carry their
 * extensions because Node's own resolver needs them.
 */
import { SLOT_MS, type Run, type Slot } from '../availability/slots.ts'
import { type HangoutRange } from '../candidates/candidates.ts'
import { groupBy, times } from 'lodash-es'

/**
 * A Friend on a Hangout — the row, not the state.
 *
 * The three states are read off it (`05-hangout.sql` §2): `leftAt` null is a
 * **Participant**, `leftAt` set is **Left** and sticky forever, and no entry at
 * all is *never joined or auto-dropped* — the one that is eligible for issue
 * 10's "Join?".
 */
export type Participant = {
  friendId: string
  /** When they Left, in epoch ms. Null while they are on it. */
  leftAt: number | null
}

/** One Hangout, with its stored Participant list. */
export type Hangout = {
  id: string
  /** Epoch ms, on the 30-minute grid — `05-hangout.sql` constrains both. */
  startsAt: number
  endsAt: number
  /**
   * Nullable, and the detail sheet is what writes it (issue 10). Never read
   * raw — `nameOf` is the one default, so there is no such thing as a Hangout
   * without a name and no null case for a card to handle.
   */
  title: string | null
  /**
   * Who confirmed it, and who last changed it —
   * `06-hangout-lifecycle.sql` §1's provenance columns.
   *
   * **Not ownership, and it must not become it.** Every policy on `hangout` is
   * still `using (true)`; anyone may retime, rename or cancel anything (ticket
   * 01). These exist *because* of that plus no notifications: they are the only
   * thing that can answer "who moved this?" after the fact.
   *
   * `editedBy` non-null **is** ticket 08 §1's "edited" mark — see `isEdited`.
   * All three are null for a Hangout nobody has changed, and `createdBy` is
   * also null for one confirmed before that migration or whose Friend row is
   * gone.
   */
  createdBy: string | null
  editedBy: string | null
  /** Epoch ms, stamped by the database rather than by whoever's clock. */
  editedAt: number | null
  /** Every row, Left included — the states are told apart by their readers. */
  participants: readonly Participant[]
}

/** The wire shapes, restated so this module needs no `@/lib` import. */
type HangoutWire = {
  id: string
  starts_at: string
  ends_at: string
  title: string | null
  created_by: string | null
  edited_by: string | null
  edited_at: string | null
}

type ParticipantWire = {
  hangout_id: string
  friend_id: string
  left_at: string | null
}

/**
 * Rows as they arrive, folded into Hangouts in chronological order.
 *
 * **The timestamps go through `Date` and never through string comparison.**
 * PostgREST renders a `timestamptz` as `2027-09-06T17:00:00+00:00` where
 * `Date#toISOString` writes `…000Z` — the same instant, two strings. That trap
 * has already bitten this repo twice (issue 07's realtime verify, and the
 * reason `slotKey` exists), so every boundary in here is an epoch number.
 *
 * Chronological, not ranked. A Hangout is a fact rather than an offer, so there
 * is nothing to rank it by: the pinned region reads top to bottom in time
 * (ticket 16).
 */
export const hangoutsFrom = (
  rows: readonly HangoutWire[],
  participants: readonly ParticipantWire[]
): Hangout[] => {
  /*
   * Grouped once rather than scanned per Hangout. Participant rows arrive as
   * one flat read and as individual Realtime events, so the client never holds
   * them nested — and orphans (rows whose Hangout is outside the window read,
   * or was just cancelled elsewhere) are simply never looked up.
   */
  const byHangout = groupBy(participants, (row) => row.hangout_id)

  return rows
    .map((row) => ({
      id: row.id,
      startsAt: new Date(row.starts_at).getTime(),
      endsAt: new Date(row.ends_at).getTime(),
      title: row.title,
      createdBy: row.created_by,
      editedBy: row.edited_by,
      editedAt: row.edited_at === null ? null : new Date(row.edited_at).getTime(),
      participants: (byHangout[row.id] ?? []).map((on) => ({
        friendId: on.friend_id,
        leftAt: on.left_at === null ? null : new Date(on.left_at).getTime(),
      })),
    }))
    .sort((a, b) => a.startsAt - b.startsAt || a.endsAt - b.endsAt)
}

/**
 * Who is actually on it — the rows whose `left_at` is null.
 *
 * Left is not a Participant, and that is the point of storing it rather than
 * deleting the row: a deleted row is indistinguishable from never having
 * joined, and would let the next overlapping Availability re-offer "Join?" to
 * somebody who deliberately walked out.
 */
export const participantIds = (hangout: Hangout): string[] =>
  hangout.participants.filter(({ leftAt }) => leftAt === null).map(({ friendId }) => friendId)

/**
 * What a Hangout is called — its title, or **"Hangout"**.
 *
 * The default is not a placeholder. A Hangout is the one object in this product
 * that was *written down* rather than derived, and it has to be nameable in a
 * sentence — "cancel Hangout, Sat 20:00" — from the moment it exists, before
 * anybody has opened the detail sheet to give it a better name. Until that
 * sheet exists, **every** Hangout is called this.
 *
 * One function because three surfaces render it and they must agree: the pinned
 * card's headline, the block on the grid, and that block's `aria-label`. It is
 * also what keeps *"the title is the headline and the time is the second line"*
 * (ticket 16) true unconditionally — an untitled Hangout used to promote its
 * time to the headline, which quietly inverted the hierarchy on exactly the
 * cards issue 09 can produce, i.e. all of them.
 */
export const nameOf = (hangout: Pick<Hangout, 'title'>): string => hangout.title ?? DEFAULT_NAME

/**
 * The word an unnamed Hangout goes by.
 *
 * `CONTEXT.md`'s own term for the object, deliberately — the fallback should
 * read as the product's vocabulary rather than as a gap ("Untitled", "—") or as
 * a nudge ("Name this…", which belongs on the control that does the naming).
 */
const DEFAULT_NAME = 'Hangout'

/**
 * The Participants of a Hangout, resolved against a roster — its **faces**.
 *
 * One function for the three places that draw them (the pinned card, the grid
 * block, and whatever issue 10 adds), because the `flatMap` is the whole of it
 * and it exists for two reasons that are easy to forget separately:
 *
 * - A Participant row can **outlive the roster's knowledge of a Friend**. The
 *   row is stored and the roster is read, so the two can disagree for a beat.
 * - A Friend **mid-setup has no face to draw at all**, so every caller passes a
 *   map already narrowed by `setUpOnly`.
 *
 * Either one would otherwise be an `undefined` React then tries to render.
 *
 * Generic over the Friend, so this module stays free of `@/` imports and
 * testable under plain Node — the callers' map is `SetUpFriend`, and nothing
 * here needs to know that.
 */
export const facesOf = <Friend>(hangout: Hangout, byId: ReadonlyMap<string, Friend>): Friend[] =>
  participantIds(hangout).flatMap((id) => {
    const friend = byId.get(id)
    return friend === undefined ? [] : [friend]
  })

/**
 * Happening right now — which the card draws in the destructive colour, and
 * which is **still Live**: ticket 08 §6 keeps a Hangout fully actionable until
 * its end time, not until it starts.
 */
export const isHappening = (hangout: HangoutRange, at: number): boolean =>
  hangout.startsAt <= at && at < hangout.endsAt

/**
 * Over. Muted and uneditable from here on (ticket 08 §6), and it stays on the
 * grid forever — the grid has to stay consistent with the past Availability
 * that is never auto-deleted either.
 */
export const isPast = (hangout: HangoutRange, at: number): boolean => hangout.endsAt <= at

/**
 * The pinned region, above the Candidates.
 *
 * **Pinned while `ends_at > now`, and it unpins when it ENDS — not on its day.**
 * That distinction is the whole rule and it is easy to get wrong in the
 * cheap direction: "leaves the sidebar on its day" would clear a Saturday
 * 20:00–23:00 Hangout at midnight *on Saturday*, seven hours before it starts.
 *
 * Chronological, and **unaffected by hiding**. Hiding is a query tool over who
 * you are trying to meet (`CONTEXT.md`) and a Hangout is not an offer, so
 * nothing filters here. Ticket 16 rejected even muting a Hidden Friend's face
 * on a Hangout card: that is a partial hide through the back door.
 */
export const pinned = (hangouts: readonly Hangout[], at: number): Hangout[] =>
  hangouts.filter((hangout) => !isPast(hangout, at))

/**
 * What the Candidate pipeline wants — step 3, *blank the Hangouts for every
 * Friend*, which issue 08 built and tested against this shape.
 *
 * Every Hangout, including the past ones: their Slots are spoken for whether or
 * not the pipeline's horizon reaches them, and the horizon is what drops the
 * past ones anyway.
 */
export const rangesOf = (hangouts: readonly Hangout[]): HangoutRange[] =>
  hangouts.map(({ startsAt, endsAt }) => ({ startsAt, endsAt }))

/**
 * Where a Hangout sits in one day column, in rows — or null if it does not
 * reach it.
 *
 * Asked of **that column's own slots array**, never of a 48-row assumption:
 * a DST day holds 46 or 50 rows and the 25-hour Sunday holds 02:00 twice, so a
 * global row index would address rows that do not exist on one column and miss
 * two on another. It is the same rule `segmentsOf` is swept under.
 *
 * A Hangout crossing midnight needs nothing special — it simply produces a run
 * in each of the two columns it reaches, clipped by each one's own array.
 *
 * The run is contiguous by construction: the slots are ordered and a Hangout is
 * one continuous range, so the rows it covers cannot have a hole in them.
 */
export const runInColumn = (hangout: HangoutRange, slots: readonly Slot[]): Run | null => {
  const rows = slots
    .map((slot, row) => ({ row, at: slot.start.getTime() }))
    .filter(({ at }) => at >= hangout.startsAt && at < hangout.endsAt)
    .map(({ row }) => row)

  return rows.length === 0 ? null : { start: rows[0], length: rows.length }
}

/**
 * Postgres's `exclusion_violation`, which is the confirm race arriving.
 *
 * Named rather than inlined because the whole of ticket 08 §8 hangs off
 * recognising exactly this code and nothing else: any *other* error is a
 * failure to report, and this one is a Hangout that already exists.
 */
const EXCLUSION_VIOLATION = '23P01'

/** Whether a PostgREST error is the exclusion constraint rejecting an overlap. */
export const isOverlapRejection = (error: { code?: string } | null | undefined): boolean =>
  error?.code === EXCLUSION_VIOLATION

/**
 * Whether ticket 08 §1's **`edited`** mark applies.
 *
 * `editedBy` non-null *is* the mark — there is no boolean beside it, so the two
 * facts cannot contradict each other and a card can never claim an edit by
 * nobody.
 *
 * **What it means changed with the human's answer to ticket 07's
 * `Needs the human`**, and the honest reading is the narrower one: *something
 * about this Hangout changed after it was confirmed*, not *it has been moved*.
 * §1 justified the mark as "the only signal a Participant gets that slots were
 * written for them", and a **rename** writes nobody's Availability — so the
 * badge cannot promise that any more. That signal lives in the retime dialog
 * instead (ticket 08 §11), in front of the person doing the writing, which is
 * where it was always stronger. A badge can only ever say *something changed*,
 * and the detail is the only thing that can say what.
 */
export const isEdited = (hangout: Pick<Hangout, 'editedBy'>): boolean => hangout.editedBy !== null

/**
 * Every Slot a Hangout covers, as the instants `availability` rows are keyed
 * on.
 *
 * **This is what "does this Friend cover the Hangout?" means, and there is
 * exactly one definition of it in the product.** Ticket 07 §6: a Hangout is a
 * range where Availability is slot rows, so coverage is *exact slot-set
 * containment* rather than a range intersection — which is the whole reason
 * `05-hangout.sql` constrains both bounds to the 30-minute grid.
 *
 * **It has to agree with the drop trigger, exactly.**
 * `06-hangout-lifecycle.sql` §3 spells the same expression as a
 * `generate_series` from `starts_at` to `ends_at - 30 minutes`, and ticket 08
 * §10's dialog names the Hangouts a pending erase will drop you from *before*
 * the delete. If the two definitions drift, that dialog lies about what you are
 * about to lose — which ticket 07 §7 calls worse than no dialog at all, since it
 * is "the only thing standing between a mis-click and silently leaving a plan".
 *
 * Half-open, `[)`, matching `tstzrange`'s default: a Hangout ending at 22:00
 * does not want the 22:00 Slot.
 */
export const slotStartsOf = (hangout: HangoutRange): number[] => {
  const count = Math.round((hangout.endsAt - hangout.startsAt) / SLOT_MS)
  return times(Math.max(count, 0), (step) => hangout.startsAt + step * SLOT_MS)
}

/** Whether a Friend holds Availability at every Slot of a Hangout. */
export const covers = (hangout: HangoutRange, holds: (slotStart: number) => boolean): boolean =>
  slotStartsOf(hangout).every(holds)

/** The Slots of a Hangout a Friend does not hold — what a Join has to write. */
export const missingSlots = (
  hangout: HangoutRange,
  holds: (slotStart: number) => boolean
): number[] => slotStartsOf(hangout).filter((slotStart) => !holds(slotStart))

/**
 * A Friend's three states toward a Hangout, out of two facts (ticket 07 §2).
 *
 * `left` is **sticky**: the way back is deliberate, from the detail, and no
 * prompt will ever offer it (ticket 08 §9). `not-involved` is the only one
 * eligible for "Join?" — which is why Leaving stores a row rather than deleting
 * one, since a deleted row is indistinguishable from never having joined.
 */
export type FriendState = 'not-involved' | 'participant' | 'left'

export const stateOf = (hangout: Hangout, friendId: string): FriendState => {
  const row = hangout.participants.find((on) => on.friendId === friendId)
  return row === undefined ? 'not-involved' : row.leftAt === null ? 'participant' : 'left'
}

/**
 * Whether **"Join?"** belongs on this Hangout for this Friend.
 *
 * Ticket 08 §5: *on any overlap, however small*. One Slot in common is enough,
 * because Join writes whatever is missing to cover the whole range — so a
 * partial overlap is a Friend who is plainly interested in that evening rather
 * than a near miss.
 *
 * **Never for a Friend who Left**, and never on a Past Hangout. The first is
 * ticket 08 §9 — the tool does not *suggest* rejoining something you walked out
 * of, though the door is not locked — and the second is §6's freeze.
 */
export const mayJoin = (
  hangout: Hangout,
  friendId: string,
  holds: (slotStart: number) => boolean,
  at: number
): boolean =>
  !isPast(hangout, at) &&
  stateOf(hangout, friendId) === 'not-involved' &&
  slotStartsOf(hangout).some(holds)

/**
 * The Hangouts a pending erase would **drop this Friend from** — ticket 08
 * §10's dialog, which names every one of them rather than counting them.
 *
 * ## It predicts the trigger, so it is written as the trigger
 *
 * Three conditions, in the order `06-hangout-lifecycle.sql` §3 applies them:
 *
 * 1. **The erase actually removes a row inside the range.** The trigger's scan
 *    is narrowed by its transition table to the pairs where a deleted Slot fell
 *    inside a Hangout, and that restriction is load-bearing rather than an
 *    optimisation: a Participant who *already* did not cover their Hangout is
 *    left alone until they erase inside it. `holds` is checked here as well as
 *    `erasing`, because a selection can include Slots the viewer does not hold
 *    — the delta is filtered before the write (`useAvailability`'s `stroke`),
 *    and nothing the store will not delete may appear in this dialog.
 * 2. **They are a Participant**, not Left and not absent. Left outranks
 *    Availability permanently, so erasing underneath it changes nothing.
 * 3. **Coverage fails afterwards** — exact containment against the store minus
 *    the erase, which is `slotStartsOf`'s contract.
 *
 * Past Hangouts are **not** excluded, and that is the strict rule holding
 * rather than an oversight: ticket 07 §7 makes any loss of coverage a drop,
 * without qualification, and the trigger has no clock in it. What ticket 08 §6
 * does exempt is the *auto-cancel* — see `wouldAutoCancel`.
 */
export const droppedBy = (
  hangouts: readonly Hangout[],
  friendId: string,
  erasing: ReadonlySet<number>,
  holds: (slotStart: number) => boolean
): Hangout[] =>
  hangouts.filter((hangout) => {
    const slots = slotStartsOf(hangout)
    if (!slots.some((slotStart) => erasing.has(slotStart) && holds(slotStart))) return false
    if (stateOf(hangout, friendId) !== 'participant') return false
    return !slots.every((slotStart) => holds(slotStart) && !erasing.has(slotStart))
  })

/**
 * Whether this Friend leaving or being dropped **cancels the Hangout outright**
 * — ticket 08 §4's auto-cancel, as the client predicts it.
 *
 * They have to be the last one on it. Said in the dialogs rather than left to
 * be discovered: cancellation is a hard delete with no tombstone and no undo
 * (ticket 08 §3), and *"you are the only one on it"* is the difference between
 * leaving a plan and deleting it for everybody.
 *
 * **Past Hangouts are exempt**, matching `cancel_empty_hangouts`: ticket 08 §6
 * makes a Past Hangout uneditable — no join, no retime, no cancel — and an
 * auto-cancel is a cancel. So a Past Hangout can end up with nobody on it,
 * which is the honest picture rather than an erased plan.
 */
export const wouldAutoCancel = (hangout: Hangout, friendId: string, at: number): boolean => {
  const on = participantIds(hangout)
  return !isPast(hangout, at) && on.length === 1 && on[0] === friendId
}
