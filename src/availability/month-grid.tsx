import { windowsOf } from '@/availability/day-answer'
import { DayPanel } from '@/availability/day-panel'
import { heatFraction, heatOpacity } from '@/availability/heat'
import { LoadState } from '@/availability/load-state'
import { DAYS_IN_WEEK, monthWeeks, peakOf, wholeDay } from '@/availability/month'
import { segmentsOf, type Segment } from '@/availability/segments'
import { runsOf, slotsOfDay, type Run, type Slot } from '@/availability/slots'
import type { AvailabilityStore } from '@/availability/use-availability'
import type { DrawingTools } from '@/availability/use-drawing-tools'
import { useMonthGesture, type MonthGesture } from '@/availability/use-month-gesture'
import type { Viewer } from '@/availability/week-grid'
import { DropDialog } from '@/hangouts/drop-dialog'
import { isHappening, isPast, nameOf, runInColumn, type Hangout } from '@/hangouts/hangout'
import { useEraseGuard } from '@/hangouts/use-erase-guard'
import { FriendBlob } from '@/identity/friend-blob'
import { friendColour, friendColourAlpha } from '@/identity/ui-colour'
import { cn } from '@/lib/utils'
import { setUpOnly, type RosterFriend, type SetUpFriend } from '@/roster/use-roster'
import { GROUP_TIME_ZONE } from '@/shell/use-calendar-view'
import { useCallback, useMemo, useRef } from 'react'
import { format, isSameDay, isSameMonth, isToday } from 'date-fns'
import { PinIcon } from 'lucide-react'

