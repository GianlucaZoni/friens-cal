import type { AvailabilityStore } from '@/availability/use-availability'
import { CandidateList } from '@/candidates/candidate-list'
import type { HangoutRange } from '@/candidates/candidates'
import { useCandidates } from '@/candidates/use-candidates'
import type { RosterState } from '@/roster/use-roster'
import { SidebarContent } from '@/shell/shell'

/**
 * The right pane: the Candidate list, and — once issue 09 exists — pinned
 * Hangouts above it.
 *
 * **Neither region gets a heading, and the divider exists only when both
 * regions do** (ticket 16). The stub this replaced carried "Pinned Hangouts"
 * and "Candidates" labels above two bordered regions, which is more chrome than
 * a 17rem column supports and, with no Hangouts in the database yet, would
 * label an empty box. So: no Hangouts → no rule and no heading, the Candidates
 * start at the top. Issue 09 adds the region, the rule and the pin glyph that
 * tells the two objects apart — *a Candidate and a Hangout look alike on screen
 * and are entirely different things* (`CONTEXT.md`).
 *
 * The two hooks arrive as props and the derivation happens **here** rather than
 * in `AppShell`: this is the only reader, and unlike `silent` — which the shell
 * computes because the *left* pane needs something only the store can answer —
 * nothing above needs a Candidate.
 */
export const RightPane = ({
  roster,
  availability,
  hangouts,
}: {
  roster: RosterState
  availability: AvailabilityStore
  /** Confirmed Hangouts from now forward. Empty until issue 09. */
  hangouts: readonly HangoutRange[]
}) => {
  const list = useCandidates({ roster, availability, hangouts })

  return (
    <SidebarContent>
      <div className="flex flex-col gap-1.5 p-2">
        <CandidateList
          list={list}
          hangoutsPinned={hangouts.length > 0}
          hiddenCount={roster.hidden.size}
          onShowAll={roster.showAll}
        />
      </div>
    </SidebarContent>
  )
}
