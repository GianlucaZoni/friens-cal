import { useSession } from '@/auth/use-session'
import { isCalId } from '@/cal/cals'
import { CurrentCalContext } from '@/cal/use-current-cal'
import type { Cal } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router'

/**
 * A resolved read, tagged with which id it answers.
 *
 * The tag is what separates "we have not asked about this cal yet" from "there
 * is no such cal", which is the same split `FetchedFriend` makes in
 * `session-provider.tsx` and for the same reason: without it, routing from one
 * cal to another renders the cal you just left until the new read lands.
 */
type Fetched = { forCalId: string; cal: Cal | null; failed: boolean }

/**
 * The cal named by `/g/:id`, and the gate on everything under it.
 *
 * ## The id comes from the route, and one row comes back
 *
 * Slice 01 read the whole list and took the alphabetically first row, which was
 * the only thing it could do while `/` was the calendar. The cal is in the URL
 * now, so this reads exactly the row the URL asks for.
 *
 * **One row rather than the list filtered.** A `/g/:id` that is not yours must
 * come back empty rather than come back as somebody else's cal or as a list to
 * search, and `cal`'s select policy is `id in (select private.my_cal_ids())` —
 * so a cal you are not a Member of returns no row, by the same expression that
 * would have hidden it from a list. Not a Member and no such cal are one state
 * here on purpose: telling them apart would answer "does this id exist" for
 * every id, which is the enumeration ticket 11 refused for Codes.
 *
 * **The shape guard is not decoration.** `.eq('id', 'nonsense')` comes back
 * `22P02 invalid input syntax for type uuid`, an error rather than an empty
 * result, so without `isCalId` a mistyped address would read as an outage.
 *
 * ## The remount
 *
 * `key` on the children, because the two stores below hold **one cal's rows and
 * are not keyed by cal** (`use-availability.ts`, `use-hangouts.ts`): routing
 * from one cal to another keeps `CalendarPage` mounted at the same position, so
 * without this the new cal's rows would be folded into the old cal's state and
 * one cal's Saturday would be painted on the other's grid. The read below also
 * passes through its loading branch on every id change, which would unmount
 * them anyway — this states the invariant rather than relying on that.
 *
 * ## The gate
 *
 * Nothing renders until the read resolves. A nullable cal would push a case
 * that lasts one round trip into every query in the product, and the grid would
 * spend that round trip drawing an empty week that is indistinguishable from a
 * week nobody drew in.
 */
export const CurrentCalProvider = ({ children }: { children: React.ReactNode }) => {
  const { state } = useSession()
  const userId = state.status === 'signed-in' ? state.user.id : null
  const { id } = useParams<{ id: string }>()
  const calId = isCalId(id) ? id : null

  const [fetched, setFetched] = useState<Fetched | null>(null)

  useEffect(() => {
    if (userId === null || calId === null) return

    let live = true
    void supabase
      .from('cal')
      .select('id, name, code, created_at')
      .eq('id', calId)
      // `maybeSingle`, not `single`: no row is the not-a-Member answer, and
      // `single` would deliver it as a PostgREST error (`PGRST116`) mixed in
      // with the failures that really are failures.
      .maybeSingle()
      .then(({ data, error }) => {
        if (!live) return
        if (error) {
          // A permission-denied here is almost always the grant rather than the
          // query — this project does not expose new tables automatically. See
          // supabase/08-cal-and-membership.sql §5.
          console.error('Could not read that cal:', error.message)
          setFetched({ forCalId: calId, cal: null, failed: true })
          return
        }
        setFetched({ forCalId: calId, cal: data, failed: false })
      })

    return () => {
      live = false
    }
  }, [userId, calId])

  /**
   * A rename this tab just wrote, folded in.
   *
   * The id is checked rather than assumed. The same `useCals` renames cals
   * from `/`'s list too, where most of them are not the one on screen, and
   * checking here is what lets that call site stay one line with no branch.
   *
   * Not a re-read. The row PostgREST hands back is the row that was written,
   * so asking for it again would be a second round trip to learn what the
   * first one already said.
   */
  const renamed = useCallback((next: Cal) => {
    setFetched((held) =>
      held === null || held.forCalId !== next.id ? held : { ...held, cal: next }
    )
  }, [])

  // Derived, never assigned in the effect: a stale answer is one whose
  // `forCalId` is not the id in the URL, and comparing is what makes routing
  // from one cal to another show the loading branch rather than the cal you
  // just left. Clearing it on the way in would be a synchronous setState in an
  // effect, which is a cascading render for the same result.
  const resolved = calId !== null && fetched?.forCalId === calId ? fetched : null
  const cal = resolved?.cal ?? null
  const current = useMemo(
    () => (cal === null ? null : { cal, calId: cal.id, renamed }),
    [cal, renamed]
  )

  if (calId !== null && resolved === null) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center text-xs text-muted-foreground"
      >
        Loading…
      </div>
    )
  }

  if (resolved?.failed) {
    return (
      <DeadEnd role="alert">
        <p>We cannot reach that cal. Reload, and if it keeps happening say so in the group chat.</p>
      </DeadEnd>
    )
  }

  if (current === null) {
    /*
     * Not one of your cals, or not a cal at all: the same answer for both, and
     * the answer is `/`, silently (planning ticket 10 §9). `/` is always the
     * join-or-create page and already carries the Code field, so a screen here
     * would be a second place to type a Code. And the id is opaque (planning
     * ticket 01): a page that says "not one of yours" to a guessed id tells the
     * guesser a cal exists behind it, where the redirect tells them nothing.
     * The `cal` read cannot tell the two cases apart either, which is the
     * policy working. Slice 02 shipped a dead-end screen here; this reverts it
     * to the settled decision.
     */
    return <Navigate to="/" replace />
  }

  return (
    <CurrentCalContext value={current}>
      <Fragment key={current.calId}>{children}</Fragment>
    </CurrentCalContext>
  )
}

/** The two dead ends above, which differ in their sentence and in nothing else. */
const DeadEnd = ({ role, children }: { role: 'alert' | 'status'; children: React.ReactNode }) => (
  <div
    role={role}
    className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center text-xs text-muted-foreground"
  >
    {children}
  </div>
)
