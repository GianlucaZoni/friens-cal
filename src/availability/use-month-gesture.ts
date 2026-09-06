import { isDrag, type Point } from '@/availability/gesture'
import { daysBetween, wholeDay } from '@/availability/month'
import { ARM_MS, pageDirection, preArmVerdict, reportCompositorLoss } from '@/availability/touch'
import type { AvailabilityStore } from '@/availability/use-availability'
import type { DrawingTools } from '@/availability/use-drawing-tools'
import type { Viewer } from '@/availability/week-grid'
import { GROUP_TIME_ZONE } from '@/shell/use-calendar-view'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

/** What a gesture in flight is doing. A month drag cannot duplicate. */
type MonthDraftKind = 'draw' | 'erase'

/** The gesture as the grid draws it, mid-drag: which days, and which way. */
export type MonthDraft = {
  kind: MonthDraftKind
  /** Indices into the lattice. */
  days: ReadonlySet<number>
}

/**
 * Where a gesture has got to — the week grid's own three phases, and the same
 * one difference between a mouse and a finger. See `use-draw-gesture.ts`, which
 * states the argument once for both grids.
 */
type Phase = 'live' | 'holding' | 'paging'

type MonthDrag = {
  /**
   * `read` is a press that cannot write: the erase toggle is on and the day
   * under the pointer holds nothing of yours. It still runs through the machine
   * so that `moved` decides the outcome — a *drag* that subtracts nothing should
   * also read nothing, and only a press that stayed still opens the panel.
   */
  kind: MonthDraftKind | 'read'
  phase: Phase
  anchor: number
  origin: Point
  /** Where the pointer was last seen, so a release can measure the swipe. */
  point: Point
  /** Whether 4px has been travelled. Below it this gesture is a click. */
  moved: boolean
  /** What the last move resolved to — committed verbatim on release. */
  span: number[]
  /** A cheap identity for it, so an unchanged span re-renders nothing. */
  shape: string
  pointerId: number
  /** Torn down when the gesture ends, however it ends. */
  release: () => void
}

