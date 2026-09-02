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

/**
 * A copy armed by the popover's Duplicate control, waiting to be dropped.
 *
 * Only its **length** survives the arming, deliberately: the discoverable route
 * is "arm, then click where it goes" — ticket 10 built exactly this, and a
 * Friend is expected to navigate to another week in between. Addresses would
 * stop meaning anything the moment they did.
 */
type Placing = { length: number }

type Drag = {
  /**
   * `read` is a press that cannot write: the erase toggle is on and there is no
   * block under the pointer. It still runs through the whole machine so that
   * `moved` decides the outcome — a *drag* that subtracts nothing should also
   * read nothing, and only a press that stayed still opens the popover.
   */
  kind: DraftKind | 'read'
  anchor: SlotAddress
  /**
   * The anchor as an **absolute slot index**, not a pixel offset.
   *
   * Ticket 10 measured auto-scroll silently corrupting a pixel anchor, "in
   * mirror image", in its own harness. Nothing auto-scrolls on desktop, but the
   * grid is a scroller and a wheel mid-drag would do the same thing.
   */
  anchorAbsolute: number
  origin: Point
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
  pointerId: number
  capturedBy: Element
}

/**
 * Drawing, erasing and duplicating Availability with a pointer.
 *
 * The grid owns the pixels; this owns the state machine. Every geometric rule
 * it applies lives in `gesture.ts`, tested, and none of it is decided here.
 *
 * ## A bare click writes nothing
 *
 * Below 4px of travel the gesture is a **click**, and a click opens the slot
 * popover (ticket 10, reversing ticket 06's click-to-create on both platforms).
 * That is what makes ticket 01's *no undo, no reset* tolerable: no stray click
 * can put Availability on the grid, so the only thing that can still slip is a
 * drag somebody meant to make.
 *
 * ## What the anchor decides
 *
 * The **mode is decided by what is under the pointer when the drag starts** —
 * the paint/erase convention every comparable tool already uses. With the erase
 * toggle on, a drag from inside a block subtracts and a press on empty grid
 * does not draw: erasing is a subtraction, and an erase toggle that quietly
 * drew would be the surprise the toggle exists to prevent.
 *
 * ## Mouse and pen only
 *
 * Touch is issue 13, and it is blocked on the mobile layout. Ignoring touch here
 * is not an oversight but the only correct thing to do in the meantime: with no
 * long-press to arm and no `touch-action` handling, a touch drag would fight the
 * grid's own scroller and win. So the grid still scrolls under a finger, and
 * issue 13 adds the gesture that arms.
 */
export const useDrawGesture = ({
  columns,
  tools,
  availability,
  requestErase,
  viewer,
  body,
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
   */
  body: RefObject<HTMLDivElement | null>
}) => {
  const [draft, setDraft] = useState<DrawingDraft | null>(null)
  const [popover, setPopover] = useState<SlotAddress | null>(null)
  const [placing, setPlacing] = useState<Placing | null>(null)

  const drag = useRef<Drag | null>(null)

  /**
   * The Slot a click landed on, waiting for the `click` event to open it.
   *
   * **Measured, not defensive.** Opening the popover on `pointerup` mounts it
   * mid-gesture, and the `click` the browser then dispatches is an outside press
   * as far as Base UI is concerned — so the popup opened and closed inside one
   * click, every time. Deciding on pointerup (which is where `moved` is known)
   * and *mounting* on click puts the popup on screen after the event that would
   * have dismissed it has been and gone.
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
       * constant in `week-grid.tsx`, where it belongs.
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

  /** Forget the gesture in flight, and let go of the pointer. */
  const abort = useCallback(() => {
    const current = drag.current
    if (current !== null && current.capturedBy.hasPointerCapture(current.pointerId)) {
      current.capturedBy.releasePointerCapture(current.pointerId)
    }
    drag.current = null
    setDraft(null)
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

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>, column: number) => {
      // Left button only, and no touch — see the note on this hook.
      if (event.button !== 0) return
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return
      if (viewer === null) return

      const point = { x: event.clientX, y: event.clientY }
      const anchor = { column, row: addressAt(point)?.row ?? 0 }

      // An armed duplicate is dropped by the next press, wherever it lands.
      if (placing !== null) {
        availability.draw(instantsOf(placingSelection(lengths, anchor, placing.length)))
        setPlacing(null)
        return
      }

      const held = availability.isFree(viewer.id, columns[column].slots[anchor.row].start)

      // Otherwise the browser starts selecting the grid's own text under the drag.
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)

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

      drag.current = {
        kind,
        anchor,
        anchorAbsolute: toAbsolute(lengths, anchor),
        origin: point,
        source: kind === 'duplicate' ? runUnder(anchor) : [],
        moved: false,
        selection: [],
        shape: '',
        pointerId: event.pointerId,
        capturedBy: event.currentTarget,
      }
    },
    [
      viewer,
      addressAt,
      placing,
      availability,
      instantsOf,
      lengths,
      columns,
      tools.erasing,
      runUnder,
    ]
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const point = { x: event.clientX, y: event.clientY }
      const current = drag.current

      if (current === null) {
        // Not dragging. The only thing a move means then is "show me where the
        // armed copy would land", which is the whole of the placing affordance.
        if (placing === null) return
        const over = addressAt(point)
        setDraft(
          over === null
            ? null
            : draftOf('duplicate', placingSelection(lengths, over, placing.length), [])
        )
        return
      }

      if (!current.moved && !isDrag(current.origin, point)) return
      current.moved = true

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
       */
      const column =
        tools.mode === 'linear'
          ? columnUnderPointer(current.anchor.column, over.column, point.x - current.origin.x)
          : over.column
      // The row was read against `over`'s column, which may not be the column
      // hysteresis chose — so clamp it into the one that won.
      const pointer = { column, row: clamp(over.row, 0, lengths[column] - 1) }

      if (current.kind === 'read') return

      const selection =
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
      const shape = shapeOf(current.kind, selection)
      if (shape === current.shape) return

      current.selection = selection
      current.shape = shape
      setDraft(draftOf(current.kind, selection, current.source))
    },
    [placing, addressAt, lengths, tools.mode, labels]
  )

  const onPointerUp = useCallback(() => {
    const current = drag.current
    if (current === null) return

    /*
     * Below the threshold this was a click: open the popover and write nothing.
     * Above it, commit what the last move resolved to — the selection has been
     * recomputed anchor→pointer on every move, so a transient excursion that
     * came back has already self-corrected, and only where the pointer LIFTS
     * commits (ticket 01's correction to ticket 06).
     */
    if (!current.moved) pending.current = current.anchor
    else if (current.kind !== 'read' && current.selection.length > 0) {
      const instants = instantsOf(current.selection)
      if (current.kind === 'erase') requestErase(instants)
      else availability.draw(instants)
    }

    abort()
  }, [instantsOf, availability, requestErase, abort])

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
      if (drag.current === null && placing === null) return
      abort()
      setPlacing(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [abort, placing])

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
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onClick,
    /** Pointer capture lost to a context menu, a window blur, or the OS. */
    onPointerCancel: abort,
    popover,
    closePopover,
    ...actions,
  }
}

/** Everything the grid needs from the gesture, under one name. */
export type DrawGesture = ReturnType<typeof useDrawGesture>

const centre = (rect: DOMRect): number => rect.left + rect.width / 2

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
