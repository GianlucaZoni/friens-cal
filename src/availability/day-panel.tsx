import type { DayWindow } from '@/availability/day-answer'
import { whenOf } from '@/candidates/when'
import { CardDetail } from '@/components/card-detail'
import { Button } from '@/components/ui/button'
import { facesOf, isHappening, isPast, nameOf, type Hangout } from '@/hangouts/hangout'
import { FriendBlob } from '@/identity/friend-blob'
import { cn } from '@/lib/utils'
import type { SetUpFriend } from '@/roster/use-roster'
import { GROUP_TIME_ZONE } from '@/shell/use-calendar-view'
import type { ReactElement } from 'react'
import { format } from 'date-fns'
import { CalendarRangeIcon, EraserIcon, PinIcon, PlusIcon } from 'lucide-react'

/**
 * What a click on a month cell opens.
 *
 * Ticket 14's decision: *"a click on a cell opens the information popover — the
 * same popover ticket 10 put on a week-grid click"*, on the click route because
 * it is the one that also works on touch. Ticket 05's hover panel does not
 * transfer, and neither does its placement rule — that panel is three month
 * columns wide, a month grid has no gutter and is compared in two dimensions, so
 * there is no direction beside a cell that is safe. It opens **below the week
 * row** instead, which is the option ticket 14 left standing.
 *
 * ## It is the same detail, not a third arrangement
 *
 * `CardDetail` is the Sheet-on-touch / Popover-on-desktop shell ticket 16
 * settled, split on `(hover: none)` rather than on width — and this reuses it
 * rather than building a second one, because the decision it encodes is about
 * *what a pointer can do* and that has not changed for being a grid cell instead
 * of a sidebar card. What it overrides is the placement, and the fact that its
 * trigger is an anchor rather than a control.
 *
 * ## The cell says how good the day is; this says everything else
 *
 * The month cell carries **no numeral** (ticket 14) — peak concurrency is the
 * wash, and identity is the avatars — and it carries **no Hangout title**,
 * because 78px cannot hold one legibly. Both of those land here, which is what
 * makes this panel load-bearing in exactly the way the week's slot popover is:
 *
 * - **The count, written out.** Opacity is a comparative channel — it says
 *   "more here than there" and cannot be read as a number (prototype 05's third
 *   contradiction). This is where it becomes a number.
 * - **The windows.** *When* is the one thing a month cell throws away entirely:
 *   two days with the same avatars and the same peak can be a whole afternoon
 *   and a single half hour.
 * - **The Hangout's name.** Ticket 14: *"the title lives in the popover"*. That
 *   is this popover, and it closes the obligation issue 09 and issue 10 both
 *   left on the month view.
 *
 * ## And the two writes touch never gets from the drag
 *
 * `useMonthGesture` is mouse and pen only, like the week's (touch is issue 13),
 * so without these controls the month would be readable on a phone and unwritable
 * on one. They are also the discoverable route on desktop, which is ticket 01's
 * standing correction: an accelerator may be a gesture, the route may not.
 *
 * **`Erase this day` goes through the same gate as the drag.** It is the largest
 * erase the product can make from one press — up to fifty Slots against every
 * Hangout on the day — so it is the last place that should reach
 * `availability.erase` directly.
 */
