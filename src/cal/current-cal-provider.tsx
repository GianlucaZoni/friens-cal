import { useSession } from '@/auth/use-session'
import { CurrentCalContext } from '@/cal/use-current-cal'
import type { Cal } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { useEffect, useMemo, useState } from 'react'

/**
 * Picks the cal on screen, and gates everything under it until there is one.
 *
 * ## It reads a table rather than holding a constant
 *
 * The cutover backfilled one cal named "spiritually unemployed" and put every
 * Friend in it, so this reads exactly one row today. It is a query anyway,
 * because the alternative — a uuid in the source — would have to be undone by
 * slice 02 rather than extended by it, and would be wrong in every checkout
 * that is not this project's one live database.
 *
 * **`cal` rather than `membership`, and that is the same fact.** `cal`'s select
 * policy is `id in (select private.my_cal_ids())`, so this query returns
 * precisely the cals the Friend is a Member of — the membership is expressed by
 * the policy instead of by a `.eq()`. The row is what the screens want: slice
 * 02's list needs the name and the Code, and reading `membership` would need a
 * second query for both.
 *
 * ## What slice 02 changes, and what it does not
 *
 * The cal moves into the URL, so this reads `useParams()` and looks the id up
 * instead of taking the first row, and a non-Member is redirected to `/` rather
 * than being told they are in no cal. **No hook below here changes**, which is
 * the whole reason this file exists. `key={calId}` on what it renders is the
 * other half of that slice: the two stores hold one cal's rows and are not
 * keyed by cal, so switching cals wants a fresh mount rather than a merge.
 *
 * ## The gate
 *
 * Nothing renders until the read resolves, which is `RequireSetup`'s shape one
 * fact over. A nullable cal would push a case that lasts one round trip into
 * every query in the product, and the grid would spend that round trip drawing
 * an empty week that is indistinguishable from a week nobody drew in.
 */
export const CurrentCalProvider = ({ children }: { children: React.ReactNode }) => {
  const { state } = useSession()
  const userId = state.status === 'signed-in' ? state.user.id : null

  const [cals, setCals] = useState<Cal[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (userId === null) return

    let live = true
    void supabase
      .from('cal')
      .select('id, name, code, created_at')
      // Alphabetical, so "the first one" is a stable answer rather than
      // whichever row Postgres handed back first. Slice 02's list is ordered
      // the same way.
      .order('name')
      .then(({ data, error }) => {
        if (!live) return
        if (error) {
          // A permission-denied here is almost always the grant rather than the
          // query — this project does not expose new tables automatically. See
          // supabase/08-cal-and-membership.sql §5.
          console.error('Could not read your cals:', error.message)
          setFailed(true)
          setCals([])
          return
        }
        setFailed(false)
        setCals(data)
      })

    return () => {
      live = false
    }
  }, [userId])

  const current = useMemo(() => {
    const cal = cals?.[0]
    return cal === undefined ? null : { cal, calId: cal.id }
  }, [cals])

  if (cals === null) {
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

  if (failed) {
    return (
      <div
        role="alert"
        className="flex min-h-screen items-center justify-center px-6 text-center text-xs text-muted-foreground"
      >
        We cannot reach your cals. Reload, and if it keeps happening say so in the group chat.
      </div>
    )
  }

  if (current === null) {
    // Reachable today only by an account created after the cutover, which has a
    // Friend row and no Membership. Slice 02 replaces this with the
    // join-or-create page, which is what `/` becomes.
    return (
      <div
        role="status"
        className="flex min-h-screen items-center justify-center px-6 text-center text-xs text-muted-foreground"
      >
        You are not in a cal yet. Ask whoever invited you for the six-character code.
      </div>
    )
  }

  return <CurrentCalContext value={current}>{children}</CurrentCalContext>
}
