import {
  clamp,
  columnUnderPointer,
  fromAbsolute,
  isDrag,
  linearSelection,
  selectionFor,
  shiftSelection,
  toAbsolute,
  type Point,
  type SlotAddress,
} from '@/availability/gesture'
import { runsOf, type Slot } from '@/availability/slots'
import {
  ARM_MS,
  edgeScrollBy,
  pageDirection,
  preArmVerdict,
  reportCompositorLoss,
} from '@/availability/touch'
import type { AvailabilityStore } from '@/availability/use-availability'
import type { DrawingTools } from '@/availability/use-drawing-tools'
import type { Viewer } from '@/availability/week-grid'
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { times } from 'lodash-es'

/** One day column, as the gesture needs it: its own Slots, in order. */
export type GridColumn = { day: Date; slots: Slot[] }

/** What a gesture in flight is doing. */
export type DraftKind = 'draw' | 'erase' | 'duplicate'

/**
 * The gesture as the grid draws it, mid-drag.
 *
 * Two sets rather than one, because the prototype's finding was that you need
 * to see the **union and your own contribution at once**: the committed
 * Availability plus this draft is what the block will be, and the dashed
 * outline over `cells` is what this gesture is adding to it. On-release merging
 * was built and rejected there — a block visibly absorbing at the instant you
 * let go is the "wait, did I do that?" moment worth avoiding.
 */
export type DrawingDraft = {
  kind: DraftKind
  /** `draftCell` keys of every Slot this gesture is contributing. */
  cells: ReadonlySet<string>
  /** For a duplicate, the block being copied — a *source*, not a thing moving. */
  source: ReadonlySet<string>
}

/** A Slot's key inside a draft. Column-scoped, because rows are (`SlotAddress`). */
export const draftCell = (column: number, row: number): string => `${column}:${row}`

/** Which edge of a selected block a resize handle drags. */
export type Edge = 'top' | 'bottom'

/**
 * A copy armed by the popover's Duplicate control, waiting to be dropped.
 *
 * Only its **length** survives the arming, deliberately: the discoverable route
 * is "arm, then click where it goes" — ticket 10 built exactly this, and a
 * Friend is expected to navigate to another week in between. Addresses would
 * stop meaning anything the moment they did.
 */
type Placing = { length: number }

/**
 * Where a gesture has got to. **The one difference between a mouse and a
 * finger, and every other rule in this hook is shared.**
 *
 * A mouse press is `live` immediately: the button was pressed on purpose and
 * nothing else on a desktop wants that gesture. A finger's press is `holding` —
 * the browser's scroller has an equal claim on it, and which of the three
 * things it turns out to be is not knowable until either the finger moves or
 * `ARM_MS` passes.
 */
type Phase =
  /** Drawing. A mouse from the start; a finger once the long-press has fired. */
  | 'live'
  /** A finger, still inside the slop circle, with the arming timer pending. */
  | 'holding'
  /** A finger latched to a horizontal swipe: on release it pages the view. */
  | 'paging'

type Drag = {
  /**
   * `read` is a press that cannot write: the erase toggle is on and there is no
   * block under the pointer. It still runs through the whole machine so that
   * `moved` decides the outcome — a *drag* that subtracts nothing should also
   * read nothing, and only a press that stayed still opens the popover.
   */
  kind: DraftKind | 'read'
  phase: Phase
  anchor: SlotAddress
  /**
   * The anchor as an **absolute slot index**, not a pixel offset.
   *
   * Ticket 10 measured auto-scroll silently corrupting a pixel anchor, "in
   * mirror image", in its own harness — and issue 13 is the slice where edge
   * auto-scroll actually exists, so the hazard is now live rather than
   * hypothetical. A drag that runs 380px of finger travel plus 51px of
   * auto-scroll keeps its anchor because the anchor is an index into the Slots
   * and the Slots do not move; only the pixels do.
   */
  anchorAbsolute: number
  origin: Point
  /** Where the pointer was last seen, so an auto-scroll frame can re-resolve it. */
  point: Point
  /** The run under the anchor, for a duplicate. Empty otherwise. */
  source: SlotAddress[]
  /** Whether 4px has been travelled. Below it this gesture is a click. */
  moved: boolean
  /**
   * What the last pointer event resolved to, and a cheap identity for it.
   *
   * Held here rather than read back off the `draft` state at release: the commit
   * must be exactly what the last move computed, and reading render state in an
   * event handler makes that a question about when React flushed.
   */
  selection: SlotAddress[]
  shape: string
  /** An armed duplicate this press will drop, in Slots. `null` when there is none. */
  drop: number | null
  pointerId: number
  /** Torn down when the gesture ends, however it ends. */
  release: () => void
}