/**
 * The second calendar view, and **month is not a shrunken week**.
 *
 * Ticket 05 prototyped the week's composite at month-cell size and it reads as a
 * corrupted thumbnail: the time axis is illegible and the segment barcode
 * becomes UI noise. Ticket 14 then built both candidate languages side by side
 * on the same data and the human's `## Decisions` took neither whole — the month
 * gets its own language, five channels on a 78×72 box:
 *
 * | Channel | Carries |
 * | --- | --- |
 * | **Wash** in the viewer's hue, opacity ∝ **peak concurrency** | *how good is this day* |
 * | **Avatars**, overflow **wrapping**, never `+N` | *who* |
 * | **Ring** on your own Availability, contiguous days merged | *am I in it* |
 * | **Hangout chip**, mandatory | *something is already booked* |
 * | **Today pill**, and the selected-day ring around it | *where am I* |
 *
 * **No numeral, anywhere.** That is the synthesis rather than a rejection: the
 * prototype's decisive argument against a bare avatar row was that two days with
 * *identical* rows can hold peak 1 and peak 9 — nine people free with no pair
 * overlapping, against nine people free together — so identity alone answers the
 * wrong question. The wash answers it, and once the wash carries peak the
 * numeral is saying the same thing twice.
 *
 * `month.ts` owns the arithmetic (and the argument for what the wash *means*),
 * `use-month-gesture.ts` owns the pointer, `day-answer.ts` owns the panel's
 * data, and this file owns pixels.
 *
 * ## The wash is the week's ramp, and the week's measurement
 *
 * `heatFraction` / `heatOpacity`, unchanged, over `counted.length` — the same
 * denominator, the same two per-theme numbers, the same monotonicity. The month
 * differs from the week in the **reduction** and in nothing else: the week paints
 * a count per half hour, the month paints the day's largest one. See `peakOf`
 * for why that is one sentence rather than two, and for why a Hangout day is the
 * *darkest* cell of the month rather than the emptiest.
 *
 * ## What ticket 15 removed from the grid, and what this puts back
 *
 * Ticket 15's live answer is unqualified: *"**Per-Friend colour no longer
 * appears in the grid at all.** … the grid answers *how many*, and **who** is
 * answered only by hovering."* This cell puts eight faces on 35 days, so the
 * divergence has to be deliberate and it has to be sayable.
 *
 * **What ticket 15 removed was colour as an *encoding*, and that is still gone
 * from both grids.** Its finding was that a coloured composite *under-reports
 * the count* — eight translucent gradients average into mud, and two Friends
 * four degrees apart read as one Friend rather than as two similar colours. The
 * fix was to stop asking hue to carry a number. Here, hue still carries no
 * number: the wash is one colour, the viewer's, and the thing that varies with
 * the count is its opacity, exactly as in the week.
 *
 * **What the avatars carry is identity, and they carry it by shape first.** A
 * blobatar is a face, not a swatch — which is why ticket 14's `## Decisions` says
 * *"avatars (not abstract dots)"* and why its `### Contradicts settled
 * decisions` rejects **a dot row** specifically: a dot would be colour standing
 * in for a person, which is the thing ticket 15 killed, and at 6px it collapses
 * into exactly the h262/h268 collision. An avatar above the legibility floor
 * does not, because the shape disambiguates (ticket 11) — so the floor is not a
 * polish detail here, it is the whole of what keeps this from being the dot row.
 *
 * So the two grids do **not** disagree about what colour encodes. Both say
 * *opacity of the viewer's hue is how many*. The month additionally says *these
 * faces were around*, which the week answers in its popover instead — a
 * difference in where identity is shown, not in what colour means.
 *
 * ## Why the ring, and why it merges
 *
 * Ticket 15's border-and-ring solved occlusion in a week column whose edge was
 * free, and ticket 14 found two reasons it does not transfer as-is: a month
 * cell's edge is contested by the grid rule, today and the selected day, and —
 * the bigger one — **the viewer has Availability on something like 80% of days**,
 * so a per-cell marker fires almost everywhere and stops distinguishing
 * anything. *A marker that is on 80% of the time is not a marker.*
 *
 * The decision answers both at once. The mark is an **inner** rectangle rather
 * than the cell's edge, inset clear of every border the lattice already spends;
 * and **contiguous days merge into one shape**, so a fortnight you are free for
 * is one long rounded box rather than fourteen rings. That is also exactly what
 * a click-drag across those days produces, so the gesture and its result look
 * like the same object — which is the half of ticket 11 that makes the wall of
 * purple readable again.
 *
 * A run crossing a **row** boundary becomes two rectangles, and nothing is lost
 * by that: it is the same concession the week grid makes for a run crossing
 * midnight, and a run has no identity of its own to be more faithful to
 * (`CONTEXT.md`).
 *
 * ## A click inspects. It does not select.
 *
 * There is no selected-day state in this app — **the selection IS the anchor**,
 * and `useCalendarView` holds one. So a cell click that moved it would re-label
 * the top bar on every out-of-month press, re-lay the whole grid out from under
 * the finger that made it, and move the week you would return to, all as a side
 * effect of *reading*.
 *
 * So a click opens the day panel and moves nothing, and the anchor is marked
 * where it falls. That marking is honest here in a way it is not next door:
 * `mini-calendar.tsx` argues that in week view *"the grid's unit is a week and a
 * single selected day would understate it"* — and the month's unit is a day, so
 * the month is precisely the view where one day is the right amount of anchor to
 * draw. The panel then carries `Show this week`, which is the one act that moves
 * the anchor and changes the view together, so neither happens by surprise.
 */
