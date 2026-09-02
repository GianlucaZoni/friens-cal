import type { AvailabilityStore } from '@/availability/use-availability'
import { cn } from '@/lib/utils'

/**
 * **The only thing that tells an unloaded range from a range nobody drew in.**
 *
 * Both grids need it and neither can do without it, which is why it is its own
 * module rather than a corner of one of them. A past week whose rows have not
 * arrived looks exactly like a week nobody said anything in, and a month is the
 * same claim over five times as many days — the reading a viewer takes from an
 * empty calendar is *"nobody is free"*, which is the one thing it must not say
 * while a read is still in flight.
 *
 * `loading` therefore covers a **backwards navigation** as well as the first
 * read, because `useAvailability` derives it from how far back Postgres has
 * actually been asked (`floorOfView`) rather than from whether a query has ever
 * run.
 *
 * It does **not** show an outstanding write, though the store offers one. Ticket
 * 19 asked for that in "a channel the grid does not already own", and the top
 * bar's `Saving…` is it; putting it here as well would give one dot two meanings
 * and add a second channel to a decision that asked for one.
 *
 * ## Where each grid puts it
 *
 * The geometry comes in as a class, because the two grids have different corners
 * to spare and neither can be moved:
 *
 * - The **week** puts it above the hour gutter, which is the only place it can
 *   go without pushing the seven columns out of line with their own dates.
 * - The **month** has no gutter, so it sits in the weekday header, out of the
 *   flow — the header's seven cells are the width of the seven columns and
 *   nothing may be inserted between them.
 */
export const LoadState = ({
  status,
  className,
}: {
  status: AvailabilityStore['status']
  className?: string
}) => {
  const message = status === 'error' ? 'Could not load Availability' : 'Loading Availability'

  return (
    <div
      className={cn('flex items-center justify-center', className)}
      role="status"
      aria-live="polite"
    >
      {status === 'ready' ? null : (
        <>
          <span
            title={message}
            className={cn(
              'size-1.5 rounded-full',
              status === 'error' ? 'bg-destructive' : 'animate-pulse bg-muted-foreground/50'
            )}
          />
          <span className="sr-only">{message}</span>
        </>
      )}
    </div>
  )
}
