/** PROTOTYPE — throwaway. Shared bits for ticket 05's variants. */
import { hash2, type Friend, friendById } from './data'
import { hueToneColor, hueToneColorAssisted } from './color'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'

export type Technique = 'mesh' | 'stripes' | 'blur'

export type Ctx = { dark: boolean; assisted: boolean; technique: Technique }

export const col = (f: Friend, alpha: number, ctx: Ctx) =>
  ctx.assisted
    ? hueToneColorAssisted(f.hue, f.tone, alpha, ctx.dark)
    : hueToneColor(f.hue, f.tone, alpha)

/**
 * STAND-IN for a blobatar. Blobatar is not installed and must not be — this is
 * a plain circle in the Friend's hue+tone with a fake eye. Same footprint, none
 * of the shape variety, so judge colour here and nothing else.
 */
export const StubBlob = ({ id, size = 26, ctx }: { id: number; size?: number; ctx: Ctx }) => {
  const f = friendById(id)
  return (
    <span
      title={`${f.name} — hue ${f.hue}, tone ${f.tone} (blobatar STAND-IN)`}
      className="relative inline-block shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15"
      style={{ width: size, height: size, background: col(f, 1, ctx) }}
    >
      <span
        className="absolute rounded-full bg-black/55"
        style={{ width: size * 0.16, height: size * 0.16, left: '32%', top: '42%' }}
      />
      <span
        className="absolute rounded-full bg-black/55"
        style={{ width: size * 0.16, height: size * 0.16, left: '56%', top: '42%' }}
      />
    </span>
  )
}

/**
 * The composite fill: one faint mesh gradient built from the colours of the
 * Friends free here. Three techniques so the human can judge Q3 directly.
 */
export const CompositeFill = ({
  friendIds,
  seed,
  ctx,
  boost = 1,
}: {
  friendIds: number[]
  seed: number
  ctx: Ctx
  boost?: number
}) => {
  const friends = friendIds.map(friendById)
  if (friends.length === 0) return null

  if (ctx.technique === 'blur') {
    // Layered elements: one blurred blob per Friend, blended.
    return (
      <span
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-[5px]"
        style={{ isolation: 'isolate' }}
      >
        {friends.map((f, i) => {
          const x = 8 + hash2(seed, f.id) * 84
          const y = 8 + hash2(f.id, seed + 7) * 84
          return (
            <span
              key={f.id}
              className="absolute rounded-full"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                width: '78%',
                height: '120%',
                transform: 'translate(-50%,-50%)',
                background: col(f, 0.75 * boost, ctx),
                filter: 'blur(9px)',
                mixBlendMode: ctx.dark ? 'screen' : 'multiply',
                zIndex: i,
              }}
            />
          )
        })}
      </span>
    )
  }

  if (ctx.technique === 'stripes') {
    const step = 100 / friends.length
    const stops = friends
      .map((f, i) => `${col(f, 0.55 * boost, ctx)} ${i * step}% ${(i + 1) * step}%`)
      .join(', ')
    return (
      <span
        className="pointer-events-none absolute inset-0 rounded-[5px]"
        style={{ backgroundImage: `linear-gradient(102deg, ${stops})` }}
      />
    )
  }

  // mesh (default): stacked radial gradients, positions seeded per block+Friend
  // so they never move on re-render.
  const layers = friends.map((f) => {
    const x = 6 + hash2(seed, f.id) * 88
    const y = 6 + hash2(f.id, seed + 7) * 88
    const c = col(f, 0.42 * boost, ctx)
    const c0 = col(f, 0, ctx)
    return `radial-gradient(130% 85% at ${x}% ${y}%, ${c} 0%, ${c0} 72%)`
  })
  const base = `linear-gradient(115deg, ${friends
    .map((f) => col(f, 0.16 * boost, ctx))
    .join(', ')})`
  return (
    <span
      className="pointer-events-none absolute inset-0 rounded-[5px]"
      style={{ backgroundImage: [...layers, base].join(', ') }}
    />
  )
}

export type VariantProps = {
  /** Visible non-viewer Friends, in id order. */
  ids: number[]
  showViewer: boolean
  ctx: Ctx
  onHover: (info: HoverInfo | null) => void
  mode: 'week' | 'month'
}

/** Build a hover payload from the element the pointer is over. */
export const hoverFrom = (
  el: HTMLElement,
  friendIds: number[],
  label: string,
  sub: string,
): HoverInfo => {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, height: r.height, right: r.right, friendIds, label, sub }
}

export type HoverInfo = {
  x: number
  y: number
  height: number
  right: number
  friendIds: number[]
  label: string
  sub: string
}

export const HoverPanel = ({ info, ctx }: { info: HoverInfo | null; ctx: Ctx }) => {
  if (!info) return null
  const W = 190
  const flip = info.right + 12 + W > window.innerWidth
  const left = flip ? Math.max(8, info.x - W - 12) : info.right + 12
  const top = Math.min(window.innerHeight - 40 - info.friendIds.length * 30, info.y)
  return (
    <div
      className="pointer-events-none fixed z-50 rounded-lg border border-border bg-popover/95 p-2.5 shadow-lg backdrop-blur"
      style={{ left, top: Math.max(8, top), width: W }}
    >
      <div className="mb-1.5 text-[11px] font-medium text-foreground">{info.label}</div>
      <div className="mb-2 text-[10px] text-muted-foreground">{info.sub}</div>
      <div className="flex flex-col gap-1">
        {info.friendIds.map((id) => (
          <div key={id} className="flex items-center gap-2">
            <StubBlob id={id} size={20} ctx={ctx} />
            <span className="text-[11px] text-foreground">{friendById(id).name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Floating variant switcher — deliberately not part of the design under test. */
export const PrototypeSwitcher = ({
  variants,
  current,
  onChange,
  name,
}: {
  variants: string[]
  current: string
  onChange: (v: string) => void
  name: string
}) => {
  const [i, setI] = useState(variants.indexOf(current))
  useEffect(() => setI(variants.indexOf(current)), [current, variants])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'ArrowLeft') onChange(variants[(i - 1 + variants.length) % variants.length])
      if (e.key === 'ArrowRight') onChange(variants[(i + 1) % variants.length])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [i, onChange, variants])

  return (
    <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-neutral-900 px-1.5 py-1.5 text-white shadow-2xl ring-1 ring-white/20 dark:bg-white dark:text-neutral-900">
      <button
        className="rounded-full p-1.5 hover:bg-white/15 dark:hover:bg-black/10"
        onClick={() => onChange(variants[(i - 1 + variants.length) % variants.length])}
      >
        <ChevronLeft size={16} />
      </button>
      <span className="min-w-[230px] px-2 text-center font-mono text-xs">
        {current} · {name}
      </span>
      <button
        className="rounded-full p-1.5 hover:bg-white/15 dark:hover:bg-black/10"
        onClick={() => onChange(variants[(i + 1) % variants.length])}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
