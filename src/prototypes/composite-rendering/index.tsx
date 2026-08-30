/**
 * PROTOTYPE — throwaway. Ticket 05: composite Availability rendering.
 *
 * Four variants of the same week grid on one route, switchable with `?variant=`
 * and the floating bottom bar (arrow keys work too). Everything is fake data,
 * in memory, no persistence, no Supabase, no drag.
 *
 * Blobatar is NOT installed and must not be: every avatar here is a coloured
 * circle stand-in (see `StubBlob`). Judge colour, not shape.
 *
 * `pixels-standalone.html` in this folder reproduces the same colour maths and
 * mesh gradients with zero dependencies — open it over file:// if node_modules
 * is not installed.
 */
import { hueToneColor } from './color'
import {
  ALL_FRIENDS,
  HANGOUT,
  OTHERS,
  VIEWER,
  availabilityFor,
  fmt,
  friendById,
  runsFor,
  segmentsFor,
} from './data'
import { CompositeFill, HoverPanel, PrototypeSwitcher, StubBlob, col } from './pieces'
import type { Ctx, HoverInfo, Technique } from './pieces'
import { CONTINUOUS_NAME, VariantContinuous } from './variant-continuous'
import { DENSITY_NAME, VariantDensity } from './variant-density'
import { LANES_NAME, VariantLanes } from './variant-lanes'
import { FriendLegend, SEGMENTED_NAME, VariantSegmented } from './variant-segmented'
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

const VARIANTS = ['A', 'B', 'C', 'D'] as const
const NAMES: Record<string, string> = {
  A: SEGMENTED_NAME,
  B: CONTINUOUS_NAME,
  C: LANES_NAME,
  D: DENSITY_NAME,
}

