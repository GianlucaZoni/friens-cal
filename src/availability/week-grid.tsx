import { runsOf, slotsOfDay, type Slot } from '@/availability/slots'
import type { AvailabilityStore } from '@/availability/use-availability'
import { friendColour, friendColourAlpha } from '@/identity/ui-colour'
import { cn } from '@/lib/utils'
import { GROUP_TIME_ZONE } from '@/shell/use-calendar-view'
import { Fragment, useMemo } from 'react'
import { groupBy, maxBy } from 'lodash-es'
import { format, isToday } from 'date-fns'

/**
 * Half an hour, in pixels. The hour is 40px, which is what the shell's lattice
 * was — this slice halves the row, it does not change the density.
 *
 * One constant, because issue 06 maps pixels back to slots with it: a drag's
 * offset divided by this is a slot index, and that is only true while every
 * row is the same height. Which is also why the DST day gets *more rows* rather
 * than taller ones — see `slotsOfDay`.
 */
const SLOT_PX = 20

/**
 * The hour gutter's width. Named because four places have to agree on it — the
 * shared gutter, a DST day's own gutter, and the spacer each of those needs in
 * the header row to keep the columns under their own dates.
 */
const GUTTER_W = 'w-10'

/** The signed-in Friend: whose rows these are, and the one colour on the grid. */
export type Viewer = { id: string; hue: number }

/**
 * The centre column: seven days of 30-minute rows, with your own Availability
 * drawn on them.
 *
 * Read path only. There is not a single pointer handler in this file — drawing
 * and erasing are issue 06, everyone else's Availability and the heatmap are
 * issue 07.
 *
 * ## The row axis is the time zone's, not 48
 *
 * Each column asks the group time zone how many half hours its day holds, so
 * the autumn Sunday renders 50 rows and the spring one 46 (ticket 07 §5).
 *
 * That breaks the one thing a week grid normally takes for granted: **on a DST
 * week the seven days genuinely disagree about what time it is**, so no single
 * hour gutter can be true for all of them. Below the transition, one column is
 * an hour out from the other six whichever axis is picked.
 *
 * So the axis is not picked, it is counted. **The shared gutter is the day
 * length the week agrees on** — unanimous 50 weeks a year, and six-to-one on the
 * two DST weeks — and **the day that disagrees carries its own gutter**,
 * immediately to its left. Every column is then labelled correctly, including
 * the repeated 02:00, which appears twice in that day's own gutter with its UTC
 * offset beside it. The transitioning column is additionally marked in place
 * with a chip naming the hour it lands on.
 *
 * The alternative — one wall-clock axis for the week — would need rows of
 * unequal duration, and equal duration is what makes a block's height mean
 * something and issue 06's pixel arithmetic honest.
 */
