/**
 * PROTOTYPE — ticket 06. Throwaway. Do not promote to production.
 *
 * One interaction engine, three behaviours. The three variants disagree on
 * exactly one axis — how you remove part of a range (edge case 7) — so they
 * deliberately share the drag lifecycle rather than triplicating it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import {
  DAYS,
  DAY_MIN,
  PX_PER_MIN,
  SLOTS_PER_DAY,
  SLOT_PX,
  SNAP,
  WEEK_MIN,
  clampSlot,
  clampWeek,
  dayOf,
  dayPieces,
  durationLabel,
  endLabel,
  findAllAt,
  findAt,
  fmtRange,
  hhmm,
  merge,
  rid,
  seedRanges,
  seedSegments,
  slotOf,
  spanFromSlots,
  subtract,
  type Range,
} from './lib'

export type Behaviour = {
  /** Availability merges (ticket 01) or segments keep their identity (variant C). */
  merging: boolean
  /** What a plain drag starting INSIDE a block does. */
  insideBlockDrag: 'erase' | 'select'
  /** Double-click inside a block punches out the 30-min slot under the pointer. */
  punchOnDoubleClick: boolean
  /** Draw the boundaries between the underlying records. */
  showSeams: boolean
}

export type DragMode = 'column' | 'rect' | 'free'

const DRAG_MODES: { key: DragMode; label: string; blurb: string }[] = [
  { key: 'column', label: 'Column-locked', blurb: 'Horizontal movement ignored. Drag below midnight to run into the next day.' },
  { key: 'rect', label: 'Rectangle', blurb: 'Drag across columns paints the same hours on every day touched. No cross-midnight.' },
  { key: 'free', label: 'Linear time', blurb: 'Anchor → pointer is one continuous range through the week. Tue 23:00 → Thu 09:00 is legal.' },
]

type Gesture =
  | { kind: 'create'; anchorDay: number; anchorMin: number; curDay: number; curMin: number; moved: boolean }
  | { kind: 'resize'; id: string; edge: 'start' | 'end'; fixed: number; curSlot: number; moved: boolean }
  | { kind: 'duplicate'; src: Range; grabSlots: number; startSlot: number; moved: boolean }
  | { kind: 'erase'; day: number; anchorSlot: number; curSlot: number; moved: boolean; shift: boolean }

const EDGE_PX = 7
const MOVE_THRESHOLD_PX = 4

const COLOUR = '#4f6bed'