export const DayPanel = ({
  day,
  anchor,
  peak,
  windows,
  booked,
  own,
  now,
  friendsById,
  onDrawDay,
  onEraseDay,
  onShowWeek,
  onClose,
}: {
  day: Date
  /**
   * The zero-weight box the popover points at, sitting on the day's week row.
   *
   * The row and not the cell, per ticket 14 — and a position rather than a
   * control, which is why `CardDetail` is told it is not a native button. The
   * grid's own click is what opens this.
   */
  anchor: ReactElement
  /** The most Friends free at one moment — the number the wash carries. */
  peak: number
  windows: DayWindow[]
  /** The Hangouts reaching this day — including one that began the evening before. */
  booked: readonly Hangout[]
  /** How much of the day is the viewer's own — which of the two writes is offered. */
  own: 'none' | 'some' | 'all'
  now: number
  friendsById: ReadonlyMap<string, SetUpFriend>
  onDrawDay: () => void
  onEraseDay: () => void
  onShowWeek: () => void
  onClose: () => void
}) => (
  <CardDetail
    open
    onOpenChange={(open) => {
      if (!open) onClose()
    }}
    trigger={anchor}
    nativeButton={false}
    side="bottom"
    align="center"
    title={<span className="tabular-nums">{format(day, 'EEEE d MMMM')}</span>}
    description={
      peak === 0
        ? 'Nobody has marked this day.'
        : `${peak} free at once · ${windows.length === 1 ? '1 window' : `${windows.length} windows`}`
    }
  >
    {booked.length > 0 && (
      <ul className="flex flex-col gap-1.5">
        {booked.map((hangout) => (
          <BookedLine key={hangout.id} hangout={hangout} now={now} friendsById={friendsById} />
        ))}
      </ul>
    )}

    {windows.length > 0 && (
      /*
        Scrolled rather than truncated. A day can hold a dozen windows once the
        Group is nine people, and a panel that showed the first four would be
        answering *when* with "some of the time", which is the failure the cell
        already has and this panel exists to fix.
      */
      <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
        {windows.map((window) => (
          <li key={window.from} className="flex items-center gap-2">
            <span className="w-24 shrink-0 tabular-nums text-[11px] text-muted-foreground">
              {window.from}–{window.to}
            </span>
            <span className="flex min-w-0 flex-1 flex-wrap gap-0.5">
              {window.free.map((friend) => (
                /*
                  Titled, unlike the cell's avatars: a name is the only thing
                  that settles a hue collision, and ticket 11's shape defence
                  holds at this size — 20px is well clear of the ~12px floor
                  below which a blobatar stops being a face.
                */
                <FriendBlob
                  key={friend.id}
                  identity={friend.identity}
                  size="xs"
                  className="size-5"
                  title={friend.name}
                />
              ))}
            </span>
          </li>
        ))}
      </ul>
    )}

    <div className="flex flex-wrap gap-1">
      {own !== 'all' && (
        <Button variant="outline" size="sm" onClick={onDrawDay}>
          {/*
            "all day", because that is what it writes: every Slot the day
            actually holds, which is 46 or 50 of them twice a year. Ticket 01's
            month drag means the same thing, so the control and the gesture say
            the same sentence.
          */}
          <PlusIcon /> I&apos;m free all day
        </Button>
      )}
      {own !== 'none' && (
        <Button variant="outline" size="sm" onClick={onEraseDay}>
          <EraserIcon /> Erase this day
        </Button>
      )}
      {/*
        The only route from a month cell into the week, and the only thing in the
        app that moves the anchor *and* changes the view in one act — which is
        what keeps a bare inspection from re-labelling the bar and moving the
        week you would return to. See `MonthGrid` on why a click does not select.
      */}
      <Button variant="outline" size="sm" onClick={onShowWeek}>
        <CalendarRangeIcon /> Show this week
      </Button>
    </div>
  </CardDetail>
)

/**
 * One Hangout on the day: **the name, then when** — the hierarchy ticket 16
 * settled for the card, so a Hangout is referred to the same way wherever it is
 * named.
 *
 * `nameOf`, so an unnamed one reads as *"Hangout"* rather than leaving the line
 * with a hole in it. That default is why nothing here has a null case, and it is
 * also the answer to the question issue 09 and issue 10 both left open — *"a
 * cell size where a name may not fit at all"*. It fits here.
 *
 * **The date is written out even though the panel is already dated.** A Hangout
 * is a range with an end of its own (`CONTEXT.md`), so one can begin the evening
 * before and still reach this day — the cell's chip says `00:00` for exactly
 * that reason — and a bare `22:00 – 01:00` on a day the plan did not start would
 * name a window that, read literally, has already ended. `whenOf` owns both
 * spellings, including the `01:00 Sun` one.
 */
const BookedLine = ({
  hangout,
  now,
  friendsById,
}: {
  hangout: Hangout
  now: number
  friendsById: ReadonlyMap<string, SetUpFriend>
}) => {
  const happening = isHappening(hangout, now)
  const over = isPast(hangout, now)
  const when = whenOf(hangout.startsAt, hangout.endsAt, GROUP_TIME_ZONE)
  const faces = facesOf(hangout, friendsById)

  return (
    <li className="flex items-start gap-2">
      <PinIcon
        aria-hidden
        className={cn(
          'mt-0.5 size-3 shrink-0',
          happening ? 'text-destructive' : 'text-muted-foreground'
        )}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn('truncate font-medium', over && 'text-muted-foreground')}>
          {nameOf(hangout)}
          {happening && <span className="ml-1 text-destructive">now</span>}
        </span>
        <span className="tabular-nums text-[11px] text-muted-foreground">
          {when.date} · {when.range}
        </span>
        {faces.length === 0 ? (
          <span className="text-[11px] text-muted-foreground">Nobody on it.</span>
        ) : (
          <span className="flex flex-wrap gap-0.5 pt-0.5">
            {faces.map((friend) => (
              <FriendBlob
                key={friend.id}
                identity={friend.identity}
                size="xs"
                className={cn('size-5', over && 'opacity-60')}
                title={friend.name}
              />
            ))}
          </span>
        )}
      </span>
    </li>
  )
}
