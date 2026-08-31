import { SlotPopover } from '@/availability/slot-popover'
import { closingLabel, runsOf, slotsOfDay, type Run, type Slot } from '@/availability/slots'
import type { AvailabilityStore } from '@/availability/use-availability'
import { draftCell, useDrawGesture, type DrawGesture } from '@/availability/use-draw-gesture'
import type { DrawingTools } from '@/availability/use-drawing-tools'
import { friendColour, friendColourAlpha } from '@/identity/ui-colour'
import { cn } from '@/lib/utils'
import { GROUP_TIME_ZONE } from '@/shell/use-calendar-view'
import { Fragment, useCallback, useMemo, useRef } from 'react'
import { groupBy, maxBy } from 'lodash-es'
import { format, isToday } from 'date-fns'

/**
 * Half an hour, in pixels. The hour is 40px, which is what the shell's lattice
 * was — issue 05 halved the row, it did not change the density.
 *
 * One constant, because a drag maps pixels back to slots with it: an offset
 * divided by this is a slot index, and that is only true while every row is the
 * same height. Which is also why the DST day gets *more rows* rather than taller
 * ones — see `slotsOfDay`.
 *
 * The gesture itself divides by each column's measured height rather than by
 * this, so that the arithmetic stays right for the column that holds 46 or 50 of
 * them; this is the number the rows are *drawn* at.
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
 * drawn on them and drawn *into*.
 *
 * Issue 05 built the read path; issue 06 adds the pointer. The state machine
 * behind it is `useDrawGesture` and the geometry behind that is `gesture.ts` —
 * this file owns pixels, and only pixels.
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
 * something and the drag's pixel arithmetic honest.
 *
 * **And it is why hit-testing asks the elements.** That extra gutter makes the
 * columns unevenly spaced, so `x / columnWidth` is a column out from it
 * rightwards — correct 50 weeks a year, which is the worst kind of wrong. Each
 * column therefore carries `data-column` and the gesture reads their rects.
 */
