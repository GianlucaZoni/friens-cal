/** PROTOTYPE — throwaway. Shared bits for ticket 14's month cell. */
import { Blobatar } from '@blobatar/react'
/**
 * Expressions are imported VALUES, not strings — passing `expression="idle"`
 * throws `bake is not a function` at render. Ticket 11 excluded the four
 * tinting ones (`mad`, `love`, `shy`, `sick`); these are six of the ten that
 * survive, so the dot row is tested against real shape variety.
 */
import { happy, idle, sleepy, smug, thinking, wink } from 'blobatar/expression'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { avatarColour, uiColour } from './color'
import { friendById } from './data'

/** How the viewer's own Availability is marked in a cell. Item 3 of the ticket. */
export type OwnMarker = 'ring' | 'underline' | 'datepill' | 'corner' | 'none'

/** What a dot is coloured with. The collision between ticket 11's two systems. */
export type DotColour = 'avatar' | 'ui'

/** What happens when the dots do not fit. Item 2 of the ticket. */
export type Overflow = 'row' | 'plusN' | 'wrap' | 'lanes' | 'fallback'

export type Ctx = {
  dark: boolean
  own: OwnMarker
  dotColour: DotColour
  overflow: Overflow
  /** wash opacity encodes coverage (ticket 14's wording) or peak (ticket 15's). */
  wash: 'coverage' | 'peak'
  /** Item 4: participant blobs + glowing border, or a single marker. */
  hangout: 'blobs' | 'marker' | 'off'
  /** Item 3's stress test: light up today + selected at the same time. */
  chrome: boolean
  /** cell geometry, so the size ladder can re-render the same cell smaller/larger. */
  w: number
  h: number
}

export const CELL_W = 78
export const CELL_H = 72

const EXPRESSIONS = [idle, happy, wink, sleepy, smug, thinking]
const expressionFor = (id: number) => EXPRESSIONS[id % EXPRESSIONS.length]

/**
 * A real blobatar, not a stand-in — `@blobatar/react` IS installed in this
 * worktree, unlike ticket 05's. That matters: ticket 11's collision decision
 * rests on "the blobatar shape disambiguates", and the only way to test that
 * claim at 8px is to render the actual shapes.
 *
 * `dotColour: 'ui'` swaps blobatar's own palette for ticket 11's
 * `oklch(L_theme, C_theme, hue)` — a flat chip, no face. That is the trade.
 */
export function Dot({ id, size, ctx }: { id: number; size: number; ctx: Ctx }) {
  const f = friendById(id)
  if (ctx.dotColour === 'ui') {
    return (
      <span
        title={f.name}
        className="inline-block shrink-0 rounded-full ring-1 ring-black/15 dark:ring-white/20"
        style={{ width: size, height: size, background: uiColour(f.hue, ctx.dark) }}
      />
    )
  }
  return (
    <span
      title={`${f.name} — hue ${f.hue}, tone ${f.tone}`}
      className="inline-block shrink-0 overflow-hidden rounded-full ring-1 ring-black/15 dark:ring-white/20"
      style={{ width: size, height: size }}
    >
      <Blobatar
        name={f.seed}
        hue={f.hue}
        tone={f.tone}
        size={size}
        background="circle"
        expression={expressionFor(id)}
      />
    </span>
  )
}

/** Bigger blobatar for legends / hover panels, where shape is actually visible. */
export function Face({ id, size = 26, ctx }: { id: number; size?: number; ctx: Ctx }) {
  const f = friendById(id)
  return (
    <span
      className="inline-block shrink-0 overflow-hidden rounded-full ring-1 ring-black/10 dark:ring-white/15"
      style={{ width: size, height: size, background: avatarColour(f.hue, f.tone, ctx.dark, 0.2) }}
    >
      <Blobatar
        name={f.seed}
        hue={f.hue}
        tone={f.tone}
        size={size}
        background="circle"
        expression={expressionFor(id)}
      />
    </span>
  )
}

export const Pill = ({
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
    className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
      on ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'
    }`}
  >
    {children}
  </button>
)

export const Group = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-center gap-1.5">
    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
    <div className="flex gap-1 rounded-lg bg-muted/60 p-0.5">{children}</div>
  </div>
)

export const Note = ({ children }: { children: ReactNode }) => (
  <p className="mt-2 max-w-[70ch] text-[11px] leading-relaxed text-muted-foreground">{children}</p>
)

export const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="mb-5 rounded-xl border border-border bg-card p-4">
    <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {title}
    </div>
    {children}
  </section>
)

export function PrototypeSwitcher({
  variants,
  current,
  name,
  onChange,
}: {
  variants: string[]
  current: string
  name: string
  onChange: (v: string) => void
}) {
  const step = (d: number) => {
    const i = variants.indexOf(current)
    onChange(variants[(i + d + variants.length) % variants.length])
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'ArrowLeft') step(-1)
      if (e.key === 'ArrowRight') step(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-neutral-900 p-1 text-white shadow-lg">
      <button
        onClick={() => step(-1)}
        className="flex size-7 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="px-3 text-[12px] font-semibold whitespace-nowrap">
        {current} · {name}
      </span>
      <button
        onClick={() => step(1)}
        className="flex size-7 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  )
}
