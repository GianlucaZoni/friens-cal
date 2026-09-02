import { CandidateCard } from '@/candidates/candidate-card'
import { containerOf, glows, isFullHouse, type Candidate } from '@/candidates/candidates'
import type { CandidateList as List } from '@/candidates/use-candidates'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useState } from 'react'
import { times } from 'lodash-es'

/**
 * The Candidate list: a flat, ranked list of when the group could meet.
 *
 * **Flat, with no day headers.** The sort is count-then-time, so the list is not
 * chronological — Thursday, Tuesday, Thursday again — and a header is
 * impossible without abandoning the ranking ticket 01 settled and ticket 09
 * specified. Every card states its own date instead.
 *
 * **The tail collapses behind *show more*.** Not a cap: nothing is removed, and
 * the cut line is the same `2 × friends > groupSize` the glow uses, so the list
 * opens with exactly the Candidates the product calls worth looking at. See
 * `splitAtGlow`, including the one case where the cut does not apply.
 */
export const CandidateList = ({
  list,
  hangoutsPinned,
  hiddenCount,
  onShowAll,
}: {
  list: List
  /**
   * Whether the pinned Hangout region above has anything in it.
   *
   * Ticket 16: hiding everybody shows *"Show more friends…"* directly beneath
   * Hangout cards displaying those same Friends' faces. Both behaviours are
   * settled and correct, and together they look broken — so the empty state
   * rewords. Issue 09 owns the region; this is the flag it will set.
   */
  hangoutsPinned: boolean
  /** How many Friends the filter is holding back, so the action can say so. */
  hiddenCount: number
  onShowAll: () => void
}) => {
  const [expanded, setExpanded] = useState(false)

  if (list.loading) return <CandidateSkeleton />

  if (list.empty !== null)
    return (
      <Empty
        reason={list.empty}
        hangoutsPinned={hangoutsPinned}
        hiddenCount={hiddenCount}
        onShowAll={onShowAll}
      />
    )

  const cards = expanded ? [...list.shown, ...list.tail] : list.shown

  return (
    <>
      <ul aria-label="Candidates" className="flex flex-col gap-1.5">
        {cards.map((candidate) => (
          <CandidateCard
            key={candidate.id}
            candidate={candidate}
            friends={friendsIn(candidate, list.friendsById)}
            glowing={glows(candidate, list.groupSize)}
            fullHouse={isFullHouse(candidate, list.groupSize)}
            /*
             * Resolved against the *whole* ranked list, not against what is on
             * screen: a card whose container is still in the collapsed tail is
             * exactly the card that needs to say so.
             */
            container={containerOf(candidate, list.all)}
          />
        ))}
      </ul>

      {list.tail.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="justify-start text-muted-foreground"
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? 'Show fewer' : `Show ${list.tail.length} more`}
        </Button>
      )}
    </>
  )
}

/**
 * The Friends in a Candidate, as faces.
 *
 * `flatMap` rather than `map`: `friendsById` is built from the same visible set
 * the pipeline swept, so a miss is not reachable — but a Friend who left the
 * roster between the scan and this render would otherwise be an `undefined` in
 * a list React then tries to draw.
 */
const friendsIn = (candidate: Candidate, byId: List['friendsById']) =>
  candidate.friendIds.flatMap((id) => {
    const friend = byId.get(id)
    return friend === undefined ? [] : [friend]
  })

/**
 * Ticket 09's three empty states, its copy verbatim, in its order.
 *
 * Each one names the *reason* there is nothing to show, which is the whole
 * design: "no overlaps yet" shown to somebody who has hidden four Friends would
 * be true and useless.
 */
const Empty = ({
  reason,
  hangoutsPinned,
  hiddenCount,
  onShowAll,
}: {
  reason: NonNullable<List['empty']>
  hangoutsPinned: boolean
  hiddenCount: number
  onShowAll: () => void
}) => {
  if (reason === 'too-few-friends')
    return (
      <div className="flex flex-col items-start gap-1.5 px-0.5">
        <p className="text-[11px] text-muted-foreground">
          {hangoutsPinned
            ? // Reworded rather than accepted, and rather than muting the Hidden
              // Friends' faces on the Hangout cards above — ticket 01 settles
              // that hiding never hides a Hangout, and muting would be a partial
              // hide through the back door.
              'Nothing to suggest while friends are hidden.'
            : 'Show more friends to see when you can meet.'}
        </p>
        {/*
          Only when the filter is what is holding the list back. With a Group
          this new there may simply be nobody else yet, and a button offering to
          unhide nothing would be the sidebar blaming the viewer for it.
        */}
        {hiddenCount > 0 && (
          <Button variant="outline" size="sm" onClick={onShowAll}>
            Show all friends
          </Button>
        )}
      </div>
    )

  return (
    <p className="px-0.5 text-[11px] text-muted-foreground">
      {reason === 'no-availability'
        ? "Nobody's free yet — draw your availability."
        : "No overlaps yet — nobody's free at the same time."}
    </p>
  )
}

/** Two, because a wall of grey boxes is worse than a gap — the roster's rule. */
const SKELETON_CARDS = 2

const CandidateSkeleton = () => (
  <div className="flex flex-col gap-1.5">
    {times(SKELETON_CARDS, (index) => (
      <Skeleton key={index} className="h-[62px] rounded-md" />
    ))}
  </div>
)
