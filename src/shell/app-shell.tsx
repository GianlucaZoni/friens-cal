import { useSession } from '@/auth/use-session'
import { useAvailability } from '@/availability/use-availability'
import { useDrawingTools } from '@/availability/use-drawing-tools'
import { useSlotClock } from '@/candidates/use-slot-clock'
import { Toaster } from '@/components/ui/toast'
import { useHangouts } from '@/hangouts/use-hangouts'
import { identityOf } from '@/identity/friend-row'
import { setUpOnly, useRoster } from '@/roster/use-roster'
import { Calendar } from '@/shell/calendar'
import { LeftPane } from '@/shell/left-pane'
import { OfflineBanner } from '@/shell/offline-banner'
import { RightPane } from '@/shell/right-pane'
import { AppShellProvider, ShellInset, ShellSidebar } from '@/shell/shell'
import { TopBar } from '@/shell/top-bar'
import { GROUP_TIME_ZONE, useCalendarView } from '@/shell/use-calendar-view'
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
 * The pieces of view state the whole app reads sit here, one hook each, and
 * travel by prop: where the calendar is pointed, which Friends are Hidden,
 * everyone's Availability, everyone's Hangouts, what a drag on the grid means,
 * and what time it is. The roster is here rather than inside the left pane
 * because Hidden is a query tool — issue 07's heatmap is computed over
 * `roster.visible` and issue 08's Candidate list is too, and neither of them is
 * in the sidebar. Availability is here for the same reason twice over: issue 06
 * writes into it from the grid and issue 08 computes Candidates from it in the
 * right pane. Hangouts are here because **three** things need them: the grid
 * draws them for every Friend, the right pane pins them above the Candidates,
 * and the Candidate pipeline blanks their Slots out of its own scan.
 *
 * The derivations below are here because each is needed by more than one column
 * and nowhere further down the tree holds every input: silence is the roster
 * crossed with the store, and the Hangouts' faces are the roster read by two
 * panes at once.
 *
 * The drawing tools are here because they are **split across two columns**:
 * ticket 01 put the "Drawing mode:" tabbar and the erase toggle in the left
 * pane, and the grid they govern is in the centre.
 */
export const AppShell = () => {
  const calendar = useCalendarView()
  const roster = useRoster()
  /*
   * `shownDays`, not `days` — **every day the view on screen draws**, which in
   * month view starts up to five weeks before the anchor's Monday.
   *
   * Both stores take their floor from `floorOfView`, which reads the first day
   * it is handed, and both were handed the anchor's *week*. So the month grid
   * drew cells from a range Postgres had never been asked for, with `status`
   * already `ready` — a month of unfetched Availability is indistinguishable
   * from a month nobody drew anything in. See `shownDays`, which is where the
   * two views' ranges are reconciled so the cells and the rows cannot disagree.
   */
  const availability = useAvailability(calendar.shownDays)
  const hangouts = useHangouts(calendar.shownDays)
  const tools = useDrawingTools()

  /**
   * The start of the Slot containing now — **the app's one clock**.
   *
   * Held here rather than inside `useCandidates`, which is where it used to
   * live, because three things now depend on the same boundary and they have to
   * agree about it: the Candidate list re-clips at the half hour (step 1 of the
   * pipeline makes it stale with no data change at all), the pinned Hangout
   * region unpins the moment a Hangout *ends*, and a Hangout happening right
   * now is drawn in the destructive colour on the grid. Three `useSlotClock`s
   * would be three timers that could each be a beat apart from the others.
   *
   * It is also why the clock is aligned to the boundary rather than ticking:
   * every one of those three answers changes on the :00 and the :30 and nowhere
   * in between.
   */
  const now = useSlotClock(GROUP_TIME_ZONE)

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
  /**
   * The **whole** roster by id, Hidden included — the Hangouts' faces.
   *
   * Here for the reason `silent` is here: two columns need it and neither can
   * compute it for the other. The grid draws a Hangout's Participants on every
   * Friend's calendar and the right pane draws them again on the pinned card,
   * and both need the map the sidebar's filter has **not** touched — hiding
   * never hides a Hangout (ticket 01), and ticket 16 rejected even muting a
   * Hidden Participant's blob as a partial hide through the back door.
   *
   * `setUpOnly`, as everywhere: a Friend mid-setup has no hue and no face.
   */
  const friendsById = useMemo(
    () => new Map(setUpOnly(roster.friends).map((friend) => [friend.id, friend])),
    [roster.friends]
  )

  const rosterIds = useMemo(() => roster.friends.map((friend) => friend.id), [roster.friends])
  /*
   * `silentAmong` is pulled off the store first, rather than reached through it
   * inside the memo. Depending on `availability` would defeat the memo entirely —
   * the store is a fresh object literal every render, so ~350 × N set lookups
   * would re-run whenever anything in this shell re-rendered — and naming the
   * narrow dependency inline instead is what React Compiler refuses to preserve,
   * because the dependency it infers from the body is the whole object. A local
   * makes the two agree: the body reads `silentAmong` and nothing else.
   */
  const { silent: silentAmong } = availability
  const silent = useMemo(() => silentAmong(rosterIds), [silentAmong, rosterIds])

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
                /*
                  Two rosters, because the grid draws two different objects
                  from them: the wash is `visible` (a query — who you are
                  currently trying to meet) and a Hangout's faces come from
                  `friendsById` (a fact — hiding never hides a Hangout).
                */
                visible={roster.visible}
                friendsById={friendsById}
                hangouts={hangouts.hangouts}
                now={now}
                tools={tools}
              />
            </ShellInset>
            <ShellSidebar side="right">
              <RightPane
                roster={roster}
                availability={availability}
                hangouts={hangouts}
                friendsById={friendsById}
                now={now}
              />
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
