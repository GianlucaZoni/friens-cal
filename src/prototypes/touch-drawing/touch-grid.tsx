/**
 * PROTOTYPE — ticket 10. THROWAWAY.
 *
 * One grid, three gesture policies. The grid is deliberately shared: the whole
 * question is which gesture wins on the SAME surface, so the surface has to be
 * the constant and the gesture the variable.
 *
 * Everything about how a variant behaves lives in `POLICY` below.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as RPointerEvent } from 'react'
import {
  DAYS,
  DAY_MIN,
  FRIENDS,
  GROUP_SIZE,
  SLOTS_PER_DAY,
  SNAP,
  WEEK_MIN,
  buildCounts,
  dayOf,
  dayPieces,
  durationLabel,
  endLabel,
  findAt,
  fmtRange,
  friendsFreeAt,
  hhmm,
  merge,
  nextColumn,
  rid,
  seedMine,
  spanFromSlots,
  subtract,
  type HystModel,
  type HystState,
  type Range,
} from './lib'

export type VariantKey = 'A' | 'B' | 'C'
export type Tool = 'read' | 'draw' | 'erase'

type Policy = {
  /** may a one-finger drag on the grid ever become a draw? */
  dragCanDraw: (tool: Tool) => boolean
  /** ms the finger must sit still before the drag is taken from the scroller */
  armMs: number
  /** CSS touch-action on the drawing surface — this is the entire ballgame */
  touchAction: (tool: Tool) => string
}

const POLICY: Record<VariantKey, Policy> = {
  // Long-press arms the surface. touch-action stays permissive; the arming
  // path cancels the browser's scroll with preventDefault on a non-passive
  // touchmove, which only works because arming requires the finger to be still.
  A: { dragCanDraw: () => true, armMs: 450, touchAction: () => 'pan-x pan-y' },
  // An explicit mode. In Draw/Erase the surface refuses to scroll at all.
  B: {
    dragCanDraw: (t) => t !== 'read',
    armMs: 0,
    touchAction: (t) => (t === 'read' ? 'pan-x pan-y' : 'none'),
  },
  // No drag-to-create at all. The scroller keeps the surface forever.
  C: { dragCanDraw: () => false, armMs: 0, touchAction: () => 'pan-x pan-y' },
}

const MOVE_TOL = 10
const EDGE = 70
const HUE = 258
const MINE = `oklch(0.58 0.17 ${HUE})`
const COUNTS = buildCounts(FRIENDS)

type Sheet = { kind: 'slot'; abs: number } | { kind: 'block'; id: string } | null

type Gesture = {
  id: number
  t0: number
  x0: number
  y0: number
  scrollTop0: number
  anchorAbsSlot: number
  anchorX: number
  anchorRow: number
  anchorCol: number
  moved: number
  drawing: boolean
  erasing: boolean
  hyst: HystState
}

export type TouchGridProps = {
  variant: VariantKey
  onLog: (kind: 'scroll' | 'draw' | 'note', msg: string) => void
}

