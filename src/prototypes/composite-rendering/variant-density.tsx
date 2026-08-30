/**
 * PROTOTYPE — variant D: DENSITY + SPINE.
 *
 * The block body carries NO hue: it is a neutral ramp keyed to how many Friends
 * are free. Identity moves to a 5px "spine" of colour ticks on the left edge,
 * and to hover. Built because at 6-8 Friends the mesh gradient stops encoding
 * anything a human can decode — this is the honest fallback.
 * Hover target = the 30-minute slot.
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
  friendById,
  segmentsFor,
} from './data'
import { COL_H, MonthShell, ROW_H, WeekShell, hOf, yOf } from './grid'
import { col, hoverFrom, type VariantProps } from './pieces'

export const DENSITY_NAME = 'Density ramp + colour spine'

const friendLite = (id: number) => friendById(id)

const density = (n: number, total: number, dark: boolean) => {
  const a = 0.1 + 0.62 * (total <= 1 ? 1 : (n - 1) / (total - 1))
  return dark ? `oklch(0.82 0.03 265 / ${a})` : `oklch(0.48 0.04 265 / ${a})`
}

export const VariantDensity = ({ ids, showViewer, ctx, onHover, mode }: VariantProps) => {
  if (mode === 'month') {
    return (
      <MonthShell
        renderCell={(day) => {
          const segs = segmentsFor(availabilityFor(day, ids))
          if (segs.length === 0) return null
          const peak = Math.max(...segs.map((s) => s.friendIds.length))
          const best = segs.find((s) => s.friendIds.length === peak)!
          const scale = (m: number) => ((m - GRID_START) / (GRID_END - GRID_START)) * 100
          return (
            <div
              className="absolute inset-0"
              style={{ background: density(peak, ids.length, ctx.dark) }}
              onMouseEnter={(e) =>
                onHover(
                  hoverFrom(
                    e.currentTarget,
                    best.friendIds,
                    `Peak ${fmt(best.start)}–${fmt(best.end)}`,
                    `${peak} free at once`,
                  ),
                )
              }
              onMouseLeave={() => onHover(null)}
            >
              <div className="absolute left-1 top-1 text-[13px] font-semibold tabular-nums text-foreground/80">
                {peak}
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-2">
                {segs.map((s, i) => (
                  <div
                    key={i}
                    className="absolute bottom-0 flex flex-col-reverse"
                    style={{
                      left: `${scale(s.start)}%`,
                      width: `${Math.max(1.5, scale(s.end) - scale(s.start))}%`,
                      height: '100%',
                    }}
                  >
                    {s.friendIds.map((id) => (
                      <div
                        key={id}
                        className="w-full"
                        style={{
                          height: `${100 / Math.max(1, s.friendIds.length)}%`,
                          background: col(friendLite(id), 0.95, ctx),
                        }}
                      />
                    ))}
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
        const segs = segmentsFor(availabilityFor(day, ids))
        const mine = AVAILABILITY.filter((a) => a.day === day && a.friendId === VIEWER.id)
        return (
          <div className="absolute inset-0" style={{ height: COL_H }}>
            {segs.map((s, i) => (
              <div
                key={i}
                className="absolute left-0.5 right-0.5 overflow-hidden rounded-[5px] ring-1 ring-inset ring-black/5 dark:ring-white/10"
                style={{
                  top: yOf(s.start),
                  height: Math.max(3, hOf(s.start, s.end) - 2),
                  background: density(s.friendIds.length, ids.length, ctx.dark),
                }}
              >
                <div className="absolute inset-y-0 left-0 flex w-[5px] flex-col">
                  {s.friendIds.map((id) => (
                    <div
                      key={id}
                      className="w-full"
                      style={{
                        height: `${100 / s.friendIds.length}%`,
                        background: col(friendLite(id), 0.95, ctx),
                      }}
                    />
                  ))}
                </div>
                {hOf(s.start, s.end) > 26 && (
                  <span className="absolute right-1.5 top-1 text-[10px] font-medium tabular-nums text-foreground/55">
                    {s.friendIds.length}
                  </span>
                )}
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
