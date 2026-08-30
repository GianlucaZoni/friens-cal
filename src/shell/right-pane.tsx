import { SidebarContent } from '@/shell/shell'

/**
 * The right pane: pinned Hangouts above a flat list of Candidates.
 *
 * A stub. Issue 08 computes the Candidates and issue 09 confirms them into
 * Hangouts; the card anatomy is theirs. What the shell owes them is the shape
 * that is here — a bordered region for pinned Hangouts above the Candidate
 * list, with the two scrolling as one region rather than two.
 *
 * A Candidate and a Hangout look alike on screen and are entirely different
 * things (CONTEXT.md): one is a live derivation, the other a fact that was
 * written down. Hence two regions rather than one list with a badge.
 */
export const RightPane = () => (
  <SidebarContent>
    <div className="flex flex-col gap-1.5 border-b p-2">
      <SectionLabel>Pinned Hangouts</SectionLabel>
    </div>
    <div className="flex flex-col gap-1.5 p-2">
      <SectionLabel>Candidates</SectionLabel>
    </div>
  </SidebarContent>
)

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="px-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
    {children}
  </span>
)