/** A handle drag: one edge of one block, moving inside its own column. */
type Resize = {
  column: number
  edge: Edge
  /** The run as it was when the handle was pressed: rows `[start, start + length)`. */
  start: number
  length: number
  /** What the last move resolved to, and its identity. */
  delta: { kind: 'draw' | 'erase'; rows: number[] } | null
  shape: string
  pointerId: number
  release: () => void
}

/**
 * Drawing, erasing, duplicating and resizing Availability with a pointer —
 * **a mouse, a pen or a finger**.
 *
 * The grid owns the pixels; this owns the state machine. Every geometric rule
 * it applies lives in `gesture.ts` or `touch.ts`, tested, and none of it is
 * decided here.
 *
 * ## A bare click, and a bare tap, write nothing
 *
 * Below 4px of travel the gesture is a **click**, and a click opens the slot
 * popover (ticket 10, reversing ticket 06's click-to-create on both platforms).
 * That is what makes ticket 01's *no undo, no reset* tolerable: no stray click
 * can put Availability on the grid, so the only thing that can still slip is a
 * drag somebody meant to make.
 *
 * On a finger the same sentence is stronger, because a tap is what the browser
 * would otherwise have spent on a scroll: a press that ends inside the slop
 * circle before `ARM_MS` opens the popover and writes nothing.
 *
 * ## What the anchor decides
 *
 * The **mode is decided by what is under the pointer when the drag starts** —
 * the paint/erase convention every comparable tool already uses. With the erase
 * toggle on, a drag from inside a block subtracts and a press on empty grid
 * does not draw: erasing is a subtraction, and an erase toggle that quietly
 * drew would be the surprise the toggle exists to prevent.
 *
 * ## The finger: long-press arms, and before that the gesture is not ours
 *
 * Issue 10's decision, over its own prototype's recommendation. Three things
 * can happen to a press on this grid and the first move decides which:
 *
 * - it stays still for `ARM_MS` → **the drag draws** (`live`), and from then on
 *   `touchmove` is `preventDefault`ed so the scroller cannot take it back;
 * - it goes sideways → **the view pages** by the current block on release
 *   (`paging`), which is `stepBy`'s own move and measures nothing here;
 * - it goes up or down → **the grid scrolls**, natively, and this hook forgets
 *   the gesture entirely.
 *
 * The two together are what resolve the conflict this ticket exists for; issue
 * 10 says so in as many words, and neither half does it alone.
 *
 * **`touch-action` stays as it was** — the grid surface is untouched, and the
 * only `touch-action: none` this slice adds is on the resize knobs, which is
 * the one place the ticket asks for it. So the armed draw beats the scroller by
 * `preventDefault` on a non-passive `touchmove` rather than by declaring the
 * surface un-scrollable, which is variant A's whole premise and **issue 15's
 * gate**: the instrument that says whether it worked is `reportCompositorLoss`.
 *
 * ## No pointer capture, on any pointer type
 *
 * This hook used to `setPointerCapture` so that later events retargeted to the
 * column the drag began on. It now registers **window listeners on
 * pointerdown** and tears them down when the gesture ends, which is
 * `use-month-gesture.ts`'s argument and `shell.tsx`'s: a drag released outside
 * the element commits rather than hanging, and there is no capture to lose.
 *
 * The consequence issue 11 named is the one that mattered to this ticket:
 * `setPointerCapture` **throws for a synthetic pointer**, which is the wall
 * issues 08, 09 and 10 all hit, and day / 3-day / week are all this grid. With
 * it gone, three of issue 13's four views can be driven from the browser
 * console instead of described.
 */
