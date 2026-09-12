import { heatFraction, heatOpacity } from '@/availability/heat'
import { LoadState } from '@/availability/load-state'
import { bandsOf, segmentsOf, type Band } from '@/availability/segments'
import { answerAt } from '@/availability/slot-answer'
import { SlotPopover } from '@/availability/slot-popover'
import { closingLabel, runsOf, slotsOfDay, type Run, type Slot } from '@/availability/slots'
import { TOUCH_SLOT_PX, durationLabel } from '@/availability/touch'
import type { AvailabilityStore } from '@/availability/use-availability'
import {
  draftCell,
  useDrawGesture,
  type DrawGesture,
  type Edge,
} from '@/availability/use-draw-gesture'
import type { DrawingTools } from '@/availability/use-drawing-tools'
import { whenOf } from '@/candidates/when'
import { DropDialog } from '@/hangouts/drop-dialog'
import { facesOf, isHappening, isPast, nameOf, runInColumn, type Hangout } from '@/hangouts/hangout'
import { useEraseGuard } from '@/hangouts/use-erase-guard'
import { useHoverPointer } from '@/hooks/use-hover-pointer'
import { FriendBlob } from '@/identity/friend-blob'
import { friendColour, friendColourAlpha } from '@/identity/ui-colour'
import { cn } from '@/lib/utils'
import { setUpOnly, type RosterFriend, type SetUpFriend } from '@/roster/use-roster'
import { GROUP_TIME_ZONE } from '@/shell/use-calendar-view'
import { Fragment, useCallback, useMemo, useRef, type CSSProperties } from 'react'
import { groupBy, maxBy } from 'lodash-es'
import { format, isToday } from 'date-fns'
import { Pin } from 'lucide-react'

/**
 * Half an hour, in pixels, **with a mouse**. The hour is 40px, which is what the
 * shell's lattice was — issue 05 halved the row, it did not change the density.
 *
 * On a touch screen it is `TOUCH_SLOT_PX`, and that is not a preference: at 44px
 * rows a week cell at 375px is 47×44, which clears the minimum touch target with
 * no margin, and prototype 10 measured the desktop row as not a target under any
 * view. The cost is stated where the number is.
 *
 * Every row is still the same height as every other, which is what makes a
 * block's height mean something — and why the DST day gets *more rows* rather
 * than taller ones (see `slotsOfDay`).
 *
 * **The gesture never reads either number.** It divides each column's measured
 * height by that column's own row count, so the 46-row and 50-row days stay
 * right and the whole 20px↔44px switch costs `use-draw-gesture.ts` nothing.
 */
const SLOT_PX = 20

/**
 * The row height, as one custom property the whole grid positions against.
 *
 * `--slot` is set once on the grid's root and read by every absolutely
 * positioned child through the cascade — the shape `--sidebar-width` already has
 * in `shell.tsx`. The alternative was threading a pixel number through five
 * components and two helpers, which is five places that have to agree about one
 * number: the mistake `shell.tsx`'s review pass caught in the drawer's height.
 */
const SLOT = 'var(--slot)'

/** Where `rows` rows starting at `row` sit in a column, in that unit. */
const box = (row: number, rows: number) => ({
  top: `calc(${SLOT} * ${row})`,
  height: `calc(${SLOT} * ${rows})`,
})

/**
 * The hour gutter's width. Named because four places have to agree on it — the
 * shared gutter, a DST day's own gutter, and the spacer each of those needs in
 * the header row to keep the columns under their own dates.
 */
const GUTTER_W = 'w-10'

/** The signed-in Friend: whose rows these are, and the one colour on the grid. */
export type Viewer = { id: string; hue: number }