export const MonthGrid = ({
  days,
  anchor,
  availability,
  viewer,
  visible,
  friendsById,
  hangouts,
  now,
  tools,
  onShowWeek,
}: {
  /**
   * The month lattice — the anchor's month padded out to whole weeks, which is
   * **also the range the stores were read over** (`calendar.shownDays`).
   *
   * One array, handed to the grid and to `useAvailability` / `useHangouts`, so
   * there is no arrangement in which a cell is drawn from a range Postgres was
   * never asked for. That was the hole before: `floorOfView` took the *week's*
   * days, and the month grid starts up to five weeks earlier — so navigating
   * back rendered a month with no rows fetched and no loading state, which is
   * indistinguishable from a month nobody drew anything in.
   */
  days: Date[]
  /** Where the calendar is pointed: which month is on show, and the selected day. */
  anchor: Date
  availability: AvailabilityStore
  viewer: Viewer | null
  /** The Friends the viewer is trying to meet — the wash's whole query (issue 07). */
  visible: RosterFriend[]
  /** The whole roster by id, Hidden included — a Hangout's faces. */
  friendsById: ReadonlyMap<string, SetUpFriend>
  /** Every confirmed Hangout, Past ones included — they stay on the calendar forever. */
  hangouts: readonly Hangout[]
  /** The start of the current Slot — the app's one clock, held in `AppShell`. */
  now: number
  tools: DrawingTools
  /** Move the anchor to this day and switch to the week — see the note above. */
  onShowWeek: (day: Date) => void
}) => {
  const counted = useMemo(() => setUpOnly(visible), [visible])
  const weeks = useMemo(() => monthWeeks(days), [days])

  const body = useRef<HTMLDivElement | null>(null)

  /**
   * Ticket 08 §10's confirmation, in front of both of this view's erase paths.
   *
   * The month is where it matters most and the reason is arithmetic: a
   * whole-day erase is up to fifty Slots at once, measured against every Hangout
   * on the day, and a drag can make several days of that from one press. Held
   * here for the reason the week grid holds its own — the prediction needs the
   * Hangouts and the viewer, and the dialog belongs to the grid that raised it.
   */
  const eraseGuard = useEraseGuard({
    hangouts,
    availability,
    friendId: viewer?.id ?? null,
  })

  const drawing = useMonthGesture({
    days,
    tools,
    availability,
    requestErase: eraseGuard.requestErase,
    viewer,
    body,
  })

  /*
   * `isFree` off the store first, rather than reached through it inside the
   * memo: the store is a fresh object literal every render, so depending on
   * `availability` would defeat the memo entirely — and this memo is the
   * expensive one in the app, ~1700 Slots swept against every visible Friend.
   * The same shape `AppShell` uses for `silentAmong`, and for the same reason.
   */
  const { isFree } = availability

  /**
   * Everything each cell draws, in one sweep of the lattice.
   *
   * The sweep is `segmentsOf` — the very same boundary sweep the week grid's
   * wash is built from — asked of **each day's own** Slots array, never a shared
   * count: a day holds 46, 48 or 50 and the autumn Sunday holds 02:00 twice, so
   * an index that did not belong to a stated day would be meaningless twice a
   * year.
   *
   * One sweep rather than three because the cell and the panel must agree: the
   * peak the wash paints, the Friends the avatars draw and the windows the panel
   * lists are three readings of one set of segments, and computing them
   * separately would be three chances to disagree about the same day.
   */
  const cells = useMemo(() => {
    const countedIds = counted.map((friend) => friend.id)

    return days.map((day) => {
      const slots = slotsOfDay(day, GROUP_TIME_ZONE)
      const segments = segmentsOf(slots.length, countedIds, (friendId, row) =>
        isFree(friendId, slots[row].start)
      )

      return {
        day,
        slots,
        segments,
        /** The number the wash carries. See `peakOf`. */
        peak: peakOf(segments),
        /**
         * Who — the Friends holding any Availability today, in **roster order**.
         *
         * Any, not overlapping: the avatars answer *who is around* and the wash
         * answers *whether it adds up to anything*. That division is the whole
         * synthesis, and dropping a Friend from the row because nobody happened
         * to overlap them would put the wash's job in the avatars.
         */
        free: counted.filter((friend) =>
          segments.some((segment) => segment.friendIds.includes(friend.id))
        ),
        /**
         * The Hangouts reaching this day, and the wall clock each opens at *here*.
         *
         * `runInColumn` against this day's own Slots, exactly as the week grid
         * asks it — so a plan crossing midnight needs no case of its own: it
         * produces a run in each of the two days it reaches, and the second one
         * opens at `00:00` because that is the first Slot of that day it covers.
         */
        booked: hangouts.flatMap((hangout) => {
          const run = runInColumn(hangout, slots)
          return run === null ? [] : [{ hangout, from: slots[run.start].label }]
        }),
        /** How many of the day's Slots are the viewer's own — the panel's tri-state. */
        held: viewer === null ? 0 : slots.filter((slot) => isFree(viewer.id, slot.start)).length,
      }
    })
  }, [days, counted, isFree, hangouts, viewer])

  /**
   * Whether a day is one of yours, **including whatever the gesture in flight is
   * contributing**.
   *
   * This is where ticket 11's "the gesture and its result look like the same
   * object" is actually paid for: a drag across five days shows one five-day
   * rectangle *mid-drag*, and releasing just commits what you are already
   * looking at. An erase draft subtracts here for the same reason, so the shape
   * shortens under the pointer rather than on release.
   */
  const { draft } = drawing
  const mine = useCallback(
    (index: number): boolean => {
      const held = cells[index].held > 0
      if (draft === null) return held
      const drafted = draft.days.has(index)
      return draft.kind === 'erase' ? held && !drafted : held || drafted
    },
    // `draft` off the gesture first, rather than reached through it in the body:
    // the hook returns a fresh object literal every render, so depending on the
    // whole of it would defeat this memo — the same shape `AppShell` uses for
    // `silentAmong`, and the one React Compiler can preserve.
    [cells, draft]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/*
        The weekday header. The month has no hour gutter, so the load state sits
        out of the flow — the seven cells here are the width of the seven columns
        below and nothing may be inserted between them.
      */}
      <div className="relative flex shrink-0 border-b">
        <LoadState status={availability.status} className="absolute inset-y-0 left-1 w-3" />
        {days.slice(0, DAYS_IN_WEEK).map((day) => (
          <div
            key={day.toISOString()}
            className="min-w-0 flex-1 basis-0 border-l py-1.5 text-center text-[11px] font-medium text-muted-foreground first:border-l-0"
          >
            {format(day, 'EEE')}
          </div>
        ))}
      </div>

      {/*
        The grid scrolls inside the inset; the page never does — the shell's
        standing obligation, and the reason the rows have a minimum rather than a
        fixed height.

        `basis-0 flex-1` on every row makes the rows **exactly equal**, which the
        overlays below depend on: each is positioned as a percentage of the row
        it sits in, so a row that had grown taller than its siblings would put a
        rectangle a few pixels off the days it names.

        `select-none` stops the browser painting a text selection across the date
        numerals while a drag is in flight — the month gesture does not
        `preventDefault` on pointerdown, because that would also stop the cell
        taking focus, and the cells are real buttons on purpose.
      */}
      <div ref={body} className="flex min-h-0 flex-1 select-none flex-col overflow-auto">
        {weeks.map((week, row) => {
          const first = row * DAYS_IN_WEEK
          /** Your own Availability, merged into one shape per contiguous stretch. */
          const ownRuns = runsOf(week.length, (column) => mine(first + column))
          const draftRuns =
            draft === null ? [] : runsOf(week.length, (column) => draft.days.has(first + column))
          const openHere =
            drawing.panel !== null && drawing.panel >= first && drawing.panel < first + week.length

          return (
            <div
              key={week[0].toISOString()}
              className="relative flex min-h-20 flex-1 basis-0 border-b last:border-b-0"
            >
              {week.map((day, column) => (
                <MonthCell
                  key={day.toISOString()}
                  index={first + column}
                  cell={cells[first + column]}
                  hue={viewer?.hue ?? null}
                  outOf={counted.length}
                  outside={!isSameMonth(day, anchor)}
                  selected={isSameDay(day, anchor)}
                  mine={mine(first + column)}
                  now={now}
                  onPointerDown={drawing.onPointerDown}
                  onClick={drawing.onClick}
                />
              ))}

              {/*
                The own-Availability rectangles and the draft, over the cells and
                under nothing — absolutely positioned siblings, so source order
                is the stacking order here, exactly as it is in a week column.

                They are laid over the row rather than drawn inside each cell
                because that is the whole of what "merged" means: one box across
                five days has no internal edges to hide.
              */}
              {viewer !== null &&
                ownRuns.map((run) => (
                  <OwnSpan key={`own-${run.start}`} run={run} hue={viewer.hue} />
                ))}

              {draft !== null &&
                draftRuns.map((run) => (
                  <DraftSpan
                    key={`draft-${run.start}`}
                    run={run}
                    erasing={draft.kind === 'erase'}
                    hue={viewer?.hue ?? 0}
                  />
                ))}

              {openHere && drawing.panel !== null && (
                <OpenDay
                  index={drawing.panel}
                  column={drawing.panel - first}
                  cell={cells[drawing.panel]}
                  counted={counted}
                  now={now}
                  friendsById={friendsById}
                  availability={availability}
                  requestErase={eraseGuard.requestErase}
                  onShowWeek={onShowWeek}
                  onClose={drawing.closePanel}
                />
              )}
            </div>
          )
        })}
      </div>

      {/*
        Outside the scroller, because it is a modal about the whole gesture
        rather than about a row — and mounted only while there is something to
        ask, so its state is the guard's and there is no open/closed flag to keep
        in step.
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

/**
 * A Hangout reaching one day, and the wall clock it opens at **on that day**.
 *
 * Its own name because three things read it — the chip, the panel and the
 * cell's `aria-label` — and because the pair is the whole of what a month cell
 * knows about a Hangout: not when it starts, but when it starts *here*.
 */
type BookedHere = { hangout: Hangout; from: string }

/** Everything one cell draws, swept once in `MonthGrid`. */
type MonthCellData = {
  day: Date
  slots: Slot[]
  segments: Segment[]
  /** The most Friends free at once — what the wash carries. */
  peak: number
  /** Who holds any Availability today, in roster order — what the avatars draw. */
  free: SetUpFriend[]
  booked: BookedHere[]
  /** How many of the day's Slots are the viewer's own — the panel's tri-state. */
  held: number
}

/**
 * How wide the avatars are, and **the floor they never go below**.
 *
 * 12px, which prototype 14 measured as the point where a blobatar stops being a
 * face: below it the shape is gone and only hue survives, so two Friends four
 * degrees apart read as one — ticket 05's under-reporting failure arriving by a
 * new route. Ticket 11's *"the blobatar shape disambiguates"* is true in the
 * sidebar, the panel and a Hangout card, and false in a grid cell at group size,
 * so this is the line the cell is not allowed to cross.
 *
 * It is why overflow **wraps** rather than shrinking or collapsing to `+N`:
 * the prototype measured a row of nine at 6px and `+N` at four faces plus a
 * number, which shows less than half the group and still asks the reader to
 * count. Fixing the size and wrapping makes another Friend cost a row of pixels
 * instead of costing legibility.
 *
 * ## Why exactly the floor, and not more
 *
 * 12px sits *on* the threshold, which looks like the wrong side of it to be on —
 * and the prototype's own `wrap` strategy reached a comfortable 16px. Both sizes
 * were measured here in a **78×80 cell carrying a Hangout chip**, which is the
 * tightest thing the grid can render:
 *
 * | | 3 | 5 | 8 | 9 |
 * | --- | --- | --- | --- | --- |
 * | **12px** | 1 row | 1 row of 5 | 2 rows | 2 rows, **nothing clipped** |
 * | **16px** | 1 row | 2 rows | 3 rows, **2 faces lost** | 3 rows, 3 lost |
 *
 * So 16px buys a third more mark and pays for it by *dropping people from the
 * cell* — `+N` without the N, which is worse than the thing wrapping was chosen
 * over. The prototype said as much about its own measurement: three rows of
 * three at 16px consumes the body box exactly, *"zero room left for the
 * own-Availability marker, a Hangout, or anything else"*. It reached 16px by
 * spending the whole cell, and this cell has a mandatory chip in it.
 *
 * 12px is therefore the largest size at which the whole group still fits — nine
 * Friends, the top of the stated range, in two rows of five with the chip intact.
 * Anything below it is the failure the floor names; anything above it starts
 * losing faces.
 */
const AVATAR = 'size-3'

/**
 * One day.
 *
 * A real `<button>`, which the week grid's cells are not: the month's hit target
 * *is* a day, so there is exactly one thing a cell can be pressed for and a
 * keyboard can therefore reach it. `Enter` opens the same panel a click does —
 * see `useMonthGesture`, which is what tells the two apart from a drag.
 */
const MonthCell = ({
  index,
  cell,
  hue,
  outOf,
  outside,
  selected,
  mine,
  now,
  onPointerDown,
  onClick,
}: {
  /** Its position in the lattice, which is the identity the gesture addresses it by. */
  index: number
  cell: MonthCellData
  /** The viewer's hue — the one colour on this grid. Null before setup finishes. */
  hue: number | null
  /** The size of the wash's query, which is the ramp's denominator. */
  outOf: number
  /** A day of the previous or next month, in the leading or trailing week. */
  outside: boolean
  selected: boolean
  mine: boolean
  now: number
  /*
   * The gesture's two handlers, not the gesture. Destructured by the caller for
   * the reason `isFree` and `draft` are above it: the hook returns a fresh object
   * literal every render, so a cell that took the whole of it would name a
   * dependency that always changes — and this file argues that convention twice
   * before it gets here.
   */
  onPointerDown: MonthGesture['onPointerDown']
  onClick: MonthGesture['onClick']
}) => {
  const { day, peak, free, booked } = cell
  const today = isToday(day)

  return (
    <button
      type="button"
      data-month-day={index}
      onPointerDown={(event) => onPointerDown(event, index)}
      onClick={() => onClick(index)}
      /*
        The whole cell in one sentence, because none of the five channels is
        readable by a screen reader on its own: a wash is a colour, an avatar is
        a picture and a chip is a pin. This is the only thing that says what the
        cell says.
      */
      aria-label={labelOf(cell, { mine, today, selected, now })}
      className={cn(
        'relative flex min-w-0 flex-1 basis-0 flex-col overflow-hidden border-l p-1 text-left first:border-l-0',
        /*
          A neutral ground, never a fade. Opacity on this grid means *how many
          Friends are free* (ticket 15), so dimming a leading or trailing day
          would report a smaller count for it — and those days are real days
          whose Availability the store holds and whose plans are exactly where a
          month's edges get made. They are drawn in full; only the ground behind
          them says which month they belong to.
        */
        outside && 'bg-muted/40',
        // `-2px` so the focus ring lands inside the lattice rather than over the
        // grid rule it shares with the neighbouring day.
        'focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring'
      )}
    >
      {/*
        The wash, under everything else in the cell and over the ground.

        First in the DOM so it paints below the numeral, the avatars and the
        chip. `peak === 0` renders nothing at all, which is the absence of a wash
        rather than the foot of the ramp: `segmentsOf` emits no segment for a
        span nobody is free in, so a quiet day has nothing to paint. `peak === 1`
        is the faintest wash plus a single avatar, and nothing special — ticket
        14 settled that explicitly.
      */}
      {hue !== null && peak > 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: friendColour(hue), opacity: heatOpacity(heatFraction(peak, outOf)) }}
        />
      )}

      {/*
        The date numeral, and both of the where-am-I marks.

        **The numeral row carries them and the cell edge never does.** The edge
        is spent four times over on a 78×72 box (the grid rule, today, the
        selected day, and — before ticket 14 cut it — a Hangout's glowing
        border), and stacking those is four concentric rings on a 72px-tall
        square where the outermost wins. So today keeps the filled pill it
        already owned, the selected day rings that pill, and the two together are
        a filled pill *with* a ring — which is the third state the prototype
        asked for and the reason your own Availability was moved off the numeral
        and onto an inner rectangle instead.
      */}
      <span className="relative flex shrink-0 items-center">
        <span
          className={cn(
            'inline-flex size-[17px] items-center justify-center rounded-full text-[11px] font-medium tabular-nums',
            today && 'bg-primary font-semibold text-primary-foreground',
            selected && 'ring-1 ring-foreground/50',
            !today && (outside ? 'text-muted-foreground/60' : 'text-foreground')
          )}
        >
          {format(day, 'd')}
        </span>
      </span>

      {/*
        Who, wrapping, never `+N`, never below the floor — see `AVATAR`.

        `overflow-hidden` on this and `shrink-0` on the chip below is what makes
        the chip **mandatory rather than decorative** in the layout as well as in
        the prose: in a cell too short for both, the avatars are what gives way.
        A clipped face costs *some of who*, which the panel restores in full on a
        click; a clipped chip would cost the one fact that stops the cell
        overselling a day whose best window is already spoken for.
      */}
      <span
        aria-hidden
        className="mt-0.5 flex min-h-0 flex-1 flex-wrap content-start gap-0.5 overflow-hidden"
      >
        {free.map((friend) => (
          /*
            Unlabelled, like a week block's faces: the cell's own `aria-label`
            already names every one of them, and a per-face title would read the
            same list a second time. At 12px there is no room for a name anyway —
            the panel is where a name settles a hue collision.
          */
          <FriendBlob key={friend.id} identity={friend.identity} size="xs" className={AVATAR} />
        ))}
      </span>

      {booked.length > 0 && (
        <span aria-hidden className="mt-auto flex shrink-0 flex-col gap-px pt-0.5">
          {booked.map(({ hangout, from }) => (
            <HangoutChip
              key={hangout.id}
              from={from}
              happening={isHappening(hangout, now)}
              over={isPast(hangout, now)}
            />
          ))}
        </span>
      )}
    </button>
  )
}

