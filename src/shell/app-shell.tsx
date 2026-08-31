import { useSession } from '@/auth/use-session'
import { useAvailability } from '@/availability/use-availability'
import { useDrawingTools } from '@/availability/use-drawing-tools'
import { Toaster } from '@/components/ui/toast'
import { identityOf } from '@/identity/friend-row'
import { useRoster } from '@/roster/use-roster'
import { Calendar } from '@/shell/calendar'
import { LeftPane } from '@/shell/left-pane'
import { OfflineBanner } from '@/shell/offline-banner'
import { RightPane } from '@/shell/right-pane'
import { AppShellProvider, ShellInset, ShellSidebar } from '@/shell/shell'
import { TopBar } from '@/shell/top-bar'
import { useCalendarView } from '@/shell/use-calendar-view'
import { useMemo } from 'react'

/**
 * The three-column shell the whole app lives in.
 *
 * **Variant C** (ticket 12 decision 1): the left pane runs the full height of
 * the window and carries the product mark; the top bar spans the centre and the
 * right pane. Two other arrangements were prototyped and this is the one the
 * reference screenshot shows — the screenshot was a decision, not a sketch.
 *
 * Below 768px both panes leave the flow and become one sheet at a time; see
 * `shell.tsx`, which owns that invariant.
 *
 * The four pieces of view state the whole app reads sit here, one hook each,
 * and travel by prop: where the calendar is pointed, which Friends are Hidden,
 * everyone's Availability, and what a drag on the grid means. The roster is here
 * rather than inside the left pane because Hidden is a query tool — issue 07's
 * heatmap is computed over `roster.visible` and issue 08's Candidate list will
 * be, and neither of them is in the sidebar. Availability is here for the same
 * reason twice over: issue 06 writes into it from the grid and issue 08 computes
 * Candidates from it in the right pane.
 *
 * The two derivations below are here because each needs **both** of those hooks,
 * and nowhere further down the tree holds both: the wash's query is the roster
 * crossed with the store, and so is silence.
 *
 * The drawing tools are here because they are **split across two columns**:
 * ticket 01 put the "Drawing mode:" tabbar and the erase toggle in the left
 * pane, and the grid they govern is in the centre.
 */
export const AppShell = () => {
  const calendar = useCalendarView()
  const roster = useRoster()
  const availability = useAvailability(calendar.days)
  const tools = useDrawingTools()

  /**
   * Whose Availability the grid draws, and the one colour it draws in.
   *
   * `RequireSetup` stands between here and the route, so an identity is
   * guaranteed in practice — but the row's columns are nullable in the type,
   * and `identityOf` is the codebase's single predicate for "finished setup".
   * Null renders the lattice with nothing on it, which is the honest picture of
   * a Friend who has no colour yet.
   *
   * Read from the session rather than off `roster.friends.find(f => f.isSelf)`,
   * which holds the same thing. The session provider owns your own row and has
   * it before the roster query lands; going through the roster would make the
   * grid's colour wait on a read it otherwise has nothing to do with. It is not
   * a second read of `friend` either — no query is issued here.
   */
  const { state } = useSession()
  const viewer = useMemo(() => {
    if (state.status !== 'signed-in') return null
    const identity = identityOf(state.friend)
    return identity === null ? null : { id: state.user.id, hue: identity.hue }
  }, [state])

  /**
   * The Friends holding no Availability anywhere in the week on screen —
   * CONTEXT.md's **silence**, which the roster marks with a muted dot so an
   * inactive Friend does not read as a busy one (ticket 01).
   *
   * Computed here because it is the one place that holds both halves: the store
   * has every Friend's rows and the roster has the Friends. `friends` rather
   * than `visible`, so a Hidden Friend's row still says whether they have said
   * anything — hiding is a query tool, not a reason to stop reporting.
   */
  const rosterIds = useMemo(() => roster.friends.map((friend) => friend.id), [roster.friends])
  const silent = useMemo(() => availability.silent(rosterIds), [availability, rosterIds])

  return (
    <AppShellProvider>
      {/*
        Above the columns, so it is a fact about the app rather than about the
        calendar — see `OfflineBanner`.
      */}
      <OfflineBanner />
      <div className="flex min-h-0 flex-1">
        <ShellSidebar side="left">
          <LeftPane calendar={calendar} roster={roster} silent={silent} tools={tools} />
        </ShellSidebar>

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar calendar={calendar} saving={availability.saving} />
          <div className="flex min-h-0 flex-1">
            <ShellInset>
              <Calendar
                calendar={calendar}
                availability={availability}
                viewer={viewer}
                visible={roster.visible}
                tools={tools}
              />
            </ShellInset>
            <ShellSidebar side="right">
              <RightPane />
            </ShellSidebar>
          </div>
        </div>
      </div>

      {/*
        One `Toaster` for the app. The manager it renders is the module-level one
        in `toast-manager.ts`, so `useAvailability` can raise a failed write from
        outside this tree — which it is, being a hook rather than a component.
      */}
      <Toaster />
    </AppShellProvider>
  )
}
