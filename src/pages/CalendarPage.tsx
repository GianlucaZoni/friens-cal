import { CurrentCalProvider } from '@/cal/current-cal-provider'
import { AppShell } from '@/shell/app-shell'

/**
 * The calendar, behind the gate.
 *
 * Everything the page is now lives in the shell. Sign-out moved with it, into
 * the blobatar menu in the top-right cluster, which is where ticket 18 puts it.
 *
 * The cal provider wraps the shell rather than sitting inside it, so every hook
 * under it can take the cal as a given. Slice 02 turns this route into
 * `/g/:id` and the provider into a lookup of that id; nothing in the shell
 * moves.
 */
export const CalendarPage = () => (
  <CurrentCalProvider>
    <AppShell />
  </CurrentCalProvider>
)
