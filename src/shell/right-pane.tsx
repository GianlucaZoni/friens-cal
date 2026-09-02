import { useSession } from '@/auth/use-session'
import type { AvailabilityStore } from '@/availability/use-availability'
import { CandidateList } from '@/candidates/candidate-list'
import { useCandidates } from '@/candidates/use-candidates'
import { pinned } from '@/hangouts/hangout'
import { PinnedHangouts } from '@/hangouts/hangout-card'
import type { HangoutStore } from '@/hangouts/use-hangouts'
import type { RosterState, SetUpFriend } from '@/roster/use-roster'
import { SidebarContent } from '@/shell/shell'
import { useMemo } from 'react'

/**
 * The right pane: the pinned Hangouts, then the Candidate list.
 *
 * **Neither region gets a heading, and the divider exists only when both
 * regions do** (ticket 16). The stub this replaced carried "Pinned Hangouts"
 * and "Candidates" labels above two bordered regions, which is more chrome than
 * a 17rem column supports. So: no Hangouts → no rule and no heading, the
 * Candidates start at the top; no Candidates → the rule, then the empty message
 * beneath it. The pin glyph and the card treatment carry the distinction — *a
 * Candidate and a Hangout look alike on screen and are entirely different
 * things* (`CONTEXT.md`).
 *
 * **The two regions are ordered by what they are, not by time.** Hangouts are
 * facts and read chronologically; Candidates are offers and read by rank
 * (count, then time). A single merged list would have to abandon one of the two
 * orderings, and there is no reading of "Saturday is booked" that belongs
 * between two suggestions.
 *
 * **Hiding never reaches the pinned region.** Hiding is a query tool over who
 * the viewer is trying to meet, and it drives both the grid and the Candidate
 * ranking — but a Hangout is not an offer, so there is nothing for it to
 * filter. `pinned` takes no roster and no visible set, which is the API saying
 * so rather than a comment promising it.
 *
 * The hooks arrive as props and the Candidate derivation happens **here**: this
 * is the only reader, and unlike `silent` — which the shell computes because the
 * *left* pane needs something only the store can answer — nothing above needs a
 * Candidate.
 */
export const RightPane = ({
  roster,
  availability,
  hangouts,
  friendsById,
  now,
}: {
  roster: RosterState
  availability: AvailabilityStore
  hangouts: HangoutStore
  /**
   * The whole roster by id, Hidden included — **not** `list.friendsById`, which
   * is built from `roster.visible` because that is the Candidate scan's query.
   * A Hangout card draws a Hidden Friend's blob in full (ticket 01, ticket 16).
   * Held in `AppShell`, because the grid reads the same map.
   */
  friendsById: ReadonlyMap<string, SetUpFriend>
  /** The start of the current Slot — the app's one clock, held in `AppShell`. */
  now: number
}) => {
  const list = useCandidates({ roster, availability, hangouts, now })
  const { state } = useSession()
  const viewerId = state.status === 'signed-in' ? state.user.id : null

  /**
   * Every Friend's **name** by id, including the ones mid-setup.
   *
   * A second map beside `friendsById`, and the two really are different
   * queries: a face needs a finished identity (`setUpOnly`) and a provenance
   * line needs only a name. A Hangout confirmed by somebody who has not
   * finished setup would otherwise read as *confirmed by someone else*, which
   * is the fallback for a genuine race and not for a real Friend.
   *
   * Built here rather than in `AppShell` because the detail is the only reader
   * — unlike `friendsById`, which the grid needs too.
   */
  const namesById = useMemo(
    () => new Map(roster.friends.map((friend) => [friend.id, friend.name])),
    [roster.friends]
  )

  /**
   * The five lifecycle writes, as one object.
   *
   * `useMemo` because it is a prop on every card in the pinned region and the
   * store hands back a fresh literal each render — the same reason `AppShell`
   * pulls `silent` off the store rather than reaching through it.
   */
  const controls = useMemo(
    () => ({
      rename: hangouts.rename,
      retime: hangouts.retime,
      cancel: hangouts.cancel,
      leave: hangouts.leave,
      join: hangouts.join,
    }),
    [hangouts.rename, hangouts.retime, hangouts.cancel, hangouts.leave, hangouts.join]
  )

  /*
   * `now` rather than `Date.now()`, so this unpins on the same tick the
   * Candidate list re-clips on. The rule is `ends_at > now`, and it is the
   * *end* that matters: "leaves the sidebar on its day" would clear a Saturday
   * 20:00 Hangout at midnight on Saturday, twenty hours before it starts.
   */
  const upcoming = useMemo(() => pinned(hangouts.hangouts, now), [hangouts.hangouts, now])
  /*
   * `viewerId` is part of the condition rather than defaulted away: without a
   * signed-in Friend there is no "am I on this", no Join and no Leave, and
   * every control in the detail would be about nobody. `RequireAuth` stands
   * between here and the route, so this is the type being honest rather than a
   * state anybody reaches — and it has to gate the **divider** too, or the rule
   * would sit above the Candidates with nothing over it.
   */
  const hasPinned = upcoming.length > 0 && viewerId !== null

  return (
    <SidebarContent>
      <div className="flex flex-col gap-1.5 p-2">
        {hasPinned && viewerId !== null && (
          <PinnedHangouts
            hangouts={upcoming}
            friendsById={friendsById}
            namesById={namesById}
            viewerId={viewerId}
            now={now}
            isFree={availability.isFree}
            controls={controls}
          />
        )}

        {/*
          The rule, whenever there is a pinned region above it.

          Ticket 16's summary reads "the divider exists only when both regions
          do", and its own elaboration is the precise version: *no pinned
          Hangouts → no rule and no heading, Candidates start at the top; no
          Candidates → rule, then the empty message beneath it.* So the region
          below is never actually absent — an empty state is what it says
          instead of cards — and the one condition is the region above.
        */}
        {hasPinned && <hr className="my-0.5 border-border" />}

        <CandidateList
          list={list}
          hangoutsPinned={hasPinned}
          hiddenCount={roster.hidden.size}
          onShowAll={roster.showAll}
          onConfirm={hangouts.confirm}
          confirming={hangouts.confirming}
        />
      </div>
    </SidebarContent>
  )
}