/**
 * A Hangout in a month cell: **a chip, and it is mandatory.**
 *
 * Ticket 01's grid spec — participants' blobs and a glowing border — is a
 * *week-view* spec, and prototype 14 measured why it cannot be a grid-wide one.
 * Six Participants get 9px dots, below the legibility floor; and month cells
 * **share their edges**, so a `0 0 9px` bloom lands on the neighbouring days and
 * the grid reads as smudged rather than as one day being special. A week block
 * floats in a column with air around it. A month cell does not.
 *
 * **No title** (ticket 14): 78px cannot hold one legibly — *"Aperitivo da
 * Giulia"* truncates to about eleven characters at 8px — so the name lives in
 * the panel, which is also the answer to the *"cell size where a name may not
 * fit at all"* that issues 09 and 10 both left open.
 *
 * **The wall clock instead**, because it is the one fact the chip can carry for
 * free and the one the cell otherwise throws away entirely. The week block
 * deliberately omits the time — its own position and height already say it, next
 * to the gutter it lines up with — and a month cell has no such geometry, so
 * here the time is the whole of *when*. It is this day's opening clock, so a plan
 * that began the evening before reads `00:00`, and it comes off the day's own
 * Slots array rather than from a fourth spelling of a wall clock.
 *
 * Its fill quiets the wash beneath it for the reason the week block's does:
 * those Slots are spoken for, so how many people happen to be free in them has
 * stopped being the question.
 *
 * Three states, from ticket 08 §6 and the app's one clock: Live until its *end*,
 * loudest in the destructive colour while it is happening, and muted forever
 * afterwards rather than removed.
 */
