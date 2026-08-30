/**
 * PROTOTYPE — ticket 12: the app shell, two independently-toggled sidebars.
 * THROWAWAY. Do not promote to production; rewrite properly when folding in.
 *
 * THE QUESTION: can two sidebars toggle independently under shadcn's sidebar,
 * and where does the top bar go? Answer: not without a fork (see shell.tsx),
 * and the bar has three plausible homes — hence `?variant=`.
 *
 * Wire up:  <Route path="/prototype/app-shell" element={<AppShellPrototype />} />
 *
 * No build step available? Open `preview.html` in this directory instead. It is
 * a dependency-free twin with the same state model and the same three layouts.
 */
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useSearchParams } from 'react-router'
import type { View } from './parts'
import { VariantAInset, VariantBBanner, VariantCReference } from './variants'

const VARIANTS = [
  { key: 'A', name: 'Inset bar — over the calendar only', render: VariantAInset },
  { key: 'B', name: 'Banner — full window width', render: VariantBBanner },
  { key: 'C', name: 'Reference — centre + right', render: VariantCReference },
]

export const AppShellPrototype = () => {
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<View>('week')
  const [dark, setDark] = useState(false)

  const key = (params.get('variant') ?? 'C').toUpperCase()
  const index = Math.max(
    0,
    VARIANTS.findIndex((v) => v.key === key)
  )
  const current = VARIANTS[index]!
  const Variant = current.render

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
      if (e.metaKey || e.ctrlKey) return
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className={dark ? 'dark' : undefined}>
      <div className="h-svh overflow-hidden bg-background text-foreground">
        <Variant view={view} onView={setView} dark={dark} onDark={setDark} />
      </div>

      {import.meta.env.MODE !== 'production' && (
        <div style={bar}>
          <button onClick={() => go(-1)} style={arrow} aria-label="previous variant">
            ←
          </button>
          <span style={{ padding: '0 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {current.key} · {current.name}
          </span>
          <button onClick={() => go(1)} style={arrow} aria-label="next variant">
            →
          </button>
          <span style={hint}>⌘B left · ⇧⌘B right · narrow the window for the sheet</span>
        </div>
      )}
    </div>
  )
}

const bar: CSSProperties = {
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
  zIndex: 60,
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

const hint: CSSProperties = {
  padding: '0 10px 0 4px',
  opacity: 0.55,
  whiteSpace: 'nowrap',
}

export default AppShellPrototype
