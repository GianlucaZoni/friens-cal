import { useEffect, useState } from 'react'

/**
 * `(hover: none)` — the query ticket 16's desktop/touch split actually turns on.
 *
 * Not `useIsMobile`, and the difference is the decision rather than a
 * preference. Ticket 16 splits on **what the pointer can do**: a hover reveals
 * the accelerator on a card, and where hover does not exist the card carries no
 * controls at all and a tap opens the detail. Width is a different question — a
 * narrow window with a mouse still hovers, and a large tablet still does not.
 *
 * It is also the query issue 09's stand-in was written against
 * (`[@media(hover:none)]:opacity-100` on the confirm tick), so this is the same
 * line drawn in JavaScript rather than a second, disagreeing one.
 *
 * **Read synchronously in the initialiser**, following `shell.tsx`: the
 * `useIsMobile` shape returns `false` until its first effect runs, which here
 * would render a Popover for one frame on a phone and then swap it for a Sheet.
 */
const HOVERLESS = '(hover: none)'

export const useHoverPointer = (): boolean => {
  const [hovers, setHovers] = useState(() => !window.matchMedia(HOVERLESS).matches)

  useEffect(() => {
    const query = window.matchMedia(HOVERLESS)
    const sync = () => setHovers(!query.matches)
    query.addEventListener('change', sync)
    sync()
    return () => query.removeEventListener('change', sync)
  }, [])

  return hovers
}