const HangoutChip = ({
  from,
  happening,
  over,
}: {
  /** The wall clock it opens at **on this day** — `00:00` where it began earlier. */
  from: string
  happening: boolean
  over: boolean
}) => (
  <span
    className={cn(
      /*
        `self-start`, so it hugs its own content rather than stretching to the
        cell. A full-width band reads as a bar the cell is wearing; a chip reads
        as a thing sitting on the day, which is what it is — and at 78px the two
        are the same width anyway, so this only shows up where there is room to
        spare.
      */
      'flex max-w-full items-center gap-0.5 self-start overflow-hidden rounded-sm border bg-background/80 px-0.5 text-[9px] leading-[12px] font-medium tabular-nums',
      happening
        ? 'border-destructive text-destructive'
        : over
          ? 'border-foreground/20 bg-background/60 text-muted-foreground'
          : 'border-foreground/45 text-foreground/80'
    )}
  >
    <PinIcon className="size-2 shrink-0" />
    <span className="truncate">{from}</span>
  </span>
)

/**
 * How far the overlays sit inside the cells they cover.
 *
 * Enough to clear the grid rule and read as an inner mark rather than as the
 * cell's own edge — which is the whole of ticket 14's *"own-Availability marking
 * does not use the cell edge"*. It is the month's spelling of the week block's
 * `inset-x-[3px]`, and for the same reason: the mark has to sit visibly *inside*
 * the wash, with density showing on both sides of it.
 */
