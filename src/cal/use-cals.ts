import { useSession } from '@/auth/use-session'
import { calOrder, withCal } from '@/cal/cals'
import { CREATE_UNAVAILABLE, joinErrorMessage, normaliseCode } from '@/cal/code'
import type { Cal } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { useCallback, useEffect, useMemo, useState } from 'react'

/**
 * What a Join or a Create came back with: the cal, or one sentence.
 *
 * A union rather than a throw, because both callers are dialogs and a dialog's
 * two jobs on a failure are to stay open and to say something. The sentence is
 * chosen here (`joinErrorMessage`) rather than in the dialog, so a second
 * caller cannot invent a different one.
 */
export type CalResult = { cal: Cal; error?: undefined } | { cal?: undefined; error: string }

export type CalsState = {
  /** The cals the Friend is a Member of, alphabetical. Empty until `ready`. */
  cals: Cal[]
  status: 'loading' | 'ready' | 'error'
  /** `create_cal(name)`. The Code is minted server-side and comes back on the row. */
  create: (name: string) => Promise<CalResult>
  /** `join_cal(code)`. Idempotent: a Code you already hold returns its cal. */
  join: (code: string) => Promise<CalResult>
}

/**
 * Every cal the signed-in Friend is in, and the two RPCs that change that set.
 *
 * ## It reads `cal`, and the Membership is the policy
 *
 * `cal`'s select policy is `id in (select private.my_cal_ids())`, so this query
 * returns precisely the Friend's cals with no `.eq()` of its own. Reading
 * `membership` instead would need a second query for the two columns the
 * screens actually want: the name to show and the Code to share.
 *
 * ## The list is local state after the first read, not a refetch
 *
 * Both RPCs return the `cal` row, and `withCal` folds it in. That is what makes
 * `join_cal` being idempotent invisible here: a Code for a cal you already hold
 * returns the same row a fresh Membership would, the fold replaces it, and
 * neither the hook nor the dialog above it has a second branch to get wrong.
 *
 * There is no Realtime on this list and no poll. A Membership only changes
 * because this Friend did something, in this tab — nobody can add you to a cal
 * and nobody can remove you (CONTEXT.md) — so there is no remote write to hear
 * about. A rename in another tab is ticket 03's problem, not this one's.
 *
 * ## Not the same read as `CurrentCalProvider`'s
 *
 * That provider reads **one** row by the id in the URL, because `/g/:id` needs
 * exactly one cal and a non-Member must get no row rather than a filtered list.
 * This hook is the list surface: `/`, and ticket 03's switcher.
 */
export const useCals = (): CalsState => {
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
        setCals(calOrder(data))
      })

    return () => {
      live = false
    }
  }, [userId])

  const create = useCallback(async (name: string): Promise<CalResult> => {
    const { data, error } = await supabase.rpc('create_cal', { name: name.trim() })
    if (error || !data) {
      // Logged, never rendered. `create_cal` can fail on the name check, on ten
      // Code collisions in a row, or on the grant, and a Friend can act on none
      // of them — but whoever reads the group chat afterwards needs the real
      // one.
      console.error('Could not create a cal:', error?.code, error?.message)
      return { error: CREATE_UNAVAILABLE }
    }
    setCals((held) => withCal(held ?? [], data))
    return { cal: data }
  }, [])

  const join = useCallback(async (code: string): Promise<CalResult> => {
    // Normalised here as well as server-side. `join_cal` does `upper(btrim())`
    // itself, so this changes no outcome — it is here so that what is sent is
    // what the Friend will be told about if it fails.
    const { data, error } = await supabase.rpc('join_cal', { code: normaliseCode(code) })
    if (error || !data) {
      console.error('Could not join a cal:', error?.code, error?.message)
      return { error: joinErrorMessage(error) }
    }
    setCals((held) => withCal(held ?? [], data))
    return { cal: data }
  }, [])

  return useMemo(
    () => ({
      cals: cals ?? [],
      status: cals === null ? 'loading' : failed ? 'error' : 'ready',
      create,
      join,
    }),
    [cals, failed, create, join]
  )
}
