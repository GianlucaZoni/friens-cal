/**
 * PROTOTYPE — ticket 06: drawing, resizing and duplicating Availability.
 * THROWAWAY. Do not promote to production; rewrite properly when folding in.
 *
 * Three variants of the ONE thing the settled gestures cannot do — removing the
 * middle of a merged range — switchable via `?variant=` and the floating bar.
 * Every other edge case (cross-midnight, live merge feedback, degenerate drags,
 * escape/undo, ⌥duplicate, resize collisions, selection) behaves identically in
 * all three so they can be judged against each other.
 *
 * Wire up:  <Route path="/prototype/drag-interaction" element={<DragInteractionPrototype />} />
 */
import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import { useSearchParams } from 'react-router'
import { VariantAErase } from './variant-a-erase'
import { VariantBPunch } from './variant-b-punch'
import { VariantCSegments } from './variant-c-segments'

const VARIANTS = [
  { key: 'A', name: 'Erase drag', render: () => <VariantAErase /> },
  { key: 'B', name: 'Punch & resize', render: () => <VariantBPunch /> },
  { key: 'C', name: 'No merging', render: () => <VariantCSegments /> },
]

export const DragInteractionPrototype = () => {
  const [params, setParams] = useSearchParams()
  const key = (params.get('variant') ?? 'A').toUpperCase()
  const index = Math.max(
    0,
    VARIANTS.findIndex((v) => v.key === key),
  )
  const current = VARIANTS[index]!

  const go = (delta: number) => {
    const next = VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length]!
    const p = new URLSearchParams(params)
    p.set('variant', next.key)
    setParams(p, { replace: true })
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

  return (
    <div style={{ minHeight: '100vh', background: '#fff', paddingBottom: 72 }}>
      {/* remounts on variant change so each variant starts from clean seed state */}
      <div key={current.key}>{current.render()}</div>

      {import.meta.env.MODE !== 'production' && (
        <div
          style={{
            position: 'fixed',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: '#111',
            color: '#fff',
            borderRadius: 999,
            padding: 4,
            boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 12,
            zIndex: 50,
          }}
        >
          <button onClick={() => go(-1)} style={arrow} aria-label="previous variant">
            ←
          </button>
          <span style={{ padding: '0 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {current.key} ({current.name})
          </span>
          <button onClick={() => go(1)} style={arrow} aria-label="next variant">
            →
          </button>
        </div>
      )}
    </div>
  )
}

const arrow: CSSProperties = {
  background: 'rgba(255,255,255,0.12)',
  color: '#fff',
  border: 0,
  borderRadius: 999,
  width: 26,
  height: 26,
  cursor: 'pointer',
  fontSize: 13,
  lineHeight: 1,
}

export default DragInteractionPrototype