const SPAN_INSET_PX = 3

/**
 * A number of columns as a share of the row — the one place the overlays'
 * geometry is spelled.
 *
 * Every overlay in this file is positioned as a percentage of the week row it
 * sits in, which is what makes `basis-0 flex-1` on the rows load-bearing rather
 * than tidying: the cells are exactly a seventh each, so a share of the row is a
 * count of days.
 */
const columns = (count: number): string => `${((count / DAYS_IN_WEEK) * 100).toFixed(4)}%`

/** Where a run of days sits in its week row, inset clear of the cell edges. */
const spanOf = (run: Run) => ({
  left: `calc(${columns(run.start)} + ${SPAN_INSET_PX}px)`,
  width: `calc(${columns(run.length)} - ${SPAN_INSET_PX * 2}px)`,
})

/**
 * Your own Availability across a stretch of days, as **one** rounded rectangle.
 *
 * Border and ring, never a fill — ticket 15's rule, and the density shows
 * straight through it. `pointer-events-none` because the gesture owns every
 * pointer here: a drag begun on your own Availability must reach the cell
 * beneath, not stop on a div with no handler.
 *
 * The same two declarations the week grid's own-run block uses, deliberately, so
 * "this is mine" is one visual idea across both views even though nothing else
 * about the two cells is shared.
 */