export const TouchGrid = ({ variant, onLog }: TouchGridProps) => {
  const [view, setView] = useState<1 | 3 | 7>(3)
  const [day0, setDay0] = useState(0)
  const [rowPx, setRowPx] = useState(44)
  const [mode, setMode] = useState<'linear' | 'multi'>('linear')
  const [hystPct, setHystPct] = useState(40)
  const [hystModel, setHystModel] = useState<HystModel>('anchor')
  const [tool, setTool] = useState<Tool>('read')
  const [eraseToggle, setEraseToggle] = useState(false)
  const [mine, setMine] = useState<Range[]>(seedMine)
  const [sel, setSel] = useState<string | null>(null)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [dup, setDup] = useState<number | null>(null)
  const [draft, setDraft] = useState<{ ranges: Range[]; erase: boolean } | null>(null)
  const [armed, setArmed] = useState(false)
  const [colW, setColW] = useState(100)

  const scrollRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const gRef = useRef<Gesture | null>(null)
  const armRef = useRef<number | null>(null)
  const handleRef = useRef<{ edge: 'start' | 'end'; id: string; fixed: number } | null>(null)
  const policy = POLICY[variant]

  // reset when the variant changes — each variant starts from the same seed
  useEffect(() => {
    setMine(seedMine())
    setSel(null)
    setSheet(null)
    setDup(null)
    setDraft(null)
    setTool('read')
    setEraseToggle(false)
    onLog(
      'note',
      `variant ${variant} · haptics ${typeof navigator.vibrate === 'function' ? 'available' : 'UNAVAILABLE (no navigator.vibrate — iOS Safari)'}`,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant])

  useLayoutEffect(() => {
    const measure = () => {
      const w = surfaceRef.current?.getBoundingClientRect().width ?? 100
      setColW(w / view)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [view])

  const touchAction = policy.touchAction(tool)
  useEffect(() => {
    onLog('note', `touch-action = ${touchAction}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touchAction])

  // A non-passive touchmove listener. Once a gesture has been claimed we must
  // cancel the browser's scroll; if the browser already started scrolling the
  // event arrives with cancelable === false and we have lost.
  useEffect(() => {
    const el = surfaceRef.current
    if (!el) return
    const onTouchMove = (e: TouchEvent) => {
      if (!gRef.current?.drawing && !handleRef.current) return
      if (e.cancelable) e.preventDefault()
      else onLog('scroll', '⚠ touchmove not cancelable — the browser already owns this gesture')
    }
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [onLog])

  // ------------------------------------------------------------- hit testing
  const hit = (clientX: number, clientY: number) => {
    const b = surfaceRef.current!.getBoundingClientRect()
    const x = clientX - b.left
    const y = clientY - b.top
    const rawCol = x / (b.width / view)
    const col = Math.max(0, Math.min(view - 1, Math.floor(rawCol)))
    const row = Math.max(0, Math.min(SLOTS_PER_DAY - 1, Math.floor(y / rowPx)))
    return { x, y, col, rawCol, row, day: day0 + col, abs: (day0 + col) * DAY_MIN + row * SNAP }
  }

  const autoScroll = (clientY: number) => {
    const sc = scrollRef.current
    if (!sc) return
    const b = sc.getBoundingClientRect()
    if (clientY < b.top + EDGE) sc.scrollTop -= Math.ceil((b.top + EDGE - clientY) / 5)
    else if (clientY > b.bottom - EDGE) sc.scrollTop += Math.ceil((clientY - (b.bottom - EDGE)) / 5)
  }

  // ------------------------------------------------------------------ draft
  const updateDraft = (g: Gesture, clientX: number, clientY: number) => {
    const h = hit(clientX, clientY)
    const bCol = nextColumn(g.hyst, {
      rawCol: h.rawCol,
      anchorX: g.anchorX,
      x: h.x,
      colW,
      cols: view,
      hystPct,
      model: hystModel,
      enabled: mode === 'linear',
    })
    let ranges: Range[]
    if (mode === 'multi') {
      const lo = Math.min(g.anchorCol, Math.floor(h.rawCol))
      const hi = Math.max(g.anchorCol, Math.floor(h.rawCol))
      const r0 = Math.min(g.anchorRow, h.row)
      const r1 = Math.max(g.anchorRow, h.row)
      ranges = []
      for (let c = Math.max(0, lo); c <= Math.min(view - 1, hi); c++) {
        const d = day0 + c
        if (d > 6) continue
        ranges.push({ id: `draft${c}`, start: d * DAY_MIN + r0 * SNAP, end: d * DAY_MIN + (r1 + 1) * SNAP })
      }
    } else {
      const b = (day0 + bCol) * SLOTS_PER_DAY + h.row
      const s = spanFromSlots(g.anchorAbsSlot, b)
      ranges = [{ id: 'draft', start: s.start, end: s.end }]
    }
    setDraft({ ranges, erase: g.erasing })
  }

  const commit = (d: { ranges: Range[]; erase: boolean }) => {
    if (d.erase) {
      let next = mine
      for (const r of d.ranges) next = subtract(next, r.start, r.end)
      setMine(next)
      onLog('draw', `ERASE commit → ${next.length} records`)
    } else {
      const next = merge([...mine, ...d.ranges.map((r) => ({ id: rid(), start: r.start, end: r.end }))])
      setMine(next)
      const made = d.ranges[0]
      setSel(made ? (findAt(next, made.start)?.id ?? null) : null)
      onLog('draw', `CREATE commit → ${next.length} records`)
    }
    setDraft(null)
  }

  // ---------------------------------------------------------------- gestures
  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const handle = target.closest('[data-handle]') as HTMLElement | null
    if (handle) {
      const rec = mine.find((r) => r.id === sel)
      if (!rec) return
      const edge = handle.dataset.handle as 'start' | 'end'
      handleRef.current = { edge, id: rec.id, fixed: edge === 'start' ? rec.end : rec.start }
      try {
        handle.setPointerCapture(e.pointerId)
      } catch {
        /* scripted gestures have no real pointer */
      }
      onLog('draw', `HANDLE ${edge} grabbed — touch-action:none on the knob, so it never scrolls`)
      return
    }
    if (gRef.current) return
    const h = hit(e.clientX, e.clientY)
    const g: Gesture = {
      id: e.pointerId,
      t0: performance.now(),
      x0: e.clientX,
      y0: e.clientY,
      scrollTop0: scrollRef.current?.scrollTop ?? 0,
      anchorAbsSlot: (day0 + h.col) * SLOTS_PER_DAY + h.row,
      anchorX: h.x,
      anchorRow: h.row,
      anchorCol: h.col,
      moved: 0,
      drawing: false,
      erasing: variant === 'B' ? tool === 'erase' : eraseToggle,
      hyst: { curCol: h.col, escaped: false },
    }
    gRef.current = g

    if (policy.armMs === 0 && policy.dragCanDraw(tool)) {
      g.drawing = true
      setArmed(true)
      onLog('draw', `DRAW begins at ${DAYS[h.day]} ${hhmm(h.abs)} (mode is explicit — no delay)`)
      updateDraft(g, e.clientX, e.clientY)
    } else if (policy.armMs > 0) {
      armRef.current = window.setTimeout(() => {
        const cur = gRef.current
        if (!cur || cur.moved > MOVE_TOL) return
        cur.drawing = true
        setArmed(true)
        if (typeof navigator.vibrate === 'function') navigator.vibrate(12)
        onLog(
          'draw',
          `long-press armed after ${policy.armMs}ms at ${DAYS[h.day]} ${hhmm(h.abs)} · haptics ${
            typeof navigator.vibrate === 'function' ? 'fired' : 'UNSUPPORTED here'
          }`,
        )
        updateDraft(cur, e.clientX, e.clientY)
      }, policy.armMs)
    }
  }

  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (handleRef.current) {
      e.preventDefault()
      const hd = handleRef.current
      const h = hit(e.clientX, e.clientY)
      autoScroll(e.clientY)
      setMine((prev) =>
        prev.map((r) => {
          if (r.id !== hd.id) return r
          if (hd.edge === 'start') return { ...r, start: Math.max(0, Math.min(h.abs, hd.fixed - SNAP)) }
          return { ...r, end: Math.min(WEEK_MIN, Math.max(h.abs + SNAP, hd.fixed + SNAP)) }
        }),
      )
      return
    }
    const g = gRef.current
    if (!g || e.pointerId !== g.id) return
    g.moved = Math.max(g.moved, Math.hypot(e.clientX - g.x0, e.clientY - g.y0))
    if (g.drawing) {
      autoScroll(e.clientY)
      updateDraft(g, e.clientX, e.clientY)
    } else if (g.moved > MOVE_TOL && armRef.current !== null) {
      window.clearTimeout(armRef.current)
      armRef.current = null
      onLog('scroll', `moved ${Math.round(g.moved)}px before ${policy.armMs}ms → the browser keeps it (SCROLL)`)
    }
  }

  const endGesture = () => {
    if (handleRef.current) {
      const hd = handleRef.current
      handleRef.current = null
      // a resize can merge into a neighbour, so re-find the surviving record by
      // the edge that did NOT move
      const probe = hd.edge === 'start' ? hd.fixed - SNAP : hd.fixed
      const next = merge(mine)
      setMine(next)
      setSel(findAt(next, probe)?.id ?? null)
      onLog('draw', `HANDLE released → ${next.length} records`)
      return
    }
    const g = gRef.current
    if (!g) return
    gRef.current = null
    setArmed(false)
    if (armRef.current !== null) {
      window.clearTimeout(armRef.current)
      armRef.current = null
    }
    const dt = Math.round(performance.now() - g.t0)
    const scrolled = Math.abs((scrollRef.current?.scrollTop ?? 0) - g.scrollTop0)
    if (g.drawing && draft) {
      commit(draft)
      return
    }
    setDraft(null)
    if (g.moved <= MOVE_TOL && scrolled < 3) onTap(g, dt)
    else onLog('scroll', `SCROLLED ${scrolled}px in ${dt}ms — nothing drawn`)
  }

  const onTap = (g: Gesture, dt: number) => {
    const abs = (g.anchorAbsSlot % (7 * SLOTS_PER_DAY)) * SNAP
    if (dup !== null) {
      const next = merge([...mine, { id: rid(), start: abs, end: Math.min(WEEK_MIN, abs + dup) }])
      setMine(next)
      setDup(null)
      const made = findAt(next, abs)
      setSel(made?.id ?? null)
      setSheet(made ? { kind: 'block', id: made.id } : null)
      onLog('draw', `DUPLICATE dropped at ${DAYS[dayOf(abs)]} ${hhmm(abs)} → ${next.length} records`)
      return
    }
    const block = findAt(mine, abs)
    if (block) {
      setSel(block.id)
      setSheet({ kind: 'block', id: block.id })
      onLog('note', `tap ${dt}ms → selected ${fmtRange(block)}`)
      return
    }
    if (variant === 'B' && tool !== 'read') return
    setSel(null)
    setSheet({ kind: 'slot', abs })
    onLog('note', `tap ${dt}ms → slot panel (who is free)`)
  }

  const onPointerCancel = () => {
    if (gRef.current && !gRef.current.drawing) onLog('scroll', 'pointercancel — the scroller took the gesture')
    if (armRef.current !== null) window.clearTimeout(armRef.current)
    armRef.current = null
    gRef.current = null
    handleRef.current = null
    setDraft(null)
    setArmed(false)
  }

  // ----------------------------------------------------------------- actions
  const createFromPanel = (abs: number) => {
    const next = merge([...mine, { id: rid(), start: abs, end: abs + SNAP }])
    setMine(next)
    const made = findAt(next, abs)
    setSel(made?.id ?? null)
    setSheet(made ? { kind: 'block', id: made.id } : null)
    onLog('draw', `PANEL create → 30 min at ${hhmm(abs)} · ${next.length} records`)
  }
  const deleteSelected = (id: string) => {
    const r = mine.find((x) => x.id === id)
    const next = mine.filter((x) => x.id !== id)
    setMine(next)
    setSel(null)
    setSheet(null)
    onLog('draw', `DELETE ${r ? fmtRange(r) : id} → ${next.length} records`)
  }

  // ------------------------------------------------------------------ render
  const H = SLOTS_PER_DAY * rowPx
  const pct = (n: number) => `${((n * 100) / view).toFixed(4)}%`
  const selected = sel ? mine.find((r) => r.id === sel) : undefined

  const heat: CSSProperties[] = []
  for (let c = 0; c < view; c++) {
    const d = day0 + c
    if (d > 6) break
    let s = 0
    while (s < SLOTS_PER_DAY) {
      const n = COUNTS[d * SLOTS_PER_DAY + s] ?? 0
      let e = s
      while (e < SLOTS_PER_DAY && (COUNTS[d * SLOTS_PER_DAY + e] ?? 0) === n) e++
      if (n > 0)
        heat.push({
          position: 'absolute',
          left: pct(c),
          width: pct(1),
          top: s * rowPx,
          height: (e - s) * rowPx,
          // ticket 15: one hue — the viewer's — opacity proportional to the count
          background: `oklch(0.58 0.17 ${HUE} / ${(0.1 + 0.72 * (n / FRIENDS.length)).toFixed(3)})`,
        })
      s = e
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', font: '13px/1.4 Inter, system-ui, sans-serif' }}>
      <div style={barStyle}>
        <span style={lblStyle}>view</span>
        <Seg options={[1, 3, 7]} value={view} label={(v) => (v === 1 ? 'Day' : v === 3 ? '3-day' : 'Week')} onChange={(v) => setView(v as 1 | 3 | 7)} />
        <span style={lblStyle}>row</span>
        <input type="range" min={18} max={64} step={2} value={rowPx} onChange={(e) => setRowPx(+e.target.value)} style={{ width: 76 }} />
        <span style={{ ...lblStyle, width: 62 }}>{rowPx}px/30m</span>
        <button style={btnStyle(false)} onClick={() => setDay0((d) => Math.max(0, d - 1))}>‹</button>
        <button style={btnStyle(false)} onClick={() => setDay0((d) => Math.min(7 - view, d + 1))}>›</button>
      </div>
      <div style={barStyle}>
        <span style={lblStyle}>drawing mode</span>
        <Seg options={['linear', 'multi'] as const} value={mode} label={(m) => (m === 'linear' ? 'Linear' : 'Multi-day')} onChange={setMode} />
        <span style={{ ...lblStyle, opacity: mode === 'linear' ? 1 : 0.35 }}>hyst {hystPct}%</span>
        <input
          type="range"
          min={0}
          max={90}
          step={5}
          value={hystPct}
          disabled={mode !== 'linear'}
          onChange={(e) => setHystPct(+e.target.value)}
          style={{ width: 64 }}
        />
        <Seg options={['anchor', 'edge'] as const} value={hystModel} label={(m) => m} onChange={setHystModel} />
        {variant === 'B' ? (
          <Seg options={['read', 'draw', 'erase'] as const} value={tool} label={(t) => t} onChange={setTool} danger="erase" />
        ) : (
          <button style={btnStyle(eraseToggle, true)} onClick={() => setEraseToggle((v) => !v)}>
            Erase drag
          </button>
        )}
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', position: 'relative', overscrollBehavior: 'contain' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 4, display: 'flex', background: '#fafafa', borderBottom: '1px solid #e4e4e7' }}>
          <div style={{ width: 44, flexShrink: 0 }} />
          {Array.from({ length: view }, (_, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: 650, color: '#52525b', padding: '6px 0', borderLeft: '1px solid #f1f1f3' }}>
              {DAYS[(day0 + i) % 7]}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex' }}>
          <div style={{ width: 44, flexShrink: 0, position: 'relative', height: H, borderRight: '1px solid #ececed' }}>
            {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
              <div key={h} style={{ position: 'absolute', right: 5, top: h * 2 * rowPx, transform: 'translateY(-50%)', fontSize: 10, color: '#a1a1aa' }}>
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>
          <div style={{ flex: 1, position: 'relative' }}>
            <div
              ref={surfaceRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endGesture}
              onPointerCancel={onPointerCancel}
              onContextMenu={(e) => e.preventDefault()}
              style={{
                position: 'relative',
                height: H,
                touchAction,
                userSelect: 'none',
                WebkitUserSelect: 'none',
                background:
                  `repeating-linear-gradient(to bottom, #f4f4f5 0 1px, transparent 1px ${rowPx}px),` +
                  `repeating-linear-gradient(to bottom, #e4e4e7 0 1px, transparent 1px ${2 * rowPx}px)`,
              }}
            >
              {Array.from({ length: view - 1 }, (_, i) => (
                <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, width: 1, background: '#f0f0f2', left: pct(i + 1) }} />
              ))}
              {heat.map((s, i) => (
                <div key={i} style={s} />
              ))}
              {mine.flatMap((r) =>
                dayPieces(r).map((p, i) => {
                  const c = p.day - day0
                  if (c < 0 || c >= view) return null
                  return (
                    <div
                      key={`${r.id}-${i}`}
                      style={{
                        position: 'absolute',
                        left: `calc(${pct(c)} + 2px)`,
                        width: `calc(${pct(1)} - 4px)`,
                        top: (p.from / SNAP) * rowPx + 1,
                        height: ((p.to - p.from) / SNAP) * rowPx - 2,
                        borderRadius: 5,
                        // ticket 15: your own Availability is a border + ring, never a fill
                        border: `2px solid ${MINE}`,
                        boxShadow: `0 0 0 2px oklch(0.58 0.17 ${HUE} / 0.22)`,
                        outline: r.id === sel ? `2px solid ${MINE}` : undefined,
                        outlineOffset: 3,
                      }}
                    >
                      <span style={{ position: 'absolute', left: 3, top: 1, fontSize: 9, fontWeight: 700, color: MINE, textShadow: '0 0 3px #fff' }}>
                        {p.first ? hhmm(r.start) : '↑'}
                      </span>
                    </div>
                  )
                }),
              )}
              {draft?.ranges.flatMap((r) =>
                dayPieces(r).map((p, i) => {
                  const c = p.day - day0
                  if (c < 0 || c >= view) return null
                  return (
                    <div
                      key={`d${r.id}-${i}`}
                      style={{
                        position: 'absolute',
                        left: `calc(${pct(c)} + 2px)`,
                        width: `calc(${pct(1)} - 4px)`,
                        top: (p.from / SNAP) * rowPx + 1,
                        height: ((p.to - p.from) / SNAP) * rowPx - 2,
                        borderRadius: 5,
                        background: draft.erase ? 'oklch(0.55 0.20 25 / 0.28)' : `oklch(0.58 0.17 ${HUE} / 0.30)`,
                        border: `2px dashed ${draft.erase ? '#dc2626' : MINE}`,
                      }}
                    />
                  )
                }),
              )}
              {selected && !draft
                ? (['start', 'end'] as const).map((edge) => {
                    const abs = edge === 'start' ? selected.start : selected.end
                    const c = dayOf(edge === 'end' ? abs - 1 : abs) - day0
                    if (c < 0 || c >= view) return null
                    const y = ((edge === 'end' ? abs - dayOf(abs - 1) * DAY_MIN : abs % DAY_MIN) / SNAP) * rowPx
                    return (
                      <div
                        key={edge}
                        data-handle={edge}
                        style={{
                          position: 'absolute',
                          left: pct(c),
                          width: pct(1),
                          top: y - 22,
                          height: 44, // the whole point: a 44px hit area on a 30-min row
                          zIndex: 8,
                          touchAction: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <div style={{ width: 34, height: 14, borderRadius: 999, background: MINE, border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,0.35)' }} />
                      </div>
                    )
                  })
                : null}
              {armed ? <div style={{ position: 'absolute', inset: 0, boxShadow: `inset 0 0 0 2px ${MINE}`, pointerEvents: 'none' }} /> : null}
            </div>
          </div>
        </div>
      </div>

      {sheet ? (
        <SlotSheet
          sheet={sheet}
          mine={mine}
          dup={dup !== null}
          onClose={() => {
            setSheet(null)
            setSel(null)
            setDup(null)
          }}
          onCreate={createFromPanel}
          onDelete={deleteSelected}
          onDuplicate={(mins) => {
            setDup(mins)
            onLog('note', 'duplicate armed — tap a slot to drop it (there is no ⌥ on touch)')
          }}
        />
      ) : null}

      <div style={{ flexShrink: 0, borderTop: '1px solid #e4e4e7', background: '#fafafa', padding: '6px 10px', maxHeight: '24vh', overflow: 'auto', fontSize: 11 }}>
        <b style={lblStyle}>my Availability ({mine.length})</b>
        <ol style={{ margin: '2px 0 0', paddingLeft: 18, lineHeight: 1.6, color: '#3f3f46' }}>
          {mine.map((r) => (
            <li key={r.id} style={{ fontWeight: r.id === sel ? 700 : 400 }}>
              {fmtRange(r)} · {durationLabel(r.end - r.start)}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

// -------------------------------------------------------------------- pieces

const SlotSheet = ({
  sheet,
  mine,
  dup,
  onClose,
  onCreate,
  onDelete,
  onDuplicate,
}: {
  sheet: NonNullable<Sheet>
  mine: Range[]
  dup: boolean
  onClose: () => void
  onCreate: (abs: number) => void
  onDelete: (id: string) => void
  onDuplicate: (mins: number) => void
}) => {
  const rec = sheet.kind === 'block' ? mine.find((r) => r.id === sheet.id) : undefined
  const abs = sheet.kind === 'slot' ? sheet.abs : (rec?.start ?? 0)
  const who = friendsFreeAt(FRIENDS, abs)
  const mineHere = !!findAt(mine, abs)
  const glow = 2 * (who.length + (mineHere ? 1 : 0)) > GROUP_SIZE
  return (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 20, background: '#fff', borderTop: '1px solid #e4e4e7', boxShadow: '0 -8px 28px rgba(0,0,0,0.14)', padding: '10px 12px 14px', borderRadius: '14px 14px 0 0' }}>
      <h3 style={{ margin: '0 0 2px', fontSize: 13 }}>
        {rec ? fmtRange(rec) : `${DAYS[dayOf(abs)]} ${hhmm(abs)}–${endLabel(abs + SNAP)}`}
        {glow ? <span style={{ fontSize: 10, color: '#a16207' }}> ◆ candidate</span> : null}
      </h3>
      <div style={{ fontSize: 11, color: '#71717a', marginBottom: 8 }}>
        {rec ? `${durationLabel(rec.end - rec.start)} · drag a handle to stretch` : 'You are not free here.'}
      </div>
      {/* This panel is the ONLY thing on touch that answers "who is free" —
          ticket 15 removed per-Friend colour from the grid and ticket 09 left
          the answer on a hover that a finger cannot produce. */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minHeight: 26, marginBottom: 10 }}>
        {who.length ? (
          who.map((f) => (
            <span key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, background: '#f4f4f5', borderRadius: 999, padding: '3px 9px 3px 3px' }}>
              <span style={{ width: 18, height: 18, borderRadius: 999, background: `oklch(0.62 0.16 ${f.hue})` }} />
              {f.name}
            </span>
          ))
        ) : (
          <span style={{ fontSize: 11, color: '#a1a1aa', fontStyle: 'italic' }}>nobody else is free here</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {rec ? (
          <>
            <button style={actStyle()} onClick={() => onDuplicate(rec.end - rec.start)}>
              Duplicate
            </button>
            <button style={actStyle('danger')} onClick={() => onDelete(rec.id)}>
              Delete
            </button>
            <button style={actStyle('primary')} onClick={onClose}>
              Done
            </button>
          </>
        ) : (
          <>
            <button style={actStyle('primary')} onClick={() => onCreate(abs)}>
              ＋ I&rsquo;m free
            </button>
            <button style={actStyle()} onClick={onClose}>
              Close
            </button>
          </>
        )}
      </div>
      {dup ? <div style={{ fontSize: 11, color: '#71717a', marginTop: 8 }}>Tap a slot to drop the copy.</div> : null}
    </div>
  )
}

function Seg<T extends string | number>({
  options,
  value,
  label,
  onChange,
  danger,
}: {
  options: readonly T[]
  value: T
  label: (v: T) => string
  onChange: (v: T) => void
  danger?: T
}) {
  return (
    <span style={{ display: 'flex', border: '1px solid #d4d4d8', borderRadius: 8, overflow: 'hidden' }}>
      {options.map((o) => (
        <button key={String(o)} onClick={() => onChange(o)} style={btnStyle(o === value, o === danger && o === value)}>
          {label(o)}
        </button>
      ))}
    </span>
  )
}

const barStyle: CSSProperties = {
  display: 'flex',
  gap: 6,
  alignItems: 'center',
  flexWrap: 'wrap',
  padding: '6px 10px',
  flexShrink: 0,
  borderBottom: '1px solid #eee',
}
const lblStyle: CSSProperties = { fontSize: 10, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.04em' }
const btnStyle = (on: boolean, danger = false): CSSProperties => ({
  font: 'inherit',
  fontSize: 11,
  padding: '5px 9px',
  border: 0,
  borderLeft: '1px solid #e4e4e7',
  background: on ? (danger ? '#dc2626' : '#111') : '#fff',
  color: on ? '#fff' : '#3f3f46',
  minHeight: 32,
})
const actStyle = (kind?: 'primary' | 'danger'): CSSProperties => ({
  font: 'inherit',
  fontSize: 12,
  minHeight: 44,
  padding: '0 14px',
  borderRadius: 9,
  flex: 1,
  border: kind === 'danger' ? '1px solid #fecaca' : '1px solid #d4d4d8',
  background: kind === 'primary' ? MINE : '#fff',
  color: kind === 'primary' ? '#fff' : kind === 'danger' ? '#dc2626' : '#18181b',
  fontWeight: kind === 'primary' ? 650 : 400,
})
