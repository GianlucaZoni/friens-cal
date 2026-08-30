/**
 * PROTOTYPE — variant B: CONTINUOUS.
 *
 * One rendered block per maximal run of "somebody is free". Marco 18:00-22:00 +
 * Sara 20:00-23:00 is ONE block, 18:00-23:00, whose gradient shifts where the
 * set changes. Sub-segment fills are cross-faded, so there is no hard edge.
 * Hover target = the 30-minute slot, not the block.
 */
import { hueToneColor } from './color'
import {
  AVAILABILITY,
  GRID_END,
  GRID_START,
  SLOT,
  SLOTS,
  VIEWER,
  availabilityFor,
  fmt,
  freeAt,
  runsFor,
  segmentsFor,
} from './data'
import { COL_H, MonthShell, ROW_H, WeekShell, hOf, yOf } from './grid'
import { CompositeFill, hoverFrom, type VariantProps } from './pieces'

export const CONTINUOUS_NAME = 'Continuous — one block per run, gradient shifts inside'

const FADE = 11

export const VariantContinuous = ({ ids, showViewer, ctx, onHover, mode }: VariantProps) => {
  if (mode === 'month') {
    const scale = (min: number) => ((min - GRID_START) / (GRID_END - GRID_START)) * 100
    return (
      <MonthShell
        renderCell={(day) => {
          const runs = runsFor(segmentsFor(availabilityFor(day, ids)))
          const everyone = [...new Set(runs.flatMap((r) => r.friendIds))].sort((a, b) => a - b)
          if (everyone.length === 0) return null
          return (
            <div
              className="absolute inset-0"
              onMouseEnter={(e) =>
                onHover(
                  hoverFrom(
                    e.currentTarget,
                    everyone,
                    'Day composite',
                    `${everyone.length} Friends free at some point`,
                  ),
                )
              }
              onMouseLeave={() => onHover(null)}
            >
              {/* whole-cell composite: time structure is thrown away… */}
              <CompositeFill friendIds={everyone} seed={day * 13} ctx={ctx} boost={0.85} />
              {/* …and put back as a 6px strip along the bottom. */}
              <div className="absolute bottom-0 left-0 right-0 h-1.5">
                {runs.map((r, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full"
                    style={{ left: `${scale(r.start)}%`, width: `${scale(r.end) - scale(r.start)}%` }}
                  >
                    <CompositeFill friendIds={r.friendIds} seed={day * 31 + i} ctx={ctx} boost={2} />
                  </div>
                ))}
              </div>
            </div>
          )
        }}
      />
    )
  }

  return (
    <WeekShell
      renderDay={(day) => {
        const runs = runsFor(segmentsFor(availabilityFor(day, ids)))
        const mine = AVAILABILITY.filter((a) => a.day === day && a.friendId === VIEWER.id)
        return (
          <div className="absolute inset-0" style={{ height: COL_H }}>
            {runs.map((run, ri) => (
              <div
                key={ri}
                className="absolute left-0.5 right-0.5 overflow-hidden rounded-[6px] ring-1 ring-inset ring-black/5 dark:ring-white/10"
                style={{ top: yOf(run.start), height: Math.max(3, hOf(run.start, run.end) - 2) }}
              >
                {run.segments.map((s, i) => {
                  const top = yOf(s.start) - yOf(run.start)
                  const h = hOf(s.start, s.end)
                  const tf = i > 0 ? FADE : 0
                  const bf = i < run.segments.length - 1 ? FADE : 0
                  return (
                    <div
                      key={i}
                      className="absolute inset-x-0"
                      style={{
                        top: top - tf,
                        height: h + tf + bf,
                        maskImage: `linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgb(0,0,0) ${tf}px, rgb(0,0,0) calc(100% - ${bf}px), rgba(0,0,0,0) 100%)`,
                        WebkitMaskImage: `linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgb(0,0,0) ${tf}px, rgb(0,0,0) calc(100% - ${bf}px), rgba(0,0,0,0) 100%)`,
                      }}
                    >
                      <CompositeFill friendIds={s.friendIds} seed={day * 97 + ri * 7 + i} ctx={ctx} />
                    </div>
                  )
                })}
              </div>
            ))}

            {showViewer &&
              mine.map((a, i) => (
                <div
                  key={i}
                  className="pointer-events-none absolute left-0.5 rounded-[5px] shadow-sm ring-1 ring-inset ring-black/10 dark:ring-white/20"
                  style={{
                    top: yOf(a.start),
                    height: Math.max(3, hOf(a.start, a.end) - 2),
                    right: 14,
                    background: hueToneColor(VIEWER.hue, VIEWER.tone, 0.92),
                  }}
                >
                  <span className="absolute left-1.5 top-1 text-[10px] font-medium text-white/90">
                    you
                  </span>
                </div>
              ))}

            {/* 30-minute hover targets, above everything. */}
            {Array.from({ length: SLOTS }, (_, s) => {
              const min = GRID_START + s * SLOT
              return (
                <div
                  key={s}
                  className="absolute inset-x-0 hover:bg-foreground/[0.06]"
                  style={{ top: s * ROW_H, height: ROW_H }}
                  onMouseEnter={(e) => {
                    const who = freeAt(day, min, ids)
                    onHover(
                      who.length
                        ? hoverFrom(
                            e.currentTarget,
                            who,
                            `${fmt(min)}–${fmt(min + SLOT)}`,
                            `${who.length} free · hovered a 30-min SLOT`,
                          )
                        : null,
                    )
                  }}
                  onMouseLeave={() => onHover(null)}
                />
              )
            })}
          </div>
        )
      }}
    />
  )
}
