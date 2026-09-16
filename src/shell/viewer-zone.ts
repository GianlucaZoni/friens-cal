import { deviceZone, type ViewerZone } from '@/shell/zone'
import { createContext, useContext } from 'react'

/**
 * The zone this screen is drawn in, and whether anything on it has to say so.
 *
 * ## Why this is a context rather than a prop
 *
 * The zone itself needs no context at all — `deviceTimeZone()` answers it
 * anywhere, and the answer does not depend on where in the tree you ask. What
 * needs one is the **frame**: whether the cal spans zones is a fact about the
 * roster, and the components that would have to carry it down are the Candidate
 * card, the Hangout card, the Hangout detail, the drop dialog, the retime
 * dialog, the day panel and the week grid. That is a prop through seven layers
 * to reach a string that is null in every cal today.
 *
 * `AppShell` computes it once, beside `now`, and puts it here.
 *
 * ## What you get above the provider
 *
 * The device's zone with **no frame**, which is deliberate rather than a
 * fallback: the only things mounted above it are `useAvailability` and
 * `useHangouts`, and the strings they render are toasts. A toast is gone in
 * four seconds and nobody screenshots it, so it carries no frame (planning
 * ticket 08 §6). Those two call `deviceZone()` directly and say so, rather than
 * leaning on this.
 */
export const ViewerZoneContext = createContext<ViewerZone>(deviceZone())

export const useViewerZone = (): ViewerZone => useContext(ViewerZoneContext)
