import { useSession } from '@/auth/use-session'
import { calOrder, withCal } from '@/cal/cals'
import { CREATE_UNAVAILABLE, RENAME_UNAVAILABLE, joinErrorMessage, normaliseCode } from '@/cal/code'
import { CurrentCalContext } from '@/cal/use-current-cal'
import type { Cal } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { useCallback, useContext, useEffect, useMemo, useState } from 'react'

/**
 * What a Join, a Create or a Rename came back with: the cal, or one sentence.
 *
 * A union rather than a throw, because every caller is a dialog and a dialog's
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
  /**
   * The one write to `cal` the client has, from both surfaces that list cals.
   *
   * Not an RPC: the update grant is column-scoped to `name` and the policy is
   * Member-scoped (`08-cal-and-membership.sql` §5), so a plain update says
   * everything a function would have and is audited by the grant rather than
   * by ADR-0003.
   */
  rename: (calId: string, name: string) => Promise<CalResult>
}

/**
 * Every cal the signed-in Friend is in, the two RPCs that change that set, and
 * the one update that changes a name.
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
 * about.
 *
 * A **rename** is the one thing here that another Friend can change under you,
 * and slice 03 left it that way rather than closing it: `cal` has no broadcast
 * trigger, so hearing about one means a new migration for a name that is read
 * in a dropdown and a dialog title. The name you see is the name as of your
 * last read of it, and the next navigation corrects it.
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
  /*
   * The cal on screen, when there is one. `useContext` rather than
   * `useCurrentCal`, which throws: `/` is outside the provider and renames cals
   * from a list, and the switcher is inside it and renames the one you are
   * standing in. Only the second has anything to tell.
   */
  const renamed = useContext(CurrentCalContext)?.renamed

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
          setCals((held) => held ?? [])
          return
        }
        setFailed(false)
        /*
         * Folded in rather than assigned, because a write can land first. Both
         * doors are live while this read is in flight, and a cal joined or
         * created before it returns is one the read was issued too early to
         * know about — assigning here would drop it off the list until a
         * reload, which is exactly what the create flow's "Later" button would
         * leave a Friend staring at.
         *
         * `held` is non-null only if a write got there first, so the ordinary
         * path is still one assignment.
         */
        setCals((held) =>
          held === null ? calOrder(data) : data.reduce((into, cal) => withCal(into, cal), held)
        )
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

  const rename = useCallback(
    async (calId: string, name: string): Promise<CalResult> => {
      const { data, error } = await supabase
        .from('cal')
        .update({ name: name.trim() })
        .eq('id', calId)
        .select('id, name, code, created_at')
        // `maybeSingle` for the same reason the provider's read uses it: a
        // Friend who is not a Member updates no rows, and the policy refusing
        // an update is not a PostgREST error. Without it that comes back as
        // `PGRST116` mixed in with the failures that really are failures.
        .maybeSingle()
      if (error || !data) {
        console.error('Could not rename a cal:', error?.code, error?.message)
        return { error: RENAME_UNAVAILABLE }
      }
      setCals((held) => withCal(held ?? [], data))
      // And the cal on screen, if this is it. Doing it here rather than in the
      // dialog is what stops a second caller renaming the cal in the list and
      // leaving the shell around it saying the old name.
      renamed?.(data)
      return { cal: data }
    },
    [renamed]
  )

  return useMemo(
    () => ({
      cals: cals ?? [],
      status: cals === null ? 'loading' : failed ? 'error' : 'ready',
      create,
      join,
      rename,
    }),
    [cals, failed, create, join, rename]
  )
}