const OwnSpan = ({ run, hue }: { run: Run; hue: number }) => (
  <span
    aria-hidden
    className="pointer-events-none absolute inset-y-[3px] rounded-[4px] border"
    style={{
      ...spanOf(run),
      borderColor: friendColour(hue),
      boxShadow: `inset 0 0 0 2px ${friendColourAlpha(hue, 0.3)}`,
    }}
  />
)

/**
 * The gesture's own contribution, over the top of the shape above.
 *
 * A dashed outline and **no fill**, exactly as in the week grid: opacity on this
 * grid means how many Friends are free, and a draft is not allowed to borrow the
 * one channel that is spoken for. Both at once was the prototype's finding — the
 * solid shape says what your Availability will be, the dashed one says which
 * part of it this drag is making.
 */
const DraftSpan = ({ run, erasing, hue }: { run: Run; erasing: boolean; hue: number }) => (
  <span
    aria-hidden
    className={cn(
      'pointer-events-none absolute inset-y-[3px] rounded-[4px] border border-dashed',
      erasing && 'border-destructive'
    )}
    style={{ ...spanOf(run), ...(erasing ? {} : { borderColor: friendColour(hue) }) }}
  />
)

/**
 * The open day's panel, and the zero-weight box it points at.
 *
 * The anchor spans the **cell's column across the whole row height**, so the
 * panel opens below the week row rather than beside the cell — ticket 14's
 * finding is that a day panel is about three month columns wide, and a month
 * grid has no gutter and is compared in two dimensions, so anchoring beside a
 * cell covers exactly the days being compared against.
 *
 * Its own component so the panel's inputs are assembled where the cell's sweep
 * already is, rather than in the row's JSX: the windows are the same segments
 * the wash's peak came from, and the two must not be derived twice.
 */
