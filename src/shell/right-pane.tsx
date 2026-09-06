import { useSession } from '@/auth/use-session'
import type { AvailabilityStore } from '@/availability/use-availability'
import { CandidateCard } from '@/candidates/candidate-card'
import { CandidateList, Empty } from '@/candidates/candidate-list'
import { containerOf, glows, isFullHouse } from '@/candidates/candidates'
import type { CandidateList as List } from '@/candidates/use-candidates'
import { friendsIn, useCandidates } from '@/candidates/use-candidates'
import { Skeleton } from '@/components/ui/skeleton'
import { facesOf, pinned } from '@/hangouts/hangout'
import { HangoutCard, PinnedHangouts, type HangoutControls } from '@/hangouts/hangout-card'
import type { HangoutStore } from '@/hangouts/use-hangouts'
import type { RosterState, SetUpFriend } from '@/roster/use-roster'
import { peekOf, type Peek } from '@/shell/peek'
import { SidebarContent } from '@/shell/shell'
import { useAppShell } from '@/shell/shell-context'
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

  /*
   * The peek, on a phone. The pane's contents are the drawer's contents at both
   * heights — this is the same component, rendering one labelled card instead of
   * the list while the drawer is down. See `DrawerPeek`.
   */
  const { isSheet, drawer } = useAppShell()
  if (isSheet && drawer === 'peek')
    return (
      <DrawerPeek
        peek={peekOf(upcoming, list.all, list.empty)}
        list={list}
        roster={roster}
        hangouts={hangouts}
        isFree={availability.isFree}
        friendsById={friendsById}
        namesById={namesById}
        viewerId={viewerId}
        now={now}
        controls={controls}
      />
    )

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

/**
 * The label above the peek's one card, chosen by what the card turned out to be
 * — *"'Upcoming' … otherwise 'Best Candidate' … otherwise whichever of the
 * three empty states applies"* (ticket 17).
 *
 * The last two cases share a word, and they share it for one reason: with
 * nothing specific to name, the strip falls back to naming **the pane** — which
 * is what `PANE.right.title` calls it everywhere else in the shell. A `null`
 * peek is the read still in flight and an `'empty'` one is ticket 09's answer
 * that there is nothing to suggest; neither has a plan to point at.
 */
const PANE_TITLE = 'Hangouts'

const peekLabel = (peek: Peek): string => {
  if (peek === null) return PANE_TITLE
  if (peek.kind === 'hangout') return 'Upcoming'
  return peek.kind === 'candidate' ? 'Best Candidate' : PANE_TITLE
}

/**
 * The bottom drawer while it is down: **one labelled card**, and nothing else.
 *
 * Ticket 17, and its reason is the whole design: *"the peek is the scarcest
 * space on the smallest screen, and a card answers* when are we meeting
 * *without opening anything."* One real card rather than a summary count — a
 * count would need opening to be worth anything, which is the opposite of what
 * a peek is for.
 *
 * `peekOf` chooses; this draws. The card is the **same** `HangoutCard` or
 * `CandidateCard` the expanded drawer holds, with the same detail sheet behind
 * a tap, so the peek is a window onto the list rather than a summary of it —
 * and confirming the best Candidate is reachable without dragging anything.
 *
 * ## A tap here opens a second bottom surface, and that is correct
 *
 * `CardDetail` comes up from the bottom on the `(hover: none)` path (issue 10),
 * so tapping this card puts a modal sheet over a non-modal drawer. The
 * acceptance criterion *"only one sheet can be open at a time"* is a claim about
 * the two **panes** — that is what the shell's slot governs
 * (`shell-context.ts`) — and below the breakpoint it now holds by construction,
 * because only the left pane can be a sheet at all. A card detail was never in
 * the slot: it has coexisted with the left drawer since issue 10, and one modal
 * surface over one permanent one is exactly one focus trap.
 */
const DrawerPeek = ({
  peek,
  list,
  roster,
  hangouts,
  isFree,
  friendsById,
  namesById,
  viewerId,
  now,
  controls,
}: {
  peek: Peek
  list: List
  /*
    The two stores whole, rather than the four values the peek reads off them.
    `CandidateList` next door takes those four unpacked on purpose — it is a
    shared component and knowing about stores is not its business — but this one
    is private to this file, its caller holds both intact, and unpacking them
    here only makes a longer signature that has to be kept in step by hand.
  */
  roster: RosterState
  hangouts: HangoutStore
  isFree: AvailabilityStore['isFree']
  friendsById: ReadonlyMap<string, SetUpFriend>
  namesById: ReadonlyMap<string, string>
  viewerId: string | null
  now: number
  controls: HangoutControls
}) => (
  <div className="flex min-h-0 flex-col gap-1 px-2 pt-0.5">
    <p className="px-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
      {peekLabel(peek)}
    </p>

    {/*
      `null` is **not** an empty state: `list.empty` is null while the read is in
      flight, and ticket 09 wrote three separate messages precisely so that
      "nobody's free yet" is never shown over a query that has not landed.
    */}
    {peek === null && <Skeleton className="h-[62px] rounded-md" />}

    {peek?.kind === 'empty' && (
      <Empty
        reason={peek.reason}
        /*
          There is no pinned region above this one — if there were a Hangout the
          peek would be showing it rather than an empty state — so the reword
          ticket 16 asked for cannot apply here.
        */
        hangoutsPinned={false}
        hiddenCount={roster.hidden.size}
        onShowAll={roster.showAll}
      />
    )}

    {peek?.kind === 'hangout' && viewerId !== null && (
      <ul aria-label="Confirmed hangouts" className="flex flex-col">
        <HangoutCard
          hangout={peek.hangout}
          friends={facesOf(peek.hangout, friendsById)}
          friendsById={friendsById}
          namesById={namesById}
          viewerId={viewerId}
          now={now}
          isFree={isFree}
          controls={controls}
        />
      </ul>
    )}

    {peek?.kind === 'candidate' && (
      <ul aria-label="Candidates" className="flex flex-col">
        <CandidateCard
          candidate={peek.candidate}
          friends={friendsIn(peek.candidate, list.friendsById)}
          glowing={glows(peek.candidate, list.groupSize)}
          fullHouse={isFullHouse(peek.candidate, list.groupSize)}
          /*
            Resolved against the whole ranked list, as it is in the expanded
            drawer — the annotation is about where this Candidate sits among all
            of them, not among the one that happens to be on screen.
          */
          container={containerOf(peek.candidate, list.all)}
          onConfirm={() => hangouts.confirm(peek.candidate)}
          pending={hangouts.confirming === peek.candidate.id}
          busy={hangouts.confirming !== null}
        />
      </ul>
    )}
  </div>
)