export const useDrawGesture = ({
  columns,
  tools,
  availability,
  requestErase,
  viewer,
  body,
  scroller,
  onPage,
}: {
  columns: readonly GridColumn[]
  tools: DrawingTools
  availability: AvailabilityStore
  /**
   * How an erase leaves this hook — `useEraseGuard`'s gate rather than
   * `availability.erase` directly.
   *
   * Both erase paths go through it (the drag, and `Erase block` from the
   * popover), because ticket 08 §10's confirmation is about the *delete* and
   * not about which gesture asked for it. The gate calls straight through when
   * no Hangout is at stake, so the ordinary erase still lands the moment the
   * gesture ends.
   *
   * A parameter rather than something this hook decides: the prediction needs
   * every Hangout and the viewer's id, neither of which is a gesture's business
   * — and the dialog it raises belongs to the grid, which is what renders it.
   */
  requestErase: (instants: readonly Date[]) => void
  viewer: Viewer | null
  /**
   * The columns container. Hit-testing goes through its `[data-column]`
   * children rather than through arithmetic on the pointer's x.
   *
   * **This is the DST trap, and it is the likeliest way to ship a drag that is
   * right fifty weeks a year.** On the two DST weeks the odd day carries its own
   * hour gutter immediately to its left, so the columns are not evenly spaced
   * and `x / columnWidth` is a column out from that gutter onwards. Asking the
   * elements where they are costs a handful of `getBoundingClientRect` calls per
   * pointer event and cannot be wrong.
   *
   * Owned by the grid rather than created here, so the ref reaches its element
   * the ordinary way — a ref handed back out of a hook and into a `ref=` is a
   * ref read during render as far as `eslint-plugin-react-hooks` is concerned,
   * and it is not wrong to be suspicious of it.
   *
   * It is also where the non-passive `touchmove` listener goes: a touch's events
   * are dispatched to the element the finger landed on for the whole sequence,
   * so one listener on the body covers a drag that has since left the window.
   */
  body: RefObject<HTMLDivElement | null>
  /**
   * The element the columns scroll inside — **the grid's own scroller, not the
   * window**, which is what makes the auto-scroll bands reachable by a thumb.
   *
   * A phone puts a top bar above this and the drawer's peek below it; bands
   * measured against the viewport would put the lower one underneath the
   * drawer.
   */
  scroller: RefObject<HTMLDivElement | null>
  /**
   * What a pre-arm horizontal swipe does: page by the current view's block.
   *
   * `-1` and `1` are `stepBy`'s directions, and `Calendar` wires them to
   * `goPrevious` / `goNext` — so *how far* a swipe moves is `view.ts`'s answer
   * and nothing here measures a block. Issue 12 decision 8 is what this pays
   * back: the phone's bar has no `‹ ›`, so until now moving a week on a phone
   * was two taps in the date navigator.
   */
  onPage: (direction: -1 | 1) => void
}) => {
  const [draft, setDraft] = useState<DrawingDraft | null>(null)
  const [popover, setPopover] = useState<SlotAddress | null>(null)
  const [placing, setPlacing] = useState<Placing | null>(null)
  /**
   * Whether a finger's drag is armed — the **surface-wide** half of the arming
   * signal.
   *
   * State rather than a ref because it is drawn: an inset ring around the whole
   * scroller, which is the one part of the signal a thumb cannot cover.
   * `navigator.vibrate` does not exist on iOS Safari and never has, so the
   * feedback has to be visual, and the parts of it that are *under* the finger
   * (the draft, the tag) cannot be all of it.
   */
  const [armed, setArmed] = useState(false)
  /**
   * The block a touch write left behind, addressed by one Slot inside it.
   *
   * A **selection**, which is a touch-only concept and exists for one reason:
   * a 7px edge zone is not addressable by a finger, so resizing needs explicit
   * handles and handles need something to hang off. Prototype 10 §3: 44px hit
   * areas on the selected block's two edges, which is *"the only part of the
   * desktop model that has no touch equivalent at all"*.
   *
   * Cleared by the next press anywhere on the grid, so it never accumulates and
   * never needs a dismiss control.
   */
  const [selection, setSelection] = useState<SlotAddress | null>(null)

  const drag = useRef<Drag | null>(null)
  const resize = useRef<Resize | null>(null)

  /**
   * The Slot a click landed on, waiting for the `click` event to open it.
   *
   * **Measured, not defensive.** Opening the popover on `pointerup` mounts it
   * mid-gesture, and the `click` the browser then dispatches is an outside press
   * as far as Base UI is concerned — so the popup opened and closed inside one
   * click, every time. Deciding on pointerup (which is where `moved` is known)
   * and *mounting* on click puts the popup on screen after the event that would
   * have dismissed it has been and gone.
   *
   * A tap takes the same route: the browser sends a `click` after `pointerup`
   * for a finger too, so the popover opens by exactly the same path it does for
   * a mouse and there is no second rule to keep in step.
   */
  const pending = useRef<SlotAddress | null>(null)

  const lengths = useMemo(() => columns.map((column) => column.slots.length), [columns])

  const labels = useMemo(
    () => columns.map((column) => column.slots.map((slot) => slot.label)),
    [columns]
  )

  /** Which Slot the pointer is over, by asking the columns where they are. */
  const addressAt = useCallback(
    (point: Point): SlotAddress | null => {
      const elements = [...(body.current?.querySelectorAll<HTMLElement>('[data-column]') ?? [])]
      if (elements.length === 0) return null

      const rects = elements.map((element) => ({
        column: Number(element.dataset.column),
        rect: element.getBoundingClientRect(),
      }))

      /*
       * The column the pointer is inside, or the nearest one — a drag is allowed
       * to leave the grid sideways, and falling back to the nearest column is
       * what makes "drag off the end of Sunday" mean "to the end of Sunday".
       */
      const inside = rects.find(({ rect }) => point.x >= rect.left && point.x < rect.right)
      const nearest =
        inside ??
        rects.reduce((best, candidate) =>
          Math.abs(centre(candidate.rect) - point.x) < Math.abs(centre(best.rect) - point.x)
            ? candidate
            : best
        )

      /*
       * The row from the column's OWN height, not from a shared row count: this
       * column may hold 46 or 50 rows while its neighbours hold 48. Dividing by
       * its height rather than by `SLOT_PX` also keeps the one pixel↔slot
       * constant in `week-grid.tsx`, where it belongs — and it is what makes the
       * 44px touch row cost this file nothing at all.
       */
      const rows = lengths[nearest.column]
      const row = Math.floor(((point.y - nearest.rect.top) / nearest.rect.height) * rows)
      return { column: nearest.column, row: clamp(row, 0, rows - 1) }
    },
    [lengths, body]
  )

  const instantsOf = useCallback(
    (addresses: readonly SlotAddress[]): Date[] =>
      addresses.map(({ column, row }) => columns[column].slots[row].start),
    [columns]
  )

  /** Forget the gesture in flight, and stop listening for it. */
  const abort = useCallback(() => {
    drag.current?.release()
    drag.current = null
    resize.current?.release()
    resize.current = null
    setDraft(null)
    setArmed(false)
  }, [])

  /**
   * The run of committed Availability covering this Slot, as addresses.
   *
   * A **visible** run, per column: a run crossing midnight is two blocks on
   * screen, and duplicating one of them duplicates what was pointed at. Nothing
   * is lost by that — a run has no identity of its own (CONTEXT.md), so there is
   * no "whole thing" to be more faithful to.
   */
  const runUnder = useCallback(
    ({ column, row }: SlotAddress): SlotAddress[] => {
      if (viewer === null) return []
      const slots = columns[column].slots
      const runs = runsOf(slots.length, (index) =>
        availability.isFree(viewer.id, slots[index].start)
      )
      const run = runs.find(
        (candidate) => row >= candidate.start && row < candidate.start + candidate.length
      )
      return run === undefined
        ? []
        : times(run.length, (index) => ({ column, row: run.start + index }))
    },
    [columns, availability, viewer]
  )

  /**
   * What the pointer being *here* means for the drag in flight.
   *
   * Factored out of the move handler because **the auto-scroll frame calls it
   * with the same point**: a finger stays on the glass while the content moves
   * under it, so re-resolving the unchanged point against the moved grid is the
   * whole of how a draft extends past the viewport. Prototype 10 hit the mirror
   * image of this in its own harness — a scripted finger pinned to *content*
   * coordinates, travelling with the grid.
   */
  const applyMove = useCallback(
    (point: Point) => {
      const current = drag.current
      if (current === null) return
      current.point = point

      const over = addressAt(point)
      if (over === null) return

      /*
       * Anchor-relative hysteresis, applied to the *column* and to nothing else.
       * The row follows the pointer freely: the hazard ticket 10 measured is
       * lateral, and a budget on the vertical axis would only make the gesture
       * feel stuck.
       *
       * **Linear only.** The hazard is Linear's — a stray column sideways turns
       * two hours into twenty-six — and ticket 10 found Multi-day "safe at week
       * width", where the same drift adds one visible extra day's block. Spending
       * the budget there would cost something instead: crossing a column IS the
       * gesture, and at a narrow grid (57px columns with both panes open) 45px
       * would refuse a deliberate two-day rectangle.
       *
       * This is also the budget the ticket's own escape hatch depends on: at a
       * phone's 47px week columns no budget can exceed a column width, and at
       * 3-day's measured 112px this one rejects a thumb's drift while still
       * allowing a deliberate crossing.
       */
      const column =
        tools.mode === 'linear'
          ? columnUnderPointer(current.anchor.column, over.column, point.x - current.origin.x)
          : over.column
      // The row was read against `over`'s column, which may not be the column
      // hysteresis chose — so clamp it into the one that won.
      const pointer = { column, row: clamp(over.row, 0, lengths[column] - 1) }

      if (current.kind === 'read') return

      const selected =
        current.kind === 'duplicate'
          ? shiftSelection(
              lengths,
              current.source,
              toAbsolute(lengths, pointer) - current.anchorAbsolute
            )
          : selectionFor(tools.mode, labels, current.anchor, pointer)

      /*
       * Nothing new to draw, nothing to render. A pointer crossing one 20px row
       * fires many moves, and each one that got through would re-render seven
       * columns of fifty rows for the same picture.
       */
      const shape = shapeOf(current.kind, selected)
      if (shape === current.shape) return

      current.selection = selected
      current.shape = shape
      setDraft(draftOf(current.kind, selected, current.source))
    },
    [addressAt, lengths, tools.mode, labels]
  )

  /**
   * Commit what the last move resolved to, and let go.
   *
   * Below the threshold this was a click or a tap: open the popover and write
   * nothing. Above it, commit what the last move resolved to — the selection has
   * been recomputed anchor→pointer on every move, so a transient excursion that
   * came back has already self-corrected, and only where the pointer LIFTS
   * commits (ticket 01's correction to ticket 06).
   */
  const finish = useCallback(() => {
    const current = drag.current
    if (current === null) return

    if (current.phase === 'paging') {
      const direction = pageDirection(current.point.x - current.origin.x)
      abort()
      if (direction !== null) onPage(direction)
      return
    }

    // An armed duplicate is dropped by the press that stays still, wherever it
    // landed — see `drop`.
    if (current.drop !== null) {
      if (!current.moved) {
        availability.draw(instantsOf(placingSelection(lengths, current.anchor, current.drop)))
        setPlacing(null)
      }
      abort()
      return
    }

    if (!current.moved) pending.current = current.anchor
    else if (current.kind !== 'read' && current.selection.length > 0) {
      const instants = instantsOf(current.selection)
      if (current.kind === 'erase') requestErase(instants)
      else availability.draw(instants)
      /*
       * A touch write leaves the block **selected**, which is what puts the
       * resize handles on screen — prototype 10's variant C ends the same way
       * ("a 30-minute block, selected, with handles"), and it is the only route
       * a finger has to an edge. The anchor addresses the block whichever
       * direction the drag went, because the anchor is always inside it.
       *
       * Set for every pointer type and drawn for one: the grid renders handles
       * on the `(hover: none)` path only, because a mouse resizes by drawing
       * over a block or erasing part of it and does not need a target.
       */
      if (current.kind === 'draw') setSelection(current.anchor)
    }

    abort()
  }, [abort, onPage, availability, instantsOf, lengths, requestErase])

  /**
   * The listeners are registered once, on pointerdown, so both of these are
   * reached through a ref: without it a drag would run — and commit — against
   * the props the press was made under. One of them is `requestErase`, whose
   * prediction is rebuilt whenever the Hangouts or the store move, and ticket 08
   * §10's dialog has to name what an erase costs *when it lands*. The shape
   * `use-month-gesture.ts` and `useAvailability` both already use.
   */
  const latest = useRef({ applyMove, finish })
  useEffect(() => {
    latest.current = { applyMove, finish }
  }, [applyMove, finish])

  /**
   * The edge band, while an armed finger is inside it.
   *
   * One `requestAnimationFrame` loop for the life of the gesture rather than one
   * started and stopped as the finger crosses the band: `edgeScrollBy` answers
   * "nothing" in the middle, so the loop is a scroll of zero pixels most of the
   * time and there is no edge to get wrong.
   */
  const autoScroll = useCallback(() => {
    let frame = 0
    const tick = () => {
      frame = requestAnimationFrame(tick)
      const current = drag.current
      const element = scroller.current
      if (current === null || current.phase !== 'live' || element === null) return
      const box = element.getBoundingClientRect()
      const by = edgeScrollBy(current.point.y, box.top, box.bottom)
      if (by === 0) return
      element.scrollTop += by
      // The finger has not moved; the grid under it has. Re-resolving the same
      // point is what extends the draft — and the anchor is an index, so it
      // cannot be dragged along with the content.
      latest.current.applyMove(current.point)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [scroller])

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>, column: number) => {
      // Left button only. Touch, pen and mouse are all welcome now — the finger
      // is what this slice adds, and it differs only in `Phase`.
      if (event.button !== 0) return
      if (viewer === null) return
      // One gesture at a time; a second finger mid-drag is not a gesture.
      if (drag.current !== null || resize.current !== null) return

      const touch = event.pointerType === 'touch'
      const point = { x: event.clientX, y: event.clientY }
      const anchor = { column, row: addressAt(point)?.row ?? 0 }

      // Any press anywhere on the grid dismisses the selection, so the handles
      // never outlive the block they were opened on.
      setSelection(null)

      const held = availability.isFree(viewer.id, columns[column].slots[anchor.row].start)

      /*
       * Otherwise the browser starts selecting the grid's own text under the
       * drag. Not for a finger: `preventDefault` on a touch's pointerdown
       * suppresses the compatibility mouse events the `click` that opens the
       * popover is dispatched alongside, and a tap has to keep reaching it.
       */
      if (!touch) event.preventDefault()

      /*
       * With the erase toggle on, empty grid is not a place a drag begins: there
       * is nothing under the pointer to subtract, and an erase toggle that
       * quietly drew would be the surprise the toggle exists to prevent. The
       * press is a `read` — which still has to travel through the machine,
       * because a *drag* from there must do nothing at all while a still press
       * opens the popover.
       */
      const kind: Drag['kind'] = tools.erasing
        ? held
          ? 'erase'
          : 'read'
        : held && event.altKey
          ? 'duplicate'
          : 'draw'

      const onMove = (moved: PointerEvent) => {
        const current = drag.current
        if (current === null || moved.pointerId !== current.pointerId) return
        const at = { x: moved.clientX, y: moved.clientY }

        if (current.phase === 'holding') {
          const verdict = preArmVerdict(at.x - current.origin.x, at.y - current.origin.y)
          current.point = at
          if (verdict === 'hold') return
          /*
           * The long-press has lost this gesture. Sideways it becomes the
           * view's and stays here to be measured on release; up or down it is
           * the browser's, and forgetting it entirely is what lets the grid
           * scroll exactly as it did before this slice.
           */
          if (verdict === 'page') current.phase = 'paging'
          else abort()
          return
        }
        if (current.phase === 'paging') {
          current.point = at
          return
        }

        if (!current.moved && !isDrag(current.origin, at)) return
        current.moved = true
        latest.current.applyMove(at)
      }

      /**
       * `preventDefault` on a non-passive `touchmove`, and the instrument that
       * says whether it worked.
       *
       * The whole of how an armed draw beats the scroller without
       * `touch-action: none` on the surface — variant A's premise, accepted by
       * issue 10 with its own `### Still open` naming this as the one claim that
       * rests on scripted events. `cancelable === false` means the browser had
       * already committed the gesture to a scroll before we asked, which is
       * precisely the failure issue 15 is the gate for.
       */
      const onTouchMove = (moving: TouchEvent) => {
        const current = drag.current
        if (current === null) return
        if (current.phase === 'holding') return
        if (!moving.cancelable) {
          if (current.phase === 'live') {
            reportCompositorLoss('uncancelable-touchmove', `phase ${current.phase}`)
          }
          return
        }
        moving.preventDefault()
      }

      const element = body.current
      let timer = 0
      let stopScrolling: (() => void) | null = null

      const release = () => {
        window.clearTimeout(timer)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onCancel)
        element?.removeEventListener('touchmove', onTouchMove)
        stopScrolling?.()
      }
      // Named declarations so `release` can name them before they run.
      function onUp(up: PointerEvent) {
        if (up.pointerId !== drag.current?.pointerId) return
        latest.current.finish()
      }
      function onCancel(cancelled: PointerEvent) {
        const current = drag.current
        if (current === null || cancelled.pointerId !== current.pointerId) return
        // The scroller took an armed draw. On a phone this is also what an
        // incoming call does, so it is not proof of the compositor question on
        // its own — but paired with the `touchmove` line it is what issue 15
        // reads. The draft is discarded either way: nothing half-drawn commits.
        if (current.phase === 'live') reportCompositorLoss('pointercancel', 'armed draw cancelled')
        abort()
      }

      /**
       * Arming: the press becomes a draw, and says so in three places at once.
       *
       * `moved` goes true with it, because a long-press *is* the deliberate act
       * the 4px threshold exists to find on a mouse — and it is what lets a
       * press that arms inside the edge band extend a draft without the finger
       * moving at all. Releasing here without moving commits exactly one
       * 30-minute block, which prototype 10 measured as the touch equivalent of
       * ticket 06's click-no-move rule.
       */
      const arm = () => {
        const current = drag.current
        if (current === null || current.phase !== 'holding') return
        current.phase = 'live'
        current.moved = true
        setArmed(true)
        stopScrolling = autoScroll()
        // Narrowing, not a case: a `read` press never gets a timer, so there is
        // nothing here for it to reach.
        if (current.kind === 'read') return
        current.selection = [current.anchor]
        current.shape = shapeOf(current.kind, current.selection)
        setDraft(draftOf(current.kind, current.selection, current.source))
      }

      /*
       * No timer for a `read` press: there is nothing for it to arm. Without
       * this, a long-press on empty grid with the erase toggle on would put the
       * ring up over a draft that cannot exist and hold the scroll for a
       * gesture that was always going to do nothing.
       */
      if (touch && kind !== 'read') timer = window.setTimeout(arm, ARM_MS)

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onCancel)
      if (touch) element?.addEventListener('touchmove', onTouchMove, { passive: false })

      drag.current = {
        kind,
        phase: touch ? 'holding' : 'live',
        anchor,
        anchorAbsolute: toAbsolute(lengths, anchor),
        origin: point,
        point,
        source: kind === 'duplicate' ? runUnder(anchor) : [],
        moved: false,
        selection: [],
        shape: '',
        /*
         * A duplicate armed by the popover is dropped by **the press that stays
         * still**, on every pointer type. It used to land on pointerdown, which
         * a mouse cannot get wrong and a finger cannot get right: with a copy
         * armed, every attempt to scroll the grid would have written one.
         */
        drop: placing?.length ?? null,
        pointerId: event.pointerId,
        release,
      }
    },
    [
      viewer,
      addressAt,
      placing,
      availability,
      lengths,
      columns,
      tools.erasing,
      runUnder,
      body,
      abort,
      autoScroll,
    ]
  )

  /**
   * And the click opens it.
   *
   * The whole of the popover's mounting, one event later than the decision — see
   * `pending`. A click that followed a drag finds nothing waiting, which is
   * right: a drag has already written, and there is nothing to read.
   */
  const onClick = useCallback(() => {
    const anchor = pending.current
    pending.current = null
    if (anchor !== null) setPopover(anchor)
  }, [])

  /* ------------------------------------------------------------------ *
   * Resizing, by the two handles a selection grows
   * ------------------------------------------------------------------ */

  /**
   * One edge of the selected block, dragged.
   *
   * **No arming, and no arbitration**: the knob carries `touch-action: none`, so
   * the browser has already been told this 44px box is not a scroller and there
   * is nothing to out-race. That is the whole reason the ticket puts
   * `touch-action` there and only there — a handle drag never contends with the
   * grid scrolling freely around it.
   *
   * It stays inside its own column, which makes it the one gesture in this file
   * that is immune to the lateral drift prototype 10 measured: a handle drag has
   * no horizontal component to get wrong.
   *
   * A resize is expressed as **a draw or an erase of the difference**, never as
   * a new range: extending draws the rows that appear, shrinking erases the rows
   * that go — through the same `requestErase` gate as everything else, because
   * shrinking a block off a Hangout costs exactly what erasing it does.
   */
  const onHandleDown = useCallback(
    (
      event: React.PointerEvent<HTMLElement>,
      { column, edge, start, length }: { column: number; edge: Edge; start: number; length: number }
    ) => {
      if (event.button !== 0) return
      if (drag.current !== null || resize.current !== null) return
      event.preventDefault()
      event.stopPropagation()

      const onMove = (moved: PointerEvent) => {
        const current = resize.current
        if (current === null || moved.pointerId !== current.pointerId) return
        const over = addressAt({ x: moved.clientX, y: moved.clientY })
        if (over === null) return

        const delta = resizeDelta(current, clamp(over.row, 0, lengths[current.column] - 1))
        const shape = delta === null ? 'none' : `${delta.kind}|${delta.rows.join()}`
        if (shape === current.shape) return
        current.shape = shape
        current.delta = delta
        setDraft(
          delta === null
            ? null
            : draftOf(
                delta.kind,
                delta.rows.map((row) => ({ column: current.column, row })),
                []
              )
        )
      }

      const release = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onCancel)
      }
      function onUp(up: PointerEvent) {
        const current = resize.current
        if (current === null || up.pointerId !== current.pointerId) return
        const { delta } = current
        if (delta !== null) {
          const instants = instantsOf(delta.rows.map((row) => ({ column: current.column, row })))
          if (delta.kind === 'erase') requestErase(instants)
          else availability.draw(instants)
        }
        /*
         * The selection survives the resize, addressed by the row the *other*
         * edge holds — the one this drag cannot have moved, so it is inside the
         * result whichever way the handle went and however far.
         */
        setSelection({ column, row: edge === 'bottom' ? start : start + length - 1 })
        abort()
      }
      function onCancel(cancelled: PointerEvent) {
        if (cancelled.pointerId !== resize.current?.pointerId) return
        abort()
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onCancel)

      resize.current = {
        column,
        edge,
        start,
        length,
        delta: null,
        shape: 'none',
        pointerId: event.pointerId,
        release,
      }
    },
    [addressAt, lengths, instantsOf, availability, requestErase, abort]
  )

  /**
   * Escape abandons whatever is in flight and commits nothing.
   *
   * One listener for the grid's lifetime rather than one per gesture: the ref it
   * reads is always current, and a listener added on pointerdown would need a
   * render's worth of state to drive it.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (
        drag.current === null &&
        resize.current === null &&
        placing === null &&
        selection === null
      )
        return
      abort()
      setPlacing(null)
      setSelection(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [abort, placing, selection])

  /**
   * Nothing may outlive the grid.
   *
   * A drag in flight at unmount takes its window listeners, its arming timer and
   * its animation frame with it — the convention `use-month-gesture.ts` sets and
   * the one `shell.tsx`'s review pass found missing. The grid unmounts under a
   * finger for a reason that is not hypothetical here: switching view from the
   * left drawer replaces this component, and so does paging into the month.
   */
  useEffect(
    () => () => {
      drag.current?.release()
      resize.current?.release()
    },
    []
  )

  const closePopover = useCallback(() => setPopover(null), [])

  /**
   * The popover's three controls, as three whole actions.
   *
   * Composed here rather than in the grid, which would otherwise have to walk
   * `instantsOf(runUnder(address))` to erase a block and read `.length` off a run
   * to arm a copy — the view reaching into this hook's parts to assemble
   * behaviour that belongs to it.
   */
  const actions = {
    /** The deliberate 30-minute block: ticket 10's create action on the panel. */
    drawSlot: useCallback(
      (address: SlotAddress) => {
        availability.draw(instantsOf([address]))
        closePopover()
        // Selected, so a finger can immediately drag it to the length it wanted
        // — the panel route prototype 10 recommended as the *read* path ends
        // here, and without the handles it would end at 30 minutes.
        setSelection(address)
      },
      [availability, instantsOf, closePopover]
    ),
    /**
     * Whole-block erase, which the erase drag gives only by dragging its length.
     *
     * Through the same gate as the drag: this is the path most likely to remove
     * the whole of the Availability holding somebody on a plan, since it takes
     * the entire run rather than whatever the pointer covered.
     */
    eraseRun: useCallback(
      (address: SlotAddress) => {
        requestErase(instantsOf(runUnder(address)))
        closePopover()
        setSelection(null)
      },
      [requestErase, instantsOf, runUnder, closePopover]
    ),
    /** Arm a copy of the run under this Slot; the next press drops it. */
    armDuplicateAt: useCallback(
      (address: SlotAddress) => {
        const length = runUnder(address).length
        closePopover()
        if (length > 0) setPlacing({ length })
      },
      [runUnder, closePopover]
    ),
  }

  return {
    draft,
    placing: placing !== null,
    /** Whether a finger's drag is armed — the surface's own arming signal. */
    armed,
    /** The block the handles hang off, or `null`. Drawn on the touch path only. */
    selection,
    onPointerDown,
    onHandleDown,
    onClick,
    popover,
    closePopover,
    ...actions,
  }
}

