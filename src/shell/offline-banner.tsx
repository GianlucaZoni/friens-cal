import { useOnline } from '@/hooks/use-online'
import { WifiOffIcon } from 'lucide-react'

/**
 * A persistent bar across the top of the window while the browser reports no
 * connection.
 *
 * Ticket 19: **detect it, say so, and let writes still attempt** and fail
 * through the normal path — two retries, then revert and a toast naming the
 * range. Blocking writes was rejected because `navigator.onLine` lies (see
 * `useOnline`), and an offline write **queue** is out of scope: replaying drafts
 * on reconnect carries its own conflict semantics and nothing on the map asked
 * for it.
 *
 * So this is the honest version of the promise: the banner tells you why the
 * next thing you draw is about to disappear, and the toast tells you which
 * thing it was.
 *
 * Above the three columns rather than inside the centre one, because it is a
 * fact about the whole app — the roster and the Hangouts pane are just as stale
 * — and because a bar inside the grid's scroller would scroll away from it.
 */
export const OfflineBanner = () => {
  const online = useOnline()
  if (online) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex shrink-0 items-center justify-center gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-1 text-[11px] text-destructive"
    >
      <WifiOffIcon className="size-3" />
      <span>You&apos;re offline. Anything you draw will be attempted and may not save.</span>
    </div>
  )
}