/**
 * Drawing and erasing a **whole day at a time**, with a pointer.
 *
 * Ticket 01 settled that a drag in month view means **00:00–24:00 for each
 * dragged day**, and ticket 11 adds the half that makes it read as one object:
 * *"contiguous days of your own Availability merge into one rounded rectangle —
 * which is also what a click-drag across several days produces, so the gesture
 * and its result look like the same object."* The grid owns the pixels; this
 * owns the state machine, and `month.ts` owns every rule either of them applies.
 *
 * ## Its own hook, and not `useDrawGesture` with a flag
 *
 * The week's gesture is built on a `SlotAddress` — a column and a row inside
 * that column's own Slots array — and every rule in `gesture.ts` is about that
 * lattice: the absolute index that survives a scroll, the column hysteresis, the
 * Linear-versus-Multi-day selection, the duplicate's shift. The month's unit is
 * a **day**, its selection is one contiguous range of them, and none of those
 * rules has anything to say about it. Sharing the hook would mean a second
 * coordinate system inside a machine whose whole correctness argument is about
 * the first one. What *is* shared is the arithmetic worth sharing — `isDrag`'s
 * 4px, and `wholeDay`'s refusal to believe in 48.
 *
 * ## A bare click writes nothing
 *
 * Below 4px of travel the gesture is a **click**, and a click opens the day
 * panel (ticket 14's decision, and ticket 10's rule for the week grid). That is
 * what makes ticket 01's *no undo, no reset* tolerable here in particular: a
 * stray click that wrote would put **fifty rows** on the grid, which is a whole
 * day of every Friend's calendar claiming you are free.
 *
 * ## Window listeners, and no pointer capture
 *
 * The move and the release are **window listeners, registered on pointerdown
 * and torn down when the gesture ends** — which is what makes a drag released
 * outside the grid commit rather than hang, and it leaves the cells real
 * `<button>`s a keyboard can reach, where `setPointerCapture` on `pointerdown`
 * would have needed a `preventDefault` that stops one taking focus. They are
 * registered imperatively rather than through an effect on a `dragging` flag: a
 * flag would cost a render at the start of every gesture, and the listeners want
 * the values the press was made under anyway.
 *
 * The side benefit is now the whole grid's rather than this hook's: with no
 * `setPointerCapture` anywhere in the path, **the gesture can be driven by
 * synthetic pointer events**. Issue 13 took the same shape to the week grid for
 * exactly that reason, so the wall issues 08, 09 and 10 all hit is down for all
 * four views.
 *
 * ## The finger, and ticket 14's conflict — which is real and still open
 *
 * Issue 13 makes the month drawable by touch on the same terms as the week: a
 * **long-press arms**, a pre-arm horizontal swipe pages by a month, and a
 * pre-arm vertical one is the browser's. `use-draw-gesture.ts` states that
 * argument in full; `touch.ts` holds the numbers; both grids share them, which
 * is the point.
 *
 * What issue 13 does **not** resolve is ticket 14's objection, and it should not
 * be read as having done: tap-to-inspect and drag-to-draw are still the same
 * 54×102 rectangle with nothing to carve a target out of. What makes that
 * tolerable is the same thing that makes it tolerable on the week grid — 450ms
 * of stillness separates the two, and neither a tap nor a swipe can write. And
 * the day panel's `I'm free all day` / `Erase this day` **stay**: they are the
 * discoverable route, ticket 01's standing correction is that a gesture may be
 * the accelerator and may not be the only path, and on a 54px cell they are the
 * only thing a screen reader can reach.
 *
 * **No edge auto-scroll here, and none is missing.** The week grid's exists
 * because its columns are two to three screens tall; the lattice is five or six
 * rows of `flex-1 basis-0` that fill the inset, so on a phone there is nothing
 * to scroll and nothing for a band to do.
 */
