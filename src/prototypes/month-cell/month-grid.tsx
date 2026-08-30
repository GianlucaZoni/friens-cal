/**
 * PROTOTYPE — throwaway. Ticket 14: the month grid chrome, shared by both
 * candidate languages.
 *
 * The chrome is where item 3 actually lives. A week-view column had a free
 * edge, so ticket 15 could pay for "your own Availability" with a border and a
 * ring. A month cell's edge is already spoken for four times over — the grid
 * rule, **today**, the **selected** day, and a **Hangout**'s glow — and every
 * one of those is also a border. Turn `chrome` on and look at a cell that is
 * all four at once.
 */
import { uiColour } from './color'
import {
  DAYS,
  MONTH_LABEL,
  TODAY,
  VIEWER,
  WEEKDAYS,
  friendById,
  metricsFor,
  type DayMetrics,
} from './data'
import { Dot, type Ctx } from './pieces'
import type { ReactNode } from 'react'

export type CellRender = (args: {
  m: DayMetrics
  ctx: Ctx
  w: number
  h: number
  visibleIds: number[]
}) => ReactNode

export type WashRender = (args: {
  m: DayMetrics
  ctx: Ctx
  visibleIds: number[]
}) => ReactNode

/** The viewer's own Availability, five ways. Item 3. */
function OwnMarker({ m, ctx }: { m: DayMetrics; ctx: Ctx }) {
  if (!m.youFree || ctx.own === 'none') return null
  const c = uiColour(VIEWER.hue, ctx.dark)

  if (ctx.own === 'ring') {
    // Ticket 15's week-view answer, transplanted verbatim: border + ring.
    return (
      <span
        className="pointer-events-none absolute inset-0 rounded-[5px]"
        style={{ boxShadow: `inset 0 0 0 2px ${c}, inset 0 0 0 4px ${uiColour(VIEWER.hue, ctx.dark, 0.28)}` }}
      />
    )
  }
  if (ctx.own === 'underline') {
    // A bar along the bottom, its width the fraction of the day you own.
    return (
      <span
        className="pointer-events-none absolute bottom-0 left-0 h-[3px]"
        style={{ width: `${Math.max(12, m.youFraction * 100)}%`, background: c }}
      />
    )
  }
  if (ctx.own === 'corner') {
    return (
      <span
        className="pointer-events-none absolute top-0 right-0 size-0"
        style={{ borderTop: `9px solid ${c}`, borderLeft: '9px solid transparent' }}
      />
    )
  }
  return null // 'datepill' is drawn by the date numeral itself
}

/**
 * The multi-colour Hangout border + glow, ticket 01's spec for the grid,
 * dropped into a 78×72 box.
 *
 * Four gradient strips rather than one masked `conic-gradient`: the mask
 * version is a coin-flip across engines and it silently renders *nothing* when
 * it loses, which is the worst possible failure mode in a prototype whose whole
 * output is "what does this look like".
 *
 * Note the `boxShadow` — the glow. In a week view a block floats inside a
 * column with air around it. Month cells share their edges, so this bleeds
 * straight onto the neighbouring days.
 */
export function HangoutBorder({
  participants,
  ctx,
}: {
  participants: number[]
  ctx: Ctx
}) {
  const cols = participants.map((id) => uiColour(friendById(id).hue, ctx.dark))
  const stops = cols.join(', ')
  const strip = (dir: string) => `linear-gradient(${dir}, ${stops})`
  return (
    <>
      <span
        className="pointer-events-none absolute inset-0 rounded-[5px]"
        style={{ boxShadow: `0 0 9px -1px ${uiColour(friendById(participants[1] ?? participants[0]).hue, ctx.dark, 0.8)}` }}
      />
      <span
        className="pointer-events-none absolute top-0 right-0 left-0 h-[2px]"
        style={{ background: strip('90deg') }}
      />
      <span
        className="pointer-events-none absolute right-0 bottom-0 left-0 h-[2px]"
        style={{ background: strip('270deg') }}
      />
      <span
        className="pointer-events-none absolute top-0 bottom-0 left-0 w-[2px]"
        style={{ background: strip('0deg') }}
      />
      <span
        className="pointer-events-none absolute top-0 right-0 bottom-0 w-[2px]"
        style={{ background: strip('180deg') }}
      />
    </>
  )
}