export const WeekGrid = ({
  days,
  availability,
  viewer,
}: {
  days: Date[]
  availability: AvailabilityStore
  viewer: Viewer | null
}) => {
  const columns = useMemo(
    () => days.map((day) => ({ day, slots: slotsOfDay(day, GROUP_TIME_ZONE) })),
    [days]
  )

  /**
   * The day length most of the week shares — its modal row count, not its
   * longest. On a DST week that is six columns against one, so the shared
   * gutter is right for six of them and the odd one out gets its own.
   */
  const shared = useMemo(() => {
    const byLength = groupBy(columns, (column) => column.slots.length)
    return maxBy(Object.values(byLength), (group) => group.length)?.[0]?.slots ?? []
  }, [columns])

  /** Does this day disagree with the rest of the week about how long it is? */
  const disagrees = (slots: Slot[]) => slots.length !== shared.length

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 border-b">
        {/* The gutter's width, so the columns line up with their headers. */}
        <LoadState status={availability.status} />
        {columns.map(({ day, slots }) => (
          <Fragment key={day.toISOString()}>
            {/* Reserves the width of that day's own gutter, so its date stays
                over its column rather than sliding one gutter to the left. */}
            {disagrees(slots) ? <div className={cn(GUTTER_W, 'shrink-0')} /> : null}
            <div
              className={cn(
                'flex-1 border-l py-1.5 text-center text-[11px] font-medium tabular-nums',
                isToday(day) ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {/*
                "the date number after the three-letter weekday" (ticket 12
                decision 6), at every width. The bar's label is month and year
                only, so this is the only place day-level precision lives.
              */}
              {format(day, 'EEE d')}
            </div>
          </Fragment>
        ))}
      </div>

      {/*
        The grid scrolls inside the inset; the page never does.

        `items-start` is load-bearing, not tidying. Without it the gutter and
        the column block are stretched to the *scroller's* height — a third of
        the grid — while their 20px rows overflow past it, so every column's
        `border-l` divider stops two thirds of the way down and the absolutely
        positioned blocks hang outside their own box. Sized to content, the
        seven dividers run the full height and the shorter column of a DST week
        simply leaves its last rows empty.
      */}
      <div className="flex min-h-0 flex-1 items-start overflow-auto">
        <Gutter slots={shared} />
        <div className="flex flex-1 items-start">
          {columns.map(({ day, slots }) => (
            <Fragment key={day.toISOString()}>
              {disagrees(slots) ? <Gutter slots={slots} /> : null}
              <DayColumn day={day} slots={slots} isFree={availability.isFree} viewer={viewer} />
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * The corner above the gutter, which is the only place a load state can go
 * without pushing the seven columns out of line with their headers.
 *
 * `loading` covers a backwards navigation as well as the first read: a past
 * week whose rows have not arrived looks exactly like a week you drew nothing
 * in, and this is the only thing that tells them apart.
 */
const LoadState = ({ status }: { status: AvailabilityStore['status'] }) => {
  const message =
    status === 'error' ? 'Could not load your Availability' : 'Loading your Availability'

  return (
    <div
      className="flex w-10 shrink-0 items-center justify-center"
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

const Gutter = ({ slots }: { slots: Slot[] }) => (
  <div className={cn(GUTTER_W, 'shrink-0')}>
    {slots.map((slot) => (
      <div
        key={slot.start.getTime()}
        style={{ height: SLOT_PX }}
        className="pr-1 pt-px text-right text-[9px] leading-none tabular-nums text-muted-foreground/70"
      >
        {/*
          Only the slots that open an hour are labelled — the half hours are the
          lattice, not a reading. On the Sunday the clocks go back, TWO of them
          read `02`, and the offset beside them is the only thing that says
          which is which.
        */}
        {slot.opensHour ? (
          <>
            {slot.label.slice(0, 2)}
            {slot.offset === null ? null : (
              <span className="text-[8px] text-muted-foreground/60">{slot.offset}</span>
            )}
          </>
        ) : null}
      </div>
    ))}
  </div>
)

const DayColumn = ({
  day,
  slots,
  isFree,
  viewer,
}: {
  day: Date
  slots: Slot[]
  isFree: AvailabilityStore['isFree']
  viewer: Viewer | null
}) => {
  /**
   * Adjacent held slots, put back together into one block.
   *
   * This is the whole of what ticket 07 traded the stored range for: merging
   * happens here, at render time, over indices, and nowhere else.
   */
  const runs = useMemo(
    () =>
      viewer === null ? [] : runsOf(slots.length, (index) => isFree(viewer.id, slots[index].start)),
    [slots, isFree, viewer]
  )

  return (
    <div className="relative flex-1 border-l">
      {slots.map((slot, index) => (
        <div
          key={slot.start.getTime()}
          style={{ height: SLOT_PX }}
          className={cn(
            'flex justify-center',
            index === 0 && 'border-t-0',
            index > 0 && 'border-t',
            slot.shiftsClock
              ? 'border-dashed border-muted-foreground/45'
              : slot.opensHour
                ? 'border-border/60'
                : 'border-border/25'
          )}
        >
          {slot.shiftsClock ? <ClockShift slot={slot} /> : null}
        </div>
      ))}

      {viewer === null
        ? null
        : runs.map((run) => (
            <div
              key={run.start}
              role="img"
              aria-label={`You are free ${slots[run.start].label} to ${
                slots[run.start + run.length]?.label ?? '24:00'
              } on ${format(day, 'EEEE d MMMM')}`}
              /*
                Border and ring, never a solid fill (ticket 15). Your own block
                used to be solid and on top, which covered precisely the thing
                you were looking at — the times you are free are the times you
                care who else is. Issue 07 fills the middle with the density of
                everyone else, straight through this outline.

                `pointer-events-none` because issue 06 owns every pointer on
                this grid, and a drag begun on your own Availability must reach
                the column beneath, not stop on a div with no handler.
              */
              className="pointer-events-none absolute inset-x-[3px] rounded-[3px] border"
              style={{
                top: run.start * SLOT_PX,
                height: run.length * SLOT_PX,
                borderColor: friendColour(viewer.hue),
                boxShadow: `inset 0 0 0 2px ${friendColourAlpha(viewer.hue, 0.3)}`,
              }}
            />
          ))}
    </div>
  )
}

/**
 * The row where the clocks moved, named in place.
 *
 * Which way they moved is readable off `offset`: going *back* duplicates a wall
 * clock, which is the only thing that puts an offset on a slot, and going
 * forward deletes one and so cannot.
 */
const ClockShift = ({ slot }: { slot: Slot }) => (
  <span
    title={
      slot.offset === null
        ? `The clocks go forward here — ${slot.label} follows 01:30, and the hour between them does not exist`
        : `The clocks go back here — this is the second ${slot.label} of the day`
    }
    className="rounded-b-sm bg-muted px-1 text-[8px] leading-[11px] tabular-nums text-muted-foreground"
  >
    {slot.label}
    {slot.offset}
  </span>
)