/**
 * The centre column: seven days of 30-minute rows, carrying **everyone's**
 * Availability as a heatmap with your own drawn over it and drawn *into*.
 *
 * Issue 05 built the read path; issue 06 added the pointer; issue 07 makes the
 * grid the group's. The state machine behind the pointer is `useDrawGesture`,
 * the geometry behind that is `gesture.ts`, the sweep behind the wash is
 * `segments.ts` and its ramp is `heat.ts` — this file owns pixels, and only
 * pixels.
 *
 * ## One hue, and opacity spent on the count
 *
 * Ticket 15 replaced the composite with **one colour — the viewer's own — with
 * opacity proportional to how many visible Friends are free**. Per-Friend colour
 * is absent from the grid entirely: eight translucent gradients average into mud
 * and two Friends four degrees apart read as one, so a coloured composite
 * *under-reports the count*, which is the one number this view exists to carry.
 *
 * The consequence, which is not a detail: the grid answers **how many**, and
 * **who** is answered only by opening the slot popover. That popover is
 * load-bearing, not a nicety.
 *
 * Opacity is therefore **spoken for**. Nothing else on this grid may fade to
 * mean anything — not a pending write (ticket 19 sent that to the top bar), not
 * a draft (issue 06 gave it a dashed outline and no fill).
 *
 * ## Your own Availability is a border and a ring
 *
 * Solid-and-on-top was ticket 01's answer and it covered precisely the thing you
 * were looking at: the times you are free are the times you care who else is.
 * So your own block is an outline, and the density shows straight through it.
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
  visible,
  friendsById,
  hangouts,
  now,
  tools,
  onPage,
}: {
  days: Date[]
  availability: AvailabilityStore
  viewer: Viewer | null
  /**
   * The Friends the viewer is currently trying to meet — `roster.visible`,
   * `friends` minus the Hidden ones (CONTEXT.md).
   *
   * This is the wash's whole query. Nothing here filters and nothing here knows
   * the word Hidden: a Friend leaves this list and leaves the wash on the next
   * render, with no invalidation and no refetch, because the store already holds
   * every Friend's rows.
   */
  visible: RosterFriend[]
  /**
   * The **whole** roster by id, Hidden Friends included — only a Hangout reads
   * this, and `AppShell` owns it because the right pane reads it too.
   *
   * A confirmed Hangout shows in full on every Friend's grid with every
   * Participant's blob, and hiding never hides one (ticket 01). Ticket 16
   * rejected even muting a Hidden Participant's face as *a partial hide through
   * the back door*, so this and `visible` are genuinely different queries
   * rather than one list used twice.
   */
  friendsById: ReadonlyMap<string, SetUpFriend>
  /** Every confirmed Hangout, Past ones included — they stay on the grid forever. */
  hangouts: readonly Hangout[]
  /** The start of the current Slot — the app's one clock, held in `AppShell`. */
  now: number
  tools: DrawingTools
  /**
   * What a pre-arm horizontal swipe does — page by this view's block.
   *
   * Handed in rather than reached for: *how far* a block is belongs to
   * `view.ts`, and issue 12 already spelled it once in `stepBy`. See
   * `useDrawGesture`.
   */
  onPage: (direction: -1 | 1) => void
}) => {
  const columns = useMemo(
    () => days.map((day) => ({ day, slots: slotsOfDay(day, GROUP_TIME_ZONE) })),
    [days]
  )

  /**
   * The visible Friends the wash can count: those who have finished setup.
   *
   * A Friend who has not is left out of the count **and** the denominator. Two
   * reasons, neither cosmetic:
   *
   * - They cannot have drawn anything. `RequireSetup` stands between an
   *   unfinished Friend and the calendar, so there is no route by which they
   *   hold a row.
   * - Counting them anyway would put them in the denominator forever and cap the
   *   ramp below its top: with two Friends in the Group and one of them
   *   unfinished — this project's state today — a full house would be
   *   unreachable and every wash would sit at the floor.
   *
   * The cost, named: a row seeded from the SQL editor for a Friend who has not
   * finished setup is **invisible to the wash and absent from the popover**. It
   * appears the moment they finish, and nothing else in the product can make one.
   */
  const counted = useMemo(() => setUpOnly(visible), [visible])

  /**
   * The element the gesture hit-tests against. Created here so the ref travels
   * from `useRef` straight into a `ref=`, which is the only shape
   * `eslint-plugin-react-hooks` will believe is not a read during render.
   */
  const body = useRef<HTMLDivElement | null>(null)

  /** The scroller the columns sit in — where edge auto-scroll does its work. */
  const scroller = useRef<HTMLDivElement | null>(null)

  /**
   * `(hover: none)`, and what it changes: the 44px row, and the resize handles.
   *
   * The same query `CardDetail` splits on, and the same argument — this is about
   * **what the pointer can do**, not how wide the window is. A narrow desktop
   * window still hovers and still wants 20px rows; a large tablet does not
   * hover and cannot address a 7px edge zone.
   */
  const touch = !useHoverPointer()

  /**
   * Ticket 08 §10's confirmation, in front of both erase paths.
   *
   * Held here rather than in the gesture because the prediction needs the
   * Hangouts and the viewer, and because the dialog is a **grid** dialog — it is
   * the erase that costs a plan, and the sidebar's cancel is a different
   * question about a different object. The gesture only needs a function to
   * call.
   */
  const eraseGuard = useEraseGuard({
    hangouts,
    availability,
    friendId: viewer?.id ?? null,
  })

  const drawing = useDrawGesture({
    columns,
    tools,
    availability,
    requestErase: eraseGuard.requestErase,
    viewer,
    body,
    scroller,
    onPage,
  })

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
    <div
      /* One number, one place. Every row and every positioned block reads it. */
      style={{ '--slot': `${touch ? TOUCH_SLOT_PX : SLOT_PX}px` } as CSSProperties}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="flex shrink-0 border-b">
        {/* The gutter's width, so the columns line up with their headers. */}
        <LoadState status={availability.status} className={cn(GUTTER_W, 'shrink-0')} />
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
      <div
        ref={scroller}
        /*
          **The arming signal a thumb cannot cover** (ticket 10 §6). There is no
          Vibration API on iOS Safari, so "you are drawing now" has to be seen —
          and the draft and its tag are both under the hand that made them. This
          ring is around the whole surface, so some of it is always visible past
          a thumb, and it says *which* of the two things is armed: the viewer's
          own colour for a draw, destructive for an erase.
        */
        style={
          drawing.armed
            ? {
                boxShadow: `inset 0 0 0 3px ${
                  drawing.draft?.kind === 'erase'
                    ? 'var(--destructive)'
                    : friendColourAlpha(viewer?.hue ?? 0, 0.75)
                }`,
              }
            : undefined
        }
        /*
          `no-scrollbar` (shadcn's utility) is alignment, not taste. The day
          headers are a sibling row above this element rather than inside it, so
          a scrollbar that holds its width instead of overlaying takes its 15px
          out of the scroller alone: the header row keeps the full width, the
          seven columns get less, and every column sits 15px left of the date it
          belongs under. Desktop only — touch scrollbars overlay, so they cost
          nothing. Wheel, trackpad, touch and keyboard all still scroll.
        */
        className="no-scrollbar flex min-h-0 flex-1 items-start overflow-auto"
      >
        <Gutter slots={shared} />
        {/*
          **Only the click is React's now.** Move, up and cancel used to bubble
          here from the column that had captured the pointer; the gesture
          registers them on the `window` at pointerdown instead, which commits a
          drag released outside the element and — the reason it matters to this
          slice — leaves no `setPointerCapture` in the path, which throws for a
          synthetic pointer and is the wall issues 08, 09 and 10 all hit.

          The click stays, because that is where the popover mounts (see
          `pending` in the gesture) and a tap takes the same route.

          `select-none` stops the browser from painting a text selection across
          the hour labels while a drag is in flight; `cursor-copy` is the whole
          of the feedback that a duplicate is armed and waiting for somewhere to
          land.
        */}
        <div
          ref={body}
          className={cn('flex flex-1 items-start select-none', drawing.placing && 'cursor-copy')}
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
                counted={counted}
                hangouts={hangouts}
                friendsById={friendsById}
                now={now}
                opensWithGutter={ownGutter}
                handles={touch}
                drawing={drawing}
              />
            </Fragment>
          ))}
        </div>
      </div>

      {/*
        Outside the scroller, because it is a modal about the whole gesture
        rather than about a column — and mounted only while there is something
        to ask, so its state is the guard's and there is no open/closed flag to
        keep in step.
      */}
      {eraseGuard.pending !== null && viewer !== null && (
        <DropDialog
          dropping={eraseGuard.pending.dropping}
          viewerId={viewer.id}
          now={now}
          onConfirm={eraseGuard.confirm}
          onDismiss={eraseGuard.dismiss}
        />
      )}
    </div>
  )
}

