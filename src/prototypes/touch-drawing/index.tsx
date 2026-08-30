/**
 * PROTOTYPE — ticket 10: drawing Availability by touch.
 * THROWAWAY. Do not promote to production; rewrite properly when folding in.
 *
 * Three gesture policies on one grid, switchable via `?variant=A|B|C`, the bar
 * at the top, or ← / →. The bar is at the TOP, not the house bottom-centre,
 * because on a phone the bottom belongs to the selection sheet under test.
 *
 * Wire up:
 *   <Route path="/prototype/touch-drawing" element={<TouchDrawingPrototype />} />
 *
 * `preview.html` in this directory is a dependency-free twin with the same
 * time model and the same three policies, plus a scripted-gesture driver
 * (`window.__proto10.gesture(...)`). All the measurements in
 * `.scratch/shared-availability-calendar/prototypes/10-touch-drawing.md` were
 * taken from it — open it on a real phone, it needs no build step.
 */
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useSearchParams } from 'react-router'
import { TouchGrid, type VariantKey } from './touch-grid'

const VARIANTS: { key: VariantKey; name: string; blurb: string }[] = [
  {
    key: 'A',
    name: 'Long-press to draw',
    blurb:
      'The grid scrolls normally. Hold still ~450ms and the surface arms; after that, dragging draws. Tap opens the slot panel. Arming without moving makes one 30-minute block.',
  },
  {
    key: 'B',
    name: 'Draw-mode toggle',
    blurb:
      'Read / Draw / Erase, in the same chrome family as ticket 01’s "Drawing mode:" tabbar. In Read the grid scrolls; in Draw or Erase one finger cannot scroll it at all — edge auto-scroll extends past the viewport.',
  },
  {
    key: 'C',
    name: 'Tap slot → panel → handles',
    blurb:
      'No drag-to-create at all. Tap a slot, get a panel answering who is free here plus "I’m free". The block lands at 30 minutes, selected, with 44px handles to stretch. The grid keeps pan-y forever, so scroll is never contended.',
  },
]

type LogLine = { kind: 'scroll' | 'draw' | 'note'; msg: string; t: number }

export const TouchDrawingPrototype = () => {
  const [params, setParams] = useSearchParams()
  const key = (params.get('variant') ?? 'A').toUpperCase()
  const index = Math.max(
    0,
    VARIANTS.findIndex((v) => v.key === key),
  )
  const current = VARIANTS[index]!
  const [lines, setLines] = useState<LogLine[]>([])

  const go = (delta: number) => {
    const next = VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length]!
    const p = new URLSearchParams(params)
    p.set('variant', next.key)
    setParams(p, { replace: true })
    setLines([])
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const onLog = (kind: LogLine['kind'], msg: string) =>
    setLines((prev) => [{ kind, msg, t: performance.now() }, ...prev].slice(0, 60))

  return (
    <div style={{ background: '#fff', minHeight: '100dvh' }}>
      {import.meta.env.MODE !== 'production' && (
        <div style={switcher}>
          <button onClick={() => go(-1)} style={arrow} aria-label="previous variant">
            ←
          </button>
          <span style={{ flex: 1, textAlign: 'center', fontWeight: 650, whiteSpace: 'nowrap' }}>
            {current.key} — {current.name}
          </span>
          <button onClick={() => go(1)} style={arrow} aria-label="next variant">
            →
          </button>
        </div>
      )}
      <div style={{ fontSize: 11, color: '#666', padding: '6px 10px', background: '#fafafa', borderBottom: '1px solid #eee' }}>
        {current.blurb}
      </div>

      {/* remounts on variant change so each starts from the same seed */}
      <TouchGrid key={current.key} variant={current.key} onLog={onLog} />

      <div style={{ borderTop: '1px solid #e4e4e7', background: '#fafafa', padding: '6px 10px 60px', fontSize: 11, fontFamily: 'ui-monospace, Menlo, monospace' }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#71717a', marginBottom: 4 }}>
          gesture log — scroll / draw
        </div>
        {lines.map((l, i) => (
          <div key={i} style={{ color: l.kind === 'scroll' ? '#b45309' : l.kind === 'draw' ? '#1d4ed8' : '#a1a1aa' }}>
            {l.msg}
          </div>
        ))}
      </div>
    </div>
  )
}

const switcher: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  background: '#111',
  color: '#fff',
  padding: '6px 8px',
  fontSize: 12,
  fontFamily: 'Inter, system-ui, sans-serif',
}
const arrow: CSSProperties = {
  background: 'rgba(255,255,255,0.14)',
  color: '#fff',
  border: 0,
  borderRadius: 999,
  width: 30,
  height: 30,
  fontSize: 13,
  lineHeight: 1,
}

export default TouchDrawingPrototype
