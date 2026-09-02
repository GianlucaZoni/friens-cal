import { SLOT_MS, slotContaining } from '@/availability/slots'
import { useEffect, useState } from 'react'

/**
 * The Candidate scan's **horizon**: the start of the Slot containing now, kept
 * current.
 *
 * ## Why this is not optional
 *
 * Step 1 of the pipeline discards everything before the current Slot, which
 * makes the sidebar **time-dependent with no data change at all** (ticket 09).
 * A tab left open overnight would otherwise offer yesterday evening, and a tab
 * left open for twenty minutes would offer a window that has already started —
 * with nothing anywhere to invalidate, because nothing about the Availability
 * moved.
 *
 * ## Aligned to the boundary, not ticking
 *
 * The timer fires on the :00 and :30, which is the only rate at which the
 * answer can change: there are 48 boundaries in a day and every one of them can
 * actually clip something, where a one-minute interval would recompute the
 * whole list 1,440 times to change it 48 times.
 *
 * **And re-read rather than incremented.** Each firing asks `slotContaining`
 * again instead of adding `SLOT_MS` to the last answer, so a laptop that slept
 * through six hours of boundaries lands on the right Slot in one step rather
 * than replaying them — and a DST transition, which moves the wall clock under
 * a lattice this hook never sees, needs no case of its own.
 *
 * ## Focus, for the sleeping laptop
 *
 * `setTimeout` does not fire while the machine is suspended and browsers
 * throttle background tabs hard, so the timer alone would leave a reopened tab
 * showing a stale list until the next boundary. `focus` and `visibilitychange`
 * both resync — and both are nearly free, because a resync that lands in the
 * same Slot sets the same number and React bails out of the render.
 */
export const useSlotClock = (timeZone: string): number => {
  const [horizon, setHorizon] = useState(() => slotContaining(new Date(), timeZone).getTime())

  useEffect(() => {
    /*
     * A few milliseconds past the boundary. A timer that fires a hair early
     * reads the Slot it is already in and reschedules for the same instant,
     * which is self-correcting but spends two wake-ups on one boundary.
     */
    const OVERSHOOT_MS = 250

    let timer: ReturnType<typeof setTimeout>

    const resync = () => {
      const slot = slotContaining(new Date(), timeZone).getTime()
      setHorizon(slot)

      clearTimeout(timer)
      timer = setTimeout(resync, Math.max(slot + SLOT_MS - Date.now(), 0) + OVERSHOOT_MS)
    }

    resync()

    // `focus` covers the reopened window and `visibilitychange` the tab
    // switched back to, which are not the same event in every browser.
    window.addEventListener('focus', resync)
    document.addEventListener('visibilitychange', resync)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', resync)
      document.removeEventListener('visibilitychange', resync)
    }
  }, [timeZone])

  return horizon
}