const OpenDay = ({
  index,
  column,
  cell,
  counted,
  now,
  friendsById,
  availability,
  requestErase,
  onShowWeek,
  onClose,
}: {
  index: number
  /** Its position in the week row, which is what the anchor is placed by. */
  column: number
  cell: MonthCellData
  counted: SetUpFriend[]
  now: number
  friendsById: ReadonlyMap<string, SetUpFriend>
  availability: AvailabilityStore
  requestErase: (instants: readonly Date[]) => void
  onShowWeek: (day: Date) => void
  onClose: () => void
}) => {
  const { day, slots, segments, peak, booked, held } = cell

  const windows = useMemo(() => windowsOf(segments, counted, slots), [segments, counted, slots])

  /*
   * The day's own Slots, once, for both writes — 46, 48 or 50 of them and never
   * the number 48. `availability.draw` filters to the delta on the way through,
   * so "I'm free all day" over a day you are half free for writes only the other
   * half; and `requestErase` is handed the whole day, because a Slot the viewer
   * does not hold is one `droppedBy` already knows to ignore.
   */
  const instants = useMemo(() => wholeDay(day, GROUP_TIME_ZONE), [day])

  return (
    <DayPanel
      key={index}
      day={day}
      anchor={
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0"
          style={{ left: columns(column), width: columns(1) }}
        />
      }
      peak={peak}
      windows={windows}
      booked={booked.map(({ hangout }) => hangout)}
      own={held === 0 ? 'none' : held === slots.length ? 'all' : 'some'}
      now={now}
      friendsById={friendsById}
      onDrawDay={() => {
        availability.draw(instants)
        onClose()
      }}
      onEraseDay={() => {
        requestErase(instants)
        onClose()
      }}
      onShowWeek={() => onShowWeek(day)}
      onClose={onClose}
    />
  )
}

/**
 * The whole cell in one sentence, for a screen reader.
 *
 * Every channel this cell spends is visual — a wash is a colour, an avatar is a
 * picture, a chip is a pin, a pill is a shape — so without this the cell reads as
 * a bare date and nothing else. The order is the order the eye takes it in: how
 * good the day is, who is around, whether you are in it, what is already booked,
 * and where you are.
 */
const labelOf = (
  { day, peak, free, booked }: MonthCellData,
  { mine, today, selected, now }: { mine: boolean; today: boolean; selected: boolean; now: number }
): string =>
  [
    format(day, 'EEEE d MMMM'),
    peak === 0
      ? 'nobody free'
      : `${peak} free at once — ${free.map((friend) => friend.name).join(', ')}`,
    mine ? 'you are free' : null,
    ...booked.map(
      ({ hangout, from }) =>
        `${nameOf(hangout)} at ${from}${isPast(hangout, now) ? ', over' : isHappening(hangout, now) ? ', happening now' : ''}`
    ),
    today ? 'today' : null,
    selected ? 'selected' : null,
  ]
    .filter((part) => part !== null)
    .join(' · ')
