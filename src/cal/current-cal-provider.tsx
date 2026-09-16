import { useSession } from '@/auth/use-session'
import { isCalId } from '@/cal/cals'
import { CurrentCalContext } from '@/cal/use-current-cal'
import { buttonVariants } from '@/components/ui/button'
import type { Cal } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'

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

  // Derived, never assigned in the effect: a stale answer is one whose
  // `forCalId` is not the id in the URL, and comparing is what makes routing
  // from one cal to another show the loading branch rather than the cal you
  // just left. Clearing it on the way in would be a synchronous setState in an
  // effect, which is a cascading render for the same result.
  const resolved = calId !== null && fetched?.forCalId === calId ? fetched : null
  const cal = resolved?.cal ?? null
  const current = useMemo(() => (cal === null ? null : { cal, calId: cal.id }), [cal])

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
    return (
      <DeadEnd role="status">
        <p>
          That is not one of your friens cals. Either the address is wrong, or you need its
          six-character code.
        </p>
        {/*
          `buttonVariants` on a `Link`, not `Button render={<Link/>}`. Base UI's
          Button defaults `nativeButton` to true and warns when what it renders
          is not a `<button>`; turning that off makes it write
          `role="button"` onto an `<a>`, which is worse than the warning — this
          control goes somewhere, and a link that claims to be a button loses
          the middle-click, the context menu and the "open in new tab" a Friend
          staring at a dead end is quite likely to want. So it stays a link and
          only borrows the look.
        */}
        <Link to="/" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Your friens cals
        </Link>
      </DeadEnd>
    )
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