export const useMonthGesture = ({
  days,
  tools,
  availability,
  requestErase,
  viewer,
  body,
  onPage,
}: {
  /** The month lattice, in order. Indices into it are this hook's addresses. */
  days: readonly Date[]
  tools: DrawingTools
  availability: AvailabilityStore
  /**
   * How an erase leaves this hook — `useEraseGuard`'s gate rather than
   * `availability.erase` directly.
   *
   * **Not optional, and the month is where it matters most.** A whole-day erase
   * is the worst case ticket 08 §10 exists for: every Slot of a day measured
   * against every Hangout on it — and a drag does that for each day it crossed,
   * in one call. Calling `availability.erase` from here would drop the viewer
   * from all of those plans silently, with no undo and no route back — adding
   * Availability never re-adds you (`CONTEXT.md`).
   */
  requestErase: (instants: readonly Date[]) => void
  viewer: Viewer | null
  /**
   * The cells' container. Hit-testing goes through its `[data-month-day]`
   * children rather than through arithmetic on the pointer's position.
   *
   * `data-month-day` and not `data-day`, which **react-day-picker already
   * spends** on every cell of the mini calendar in the left pane. Scoping the
   * query to this ref is what makes it correct, so the rename buys nothing on
   * its own — it buys that a document-wide query for the month's cells, in a
   * later refactor or in a verification script, cannot silently return
   * somebody else's calendar instead.
   *
   * The month lattice *is* evenly spaced, unlike the week's columns on a DST
   * week — so this is not the correctness argument it is there. It is a
   * robustness one: the rows are content-sized above their minimum, so a row
   * that grows to fit a second Hangout chip makes `y / rowHeight` wrong, and
   * asking the elements cannot be.
   */
  body: RefObject<HTMLDivElement | null>
  /**
   * What a pre-arm horizontal swipe does: page by the current view's block,
   * which in this view is a **month** and not 30 or 31 days — `stepBy` uses
   * `addMonths` precisely so a step from 31 January does not land in March.
   */
  onPage: (direction: -1 | 1) => void
}) => {
  const [draft, setDraft] = useState<MonthDraft | null>(null)
  /** Which day's panel is open, as an index into the lattice. */
  const [panel, setPanel] = useState<number | null>(null)

  const drag = useRef<MonthDrag | null>(null)

  /**
   * Whether the click the browser is about to dispatch belongs to a drag.
   *
   * A drag inside one cell — over 4px, still the same day — ends with a `click`
   * on that cell, and the cell's own handler would read it as a press and open
   * the panel over the Availability it just drew.
   *
   * **Set only when a cell click is actually coming**, which is when the press
   * and the release happened on the *same* cell: a `click` is dispatched to the
   * nearest common ancestor of the two, so a drag that crossed cells produces
   * its click on the row instead and no cell handler ever runs. Setting it for
   * those would leave the flag standing and swallow the *next* press. It is
   * also cleared whenever a new gesture starts, so nothing can outlive one.
   */
  const dragged = useRef(false)

  /** Which day the pointer is over, by asking the cells where they are. */
  const dayAt = useCallback(
    (point: Point): number | null => {
      const cells = [...(body.current?.querySelectorAll<HTMLElement>('[data-month-day]') ?? [])]
      if (cells.length === 0) return null

      const rects = cells.map((cell) => ({
        day: Number(cell.dataset.monthDay),
        rect: cell.getBoundingClientRect(),
      }))

      const inside = rects.find(
        ({ rect }) =>
          point.x >= rect.left &&
          point.x < rect.right &&
          point.y >= rect.top &&
          point.y < rect.bottom
      )
      if (inside !== undefined) return inside.day

      /*
       * Or the nearest, by the distance to the cell's centre in both axes at
       * once — a drag is allowed to leave the grid in any direction, and a month
       * grid can be left sideways *and* downwards, where a week column could
       * only be left sideways. `daysBetween` then clamps, so leaving the grid
       * means "to the edge of it" rather than "nowhere".
       */
      const nearest = rects.reduce((best, candidate) =>
        distance(candidate.rect, point) < distance(best.rect, point) ? candidate : best
      )
      return nearest.day
    },
    [body]
  )

  /** Forget the gesture in flight, and stop listening for it. */
  const abort = useCallback(() => {
    drag.current?.release()
    drag.current = null
    setDraft(null)
  }, [])

  /**
   * Commit what the last move resolved to, and let go.
   *
   * The span comes off the ref rather than out of the `draft` state: what lands
   * has to be exactly what the last move computed, and reading render state in
   * an event handler makes that a question about when React flushed.
   */
  const finish = useCallback(
    (releasedOver: Element | null) => {
      const current = drag.current
      if (current === null) return

      /*
       * A pre-arm horizontal swipe. It pages and it writes nothing — and it
       * suppresses the click the browser will send, because a swipe that
       * happened to begin and end on the same cell would otherwise open that
       * day's panel over the month it just left.
       */
      if (current.phase === 'paging') {
        const direction = pageDirection(current.point.x - current.origin.x)
        dragged.current = true
        abort()
        if (direction !== null) onPage(direction)
        return
      }

      /*
       * Only the anchor's own cell will see a click — see `dragged`. `closest`
       * rather than the target itself, because the release usually lands on one of
       * the cell's children (an avatar, the numeral, a chip).
       */
      dragged.current =
        current.moved &&
        releasedOver?.closest('[data-month-day]')?.getAttribute('data-month-day') ===
          String(current.anchor)

      if (current.moved && current.kind !== 'read' && current.span.length > 0) {
        /*
         * **Each day's own Slots**, gathered day by day — never `48 × n`. Two of
         * the days a September-to-October drag can cross hold 46 and 50, and the
         * spring one would otherwise be handed an instant that is not on the grid
         * at all.
         */
        const instants = current.span.flatMap((index) => wholeDay(days[index], GROUP_TIME_ZONE))
        if (current.kind === 'erase') requestErase(instants)
        else availability.draw(instants)
      }

      abort()
    },
    [days, availability, requestErase, abort, onPage]
  )

  /**
   * The release, always through the *current* `finish`.
   *
   * A gesture's listeners are registered once, on pointerdown, so without this
   * a drag would commit against the props the press was made under — and one of
   * them is `requestErase`, whose prediction is rebuilt whenever the Hangouts or
   * the store move. Ticket 08 §10's dialog has to name what an erase costs *when
   * it lands*, not what it would have cost when the hand started moving. The
   * same shape `useAvailability` uses for the toast's Retry, and for the same
   * reason.
   */
  const latestFinish = useRef(finish)
  useEffect(() => {
    latestFinish.current = finish
  }, [finish])

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>, day: number) => {
      // Left button only. A finger is welcome now, and differs only in `Phase`.
      if (event.button !== 0) return
      if (viewer === null) return
      // One gesture at a time; a second pointer down mid-drag is not a gesture.
      if (drag.current !== null) return

      // Whatever the last gesture left waiting to be suppressed, this press is
      // not it — so nothing can be swallowed by a flag from two gestures ago.
      dragged.current = false

      /*
       * Whether any of this day is yours, which is what the erase toggle acts
       * on. **Any**, not all: a day you are free for one evening is a day an
       * erase drag has something to subtract, and requiring the whole day would
       * make the toggle silently inert on almost every real day.
       */
      const held = wholeDay(days[day], GROUP_TIME_ZONE).some((instant) =>
        availability.isFree(viewer.id, instant)
      )

      /*
       * With the erase toggle on, a day holding nothing of yours is not a place
       * a drag begins — the same convention as the week grid, and the same
       * reason: an erase toggle that quietly drew would be the surprise the
       * toggle exists to prevent. The press is a `read`, which still travels
       * through the machine so that a *drag* from there does nothing while a
       * still press opens the panel.
       */
      const kind: MonthDrag['kind'] = tools.erasing ? (held ? 'erase' : 'read') : 'draw'

      const touch = event.pointerType === 'touch'
      const origin = { x: event.clientX, y: event.clientY }

      const onMove = (moved: PointerEvent) => {
        const current = drag.current
        if (current === null || moved.pointerId !== current.pointerId) return

        const point = { x: moved.clientX, y: moved.clientY }
        current.point = point

        if (current.phase === 'holding') {
          const verdict = preArmVerdict(point.x - current.origin.x, point.y - current.origin.y)
          if (verdict === 'hold') return
          // The long-press has lost the gesture: sideways it becomes the view's
          // and is measured on release, vertically it is the browser's.
          if (verdict === 'page') current.phase = 'paging'
          else abort()
          return
        }
        if (current.phase === 'paging') return

        if (!current.moved && !isDrag(current.origin, point)) return
        current.moved = true

        if (current.kind === 'read') return

        const over = dayAt(point)
        if (over === null) return

        const span = daysBetween(days.length, current.anchor, over)
        /*
         * Nothing new to select, nothing to render. A pointer crossing one cell
         * fires many moves, and each one that got through would re-derive
         * thirty-five days of segments for the same picture.
         */
        const shape = `${current.kind}|${span[0]}|${span[span.length - 1]}`
        if (shape === current.shape) return

        current.span = span
        current.shape = shape
        setDraft({ kind: current.kind, days: new Set(span) })
      }

      /**
       * `preventDefault` on a non-passive `touchmove`, once the gesture is ours.
       *
       * The same instrument the week grid carries, for the same gate: issue 15
       * asks whether this still beats the compositor once a long-press has
       * armed, and `cancelable === false` is the browser saying it does not.
       */
      const onTouchMove = (moving: TouchEvent) => {
        const current = drag.current
        if (current === null || current.phase === 'holding') return
        if (!moving.cancelable) {
          if (current.phase === 'live') {
            reportCompositorLoss('uncancelable-touchmove', 'month, armed draw')
          }
          return
        }
        moving.preventDefault()
      }

      const element = body.current
      let timer = 0

      const release = () => {
        window.clearTimeout(timer)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onCancel)
        element?.removeEventListener('touchmove', onTouchMove)
      }
      // Named function declarations so `release` can name them before they run.
      function onUp(up: PointerEvent) {
        if (up.pointerId !== drag.current?.pointerId) return
        latestFinish.current(up.target instanceof Element ? up.target : null)
      }
      function onCancel(cancelled: PointerEvent) {
        const current = drag.current
        if (current === null || cancelled.pointerId !== current.pointerId) return
        if (current.phase === 'live') reportCompositorLoss('pointercancel', 'month, armed draw')
        abort()
      }

      /**
       * Arming, and `moved` goes true with it.
       *
       * A long-press *is* the deliberate act the 4px threshold looks for on a
       * mouse, so releasing here without moving commits **this day, all day** —
       * which is exactly what ticket 01 says a month drag means, for a drag of
       * one day. The unit of this grid is the day; there is no smaller thing for
       * a press to land on.
       */
      const arm = () => {
        const current = drag.current
        if (current === null || current.phase !== 'holding') return
        current.phase = 'live'
        current.moved = true
        if (current.kind === 'read') return
        current.span = [current.anchor]
        current.shape = `${current.kind}|${current.anchor}|${current.anchor}`
        setDraft({ kind: current.kind, days: new Set(current.span) })
      }

      // Nothing to arm for a `read` press — see the week grid's note.
      if (touch && kind !== 'read') timer = window.setTimeout(arm, ARM_MS)

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onCancel)
      if (touch) element?.addEventListener('touchmove', onTouchMove, { passive: false })

      drag.current = {
        kind,
        phase: touch ? 'holding' : 'live',
        anchor: day,
        origin,
        point: origin,
        moved: false,
        span: [],
        shape: '',
        pointerId: event.pointerId,
        release,
      }
    },
    [viewer, days, availability, tools.erasing, dayAt, abort, body]
  )

  /**
   * A press that stayed still opens the day panel.
   *
   * **On `click`, not on `pointerup`** — the lesson ticket 10 left on the week
   * grid's popover. Mounting a popup during `pointerup` puts it on screen before
   * the `click` the browser then dispatches, and Base UI reads that click as an
   * outside press: the panel opened and closed inside one gesture, every time.
   * Deciding on release and *mounting* on the click puts it up after the event
   * that would have dismissed it has been and gone.
   *
   * It is also the keyboard's route in, for free: `Enter` on a cell dispatches a
   * click with no pointer sequence before it, so `dragged` is clear and the
   * panel opens.
   */
  const onClick = useCallback((day: number) => {
    if (dragged.current) {
      dragged.current = false
      return
    }
    setPanel(day)
  }, [])

  /**
   * Escape abandons whatever is in flight and commits nothing.
   *
   * One listener for the grid's lifetime rather than one per gesture: the ref it
   * reads is always current, and this is the one thing a drag needs that its own
   * pointer listeners cannot deliver.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (drag.current === null) return
      abort()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [abort])

  /** Nothing may outlive the grid — a drag in flight at unmount takes its listeners. */
  useEffect(() => () => drag.current?.release(), [])

  const closePanel = useCallback(() => setPanel(null), [])

  return { draft, panel, onPointerDown, onClick, closePanel }
}

/** Everything the grid needs from the gesture, under one name. */
export type MonthGesture = ReturnType<typeof useMonthGesture>

/** How far a point is from a rectangle's centre, in both axes at once. */
const distance = (rect: DOMRect, point: Point): number =>
  Math.hypot(rect.left + rect.width / 2 - point.x, rect.top + rect.height / 2 - point.y)