const Gutter = ({ slots, className }: { slots: Slot[]; className?: string }) => (
  <div className={cn(GUTTER_W, 'shrink-0', className)}>
    {slots.map((slot) => (
      <div
        key={slot.start.getTime()}
        style={{ height: SLOT }}
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

/** Where a run sits in its column. */
const boxOf = (run: Run) => box(run.start, run.length)

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
  counted,
  hangouts,
  friendsById,
  now,
  opensWithGutter,
  handles,
  drawing,
}: {
  /** Its position in the week, which is the identity the gesture addresses it by. */
  index: number
  day: Date
  slots: Slot[]
  isFree: AvailabilityStore['isFree']
  viewer: Viewer | null
  /** The wash's query, already narrowed to Friends who have finished setup. */
  counted: SetUpFriend[]
  /** Every Hangout in the app; this column takes the ones that reach it. */
  hangouts: readonly Hangout[]
  /** The whole roster by id, Hidden included — a Hangout's faces. */
  friendsById: ReadonlyMap<string, SetUpFriend>
  now: number
  /** Its own gutter is immediately to the left, and carries the day separator. */
  opensWithGutter: boolean
  /**
   * Whether a selected block grows resize handles — the `(hover: none)` path.
   *
   * A mouse resizes a block by drawing over it or erasing part of it, and a 7px
   * edge zone it can hit is not worth the two knobs. A finger has neither, which
   * is prototype 10 §3: *"the only part of the desktop model that has no touch
   * equivalent at all"*.
   */
  handles: boolean
  drawing: DrawGesture
}) => {
  const { draft } = drawing

  /**
   * Everybody's Availability in this column, cut where the *set* changes.
   *
   * Swept against **this column's own** slots array, never against a shared row
   * count: a DST day holds 46 or 50 rows while its neighbours hold 48, and the
   * 25-hour Sunday holds 02:00 twice. A global row index would address rows that
   * do not exist on one column and miss two on another.
   *
   * The committed store only — a draft in flight is your own and shows as a
   * dashed outline; it joins the count when it commits, which is when it becomes
   * true. Painting it into the wash early would make the density say something
   * the database has not been told yet.
   */
  const segments = useMemo(
    () =>
      segmentsOf(
        slots.length,
        counted.map((friend) => friend.id),
        (friendId, row) => isFree(friendId, slots[row].start)
      ),
    [slots, counted, isFree]
  )

  /** Contiguous segments, so each stretch gets one silhouette (prototype 05 Q1). */
  const bands = useMemo(() => bandsOf(segments), [segments])
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

  /**
   * The Hangouts reaching this column, and where each one sits in it.
   *
   * Asked of **this column's own** slots array (`runInColumn`), never computed
   * from the hour: a DST day holds 46 or 50 rows and the 25-hour Sunday holds
   * 02:00 twice, so a global row index would address rows that do not exist on
   * one column and miss two on another. A Hangout crossing midnight needs no
   * case of its own either — it simply produces a run in each of the two
   * columns it reaches.
   */
  const booked = useMemo(
    () =>
      hangouts.flatMap((hangout) => {
        const run = runInColumn(hangout, slots)
        return run === null ? [] : [{ hangout, run }]
      }),
    [hangouts, slots]
  )

  const popover = drawing.popover?.column === index ? drawing.popover.row : null

  /**
   * The block the handles hang off, taken out of the runs this column already
   * derived rather than asked for separately — so the handles are on the edges
   * of the shape actually on screen, including the merge with whatever the
   * selection grew into.
   *
   * `draft === null` because a gesture in flight speaks for itself: mid-resize
   * the two knobs would sit at the edges the block no longer has.
   */
  const selected = useMemo(() => {
    const at = drawing.selection
    if (!handles || draft !== null || at === null || at.column !== index) return null
    return runs.find((run) => at.row >= run.start && at.row < run.start + run.length) ?? null
  }, [handles, draft, drawing.selection, index, runs])

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
          style={{ height: SLOT }}
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

      {/*
        The wash, under everything else in the column.

        First in the DOM so it paints below your own outline, the draft and the
        source marker — all of which are absolutely positioned siblings, so
        source order IS the stacking order here. It sits *above* the row lattice
        for the same reason, which is what makes the half-hour lines read through
        it rather than over it.
      */}
      {viewer === null
        ? null
        : bands.map((band) => (
            <HeatWash
              key={`heat-${band[0].start}`}
              band={band}
              hue={viewer.hue}
              outOf={counted.length}
            />
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
              rows={run.length}
              {...boxOf(run)}
            />
          ))}

      {/*
        The Hangouts, on top of everything the grid derives.

        **Last in the DOM, which is the stacking order here** (the wash, your
        own outline, the draft and the source marker are absolutely positioned
        siblings, so source order is z-order). A Hangout is the only thing in
        this column that was *written down* rather than computed, and it is the
        one thing every Friend sees identically — so it sits over the
        composite rather than under it.

        Its fill mutes the wash beneath it deliberately. Those Slots are spoken
        for, so how many people happen to be free in them is no longer the
        question — which is the same reason step 3 of the Candidate pipeline
        blanks them out of the sidebar.
      */}
      {booked.map(({ hangout, run }) => (
        <HangoutBlock
          key={hangout.id}
          hangout={hangout}
          run={run}
          friendsById={friendsById}
          now={now}
        />
      ))}

      {/*
        The two knobs, over everything — a handle nothing can be pressed through
        is not a handle. They are the last positioned siblings, which is the
        stacking order in this column.
      */}
      {selected !== null && (
        <>
          <ResizeHandle
            edge="top"
            atRow={selected.start}
            hue={viewer?.hue ?? 0}
            onPointerDown={(event) =>
              drawing.onHandleDown(event, {
                column: index,
                edge: 'top',
                start: selected.start,
                length: selected.length,
              })
            }
          />
          <ResizeHandle
            edge="bottom"
            atRow={selected.start + selected.length}
            hue={viewer?.hue ?? 0}
            onPointerDown={(event) =>
              drawing.onHandleDown(event, {
                column: index,
                edge: 'bottom',
                start: selected.start,
                length: selected.length,
              })
            }
          />
        </>
      )}

      {popover === null || viewer === null ? null : (
        <SlotPopover
          day={day}
          slot={slots[popover]}
          end={endOf(slots, popover)}
          box={box(popover, 1)}
          held={isFree(viewer.id, slots[popover].start)}
          /*
            The answer, and the span it holds for. `segmentAt` is what turns a
            clicked Slot into the segment it belongs to — the popover names the
            Slot in its title and the *segment* in its answer, so the reading is
            "these Friends, from here to here" rather than "these Friends, in
            this half hour and who knows about the next one".
          */
          answer={answerAt(segments, counted, slots, popover)}
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
 * One band — a stretch where somebody is free — as one silhouette with hard
 * internal boundaries.
 *
 * **Segments inside runs** was prototype 05's recommendation, and this is the
 * half of it ticket 15 kept. The rounded corners and the clip belong to the
 * *band*, so the stretch reads as one continuous window; the edges *inside* it
 * are hard and flush, because each one is a moment when the set of free Friends
 * changed and that is exactly what the viewer needs to be able to point at.
 * Adjacent segments drawn as separate rounded boxes read as three separate
 * offers, which is the mistake that finding names.
 *
 * No shadow, against the prototype's "one rounded outline and one drop shadow
 * per run": the shadow was there to lift a *coloured composite* off the grid, and
 * what sits on top of this one now is your own border and ring. A shadow under
 * those would blur the one edge ticket 15 spent to keep the density legible
 * through them.
 *
 * `pointer-events-none` because the gesture owns every pointer on this grid —
 * the same reason your own blocks have it. And it is absolutely positioned, so
 * it contributes no height: the columns are content-sized (`items-start`) and
 * the drag divides a column's measured height by its own row count.
 */
const HeatWash = ({ band, hue, outOf }: { band: Band; hue: number; outOf: number }) => {
  const start = band[0].start
  const end = band[band.length - 1].end

  return (
    <div
      aria-hidden
      /*
        Full column width, where your own block is inset 3px — so the outline
        marking your own Availability sits *inside* the wash with density showing
        on both sides of it, and reads as a border rather than as the wash's own
        edge. The two coincided at first and the outline vanished into the fill it
        was supposed to sit over. It also says the right thing: the density is a
        property of the *time*, not of a block.
      */
      className="pointer-events-none absolute inset-x-0 overflow-hidden rounded-[3px]"
      style={box(start, end - start)}
    >
      {band.map((segment) => (
        <div
          key={segment.start}
          className="absolute inset-x-0"
          style={{
            ...box(segment.start - start, segment.end - segment.start),
            /*
              `friendColour` is the one spelling of a Friend's colour, and the
              strength is an `opacity` resolved by the cascade — so the ramp is
              tuned per theme without anything here asking which theme is on.
              See `heat.ts`.
            */
            background: friendColour(hue),
            opacity: heatOpacity(heatFraction(segment.friendIds.length, outOf)),
          }}
        />
      ))}
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
 * ## The tag sits above the draft, and that is a correction
 *
 * Issue 06 put it *inside* the run's first row, reasoning that the grid is a
 * scroller and a tag hanging off the top would be clipped. Ticket 10 §6 asks
 * for it above, for a reason the desktop does not have: **the hand is on the
 * glass**, and every pixel of the draft between the anchor and the finger is
 * under it. A tag inside the first row is the one part of the arming signal
 * most likely to be covered.
 *
 * The clipping objection is answered rather than overruled — the tag is clamped
 * into the column, so a draft that starts on row 0 gets its tag over its own
 * first row instead of outside the scroller. It carries a ground for the same
 * reason: over the wash, unbacked text at 9px is not legible.
 *
 * It says the **duration** too, which is the number a range does not give you
 * by inspection. `2h` under a thumb is worth more than reading `10:00–12:00`
 * and subtracting.
 */
const DraftRun = ({
  erasing,
  hue,
  from,
  to,
  rows,
  top,
  height,
}: {
  erasing: boolean
  hue: number
  from: string
  to: string
  /** How many Slots the draft covers — the duration, before it is a string. */
  rows: number
  top: string
  height: string
}) => (
  <>
    <div
      className={cn(
        'pointer-events-none absolute inset-x-[3px] rounded-[3px] border border-dashed',
        erasing && 'border-destructive'
      )}
      style={{ top, height, ...(erasing ? {} : { borderColor: friendColour(hue) }) }}
    />
    <span
      className={cn(
        'pointer-events-none absolute inset-x-[3px] truncate rounded-[3px] bg-background/85 px-0.5 text-center text-[9px] leading-[13px] font-medium tabular-nums',
        erasing ? 'text-destructive' : 'text-foreground/80'
      )}
      /* Above the draft, or on top of its first row where there is no above. */
      style={{ top: `max(0px, calc(${top} - ${TAG_H}px))`, height: TAG_H }}
    >
      {from}–{to} · {durationLabel(rows)}
      {erasing && ' erase'}
    </span>
  </>
)

/** The draft tag's height, in pixels. Two places need it: the box and the clamp. */
const TAG_H = 13

/**
 * One edge of a selected block, as something a thumb can actually grab.
 *
 * **44px of hit area for a 34×14 knob** (prototype 10 §3, measured): the knob is
 * what you see and the box around it is what you press, so the target clears the
 * minimum without a knob big enough to hide the block it belongs to. At a 44px
 * row the two handles of a 30-minute block abut exactly — `[edge−22, edge+22]`
 * — which is why the touch row height and this number are the same measurement
 * and not two.
 *
 * **`touch-action: none`, here and nowhere else this slice adds it.** It is the
 * whole of why a handle drag needs no long-press and no arbitration: the browser
 * has been told this box is not a scroller, so there is nothing to out-race. The
 * grid around it keeps its default touch behaviour entirely, which is the rule
 * issue 12 set for the drawer's own handle and the one issue 13 restates for
 * these.
 *
 * `aria-hidden`, deliberately: this is an **accelerator**, and ticket 01's
 * standing correction is that a gesture may be one and may not be the only
 * route. Lengthening a block without it is drawing over it; shortening it is
 * `Erase block` in the popover, then drawing what you meant. Neither of those is
 * a gesture, and both are reachable from the tap that opens the popover.
 */
const ResizeHandle = ({
  edge,
  atRow,
  hue,
  onPointerDown,
}: {
  edge: Edge
  /** The row boundary the edge sits on — `start` at the top, `start + length` below. */
  atRow: number
  hue: number
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void
}) => (
  <div
    aria-hidden
    data-resize={edge}
    onPointerDown={onPointerDown}
    className="absolute inset-x-0 flex touch-none items-center justify-center"
    style={{ top: `calc(${SLOT} * ${atRow} - ${HANDLE_PX / 2}px)`, height: HANDLE_PX }}
  >
    <span
      className="h-[14px] w-[34px] rounded-full border border-background shadow-sm"
      style={{ background: friendColour(hue) }}
    />
  </div>
)

/** The handle's hit area, square with the minimum touch target. */
const HANDLE_PX = 44

/**
 * How tall a Hangout has to be before it can carry faces.
 *
 * Two rows, an hour, 40px. Below that the faces would be taller than the block
 * and the pin is the whole of what fits — and a 30-minute Hangout is a real
 * shape (the Candidate list ranks a 30-minute full house above a 2h30 window
 * with five Friends, permanently, which ticket 16 flagged as *one thing to look
 * at*).
 */
const FACES_MIN_ROWS = 2

/**
 * A confirmed Hangout, on the grid.
 *
 * **On everyone's grid, Participant or not** (ticket 01) — this is the one
 * thing in the centre column that is identical on every Friend's screen. The
 * wash is a query (`roster.visible`, per viewer) and your own outline is
 * personal; a Hangout is a fact that was written down.
 *
 * **The border is the treatment, and there is no hue in it.** Colour on this
 * grid is the viewer's own, and its *opacity* is spoken for by the count
 * (ticket 15) — so a Hangout cannot borrow either without saying something
 * about how many people are free. It gets weight instead: a solid border and a
 * ring, over a fill opaque enough to quiet the wash underneath. That fill is
 * deliberate rather than a compromise: those Slots are booked, so how many
 * people happen to be free in them has stopped being the question — the same
 * reasoning that has step 3 of the Candidate pipeline blank them out of the
 * sidebar.
 *
 * **Three states, and each one is a decision from ticket 08 §6.** A Hangout is
 * Live until its *end* — so one happening right now is not "past", it is the
 * loudest thing on the grid, in the destructive colour. Afterwards it is
 * **muted and stays forever**, because the Availability underneath it is never
 * auto-deleted either and a grid that dropped the plan but kept the evidence
 * would read as a bug.
 *
 * `pointer-events-none`, like every other block here: the gesture owns every
 * pointer on this grid, and a drag begun on a Hangout must reach the column
 * beneath it. Which is also why there are no controls on it — every action a
 * Hangout has is issue 10's, and ticket 16 puts them on the sidebar card.
 */
const HangoutBlock = ({
  hangout,
  run,
  friendsById,
  now,
}: {
  hangout: Hangout
  /** Its rows in **this** column — `runInColumn`, never derived from the hour. */
  run: Run
  friendsById: ReadonlyMap<string, SetUpFriend>
  now: number
}) => {
  const happening = isHappening(hangout, now)
  const over = isPast(hangout, now)
  const faces = facesOf(hangout, friendsById)

  const when = whenOf(hangout.startsAt, hangout.endsAt, GROUP_TIME_ZONE)

  return (
    <div
      role="img"
      aria-label={[
        nameOf(hangout),
        `${when.date}, ${when.range}`,
        happening ? 'happening now' : over ? 'over' : null,
        faces.length === 0
          ? 'nobody on it'
          : `with ${faces.map((friend) => friend.name).join(', ')}`,
      ]
        .filter((part) => part !== null)
        .join(' · ')}
      className={cn(
        'pointer-events-none absolute inset-x-[2px] overflow-hidden rounded-[3px] border bg-background/80 ring-1',
        happening
          ? 'border-destructive ring-destructive/25'
          : over
            ? // Muted, and still there. Uneditable is issue 10's; invisible was
              // never on the table.
              'border-foreground/20 bg-background/60 ring-transparent'
            : 'border-foreground/45 ring-foreground/15'
      )}
      style={boxOf(run)}
    >
      <span className="flex items-center gap-0.5 px-0.5 pt-px">
        <Pin
          aria-hidden
          className={cn(
            'size-2.5 shrink-0',
            happening ? 'text-destructive' : 'text-muted-foreground'
          )}
        />
        {/*
          **The name, always** — `nameOf` falls back to "Hangout", so the marker
          is never a bare pin. The alternative, drawn while the title column had
          nothing writing to it, was a pin alone on every block: unreadable as
          anything but decoration, and indistinguishable from the drag's own
          outlines to somebody who had not been told.

          The name only. The *time* is the block's own position and height,
          already said by the gutter it lines up with, so spending nine pixels
          of a 20px row on it would be saying the same thing three times.
        */}
        <span
          className={cn(
            'truncate text-[9px] leading-[11px] font-medium',
            happening ? 'text-destructive' : 'text-foreground/80'
          )}
        >
          {nameOf(hangout)}
        </span>
      </span>

      {run.length >= FACES_MIN_ROWS && (
        <span className="flex flex-wrap gap-0.5 px-0.5 pt-0.5">
          {faces.map((friend) => (
            <FriendBlob
              key={friend.id}
              identity={friend.identity}
              size="xs"
              className={cn('size-4', over && 'opacity-60')}
              /*
                Unlabelled on purpose, unlike a sidebar card's: the block's own
                `aria-label` already names every Participant, and a per-face
                title would read the same list a second time.
              */
            />
          ))}
        </span>
      )}
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
