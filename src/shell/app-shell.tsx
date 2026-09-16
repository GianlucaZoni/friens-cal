import { useSession } from '@/auth/use-session'
import { useAvailability } from '@/availability/use-availability'
import { useDrawingTools } from '@/availability/use-drawing-tools'
import { CalsContext, useCals } from '@/cal/use-cals'
import { useSlotClock } from '@/candidates/use-slot-clock'
import { Toaster } from '@/components/ui/toast'
import { useHangouts } from '@/hangouts/use-hangouts'
import { identityOf } from '@/identity/friend-row'
import { useRoster } from '@/roster/use-roster'
import { Calendar } from '@/shell/calendar'
import { LeftPane } from '@/shell/left-pane'
import { OfflineBanner } from '@/shell/offline-banner'
import { RightPane } from '@/shell/right-pane'
import { AppShellProvider, ShellInset, ShellSidebar } from '@/shell/shell'
import { TopBar } from '@/shell/top-bar'
import { useCalendarView } from '@/shell/use-calendar-view'
import { ViewerZoneContext } from '@/shell/viewer-zone'
import { deviceTimeZone, viewerZoneAmong } from '@/shell/zone'
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
   * `calendar.days` is **every day the view on screen draws** — one day, three,
   * a week, or a month lattice that starts up to five weeks before the anchor's
   * Monday. The grids are handed the same array, so the cells drawn and the
   * rows fetched cannot disagree.
   *
   * That is not tidying. Both stores take their floor from `floorOfView`, which
   * reads the first day it is handed, and before issue 11 both were handed the
   * anchor's *week* — so the month grid drew cells from a range Postgres had
   * never been asked for, with `status` already `ready`, and a month of
   * unfetched Availability is indistinguishable from a month nobody drew
   * anything in. Issue 11 closed it with a second array beside the first; issue
   * 12 made the first one view-correct, so there is no longer a second thing to
   * keep in step. See `daysOf`.
   */
  const availability = useAvailability(calendar.days)
  const hangouts = useHangouts(calendar.days)
  const tools = useDrawingTools()

  /**
   * Every cal this Friend is in — **one instance, read by both side panes**.
   *
   * The switcher in the left pane shows the list; `useElsewhere` in the right
   * one resolves the double-booking mark's cal names against it. Both called
   * `useCals` for themselves until this line, which cost a second query on
   * every cal screen and, worse, meant a rename in the switcher never reached
   * the other one's `namesById`: the clash warning kept naming the cal by the
   * name it no longer had, until the next navigation.
   *
   * Here rather than in a provider of its own for the reason everything else in
   * this component is here — one hook each, in the one place that is above
   * every reader. Nothing is threaded down, because the two readers are seven
   * and three layers away and the value is a fact about the viewer, not about
   * any column.
   */
  const cals = useCals()

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
  const now = useSlotClock()

  /**
   * The zone this screen is drawn in, and the frame its time strings name.
   *
   * The zone is the **device's**, read fresh rather than stored, so a Friend
   * who lands in another country sees their grid redraw with no setting to
   * change and nothing to reconcile. A cal has no clock of its own to disagree
   * with it (`CONTEXT.md`, **Group**).
   *
   * The frame is `GMT+2`, and it is null unless at least one *other* Member
   * reads a different clock — so every cal in existence today renders exactly
   * what v1 rendered, and the marker appears the moment somebody is abroad.
   * Your own row is excluded because its `time_zone` is a mirror that may be a
   * round trip behind the device it mirrors, which would otherwise make the
   * frame flicker on for the beat after you land.
   *
   * Beside `now` because it is the same kind of fact and it is asked of the
   * same instant: which clocks differ is a property of a moment, not of a pair
   * of zones — Rome and New York are six hours apart most of the year and five
   * for the ten days the EU has moved and the US has not.
   */
  const zone = useMemo(
    () =>
      viewerZoneAmong(
        deviceTimeZone(),
        roster.friends.filter((friend) => !friend.isSelf).map((friend) => friend.timeZone),
        now
      ),
    [roster.friends, now]
  )

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
   *
   * `roster.friends` is the cal's **Members** as of issue 04, so a Friend in
   * another cal no longer wears a silence dot on this one's sidebar.
   */
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
      <CalsContext value={cals}>
        <ViewerZoneContext value={zone}>
          {/*
          Above the columns, so it is a fact about the app rather than about the
          calendar — see `OfflineBanner`.
        */}
          <OfflineBanner />
          <div className="flex min-h-0 flex-1">
            <ShellSidebar side="left">
              <LeftPane
                calendar={calendar}
                roster={roster}
                silent={silent}
                now={now}
                tools={tools}
              />
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
                    Two sets, because the grid draws two different objects from
                    them: the wash is `visible` (a query — the Members you are
                    currently trying to meet) and a Hangout's faces come from
                    `friendsById` (a fact — hiding never hides a Hangout, and
                    neither does leaving the cal). The hook holds both, so
                    nothing here can pick the wrong one.
                  */
                    visible={roster.visible}
                    friendsById={roster.friendsById}
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
                    now={now}
                  />
                </ShellSidebar>
              </div>
            </div>
          </div>

          {/*
          One `Toaster` for the app. The manager it renders is the module-level
          one in `toast-manager.ts`, so `useAvailability` can raise a failed
          write from outside this tree — which it is, being a hook rather than a
          component.
        */}
          <Toaster />
        </ViewerZoneContext>
      </CalsContext>
    </AppShellProvider>
  )
}
