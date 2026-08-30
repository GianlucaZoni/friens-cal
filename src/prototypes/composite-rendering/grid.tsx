/** PROTOTYPE — throwaway. Week/month chrome the variants draw inside. */
import { DAY_NAMES, GRID_END, GRID_START, SLOT, SLOTS, WEEK_OFFSET } from './data'
import type { ReactNode } from 'react'

export const ROW_H = 24
export const COL_H = SLOTS * ROW_H

export const yOf = (min: number) => ((Math.max(GRID_START, min) - GRID_START) / SLOT) * ROW_H
export const hOf = (start: number, end: number) =>
  ((Math.min(GRID_END, end) - Math.max(GRID_START, start)) / SLOT) * ROW_H

export const WeekShell = ({ renderDay }: { renderDay: (day: number, i: number) => ReactNode }) => (
  <div className="rounded-xl border border-border bg-card">
    <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-border">
      <div />
      {DAY_NAMES.map((d, i) => (
        <div
          key={d}
          className="border-l border-border px-2 py-2 text-[11px] font-medium text-muted-foreground"
        >
          {d} <span className="text-foreground/70">{WEEK_OFFSET + i + 1}</span>
        </div>
      ))}
    </div>
    <div className="max-h-[62vh] overflow-y-auto">
      <div className="grid grid-cols-[56px_repeat(7,1fr)]">
        <div className="relative" style={{ height: COL_H }}>
          {Array.from({ length: SLOTS / 2 }, (_, h) => (
            <div
              key={h}
              className="absolute right-1.5 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
              style={{ top: h * ROW_H * 2 }}
            >
              {String(GRID_START / 60 + h).padStart(2, '0')}:00
            </div>
          ))}
        </div>
        {DAY_NAMES.map((d, i) => (
          <div
            key={d}
            className="relative border-l border-border"
            style={{
              height: COL_H,
              backgroundImage:
                'repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px ' +
                ROW_H * 2 +
                'px)',
            }}
          >
            {renderDay(WEEK_OFFSET + i, i)}
          </div>
        ))}
      </div>
    </div>
  </div>
)

export const MonthShell = ({ renderCell }: { renderCell: (day: number) => ReactNode }) => (
  <div className="rounded-xl border border-border bg-card p-2">
    <div className="grid grid-cols-7 gap-1">
      {DAY_NAMES.map((d) => (
        <div key={d} className="px-1 pb-1 text-[10px] font-medium text-muted-foreground">
          {d}
        </div>
      ))}
      {Array.from({ length: 35 }, (_, day) => (
        <div
          key={day}
          className="relative h-20 overflow-hidden rounded-md border border-border bg-background"
        >
          <div className="absolute right-1 top-0.5 z-10 text-[10px] tabular-nums text-muted-foreground">
            {day + 1}
          </div>
          {renderCell(day)}
        </div>
      ))}
    </div>
  </div>
)