export function HangoutMarker({ title }: { title: string }) {
  return (
    <span className="pointer-events-none absolute inset-x-[3px] bottom-[3px] flex items-center gap-[3px] rounded-[3px] bg-foreground/90 px-[3px] py-[1px]">
      <span className="size-[5px] shrink-0 rounded-full bg-background" />
      <span className="truncate text-[8px] leading-[11px] font-medium text-background">{title}</span>
    </span>
  )
}

export function HangoutBlobs({
  participants,
  ctx,
  w,
}: {
  participants: number[]
  ctx: Ctx
  w: number
}) {
  const size = Math.max(5, Math.floor((w - 14) / participants.length) - 1)
  return (
    <span className="pointer-events-none absolute inset-x-[4px] bottom-[3px] flex items-end justify-center gap-[1px]">
      {participants.map((id) => (
        <Dot key={id} id={id} size={size} ctx={ctx} />
      ))}
    </span>
  )
}

function HangoutLayer({ m, ctx, w }: { m: DayMetrics; ctx: Ctx; w: number }) {
  const h = m.hangout
  if (!h || ctx.hangout === 'off') return null
  if (ctx.hangout === 'marker') return <HangoutMarker title={h.title} />
  return (
    <>
      <HangoutBorder participants={h.participants} ctx={ctx} />
      <HangoutBlobs participants={h.participants} ctx={ctx} w={w} />
    </>
  )
}

export function MonthGrid({
  visibleIds,
  ctx,
  selected,
  onSelect,
  renderBody,
  renderWash,
  w,
  h,
  label,
}: {
  visibleIds: number[]
  ctx: Ctx
  selected: number | null
  onSelect: (i: number | null) => void
  renderBody: CellRender
  renderWash?: WashRender
  w: number
  h: number
  label: string
}) {
  return (
    <div className="inline-block">
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-[12px] font-semibold">{label}</span>
        <span className="text-[10px] text-muted-foreground">
          {MONTH_LABEL} · {w}×{h}px cells
        </span>
      </div>
      <div
        className="grid overflow-hidden rounded-lg border border-border bg-card"
        style={{ gridTemplateColumns: `repeat(7, ${w}px)` }}
      >
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="border-b border-border py-1 text-center text-[10px] font-medium text-muted-foreground"
          >
            {d}
          </div>
        ))}
        {DAYS.map((day) => {
          const m = metricsFor(day.index, visibleIds)
          const isToday = ctx.chrome && day.index === TODAY
          const isSelected = ctx.chrome && day.index === selected
          const pill = ctx.own === 'datepill' && m.youFree
          return (
            <button
              key={day.index}
              onClick={() => onSelect(selected === day.index ? null : day.index)}
              className="relative border-t border-l border-border text-left first:border-l-0 focus:outline-none"
              style={{ width: w, height: h, opacity: day.inMonth ? 1 : 0.45 }}
              title={`day ${day.date} · peak ${m.peak} · ${m.anyone.length} with availability · coverage ${Math.round(m.coverage * 100)}%`}
            >
              {renderWash ? renderWash({ m, ctx, visibleIds }) : null}

              <span className="pointer-events-none absolute inset-x-0 top-0 flex h-[17px] items-center px-[4px]">
                <span
                  className={`text-[10px] leading-none font-medium tabular-nums ${
                    isToday ? 'text-background' : pill ? 'text-white' : 'text-muted-foreground'
                  }`}
                  style={
                    isToday
                      ? {
                          background: 'var(--foreground)',
                          borderRadius: 999,
                          padding: '2px 4px',
                        }
                      : pill
                        ? {
                            background: uiColour(VIEWER.hue, ctx.dark),
                            borderRadius: 999,
                            padding: '2px 4px',
                          }
                        : undefined
                  }
                >
                  {day.date}
                </span>
              </span>

              <span className="pointer-events-none absolute inset-x-[4px] top-[17px] bottom-[3px] flex items-center justify-center">
                {renderBody({ m, ctx, w, h, visibleIds })}
              </span>

              <OwnMarker m={m} ctx={ctx} />
              <HangoutLayer m={m} ctx={ctx} w={w} />

              {isSelected ? (
                <span
                  className="pointer-events-none absolute inset-0"
                  style={{ boxShadow: 'inset 0 0 0 2px var(--ring)' }}
                />
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
