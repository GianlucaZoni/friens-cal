import type { Cal } from '@/lib/database.types'
import { createContext, useContext } from 'react'

/**
 * Which cal is on screen.
 *
 * **The seam, and the only thing in the client that answers the question.**
 * Every cal-scoped read and write goes through here rather than through a
 * constant, so when slice 02 puts the cal in the URL (`/g/:id`) the change is
 * one provider and no hooks: `useAvailability`, `useHangouts` and everything
 * downstream ask this and do not care where the answer came from.
 *
 * It is deliberately **not** `GROUP_TIME_ZONE`-shaped. A module constant would
 * be a second place the cutover had to be undone, and it would make the
 * multi-cal case a rewrite rather than a swap.
 *
 * The context carries the whole row rather than the id, because the id alone is
 * the half nobody can read: the dropdown wants the name and the join-or-create
 * page wants the Code, and both are on the row the provider already read.
 */
export type CurrentCal = {
  /** The cal on screen. Never null inside the provider, which gates on it. */
  cal: Cal
  /** Its id, which is what every query and every Realtime topic needs. */
  calId: string
}

export const CurrentCalContext = createContext<CurrentCal | null>(null)

/**
 * The cal on screen, guaranteed.
 *
 * Non-nullable because `CurrentCalProvider` renders nothing until it has one —
 * the same shape `RequireSetup` uses for the identity, and for the same reason:
 * a nullable cal would make twelve call sites handle a case that lasts one
 * round trip.
 */
export const useCurrentCal = (): CurrentCal => {
  const value = useContext(CurrentCalContext)
  if (!value) throw new Error('useCurrentCal must be used inside a <CurrentCalProvider>')
  return value
}