/** Everything the grid needs from the gesture, under one name. */
export type DrawGesture = ReturnType<typeof useDrawGesture>

const centre = (rect: DOMRect): number => rect.left + rect.width / 2

/**
 * What a handle dragged to `to` changes: the rows that appear, or the rows that
 * go.
 *
 * `null` where the edge has not moved. A block never shrinks below one Slot —
 * deleting it is `Erase block` in the popover, which is a deliberate control
 * rather than the end of a drag, and a handle that could delete by overshooting
 * is a handle that deletes by accident.
 */
const resizeDelta = (
  { edge, start, length }: Pick<Resize, 'edge' | 'start' | 'length'>,
  to: number
): { kind: 'draw' | 'erase'; rows: number[] } | null => {
  const last = start + length - 1
  if (edge === 'bottom') {
    const bottom = Math.max(to, start)
    if (bottom === last) return null
    return bottom > last
      ? { kind: 'draw', rows: range(last + 1, bottom) }
      : { kind: 'erase', rows: range(bottom + 1, last) }
  }
  const top = Math.min(to, last)
  if (top === start) return null
  return top < start
    ? { kind: 'draw', rows: range(top, start - 1) }
    : { kind: 'erase', rows: range(start, top - 1) }
}

/** The rows from `from` to `to`, inclusive. */
const range = (from: number, to: number): number[] => times(to - from + 1, (index) => from + index)

const draftOf = (
  kind: DraftKind,
  cells: readonly SlotAddress[],
  source: readonly SlotAddress[]
): DrawingDraft => ({
  kind,
  cells: new Set(cells.map(({ column, row }) => draftCell(column, row))),
  source: new Set(source.map(({ column, row }) => draftCell(column, row))),
})

/**
 * A selection's identity, cheaply.
 *
 * Its two ends and its size, which no two different selections of either
 * geometry can share — Linear's are one run, and Multi-day's are a rectangle.
 */
const shapeOf = (kind: DraftKind, selection: readonly SlotAddress[]): string => {
  const first = selection[0]
  const last = selection[selection.length - 1]
  return first === undefined
    ? `${kind}|empty`
    : `${kind}|${selection.length}|${draftCell(first.column, first.row)}|${draftCell(last.column, last.row)}`
}

/** The armed copy, `length` Slots long, with its top on the Slot under the pointer. */
const placingSelection = (
  lengths: readonly number[],
  at: SlotAddress,
  length: number
): SlotAddress[] =>
  linearSelection(lengths, at, fromAbsolute(lengths, toAbsolute(lengths, at) + length - 1))