export const WeekGrid = ({
  days,
  availability,
  viewer,
  tools,
}: {
  days: Date[]
  availability: AvailabilityStore
  viewer: Viewer | null
  tools: DrawingTools
}) => {
  const columns = useMemo(
    () => days.map((day) => ({ day, slots: slotsOfDay(day, GROUP_TIME_ZONE) })),
    [days]
  )

  /**
   * The element the gesture hit-tests against. Created here so the ref travels
   * from `useRef` straight into a `ref=`, which is the only shape
   * `eslint-plugin-react-hooks` will believe is not a read during render.
   */
  const body = useRef<HTMLDivElement | null>(null)
  const drawing = useDrawGesture({ columns, tools, availability, viewer, body })

  /**
   * The day length most of the week shares — its modal row count, not its
   * longest. On a DST week that is six columns against one, so the shared
   * gutter is right for six of them and the odd one out gets its own.
   */
  const shared = useMemo(() => {
    const byLength = groupBy(columns, (column) => column.slots.length)
    return maxBy(Object.values(byLength), (group) => group.length)?.[0]?.slots ?? []
  }, [columns])

  /**
   * The day that disagrees with the rest of the week opens with its own gutter,
   * and **the day separator moves to the gutter's left edge** — so the time
   * column reads as belonging to the day it labels rather than to the day
   * before it. That day's column therefore carries no left border of its own;
   * there is one line between two days, and it is in front of both of them.
   */
  const laidOut = useMemo(
    () =>
      columns.map((column) => ({ ...column, ownGutter: column.slots.length !== shared.length })),
    [columns, shared]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 border-b">
        {/* The gutter's width, so the columns line up with their headers. */}
        <LoadState status={availability.status} />
        {laidOut.map(({ day, ownGutter }) => (
          <Fragment key={day.toISOString()}>
            {/* Reserves the width of that day's own gutter, so its date stays
                over its column rather than sliding one gutter to the left —
                and carries the day separator, as the body's gutter does. */}
            {ownGutter ? <div className={cn(GUTTER_W, 'shrink-0 border-l')} /> : null}
            <div
              className={cn(
                'flex-1 py-1.5 text-center text-[11px] font-medium tabular-nums',
                ownGutter || 'border-l',
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
        {/*
          Move, up and cancel live here rather than on each column, because a
          drag is captured by the column it began on and every later event
          retargets to it — so they arrive here by bubbling however far the
          pointer has since travelled, including outside the window.

          `select-none` stops the browser from painting a text selection across
          the hour labels while a drag is in flight; `cursor-copy` is the whole
          of the feedback that a duplicate is armed and waiting for somewhere to
          land.
        */}
        <div
          ref={body}
          className={cn('flex flex-1 items-start select-none', drawing.placing && 'cursor-copy')}
          onPointerMove={drawing.onPointerMove}
          onPointerUp={drawing.onPointerUp}
          onPointerCancel={drawing.onPointerCancel}
          onClick={drawing.onClick}
        >
          {laidOut.map(({ day, slots, ownGutter }, index) => (
            <Fragment key={day.toISOString()}>
              {ownGutter ? <Gutter slots={slots} className="border-l" /> : null}
              <DayColumn
                index={index}
                day={day}
                slots={slots}
                isFree={availability.isFree}
                viewer={viewer}
                opensWithGutter={ownGutter}
                drawing={drawing}
              />
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
 *
 * It does **not** show an outstanding write, though the store offers one. Ticket
 * 19 asked for that in "a channel the grid does not already own", and the top
 * bar's `Saving…` is it; putting it here as well would give one dot two
 * meanings and add a second channel to a decision that asked for one.
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

const Gutter = ({ slots, className }: { slots: Slot[]; className?: string }) => (
  <div className={cn(GUTTER_W, 'shrink-0', className)}>
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

/** Where a run sits in its column, in pixels. The one place `SLOT_PX` is spent. */
const boxOf = (run: Run) => ({ top: run.start * SLOT_PX, height: run.length * SLOT_PX })

/**
 * The wall clock a Slot ends at — the next row's label, or the day's own end.
 *
 * `closingLabel` rather than a literal, because the same rule is what makes the
 * toast say `Thu 23:30–24:00` instead of a range that runs backwards.
 */
const endOf = (slots: Slot[], row: number): string => closingLabel(slots[row + 1]?.label)

const DayColumn = ({
  index,
  day,
  slots,
  isFree,
  viewer,
  opensWithGutter,
  drawing,
}: {
  /** Its position in the week, which is the identity the gesture addresses it by. */
  index: number
  day: Date
  slots: Slot[]
  isFree: AvailabilityStore['isFree']
  viewer: Viewer | null
  /** Its own gutter is immediately to the left, and carries the day separator. */
  opensWithGutter: boolean
  drawing: DrawGesture
}) => {
  const { draft } = drawing
  const inDraft = useCallback(
    (row: number) => draft?.cells.has(draftCell(index, row)) ?? false,
    [draft, index]
  )

  /**
   * Adjacent held slots, put back together into one block — **including whatever
   * the gesture in flight is contributing**.
   *
   * This is where ticket 07's traded-away range comes back, and it is also the
   * whole of the live merging feedback: with `08:00–22:00` committed, drawing
   * `06:00→07:59` shows one `06:00–22:00` block *mid-drag*, and releasing just
   * commits what you are already looking at. An erase draft subtracts here for
   * the same reason, so the hole opens under the pointer rather than on release.
   */
  const runs = useMemo(() => {
    if (viewer === null) return []
    return runsOf(slots.length, (row) => {
      const held = isFree(viewer.id, slots[row].start)
      if (draft === null || draft.kind === 'duplicate') return held
      return draft.kind === 'erase' ? held && !inDraft(row) : held || inDraft(row)
    })
  }, [slots, isFree, viewer, draft, inDraft])

  /**
   * This gesture's own contribution, over the top of the union above.
   *
   * Both at once was the prototype's finding: the solid outline says what the
   * block will be and the dashed one says which part of it you are drawing.
   */
  const draftRuns = useMemo(
    () => (draft === null ? [] : runsOf(slots.length, inDraft)),
    [draft, slots.length, inDraft]
  )

  /** A duplicate's original, which stays where it is and reads as a source. */
  const sourceRuns = useMemo(
    () =>
      draft === null || draft.source.size === 0
        ? []
        : runsOf(slots.length, (row) => draft.source.has(draftCell(index, row))),
    [draft, slots.length, index]
  )

  const popover = drawing.popover?.column === index ? drawing.popover.row : null

  return (
    /*
      `min-w-0` so the column can shrink with its siblings. Without it a flex
      item cannot go below its own min-content width, and the DST day's chip
      gives this one a floor the other six do not have — at a narrow grid it
      then steals a pixel from each of them and slides every column out from
      under its own date.
    */
    <div
      data-column={index}
      className={cn('relative min-w-0 flex-1', opensWithGutter || 'border-l')}
      onPointerDown={(event) => drawing.onPointerDown(event, index)}
    >
      {slots.map((slot, row) => (
        <div
          key={slot.start.getTime()}
          style={{ height: SLOT_PX }}
          className={cn(
            'relative flex justify-center',
            row === 0 && 'border-t-0',
            row > 0 && 'border-t',
            slot.shiftsClock
              ? 'border-dashed border-muted-foreground/45'
              : slot.opensHour
                ? 'border-border/60'
                : 'border-border/25',
            /*
              Closes the day at its own last row rather than at the bottom of
              the box, which on a DST week is 40px lower — the column is
              stretched to the week's tallest. Without it a 24-hour day beside
              a 25-hour one just stops, and reads as unfinished rather than
              over.
            */
            row === slots.length - 1 && 'border-b border-b-border/60'
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
              aria-label={`You are free ${slots[run.start].label} to ${endOf(
                slots,
                run.start + run.length - 1
              )} on ${format(day, 'EEEE d MMMM')}`}
              /*
                Border and ring, never a solid fill (ticket 15). Your own block
                used to be solid and on top, which covered precisely the thing
                you were looking at — the times you are free are the times you
                care who else is. Issue 07 fills the middle with the density of
                everyone else, straight through this outline.

                `pointer-events-none` because the gesture owns every pointer on
                this grid, and a drag begun on your own Availability must reach
                the column beneath, not stop on a div with no handler.
              */
              className="pointer-events-none absolute inset-x-[3px] rounded-[3px] border"
              style={{
                ...boxOf(run),
                borderColor: friendColour(viewer.hue),
                boxShadow: `inset 0 0 0 2px ${friendColourAlpha(viewer.hue, 0.3)}`,
              }}
            />
          ))}

      {sourceRuns.map((run) => (
        <div
          key={`source-${run.start}`}
          className="pointer-events-none absolute inset-x-[3px] rounded-[3px] border border-dashed border-muted-foreground/60"
          style={boxOf(run)}
        />
      ))}

      {draft === null
        ? null
        : draftRuns.map((run) => (
            <DraftRun
              key={`draft-${run.start}`}
              erasing={draft.kind === 'erase'}
              hue={viewer?.hue ?? 0}
              from={slots[run.start].label}
              to={endOf(slots, run.start + run.length - 1)}
              {...boxOf(run)}
            />
          ))}

      {popover === null || viewer === null ? null : (
        <SlotPopover
          day={day}
          slot={slots[popover]}
          end={endOf(slots, popover)}
          top={popover * SLOT_PX}
          height={SLOT_PX}
          held={isFree(viewer.id, slots[popover].start)}
          onClose={drawing.closePopover}
          onDraw={() => drawing.drawSlot({ column: index, row: popover })}
          onErase={() => drawing.eraseRun({ column: index, row: popover })}
          onDuplicate={() => drawing.armDuplicateAt({ column: index, row: popover })}
        />
      )}
    </div>
  )
}

/**
 * The gesture's own contribution, and what time it says.
 *
 * A dashed outline and **no fill**: opacity in this grid means *how many
 * Friends are free* (ticket 15), and issue 07 has not spent it yet. A wash here
 * would be the one channel the draft is not allowed to borrow.
 *
 * The time tag is ticket 10's, ported from touch: mid-gesture it is worth more
 * than the toolbar's state, because it says what you have actually drawn rather
 * than what mode you are in. Inside the run rather than above it — the grid is a
 * scroller, and a tag hanging off the top of the first row would be clipped by
 * it.
 */
const DraftRun = ({
  erasing,
  hue,
  from,
  to,
  top,
  height,
}: {
  erasing: boolean
  hue: number
  from: string
  to: string
  top: number
  height: number
}) => (
  <div
    className={cn(
      'pointer-events-none absolute inset-x-[3px] overflow-hidden rounded-[3px] border border-dashed',
      erasing && 'border-destructive'
    )}
    style={{ top, height, ...(erasing ? {} : { borderColor: friendColour(hue) }) }}
  >
    <span
      className={cn(
        'absolute inset-x-0 top-0 truncate px-0.5 text-center text-[9px] leading-[11px] font-medium tabular-nums',
        erasing ? 'text-destructive' : 'text-foreground/70'
      )}
    >
      {from}–{to}
    </span>
  </div>
)

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
    /*
      Absolutely positioned so it contributes no width at all — in flow it
      would be the widest thing in the column and set a min-content floor no
      other column has. See `min-w-0` on the column.

      It keeps its pointer events, unlike the Availability blocks: it is the only
      thing on the grid with something to say on hover, and a `title` needs them.
      A press on it still reaches the drag — the gesture's handler is on the
      column and the event bubbles there.
    */
    className="pointer-events-auto absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap rounded-b-sm bg-muted px-1 text-[8px] leading-[11px] tabular-nums text-muted-foreground"
  >
    {slot.label}
    {slot.offset}
  </span>
)
