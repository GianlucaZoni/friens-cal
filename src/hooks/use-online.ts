import { useEffect, useState } from 'react'

/**
 * Whether the browser believes it is online.
 *
 * **Believes** is the operative word, and it is why nothing gates a write on
 * this. `navigator.onLine` lies often enough — a captive portal, dead wifi with
 * a live interface — that blocking writes on it would lock a Friend out of a
 * working connection (ticket 19). So it drives a **banner** and nothing else:
 * writes still attempt and still fail through the normal path, which degrades
 * correctly whichever way the detection is wrong.
 *
 * Read synchronously for the first render rather than in an effect, so a reload
 * with no connection does not show a hopeful frame first.
 */
export const useOnline = (): boolean => {
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine)
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    // The events are the signal; this covers a change that happened between the
    // first render and this effect, which StrictMode's remount makes reachable.
    sync()
    return () => {
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
    }
  }, [])

  return online
}
