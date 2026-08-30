/**
 * PROTOTYPE — ticket 16: the right sidebar, Candidate and Hangout cards.
 * THROWAWAY. Do not promote; rewrite properly when folding in.
 *
 * Three variants of the card anatomy on one route, `?variant=A|B|C`, plus the
 * floating bar. Everything else is a control, deliberately: the border
 * technique, the theme, the sidebar width, the dataset (including all three
 * empty states), the touch/hover mode, and whether the force-write editor is a
 * Popover or a Dialog — those are orthogonal to layout and want to be compared
 * *within* a variant, not across them.
 *
 * The list is not hardcoded. `data.ts` implements ticket 09's pipeline, so the
 * ordering, the glow rule, the Hangout blanking, the clip-to-now and the empty
 * states on screen are the real ones.
 *
 * Wire up (another agent owns AppRoutes.tsx — this is not wired):
 *   <Route path="/prototypes/right-sidebar" element={<RightSidebarPrototype />} />
 *
 * The zero-build twin is `preview.html` in this folder — open it directly.
 */
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { BorderTechnique, Theme } from './color'
import {
  computeCandidates,
  DATASETS,
  EMPTY_COPY,
  emptyState,
  FRIENDS,
  NOW,
  pinnedHangouts,
  type DatasetKey,
} from './data'
import type { Chrome } from './pieces'
import { CandidateCardA, HangoutCardA } from './variant-a-count-rail'
import { CandidateCardB, HangoutCardB } from './variant-b-avatar-led'
import { CandidateCardC, HangoutCardC } from './variant-c-dense-rows'

const VARIANTS = [
  { key: 'A', name: 'Count rail', Candidate: CandidateCardA, Hangout: HangoutCardA, gap: 'gap-2', pad: 'p-2', technique: 'ring' as BorderTechnique },
  { key: 'B', name: 'Avatar-led', Candidate: CandidateCardB, Hangout: HangoutCardB, gap: 'gap-2', pad: 'p-2', technique: 'bar' as BorderTechnique },
  { key: 'C', name: 'Dense rows', Candidate: CandidateCardC, Hangout: HangoutCardC, gap: 'gap-0', pad: 'p-0', technique: 'stripe' as BorderTechnique },
]

