import type { DrawingMode } from '@/availability/gesture'
import { useState } from 'react'

/**
 * The two controls that decide what a drag on the grid means.
 *
 * They live in `AppShell` beside `useCalendarView`, `useRoster` and
 * `useAvailability`, and travel by prop for the same reason those do: the
 * controls are in the **left pane** (ticket 01's corrections put the erase
 * toggle and the "Drawing mode:" tabbar there, and ticket 17 confirms it for
 * mobile) while the grid they govern is in the centre. Nothing else in the app
 * reads them.
 *
 * Ephemeral, like every other piece of view state here (ticket 12): a reload
 * lands you on Linear with erase off.
 */
export type DrawingTools = {
  /**
   * **Linear** is the default, and it is true linear time with no column lock
   * (ticket 01's corrections, overriding ticket 06's recommendation). A drag
   * runs continuously across midnight, which is what makes crossing days an
   * ordinary drag rather than an over-drag past the bottom of a column.
   */
  mode: DrawingMode
  setMode: (mode: DrawingMode) => void
  /**
   * Whether a drag that starts inside a block subtracts it.
   *
   * A toggle rather than an unassigned gesture: ticket 06's prototype found
   * "drag from the middle of a block" free to assign, and the human then asked
   * for it to be visible and switchable, which is also what gives issue 13 an
   * erase route with no modifier key in it.
   */
  erasing: boolean
  setErasing: (erasing: boolean) => void
}

export const useDrawingTools = (): DrawingTools => {
  const [mode, setMode] = useState<DrawingMode>('linear')
  const [erasing, setErasing] = useState(false)
  return { mode, setMode, erasing, setErasing }
}
