import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { CalendarView } from '@/shell/view'

/**
 * The four views, in the order they get longer.
 *
 * Two spellings per view, and the short one is not a nicety: ticket 12 measured
 * that at 375px the full top-bar cluster does not fit and *"the first thing it
 * eats is the date range label, which is the one thing on the bar you cannot do
 * without"*. Four written-out words would eat it two breakpoints earlier than
 * two did.
 */
const VIEWS: { value: CalendarView; label: string; short: string }[] = [
  { value: 'day', label: 'Day', short: 'D' },
  { value: '3-day', label: '3 days', short: '3D' },
  { value: 'week', label: 'Week', short: 'W' },
  { value: 'month', label: 'Month', short: 'M' },
]

/**
 * Which view the calendar is in — **one control, two placements**.
 *
 * On desktop it sits in the top-bar cluster where ticket 12's reference
 * screenshot puts it. Below 768px it moves into the **left drawer** (ticket 17),
 * which is a reversal of ticket 12 decision 6 rather than an addition to it:
 * that decision sent the view select *into the blobatar menu* at narrow widths,
 * on the grounds that the cluster did not fit and the menu was the nearest
 * container. Ticket 17 then gave the phone a drawer that holds exactly this
 * class of thing — what a drag means, whose Availability is on screen, and now
 * which view it is on — and a mode selector filed under *account* was only ever
 * where there was nowhere else. The blobatar menu keeps profile, appearance,
 * password and sign out; nothing about the calendar is in it any more.
 *
 * It is one component rather than two so the phone and the desktop cannot drift
 * apart about what the views *are* — which is the failure that matters here,
 * because issue 13 inherits this list and its acceptance criteria name all four.
 */
export const ViewSelector = ({
  view,
  onView,
  abbreviate = false,
  className,
}: {
  view: CalendarView
  onView: (view: CalendarView) => void
  /**
   * Fall back to `D / 3D / W / M` below `lg`, which is what the top bar needs
   * and the drawer does not: the drawer is 17rem wide at every width it exists
   * at, so there is nothing there for a breakpoint to respond to.
   */
  abbreviate?: boolean
  className?: string
}) => (
  <ToggleGroup
    className={className}
    variant="outline"
    size="sm"
    spacing={0}
    value={[view]}
    onValueChange={(next) => {
      // Base UI hands back an array and allows it to be empty. A calendar is
      // always in some view, so an empty selection is not a state to enter.
      if (next[0]) onView(next[0] as CalendarView)
    }}
  >
    {VIEWS.map(({ value, label, short }) => (
      <ToggleGroupItem
        key={value}
        value={value}
        aria-label={`${label} view`}
        /* Equal shares of a full-width group in the drawer; content-sized in
           the bar, where the cluster's other controls need the room. */
        className={abbreviate ? undefined : 'flex-1'}
      >
        {abbreviate ? (
          <>
            <span className="hidden lg:inline">{label}</span>
            <span className="lg:hidden">{short}</span>
          </>
        ) : (
          label
        )}
      </ToggleGroupItem>
    ))}
  </ToggleGroup>
)