export const RightSidebarPrototype = () => {
  const [params, setParams] = useSearchParams()
  const key = (params.get('variant') ?? 'A').toUpperCase()
  const index = Math.max(0, VARIANTS.findIndex((v) => v.key === key))
  const current = VARIANTS[index]!

  const [theme, setTheme] = useState<Theme>('light')
  const [technique, setTechnique] = useState<BorderTechnique | 'default'>('default')
  const [colourEveryCard, setColourEveryCard] = useState(false)
  const [touch, setTouch] = useState(false)
  const [retimeSurface, setRetimeSurface] = useState<'popover' | 'dialog'>('dialog')
  const [dataset, setDataset] = useState<DatasetKey>('normal')
  const [width, setWidth] = useState(320)

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

  const chrome: Chrome = {
    theme,
    technique: technique === 'default' ? current.technique : technique,
    colourEveryCard,
    touch,
    retimeSurface,
  }

  const data = DATASETS[dataset]
  const hidden = data.hidden
  const candidates = computeCandidates(data, hidden, NOW)
  const pinned = pinnedHangouts(data, NOW)
  const empty = emptyState(data, hidden, NOW, candidates)

  const CandidateCard = current.Candidate
  const HangoutCard = current.Hangout

  return (
    <div className={cn(theme === 'dark' && 'dark')}>
      <div className="flex min-h-screen bg-background pb-16 text-foreground">
        {/* the grid is ticket 05/15's problem — this is a stand-in so the
            sidebar is judged next to something, not in a vacuum */}
        <div className="flex-1 bg-muted/30 p-6 text-xs text-muted-foreground">
          <p className="mb-2 font-medium text-foreground">Prototype 16 — right sidebar</p>
          <p className="max-w-md leading-relaxed">
            The calendar grid lives here (tickets 05/15). Everything on the right is what this
            ticket is about. Controls below the sidebar; ← / → switch card anatomy.
          </p>
        </div>

        <aside
          className="flex shrink-0 flex-col border-l border-border bg-sidebar"
          style={{ width }}
        >
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs font-medium">When we can meet</span>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {candidates.length}
            </span>
          </div>
          <Separator />

          <div className="min-h-0 flex-1 overflow-y-auto">
            {pinned.length > 0 && (
              <>
                <div className={cn('flex flex-col', current.gap, current.pad)}>
                  {pinned.map((h) => (
                    <HangoutCard key={h.id} hangout={h} chrome={chrome} now={NOW} />
                  ))}
                </div>
                {/* the divider only exists when both regions do */}
                {(candidates.length > 0 || empty) && <Separator />}
              </>
            )}

            {empty ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {EMPTY_COPY[empty].title}
                </p>
                {EMPTY_COPY[empty].action && (
                  <Button size="sm" variant="outline">
                    {EMPTY_COPY[empty].action}
                  </Button>
                )}
              </div>
            ) : (
              <div className={cn('flex flex-col', current.gap, current.pad)}>
                {candidates.map((c) => (
                  <CandidateCard key={c.key} candidate={c} chrome={chrome} now={NOW} />
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      {import.meta.env.MODE !== 'production' && (
        <div style={bar}>
          <button onClick={() => go(-1)} style={arrow} aria-label="previous variant">
            ←
          </button>
          <span style={{ padding: '0 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {current.key} ({current.name})
          </span>
          <button onClick={() => go(1)} style={arrow} aria-label="next variant">
            →
          </button>
          <span style={sep} />
          <Toggle on={theme === 'dark'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            dark
          </Toggle>
          {(['default', 'ring', 'bar', 'stripe'] as const).map((t) => (
            <Toggle key={t} on={technique === t} onClick={() => setTechnique(t)}>
              {t}
            </Toggle>
          ))}
          <span style={sep} />
          <Toggle on={colourEveryCard} onClick={() => setColourEveryCard(!colourEveryCard)}>
            colour every card
          </Toggle>
          <Toggle on={touch} onClick={() => setTouch(!touch)}>
            touch
          </Toggle>
          <Toggle
            on={retimeSurface === 'popover'}
            onClick={() => setRetimeSurface(retimeSurface === 'popover' ? 'dialog' : 'popover')}
          >
            retime: {retimeSurface}
          </Toggle>
          <span style={sep} />
          {(Object.keys(DATASETS) as DatasetKey[]).map((k) => (
            <Toggle key={k} on={dataset === k} onClick={() => setDataset(k)}>
              {k}
            </Toggle>
          ))}
          <span style={sep} />
          {[280, 320, 360].map((w) => (
            <Toggle key={w} on={width === w} onClick={() => setWidth(w)}>
              {w}
            </Toggle>
          ))}
          <span style={{ ...sep, opacity: 0 }} />
          <span style={{ opacity: 0.6, fontSize: 11 }}>group of {FRIENDS.length}</span>
        </div>
      )}
    </div>
  )
}

const Toggle = ({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) => (
  <button
    onClick={onClick}
    style={{
      background: on ? '#fff' : 'rgba(255,255,255,0.12)',
      color: on ? '#111' : '#fff',
      border: 0,
      borderRadius: 999,
      padding: '3px 8px',
      cursor: 'pointer',
      fontSize: 11,
      lineHeight: 1.3,
    }}
  >
    {children}
  </button>
)

const bar: CSSProperties = {
  position: 'fixed',
  bottom: 12,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  flexWrap: 'wrap',
  maxWidth: '94vw',
  justifyContent: 'center',
  background: '#111',
  color: '#fff',
  borderRadius: 14,
  padding: 6,
  boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 12,
  zIndex: 50,
}

const arrow: CSSProperties = {
  background: 'rgba(255,255,255,0.12)',
  color: '#fff',
  border: 0,
  borderRadius: 999,
  width: 24,
  height: 24,
  cursor: 'pointer',
  fontSize: 13,
  lineHeight: 1,
}

const sep: CSSProperties = {
  width: 1,
  height: 16,
  background: 'rgba(255,255,255,0.25)',
  margin: '0 2px',
}

export default RightSidebarPrototype