const Pill = ({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: ReactNode
}) => (
  <button
    onClick={onClick}
    className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
      on
        ? 'bg-foreground text-background'
        : 'bg-muted text-muted-foreground hover:text-foreground'
    }`}
  >
    {children}
  </button>
)

const Group = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-center gap-1.5">
    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
    <div className="flex gap-1 rounded-lg bg-muted/60 p-0.5">{children}</div>
  </div>
)

// ---------------------------------------------------------------------------
// Segmentation probe: the ticket's own example, all four treatments side by
// side, same data, same width. 17:00-24:00 on the Wednesday.
// ---------------------------------------------------------------------------
const PROBE_DAY = 9
const P_START = 17 * 60
const P_H = 24
const py = (m: number) => ((m - P_START) / 30) * P_H

const Probe = ({ ids, ctx }: { ids: number[]; ctx: Ctx }) => {
  const ranges = availabilityFor(PROBE_DAY, ids)
  const segs = segmentsFor(ranges)
  const runs = runsFor(segs)
  const H = py(24 * 60)

  const Col = ({ title, note, children }: { title: string; note: string; children: ReactNode }) => (
    <div className="w-[132px] shrink-0">
      <div className="mb-1 text-[11px] font-medium text-foreground">{title}</div>
      <div className="mb-1.5 h-8 text-[10px] leading-tight text-muted-foreground">{note}</div>
      <div
        className="relative rounded-md border border-border bg-card"
        style={{
          height: H,
          backgroundImage:
            'repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px 48px)',
        }}
      >
        {children}
      </div>
    </div>
  )

  return (
    <div className="flex gap-4 overflow-x-auto">
      <div className="w-11 shrink-0">
        <div style={{ height: 56 }} />
        <div className="relative" style={{ height: H }}>
          {[17, 18, 19, 20, 21, 22, 23, 24].map((h) => (
            <div
              key={h}
              className="absolute right-0 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
              style={{ top: py(h * 60) }}
            >
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>
      </div>

      <Col title="A · Segmented" note="one block per change of set — hard edge at every boundary">
        {segs.map((s, i) => (
          <div
            key={i}
            className="absolute inset-x-0.5 rounded-[5px] ring-1 ring-inset ring-black/5 dark:ring-white/10"
            style={{ top: py(s.start), height: Math.max(3, py(s.end) - py(s.start) - 2) }}
          >
            <CompositeFill friendIds={s.friendIds} seed={i * 17} ctx={ctx} />
          </div>
        ))}
      </Col>

      <Col title="B · Continuous" note="one block per run — gradient cross-fades where the set changes">
        {runs.map((r, ri) => (
          <div
            key={ri}
            className="absolute inset-x-0.5 overflow-hidden rounded-[6px] ring-1 ring-inset ring-black/5 dark:ring-white/10"
            style={{ top: py(r.start), height: Math.max(3, py(r.end) - py(r.start) - 2) }}
          >
            {r.segments.map((s, i) => {
              const tf = i > 0 ? 11 : 0
              const bf = i < r.segments.length - 1 ? 11 : 0
              const mask = `linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgb(0,0,0) ${tf}px, rgb(0,0,0) calc(100% - ${bf}px), rgba(0,0,0,0) 100%)`
              return (
                <div
                  key={i}
                  className="absolute inset-x-0"
                  style={{
                    top: py(s.start) - py(r.start) - tf,
                    height: py(s.end) - py(s.start) + tf + bf,
                    maskImage: mask,
                    WebkitMaskImage: mask,
                  }}
                >
                  <CompositeFill friendIds={s.friendIds} seed={ri * 7 + i} ctx={ctx} />
                </div>
              )
            })}
          </div>
        ))}
      </Col>

      <Col title="C · Lanes" note="no compositing — one sliver per Friend">
        {ids.map((id, li) => {
          const w = 100 / ids.length
          return availabilityFor(PROBE_DAY, [id]).map((a, i) => (
            <div
              key={`${id}-${i}`}
              className="absolute rounded-[3px]"
              style={{
                left: `calc(${li * w}% + 1px)`,
                width: `calc(${w}% - 2px)`,
                top: py(a.start),
                height: Math.max(3, py(a.end) - py(a.start) - 2),
                background: col(friendById(id), 0.62, ctx),
              }}
            />
          ))
        })}
      </Col>

      <Col title="D · Density + spine" note="body encodes count only; hue moves to the 5px spine">
        {segs.map((s, i) => (
          <div
            key={i}
            className="absolute inset-x-0.5 overflow-hidden rounded-[5px] ring-1 ring-inset ring-black/5 dark:ring-white/10"
            style={{
              top: py(s.start),
              height: Math.max(3, py(s.end) - py(s.start) - 2),
              background: ctx.dark
                ? `oklch(0.82 0.03 265 / ${0.1 + 0.62 * (s.friendIds.length / Math.max(1, ids.length))})`
                : `oklch(0.48 0.04 265 / ${0.1 + 0.62 * (s.friendIds.length / Math.max(1, ids.length))})`,
            }}
          >
            <div className="absolute inset-y-0 left-0 flex w-[5px] flex-col">
              {s.friendIds.map((id) => (
                <div
                  key={id}
                  style={{
                    height: `${100 / s.friendIds.length}%`,
                    background: col(friendById(id), 0.95, ctx),
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </Col>

      <div className="min-w-[190px] flex-1 text-[11px] leading-relaxed text-muted-foreground">
        <div className="mb-1 font-medium text-foreground">The ticket's case</div>
        Marco 18:00–22:00, Sara 20:00–23:00 (plus whoever else is visible).
        <br />
        <br />
        Segments here: {segs.length}. Runs: {runs.length}.
        <br />
        <br />
        A gives you {segs.length} hoverable rectangles. B gives you {runs.length}. Everything else
        follows from that choice.
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reference strip: viewer-solid vs composite vs confirmed Hangout, same size,
// so "does the heatmap stay distinct from a Hangout's glow" is answerable.
// ---------------------------------------------------------------------------
const Reference = ({ ids, ctx }: { ids: number[]; ctx: Ctx }) => {
  const glow = HANGOUT.participants
    .map((id) => col(friendById(id), 0.95, ctx))
    .join(', ')
  return (
    <div className="flex flex-wrap items-end gap-6">
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          your own — solid
        </div>
        <div
          className="relative h-[72px] w-[120px] rounded-[6px] shadow-sm ring-1 ring-inset ring-black/10 dark:ring-white/20"
          style={{ background: hueToneColor(VIEWER.hue, VIEWER.tone, 0.92) }}
        >
          <span className="absolute left-2 top-1.5 text-[10px] font-medium text-white/90">you</span>
        </div>
      </div>
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          others — composite ({ids.length})
        </div>
        <div className="relative h-[72px] w-[120px] overflow-hidden rounded-[6px] ring-1 ring-inset ring-black/5 dark:ring-white/10">
          <CompositeFill friendIds={ids} seed={5} ctx={ctx} />
        </div>
      </div>
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          confirmed Hangout
        </div>
        <div
          className="relative h-[72px] w-[120px] rounded-[6px] p-[2px]"
          style={{
            background: `conic-gradient(${glow}, ${glow.split(', ')[0]})`,
            boxShadow: `0 0 14px -2px ${col(friendById(HANGOUT.participants[1]), 0.7, ctx)}`,
          }}
        >
          <div className="flex h-full w-full items-end gap-0.5 rounded-[4px] bg-card p-1.5">
            {HANGOUT.participants.map((id) => (
              <StubBlob key={id} id={id} size={18} ctx={ctx} />
            ))}
            <span className="ml-auto text-[10px] text-foreground">{HANGOUT.title}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

export default function CompositeRenderingPrototype() {
  const [variant, setVariant] = useState<string>(
    () => new URLSearchParams(window.location.search).get('variant')?.toUpperCase() ?? 'A',
  )
  const [dark, setDark] = useState(false)
  const [count, setCount] = useState(4)
  const [technique, setTechnique] = useState<Technique>('mesh')
  const [assisted, setAssisted] = useState(false)
  const [mode, setMode] = useState<'week' | 'month'>('week')
  const [showViewer, setShowViewer] = useState(true)
  const [hover, setHover] = useState<HoverInfo | null>(null)

  const change = useCallback((v: string) => {
    setVariant(v)
    const u = new URL(window.location.href)
    u.searchParams.set('variant', v)
    window.history.replaceState(null, '', u)
  }, [])

  useEffect(() => {
    if (!VARIANTS.includes(variant as (typeof VARIANTS)[number])) change('A')
  }, [variant, change])

  const ctx: Ctx = { dark, assisted, technique }
  const ids = OTHERS.slice(0, count).map((f) => f.id)
  const props = { ids, showViewer, ctx, onHover: setHover, mode }

  return (
    <div className={dark ? 'dark' : ''}>
      <div className="min-h-screen bg-background px-6 pb-28 pt-5 text-foreground">
        <div className="mx-auto max-w-[1400px]">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h1 className="text-sm font-semibold">Composite Availability rendering</h1>
            <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
              PROTOTYPE · throwaway · fake data · blobatars are STAND-INS
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-3">
              <Group label="friends">
                {[2, 4, 6, 8].map((n) => (
                  <Pill key={n} on={count === n} onClick={() => setCount(n)}>
                    {n}
                  </Pill>
                ))}
              </Group>
              <Group label="fill">
                {(['mesh', 'stripes', 'blur'] as Technique[]).map((t) => (
                  <Pill key={t} on={technique === t} onClick={() => setTechnique(t)}>
                    {t}
                  </Pill>
                ))}
              </Group>
              <Group label="view">
                <Pill on={mode === 'week'} onClick={() => setMode('week')}>
                  week
                </Pill>
                <Pill on={mode === 'month'} onClick={() => setMode('month')}>
                  month
                </Pill>
              </Group>
              <Group label="theme">
                <Pill on={!dark} onClick={() => setDark(false)}>
                  light
                </Pill>
                <Pill on={dark} onClick={() => setDark(true)}>
                  dark
                </Pill>
              </Group>
              <Group label="tweaks">
                <Pill on={assisted} onClick={() => setAssisted((v) => !v)}>
                  clamp L/C
                </Pill>
                <Pill on={showViewer} onClick={() => setShowViewer((v) => !v)}>
                  show you
                </Pill>
              </Group>
            </div>
          </div>

          <section className="mb-5 rounded-xl border border-border bg-card p-4">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Q1 · Segmentation probe — same data, four treatments, side by side
            </div>
            <Probe ids={ids} ctx={ctx} />
          </section>

          <section className="mb-5 rounded-xl border border-border bg-card p-4">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Q2 · Three things that must never be confused
            </div>
            <Reference ids={ids} ctx={ctx} />
          </section>

          <section className="mb-4 rounded-xl border border-border bg-card p-3">
            <FriendLegend ids={ids} ctx={ctx} />
            <p className="mt-2 text-[10px] text-muted-foreground">
              Giulia (h262) and Luca (h268) are a deliberate near-collision. Elena is tone{' '}
              <code>0.36</code> (l .9 c .028) — watch her disappear in light. Teo is tone{' '}
              <code>1.0</code> (l .34) — watch him disappear in dark.
            </p>
          </section>

          <div className="mb-2 text-[11px] text-muted-foreground">
            {variant} · {NAMES[variant]} · {mode}
          </div>

          {variant === 'A' && <VariantSegmented {...props} />}
          {variant === 'B' && <VariantContinuous {...props} />}
          {variant === 'C' && <VariantLanes {...props} />}
          {variant === 'D' && <VariantDensity {...props} />}

          <p className="mt-3 text-[10px] text-muted-foreground">
            {ALL_FRIENDS.length} fake Friends exist; {ids.length} visible + you. Hangout: day{' '}
            {HANGOUT.day + 1}, {fmt(HANGOUT.start)}–{fmt(HANGOUT.end)}.
          </p>
        </div>

        <HoverPanel info={hover} ctx={ctx} />
        {!import.meta.env.PROD && (
          <PrototypeSwitcher
            variants={[...VARIANTS]}
            current={variant}
            onChange={change}
            name={NAMES[variant] ?? ''}
          />
        )}
      </div>
    </div>
  )
}
