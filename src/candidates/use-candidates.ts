import type { AvailabilityStore } from '@/availability/use-availability'
import {
  emptyReason,
  scanCandidates,
  splitAtGlow,
  type Candidate,
  type EmptyReason,
  type HangoutRange,
} from '@/candidates/candidates'
import { useSlotClock } from '@/candidates/use-slot-clock'
import { setUpOnly, type RosterState, type SetUpFriend } from '@/roster/use-roster'
import { GROUP_TIME_ZONE } from '@/shell/use-calendar-view'
import { useMemo } from 'react'

export type CandidateList = {
  /** Above the glow line: what the product calls worth looking at. */
  shown: Candidate[]
  /** Below it, behind *show more*. Nothing is removed — see `splitAtGlow`. */
  tail: Candidate[]
  /**
   * Both halves, ranked — what a card asks when it wants to know which window
   * it sits inside (`containerOf`).
   */
  all: Candidate[]
  /** Which of ticket 09's three empty states applies, or null. */
  empty: EmptyReason | null
  /** Whose faces to draw, by id. Every Friend in a Candidate is in here. */
  friendsById: ReadonlyMap<string, SetUpFriend>
  /**
   * The **whole Group**, Hidden included — the glow's denominator, and the
   * `everyone` pill's bar.
   */
  groupSize: number
  /** True until the store has the range the sidebar reads. */
  loading: boolean
}

/**
 * The right pane's list, recomputed whenever anything under it moves.
 *
 * ## The five recompute triggers, and where each one is
 *
 * Ticket 09 names them: any Availability change (local or Realtime) · any eye
 * toggle · any Hangout change · a timer aligned to the slot boundaries · tab
 * focus. Four of the five are *already* React dependencies and need no
 * machinery at all —
 *
 * - **Availability** — `heldFrom`'s identity is keyed on the store's slot set,
 *   so an optimistic paint and a Realtime insert both land here.
 * - **Eye toggles** — `roster.visible` is rebuilt when `hidden` moves.
 * - **Hangouts** — a prop, and issue 09 owns where it comes from.
 * - **Time** — `useSlotClock`, which also covers **focus**. It is the only one
 *   of the five with nothing to hang off, because step 1 of the pipeline makes
 *   the list stale with no data change whatsoever.
 *
 * ## Who is counted, and who is not
 *
 * `setUpOnly` on both sides — a Friend mid-setup is in neither the numerator
 * nor the denominator. They cannot hold Availability (`RequireSetup` stands
 * between the app and the grid) so they can never be *in* a Candidate, and they
 * have no hue and no face to draw on a card. Counting them in `groupSize`
 * anyway would raise the glow bar for a Friend who cannot help clear it, and a
 * single unfinished signup would take the `everyone` pill away from the whole
 * Group until they finished. It is the same rule the heatmap already uses
 * (`counted` in `week-grid.tsx`), applied to the other denominator.
 */
export const useCandidates = ({
  roster,
  availability,
  hangouts,
}: {
  roster: RosterState
  availability: AvailabilityStore
  /** Confirmed Hangouts, from now forward. Issue 09 fills this in. */
  hangouts: readonly HangoutRange[]
}): CandidateList => {
  const horizon = useSlotClock(GROUP_TIME_ZONE)

  /*
   * Pulled off the store rather than reached through it inside the memos below.
   * The store is a fresh object literal every render, so depending on it would
   * re-run the whole pipeline whenever anything in the shell re-rendered — the
   * shape `app-shell.tsx` already names for `silent`.
   */
  const { heldFrom, status } = availability

  const countable = useMemo(() => setUpOnly(roster.visible), [roster.visible])
  const visibleIds = useMemo(() => countable.map((friend) => friend.id), [countable])
  const groupSize = useMemo(() => setUpOnly(roster.friends).length, [roster.friends])

  const scan = useMemo(
    () =>
      scanCandidates({
        slots: heldFrom(horizon),
        visible: visibleIds,
        hangouts,
        from: horizon,
      }),
    [heldFrom, horizon, visibleIds, hangouts]
  )

  const { shown, tail } = useMemo(() => splitAtGlow(scan.candidates, groupSize), [scan, groupSize])

  const friendsById = useMemo(
    () => new Map(countable.map((friend) => [friend.id, friend])),
    [countable]
  )

  return {
    shown,
    tail,
    all: scan.candidates,
    /*
     * No empty state while the read is in flight. Every one of the three names
     * a *reason* there is nothing to show, and "nobody's free yet — draw your
     * availability" shown over a query that has not landed is the one reason
     * that is never true.
     */
    empty: status === 'ready' ? emptyReason(visibleIds.length, scan) : null,
    friendsById,
    groupSize,
    loading: status === 'loading',
  }
}
