import { onCompositorLoss, type Loss } from '@/availability/touch'
import { useEffect, useState } from 'react'

/**
 * A strip across the top of the screen that says whether the compositor took an
 * armed draw. **Off unless the URL says `?touchlog`.**
 *
 * Issue 15 has to answer one question on real hardware: *can `preventDefault`
 * still cancel a native scroll once a long-press arms?* Issue 13 already built
 * the instrument that answers it. What issue 13 could not know is that
 * the answer arrives as a `console.warn`, and **a phone has no console**: an
 * iPhone needs a Mac, a cable and Safari's Web Inspector, and the person the
 * run sheet asks to press their thumb on the glass a dozen times is not holding
 * one. So the reading was invisible exactly where the ticket needed it.
 *
 * This puts it on the glass instead. It renders nothing until a loss arrives
 * apart from one pill, and that pill is load-bearing: `reportCompositorLoss`
 * fires **once per reason per page load**, so after the first warning the same
 * reason cannot print again until a full reload. A tester who forgets that
 * reads a quiet screen as a pass when it is really a screen that already spoke.
 * The pill's timestamp is how you tell those apart.
 *
 * **It cannot perturb what it measures.** `pointer-events-none` keeps it out of
 * every gesture, `fixed` keeps it out of the grid's layout, and it draws
 * nothing at all until the design has already failed.
 */
export const CompositorLossReadout = () => {
  const [armed] = useState(() => new URLSearchParams(window.location.search).has('touchlog'))
  const [loadedAt] = useState(() => new Date().toTimeString().slice(0, 8))
  const [seen, setSeen] = useState<{ loss: Loss; detail: string; at: string }[]>([])

  useEffect(() => {
    if (!armed) return
    return onCompositorLoss((loss, detail) => {
      setSeen((before) => [...before, { loss, detail, at: new Date().toTimeString().slice(0, 8) }])
    })
  }, [armed])

  if (!armed) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-100 flex flex-col items-start gap-1 p-1.5 font-mono text-[11px] leading-tight">
      <div className="rounded bg-foreground/85 px-1.5 py-0.5 text-background">
        issue 15 · loaded {loadedAt} ·{' '}
        {seen.length === 0 ? 'nothing lost yet' : `${seen.length} lost`}
      </div>

      {seen.map((one, index) => (
        <div
          key={index}
          className={
            one.loss === 'uncancelable-touchmove'
              ? 'rounded bg-destructive px-1.5 py-0.5 text-white'
              : 'rounded border border-destructive/60 bg-background px-1.5 py-0.5 text-destructive'
          }
        >
          {/*
            The two reasons are printed differently on purpose, and the wording
            is the whole reason this is not one line with a variable in it. Only
            the first is the gate. A `pointercancel` mid-draw is also what an
            incoming call and a system edge gesture do, so a tester who reads
            the two as the same result reopens issue 13 over a phone call.
          */}
          {one.loss === 'uncancelable-touchmove' ? (
            <>
              {one.at} GATE FAILED · uncancelable-touchmove · {one.detail} · preventDefault did not
              win. Reopen issue 13
            </>
          ) : (
            <>
              {one.at} pointercancel · {one.detail} · NOT the gate on its own. A call or a system
              edge gesture does this too
            </>
          )}
        </div>
      ))}
    </div>
  )
}
