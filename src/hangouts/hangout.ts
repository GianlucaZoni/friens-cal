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
import { type Run, type Slot } from '../availability/slots.ts'
import { type HangoutRange } from '../candidates/candidates.ts'
import { groupBy } from 'lodash-es'

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
   * Nullable, and nothing in issue 09 writes it: confirming a Candidate is the
   * only way a Hangout is created and it names nothing. The card promotes the
   * time to the headline when this is absent.
   */
  title: string | null
  /** Every row, Left included — the states are told apart by their readers. */
  participants: readonly Participant[]
}

/** The wire shapes, restated so this module needs no `@/lib` import. */
type HangoutWire = {
  id: string
  starts_at: string
  ends_at: string
  title: string | null
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
export const facesOf = <Friend,>(
  hangout: Hangout,
  byId: ReadonlyMap<string, Friend>
): Friend[] =>
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
