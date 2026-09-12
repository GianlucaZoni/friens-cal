import { useState } from 'react'

/**
 * Placeholder rows inside the drawer's scroller. **Off unless the URL says
 * `?drawerfill=N`.**
 *
 * Issue 15 has to measure `SETTLE_MS`, which is how long after a fast flick
 * reaches the top the scroll-chained close stays refused. That measurement
 * needs a list long enough to flick. A group with one Friend has no Candidates
 * and no Hangouts, so the drawer is empty, the scroller does not exist,
 * `scrollTop` is always 0 and `sinceAwayFromTop` is always `Infinity`:
 * `mayChainClose` says yes to everything and the momentum case **cannot be
 * produced at all**.
 *
 * Issue 13 hit the same wall and injected 900px of filler through the
 * inspector, which is issue 12's technique on the drop dialog. A phone cannot
 * be handed an inspector, so the run sheet needs the filler to be reachable by
 * URL instead.
 *
 * `aria-hidden`, because these are furniture and not content. A screen reader
 * announcing thirty rows of "filler" would be worse than the empty list it
 * replaced.
 */
export const DrawerFill = () => {
  const [rows] = useState(() => {
    const asked = Number(new URLSearchParams(window.location.search).get('drawerfill'))
    return Number.isFinite(asked) && asked > 0 ? Math.min(Math.round(asked), 200) : 0
  })

  if (rows === 0) return null

  return (
    <div aria-hidden className="flex flex-col gap-1.5">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="rounded border border-dashed border-border px-2 py-3 text-[11px] text-muted-foreground"
        >
          filler {index + 1} · issue 15
        </div>
      ))}
    </div>
  )
}
