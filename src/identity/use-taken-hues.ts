import { useSession } from '@/auth/use-session'
import type { TakenHue } from '@/identity/customise-controls'
import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'

/**
 * The hues the rest of the Group already has.
 *
 * The read the signup bias needs, and the read the hue slider's ticks are drawn
 * from. It works because `select` on `friend` is group-wide (issue 01) — reads
 * are the roster's, writes are your own.
 *
 * Friends who have not finished setup have a null `hue` and are simply not
 * taken yet, so they are filtered in SQL rather than counted as 0°.
 *
 * A failed load is not an error a Friend needs to see: the consequence is that
 * their starting hue is unbiased and the slider has no ticks, which is the same
 * experience as being the first Friend in the Group. So this resolves to an
 * empty list and logs, rather than blocking setup on a query nothing depends
 * on for correctness.
 */
export const useTakenHues = (): { loading: boolean; taken: TakenHue[] } => {
  const { state } = useSession()
  const userId = state.status === 'signed-in' ? state.user.id : null

  const [loading, setLoading] = useState(true)
  const [taken, setTaken] = useState<TakenHue[]>([])

  useEffect(() => {
    if (userId === null) return

    let live = true
    void supabase
      .from('friend')
      .select('id, hue, display_name')
      .not('hue', 'is', null)
      .neq('id', userId)
      .then(({ data, error }) => {
        if (!live) return
        if (error) {
          console.error('Could not read the hues already taken:', error.message)
        }
        setTaken(
          (data ?? []).flatMap((row) =>
            row.hue === null ? [] : [{ id: row.id, hue: row.hue, display_name: row.display_name }]
          )
        )
        setLoading(false)
      })

    return () => {
      live = false
    }
  }, [userId])

  return { loading, taken }
}
