import { CurrentCalProvider } from '@/cal/current-cal-provider'
import { AppShell } from '@/shell/app-shell'

/**
 * The calendar, behind the gate.
 *
 * Everything the page is now lives in the shell. Sign-out moved with it, into
 * the blobatar menu in the top-right cluster, which is where ticket 18 puts it.
 *
 * The cal provider wraps the shell rather than sitting inside it, so every hook
 * under it can take the cal as a given. Slice 02 moved this route to `/g/:id`
 * and the provider to a lookup of that id, and the promise held: no hook below
 * changed, and nothing in the shell moved except the wordmark, which is now the
 * way back to `/`.
 */
export const CalendarPage = () => (
  <CurrentCalProvider>
    <AppShell />
  </CurrentCalProvider>
)
