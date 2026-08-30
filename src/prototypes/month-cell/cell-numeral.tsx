/**
 * PROTOTYPE — throwaway. Ticket 14, candidate language B:
 * THE PEAK-CONCURRENCY NUMERAL OVER A DENSITY WASH.
 *
 * "4" over a shaded cell: how many Friends were free at the best moment, plus
 * a rough sense of how much of the day it covers.
 *
 * Two things here are load-bearing and are NOT in the ticket:
 *
 * 1. **What the wash's opacity means.** Ticket 14's wording says coverage; the
 *    week grid ticket 15 settled says the same visual channel means *count*.
 *    They cannot both be true, or the same opacity means two things in two
 *    views. `ctx.wash` flips between them so the human can decide once.
 *
 * 2. **`peak < 2` is not a Candidate.** A day where the best moment has exactly
 *    one Friend free holds no Candidate at all (CONTEXT: a Candidate needs two
 *    or more). Printing a bold "1" would advertise a day that has nothing on
 *    it, so 1 renders demoted and 0 renders as nothing.
 */
import { uiColour, washColour } from './color'
import { VIEWER, type DayMetrics } from './data'
import type { Ctx } from './pieces'

export const NUMERAL_NAME = 'peak numeral + density wash'

export function washStrength(m: DayMetrics, visibleCount: number, ctx: Ctx) {
  if (ctx.wash === 'peak') return visibleCount > 0 ? m.peak / visibleCount : 0
  return m.coverage
}

export function NumeralWash({
  m,
  visibleCount,
  ctx,
}: {
  m: DayMetrics
  visibleCount: number
  ctx: Ctx
}) {
  const t = washStrength(m, visibleCount, ctx)
  return (
    <span
      className="pointer-events-none absolute inset-0"
      style={{ background: washColour(VIEWER.hue, t, ctx.dark) }}
    />
  )
}

/**
 * The numeral takes no `Ctx` on purpose: it scales with the CELL, not with the
 * Friend count, the theme or any of the toggles. That is language B's whole
 * structural advantage over the dot row, and the signature says so.
 */
export function NumeralBody({ m, w, h }: { m: DayMetrics; w: number; h: number }) {
  const innerH = h - 20
  // The numeral scales with the cell, not with the Friend count — which is the
  // whole structural advantage over the dot row.
  const fs = Math.round(Math.min(innerH * 0.72, w * 0.42))

  if (m.peak === 0) return null

  if (m.peak === 1) {
    return (
      <div
        className="flex items-center justify-center tabular-nums"
        style={{ width: w - 8, height: innerH }}
      >
        <span
          className="font-medium text-muted-foreground"
          style={{ fontSize: Math.round(fs * 0.42), opacity: 0.7 }}
          title="peak concurrency 1 — nobody overlaps, so this day holds no Candidate"
        >
          1
        </span>
      </div>
    )
  }

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: w - 8, height: innerH }}
    >
      <span
        className="leading-none font-semibold tabular-nums text-foreground"
        style={{ fontSize: fs, letterSpacing: '-0.04em' }}
      >
        {m.peak}
      </span>
    </div>
  )
}

/**
 * The second channel: how much of the day could hold a Candidate. A 5px strip
 * across the bottom of the cell. Ticket 05 called the equivalent strip "too
 * small to see" — it is here so that claim can be checked at the real size
 * rather than remembered.
 */
export function CoverageStrip({ m, ctx, w }: { m: DayMetrics; ctx: Ctx; w: number }) {
  if (m.coverage <= 0) return null
  return (
    <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[4px]">
      <span
        className="absolute bottom-0 left-0 h-full"
        style={{
          width: `${Math.max(4, m.coverage * 100)}%`,
          background: uiColour(VIEWER.hue, ctx.dark, 0.85),
        }}
        title={`${Math.round(m.coverage * 24 * 60 * (1 / 60))}h of the day has 2+ Friends free`}
      />
      <span className="sr-only">{Math.round(m.coverage * 100)}% coverage</span>
      <span className="absolute inset-0" style={{ width: w }} />
    </span>
  )
}