export function WeekGrid({
  behaviour,
  variantName,
  gestureNotes,
}: {
  behaviour: Behaviour
  variantName: string
  gestureNotes: string[]
}) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const originRef = useRef<{ x: number; y: number } | null>(null)

  const [ranges, setRanges] = useState<Range[]>(() =>
    behaviour.merging ? merge(seedRanges()) : seedSegments(),
  )
  const [past, setPast] = useState<Range[][]>([])
  const [futureStack, setFutureStack] = useState<Range[][]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const [dragMode, setDragMode] = useState<DragMode>('column')
  const [altDown, setAltDown] = useState(false)
  const [hover, setHover] = useState<{ id: string | null; edge: 'start' | 'end' | null; abs: number } | null>(null)
  const [log, setLog] = useState<string[]>(['ready'])

  const note = useCallback((s: string) => setLog((l) => [s, ...l].slice(0, 8)), [])

  const commit = useCallback(
    (next: Range[], what: string) => {
      setPast((p) => [...p, ranges].slice(-50))
      setFutureStack([])
      setRanges(behaviour.merging ? merge(next) : [...next].sort((a, b) => a.start - b.start))
      note(what)
    },
    [ranges, behaviour.merging, note],
  )

  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p
      const prev = p[p.length - 1]!
      setFutureStack((f) => [ranges, ...f].slice(0, 50))
      setRanges(prev)
      note('undo')
      return p.slice(0, -1)
    })
  }, [ranges, note])

  const redo = useCallback(() => {
    setFutureStack((f) => {
      if (!f.length) return f
      const next = f[0]!
      setPast((p) => [...p, ranges].slice(-50))
      setRanges(next)
      note('redo')
      return f.slice(1)
    })
  }, [ranges, note])

  // ---- pointer → time ------------------------------------------------------

  const pointToTime = useCallback((clientX: number, clientY: number) => {
    const el = surfaceRef.current
    if (!el) return { day: 0, minRaw: 0, abs: 0 }
    const rect = el.getBoundingClientRect()
    const colW = rect.width / 7
    const day = Math.max(0, Math.min(6, Math.floor((clientX - rect.left) / colW)))
    // NOT clamped: overflow past the bottom of the grid is how a drag runs
    // past midnight in column-locked mode.
    const minRaw = (clientY - rect.top) / PX_PER_MIN
    const abs = clampWeek(day * DAY_MIN + Math.max(0, Math.min(DAY_MIN - 1, minRaw)))
    return { day, minRaw, abs }
  }, [])

  // ---- gesture → draft ranges ---------------------------------------------

  const draftFromGesture = useCallback(
    (g: Gesture): Range[] => {
      if (g.kind === 'create') {
        const anchorSlot = g.anchorDay * SLOTS_PER_DAY + Math.floor(g.anchorMin / SNAP)
        if (dragMode === 'rect') {
          const d0 = Math.min(g.anchorDay, g.curDay)
          const d1 = Math.max(g.anchorDay, g.curDay)
          const s0 = Math.max(0, Math.min(SLOTS_PER_DAY - 1, Math.floor(g.anchorMin / SNAP)))
          const s1 = Math.max(0, Math.min(SLOTS_PER_DAY - 1, Math.floor(g.curMin / SNAP)))
          const lo = Math.min(s0, s1)
          const hi = Math.max(s0, s1)
          const out: Range[] = []
          for (let d = d0; d <= d1; d++) {
            out.push({ id: rid(), start: d * DAY_MIN + lo * SNAP, end: d * DAY_MIN + (hi + 1) * SNAP })
          }
          return out
        }
        const curSlot =
          dragMode === 'column'
            ? g.anchorDay * SLOTS_PER_DAY + Math.floor(g.curMin / SNAP)
            : g.curDay * SLOTS_PER_DAY + Math.floor(Math.max(0, Math.min(DAY_MIN - 1, g.curMin)) / SNAP)
        const { start, end } = spanFromSlots(clampSlot(anchorSlot), clampSlot(curSlot))
        return [{ id: rid(), start, end }]
      }
      if (g.kind === 'resize') {
        // The dragged edge is CLAMPED at the opposite edge, it does not flip past
        // it. Flipping silently relocated the whole block on an overshoot.
        const moving = clampWeek(g.curSlot * SNAP)
        const start = g.edge === 'start' ? Math.min(moving, g.fixed - SNAP) : g.fixed
        const end = g.edge === 'end' ? Math.max(moving, g.fixed + SNAP) : g.fixed
        return [{ id: g.id, start, end }]
      }
      if (g.kind === 'duplicate') {
        const len = g.src.end - g.src.start
        const start = clampWeek(g.startSlot * SNAP)
        return [{ id: 'ghost', start, end: Math.min(WEEK_MIN, start + len) }]
      }
      const { start, end } = spanFromSlots(g.anchorSlot, g.curSlot)
      return [{ id: 'hole', start, end }]
    },
    [dragMode],
  )

  const draft = gesture ? draftFromGesture(gesture) : null

  /** What the grid shows right now, gesture applied but not committed. */
  const preview: Range[] = useMemo(() => {
    if (!gesture || !draft) return ranges
    if (gesture.kind === 'erase') {
      const hole = draft[0]!
      return subtract(ranges, hole.start, hole.end)
    }
    if (gesture.kind === 'resize') {
      const rest = ranges.filter((r) => r.id !== gesture.id)
      const next = [...rest, ...draft]
      return behaviour.merging ? merge(next) : next.sort((a, b) => a.start - b.start)
    }
    const next = [...ranges, ...draft]
    return behaviour.merging ? merge(next) : next.sort((a, b) => a.start - b.start)
  }, [ranges, gesture, draft, behaviour.merging])

  // ---- pointer handlers ----------------------------------------------------

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    const el = surfaceRef.current
    if (!el) return
    el.setPointerCapture(e.pointerId)
    originRef.current = { x: e.clientX, y: e.clientY }
    const { day, minRaw, abs } = pointToTime(e.clientX, e.clientY)
    const hit = findAt(preview, abs)
    const raw = behaviour.merging ? hit : findAllAt(ranges, abs).slice(-1)[0]

    if (hit) {
      const pieces = dayPieces(hit)
      const piece = pieces.find((p) => p.day === dayOf(abs))
      const yInBlock = piece ? minRaw - piece.from : 0
      const blockH = piece ? (piece.to - piece.from) * PX_PER_MIN : 0
      const nearTop = piece?.first && yInBlock * PX_PER_MIN < EDGE_PX
      const nearBottom = piece?.last && blockH - yInBlock * PX_PER_MIN < EDGE_PX

      if (e.altKey) {
        const src = raw ?? hit
        setGesture({
          kind: 'duplicate',
          src,
          grabSlots: slotOf(abs) - slotOf(src.start),
          startSlot: slotOf(src.start),
          moved: false,
        })
        setSelected([src.id])
        return
      }
      if (nearTop || nearBottom) {
        const target = raw ?? hit
        const edge: 'start' | 'end' = nearTop ? 'start' : 'end'
        setGesture({
          kind: 'resize',
          id: target.id,
          edge,
          fixed: edge === 'start' ? target.end : target.start,
          curSlot: slotOf(edge === 'start' ? target.start : target.end),
          moved: false,
        })
        setSelected([target.id])
        return
      }
      if (behaviour.insideBlockDrag === 'erase') {
        setGesture({
          kind: 'erase',
          day,
          anchorSlot: slotOf(abs),
          curSlot: slotOf(abs),
          moved: false,
          shift: e.shiftKey,
        })
        return
      }
      const target = raw ?? hit
      if (e.shiftKey) {
        setSelected((s: string[]) =>
          s.includes(target.id) ? s.filter((x) => x !== target.id) : [...s, target.id],
        )
      } else {
        setSelected([target.id])
      }
      note(`selected ${fmtRange(target)}`)
      return
    }

    setSelected([])
    setGesture({ kind: 'create', anchorDay: day, anchorMin: minRaw, curDay: day, curMin: minRaw, moved: false })
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    const { day, minRaw, abs } = pointToTime(e.clientX, e.clientY)

    if (!gesture) {
      const hit = findAt(preview, abs)
      if (!hit) {
        setHover(null)
        return
      }
      const piece = dayPieces(hit).find((p) => p.day === dayOf(abs))
      const yIn = (minRaw - (piece?.from ?? 0)) * PX_PER_MIN
      const h = piece ? (piece.to - piece.from) * PX_PER_MIN : 0
      const edge = piece?.first && yIn < EDGE_PX ? 'start' : piece?.last && h - yIn < EDGE_PX ? 'end' : null
      setHover({ id: hit.id, edge, abs })
      return
    }

    const o = originRef.current
    const moved =
      gesture.moved ||
      (o ? Math.hypot(e.clientX - o.x, e.clientY - o.y) > MOVE_THRESHOLD_PX : false)

    if (gesture.kind === 'create') {
      setGesture({ ...gesture, curDay: day, curMin: minRaw, moved })
    } else if (gesture.kind === 'resize') {
      setGesture({ ...gesture, curSlot: clampSlot(Math.round((day * DAY_MIN + minRaw) / SNAP)), moved })
    } else if (gesture.kind === 'duplicate') {
      const len = gesture.src.end - gesture.src.start
      const maxSlot = Math.floor((WEEK_MIN - len) / SNAP)
      const want = slotOf(day * DAY_MIN + Math.max(0, Math.min(DAY_MIN - 1, minRaw))) - gesture.grabSlots
      setGesture({ ...gesture, startSlot: Math.max(0, Math.min(maxSlot, want)), moved })
    } else {
      setGesture({ ...gesture, curSlot: clampSlot(slotOf(gesture.day * DAY_MIN + Math.max(0, Math.min(DAY_MIN - 1, minRaw)))), moved })
    }
  }

  const onPointerUp = () => {
    if (!gesture) return
    const g = gesture
    setGesture(null)
    originRef.current = null
    const d = draftFromGesture(g)

    if (g.kind === 'create') {
      const total = d.reduce((n, r) => n + (r.end - r.start), 0)
      commit(
        [...ranges, ...d],
        g.moved
          ? `drew ${d.length > 1 ? `${d.length} blocks, ` : ''}${durationLabel(total)} — ${fmtRange(d[0]!)}`
          : `click → one ${SNAP}-min block, ${fmtRange(d[0]!)}`,
      )
      setSelected([])
      return
    }
    if (g.kind === 'resize') {
      if (!g.moved) return
      commit([...ranges.filter((r) => r.id !== g.id), ...d], `resized ${g.edge} → ${fmtRange(d[0]!)}`)
      return
    }
    if (g.kind === 'duplicate') {
      if (!g.moved) {
        note('alt+click with no movement → nothing copied')
        return
      }
      const ghost = { ...d[0]!, id: rid() }
      const collides = ranges.some((r) => r.start < ghost.end && ghost.start < r.end)
      commit(
        [...ranges, ghost],
        `⌥ copied → ${fmtRange(ghost)}${collides ? ' (merged into existing)' : ''}`,
      )
      return
    }
    // erase
    if (!g.moved) {
      const hit = findAt(ranges, g.anchorSlot * SNAP)
      if (hit) {
        if (g.shift) {
          setSelected((s: string[]) =>
            s.includes(hit.id) ? s.filter((x) => x !== hit.id) : [...s, hit.id],
          )
        } else {
          setSelected([hit.id])
        }
        note(`selected ${fmtRange(hit)}`)
      }
      return
    }
    const hole = d[0]!
    commit(subtract(ranges, hole.start, hole.end), `erased ${fmtRange(hole)}`)
  }

  const onDoubleClick = (e: ReactMouseEvent) => {
    if (!behaviour.punchOnDoubleClick) return
    const { abs } = pointToTime(e.clientX, e.clientY)
    const hit = findAt(ranges, abs)
    if (!hit) return
    const s = slotOf(abs) * SNAP
    commit(subtract(ranges, s, s + SNAP), `punched ${SNAP}-min hole at ${hhmm(s)}`)
  }

  // ---- keyboard ------------------------------------------------------------

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAltDown(true)
      if (e.key === 'Escape') {
        if (gesture) {
          setGesture(null)
          originRef.current = null
          note('escape → drag cancelled, nothing committed')
        } else if (selected.length) {
          setSelected([])
          note('escape → selection cleared')
        }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected.length) {
        e.preventDefault()
        commit(ranges.filter((r) => !selected.includes(r.id)), `deleted ${selected.length} block(s)`)
        setSelected([])
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAltDown(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [gesture, selected, ranges, commit, undo, redo, note])

  useEffect(() => {
    // open on the working part of the day
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * 2 * SLOT_PX
  }, [])

  // ---- render --------------------------------------------------------------

  const cursor =
    gesture?.kind === 'duplicate' || (altDown && hover?.id)
      ? 'copy'
      : hover?.edge
        ? 'ns-resize'
        : hover?.id && behaviour.insideBlockDrag === 'erase'
          ? 'cell'
          : 'crosshair'

  const dragBlurb = DRAG_MODES.find((m) => m.key === dragMode)?.blurb ?? ''
  const totalMins = ranges.reduce((n, r) => n + (r.end - r.start), 0)

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', padding: 16, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <header style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>
            Prototype 06 · drawing Availability · {variantName}
          </div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
            One Friend, one week. Plain rectangles — composite rendering is ticket 05.
          </div>
        </header>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: '#666' }}>create drag:</span>
          {DRAG_MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setDragMode(m.key)}
              style={{
                fontSize: 11,
                padding: '3px 8px',
                borderRadius: 6,
                border: '1px solid ' + (dragMode === m.key ? COLOUR : '#d4d4d8'),
                background: dragMode === m.key ? COLOUR : '#fff',
                color: dragMode === m.key ? '#fff' : '#333',
                cursor: 'pointer',
              }}
            >
              {m.label}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <button onClick={undo} disabled={!past.length} style={btn}>
            ↶ undo ({past.length})
          </button>
          <button onClick={redo} disabled={!futureStack.length} style={btn}>
            ↷ redo ({futureStack.length})
          </button>
          <button
            onClick={() => commit(behaviour.merging ? merge(seedRanges()) : seedSegments(), 'reset')}
            style={btn}
          >
            reset
          </button>
        </div>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>{dragBlurb}</div>

        <div
          ref={scrollRef}
          style={{
            border: '1px solid #e4e4e7',
            borderRadius: 8,
            overflow: 'auto',
            maxHeight: 560,
            background: '#fff',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', minWidth: 640 }}>
            {/* hour gutter */}
            <div style={{ width: 52, flexShrink: 0, position: 'relative', paddingTop: 28 }}>
              <div
                style={{
                  position: 'sticky',
                  top: 0,
                  height: 28,
                  marginTop: -28,
                  background: '#fafafa',
                  borderBottom: '1px solid #e4e4e7',
                  zIndex: 3,
                }}
              />
              <div style={{ position: 'relative', height: SLOTS_PER_DAY * SLOT_PX }}>
                {Array.from({ length: 24 }, (_, h) => (
                  <div
                    key={h}
                    style={{
                      position: 'absolute',
                      top: h * 2 * SLOT_PX - 6,
                      right: 6,
                      fontSize: 10,
                      color: '#a1a1aa',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ flex: 1, position: 'relative' }}>
              {/* day headers */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  position: 'sticky',
                  top: 0,
                  zIndex: 3,
                  background: '#fafafa',
                  borderBottom: '1px solid #e4e4e7',
                }}
              >
                {DAYS.map((d) => (
                  <div
                    key={d}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#52525b',
                      textAlign: 'center',
                      padding: '7px 0',
                      borderLeft: '1px solid #f4f4f5',
                    }}
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* drawing surface */}
              <div
                ref={surfaceRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onDoubleClick={onDoubleClick}
                onPointerLeave={() => !gesture && setHover(null)}
                style={{
                  position: 'relative',
                  height: SLOTS_PER_DAY * SLOT_PX,
                  cursor,
                  touchAction: 'none',
                  userSelect: 'none',
                }}
              >
                {/* grid lines */}
                {Array.from({ length: SLOTS_PER_DAY }, (_, s) => (
                  <div
                    key={s}
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: s * SLOT_PX,
                      height: 1,
                      background: s % 2 === 0 ? '#e8e8ec' : '#f5f5f7',
                      pointerEvents: 'none',
                    }}
                  />
                ))}
                {Array.from({ length: 7 }, (_, d) => (
                  <div
                    key={d}
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: `${(d / 7) * 100}%`,
                      width: 1,
                      background: '#ececed',
                      pointerEvents: 'none',
                    }}
                  />
                ))}

                {/* committed / previewed blocks */}
                {preview.map((r) =>
                  dayPieces(r).map((p, i) => {
                    const isSel = selected.includes(r.id)
                    return (
                      <div
                        key={`${r.id}-${i}`}
                        style={{
                          position: 'absolute',
                          left: `calc(${(p.day / 7) * 100}% + 3px)`,
                          width: `calc(${100 / 7}% - 6px)`,
                          top: p.from * PX_PER_MIN,
                          height: Math.max(6, (p.to - p.from) * PX_PER_MIN - 1),
                          background: behaviour.merging ? COLOUR : 'rgba(79,107,237,0.45)',
                          border: isSel ? '2px solid #111' : '1px solid rgba(255,255,255,0.5)',
                          borderTopLeftRadius: p.first ? 5 : 0,
                          borderTopRightRadius: p.first ? 5 : 0,
                          borderBottomLeftRadius: p.last ? 5 : 0,
                          borderBottomRightRadius: p.last ? 5 : 0,
                          boxShadow: isSel ? '0 0 0 3px rgba(17,17,17,0.15)' : undefined,
                          pointerEvents: 'none',
                          overflow: 'hidden',
                          color: '#fff',
                          fontSize: 10,
                          padding: '2px 4px',
                          lineHeight: 1.25,
                          opacity: gesture?.kind === 'duplicate' && r.id === gesture.src.id ? 0.55 : 1,
                          outline:
                            gesture?.kind === 'duplicate' && r.id === gesture.src.id
                              ? '2px dashed #fff'
                              : undefined,
                          outlineOffset: -3,
                        }}
                      >
                        {p.first && (p.to - p.from) >= 45 && (
                          <span style={{ fontWeight: 600 }}>
                            {hhmm(r.start)}–{endLabel(r.end)}
                          </span>
                        )}
                        {!p.first && <span style={{ opacity: 0.85 }}>↑ from {DAYS[dayOf(r.start)]}</span>}
                        {p.first && !p.last && (
                          <span style={{ position: 'absolute', bottom: 1, right: 4, opacity: 0.85 }}>↓</span>
                        )}
                      </div>
                    )
                  }),
                )}

                {/* seams between the underlying records (variant C) */}
                {behaviour.showSeams &&
                  ranges.map((r) =>
                    dayPieces(r).map((p, i) => (
                      <div
                        key={`seam-${r.id}-${i}`}
                        style={{
                          position: 'absolute',
                          left: `calc(${(p.day / 7) * 100}% + 3px)`,
                          width: `calc(${100 / 7}% - 6px)`,
                          top: p.from * PX_PER_MIN,
                          height: Math.max(6, (p.to - p.from) * PX_PER_MIN - 1),
                          border: '1px dashed rgba(255,255,255,0.9)',
                          borderRadius: 4,
                          pointerEvents: 'none',
                        }}
                      />
                    )),
                  )}

                {/* live draft outline — what this gesture is adding / removing */}
                {draft &&
                  gesture &&
                  draft.map((r, ri) =>
                    dayPieces(r).map((p, i) => (
                      <div
                        key={`draft-${ri}-${i}`}
                        style={{
                          position: 'absolute',
                          left: `calc(${(p.day / 7) * 100}% + 3px)`,
                          width: `calc(${100 / 7}% - 6px)`,
                          top: p.from * PX_PER_MIN,
                          height: Math.max(4, (p.to - p.from) * PX_PER_MIN - 1),
                          border:
                            gesture.kind === 'erase'
                              ? '2px dashed #dc2626'
                              : '2px dashed rgba(255,255,255,0.95)',
                          background:
                            gesture.kind === 'erase'
                              ? 'repeating-linear-gradient(45deg, rgba(220,38,38,0.18) 0 5px, transparent 5px 10px)'
                              : gesture.kind === 'duplicate'
                                ? 'rgba(79,107,237,0.55)'
                                : 'transparent',
                          borderRadius: 5,
                          pointerEvents: 'none',
                          boxShadow: '0 0 0 1px rgba(0,0,0,0.25)',
                        }}
                      />
                    )),
                  )}

                {/* gesture readout, pinned to the draft */}
                {draft && gesture && (
                  <div
                    style={{
                      position: 'absolute',
                      left: `calc(${(dayOf(draft[0]!.start) / 7) * 100}% + 3px)`,
                      top: Math.max(0, (draft[0]!.start % DAY_MIN) * PX_PER_MIN - 20),
                      fontSize: 10,
                      fontWeight: 600,
                      background: gesture.kind === 'erase' ? '#dc2626' : '#111',
                      color: '#fff',
                      padding: '2px 6px',
                      borderRadius: 4,
                      whiteSpace: 'nowrap',
                      pointerEvents: 'none',
                      zIndex: 4,
                    }}
                  >
                    {gesture.kind === 'erase' ? 'erase ' : gesture.kind === 'duplicate' ? '⌥ copy ' : ''}
                    {fmtRange(draft[0]!)}
                    {draft.length > 1 ? ` ×${draft.length}` : ''}
                    {' · '}
                    {durationLabel(draft[0]!.end - draft[0]!.start)}
                    {gesture.moved ? '' : ' (no movement yet)'}
                  </div>
                )}

                {/* hover affordance: edge handles + modifier hint */}
                {hover?.id && !gesture && (
                  <HoverHints
                    range={preview.find((r) => r.id === hover.id)!}
                    altDown={altDown}
                    behaviour={behaviour}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <ul style={{ fontSize: 11, color: '#555', marginTop: 10, paddingLeft: 16, lineHeight: 1.7 }}>
          {gestureNotes.map((n) => (
            <li key={n}>{n}</li>
          ))}
          <li>Escape cancels a drag mid-flight · ⌘Z / ⌘⇧Z undo &amp; redo (50 deep)</li>
          <li>Click selects · ⇧click adds to selection · Delete / Backspace removes</li>
        </ul>
      </div>

      {/* state panel — rule 5: surface the state */}
      <aside
        style={{
          width: 270,
          flexShrink: 0,
          fontSize: 11,
          border: '1px solid #e4e4e7',
          borderRadius: 8,
          padding: 12,
          background: '#fafafa',
          maxHeight: 720,
          overflow: 'auto',
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>
          Availability records: {ranges.length}
        </div>
        <div style={{ color: '#666', marginBottom: 8 }}>
          {durationLabel(totalMins)} total · {behaviour.merging ? 'merging ON' : 'merging OFF'}
        </div>
        <ol style={{ paddingLeft: 16, margin: 0, lineHeight: 1.8, fontVariantNumeric: 'tabular-nums' }}>
          {ranges.map((r) => (
            <li
              key={r.id}
              style={{
                color: selected.includes(r.id) ? '#111' : '#555',
                fontWeight: selected.includes(r.id) ? 700 : 400,
              }}
            >
              {fmtRange(r)}
            </li>
          ))}
        </ol>
        <div style={{ fontWeight: 700, marginTop: 14, marginBottom: 4 }}>Log</div>
        <ul style={{ paddingLeft: 16, margin: 0, lineHeight: 1.7, color: '#666' }}>
          {log.map((l, i) => (
            <li key={i} style={{ opacity: 1 - i * 0.1 }}>
              {l}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}

const btn: CSSProperties = {
  fontSize: 11,
  padding: '3px 8px',
  borderRadius: 6,
  border: '1px solid #d4d4d8',
  background: '#fff',
  color: '#333',
  cursor: 'pointer',
}

function HoverHints({
  range,
  altDown,
  behaviour,
}: {
  range: Range
  altDown: boolean
  behaviour: Behaviour
}) {
  if (!range) return null
  const pieces = dayPieces(range)
  const first = pieces[0]!
  const hint = altDown
    ? '⌥ drag → copy'
    : behaviour.insideBlockDrag === 'erase'
      ? 'drag inside → erase · ⌥ copy'
      : behaviour.punchOnDoubleClick
        ? 'double-click → punch hole · ⌥ copy'
        : 'click → select · ⌥ copy'
  return (
    <>
      {pieces.map((p, i) => (
        <div key={i} style={{ pointerEvents: 'none' }}>
          {p.first && (
            <div
              style={{
                position: 'absolute',
                left: `calc(${(p.day / 7) * 100}% + 3px)`,
                width: `calc(${100 / 7}% - 6px)`,
                top: p.from * PX_PER_MIN,
                height: 4,
                background: '#fff',
                opacity: 0.9,
                borderRadius: 2,
                zIndex: 5,
              }}
            />
          )}
          {p.last && (
            <div
              style={{
                position: 'absolute',
                left: `calc(${(p.day / 7) * 100}% + 3px)`,
                width: `calc(${100 / 7}% - 6px)`,
                top: p.to * PX_PER_MIN - 5,
                height: 4,
                background: '#fff',
                opacity: 0.9,
                borderRadius: 2,
                zIndex: 5,
              }}
            />
          )}
        </div>
      ))}
      <div
        style={{
          position: 'absolute',
          left: `calc(${(first.day / 7) * 100}% + 3px)`,
          top: Math.max(0, first.from * PX_PER_MIN - 18),
          fontSize: 9,
          background: altDown ? COLOUR : 'rgba(17,17,17,0.85)',
          color: '#fff',
          padding: '1px 5px',
          borderRadius: 3,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          zIndex: 6,
        }}
      >
        {hint}
      </div>
    </>
  )
}
