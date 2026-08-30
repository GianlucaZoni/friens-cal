/**
 * PROTOTYPE — variant A: SEGMENTED.
 *
 * One rendered block per maximal interval where the SET of free Friends is
 * constant. Marco 18:00-22:00 + Sara 20:00-23:00 becomes three blocks with hard
 * edges at 20:00 and 22:00. Hover target = the block (a segment).
 */
import { hueToneColor } from './color'
import {
  AVAILABILITY,
  GRID_END,
  GRID_START,
  VIEWER,
  availabilityFor,
  fmt,
  friendById,
  segmentsFor,
} from './data'
import { COL_H, MonthShell, WeekShell, hOf, yOf } from './grid'
import { CompositeFill, StubBlob, hoverFrom, type VariantProps } from './pieces'

export const SEGMENTED_NAME = 'Segmented — one block per change of set'

export const VariantSegmented = ({ ids, showViewer, ctx, onHover, mode }: VariantProps) => {
  if (mode === 'month') {
    const scale = (min: number) => ((min - GRID_START) / (GRID_END - GRID_START)) * 80
    return (
      <MonthShell
        renderCell={(day) => {
          const segs = segmentsFor(availabilityFor(day, ids))
          return (
            <>
              {segs.map((s, i) => (
                <div
                  key={i}
                  className="absolute left-0.5 right-0.5"
                  style={{ top: scale(s.start), height: Math.max(2, scale(s.end) - scale(s.start) - 1) }}
                  onMouseEnter={(e) =>
                    onHover(
                      hoverFrom(
                        e.currentTarget,
                        s.friendIds,
                        `${fmt(s.start)}–${fmt(s.end)}`,
                        `${s.friendIds.length} Friends free · segment`,
                      ),
                    )
                  }
                  onMouseLeave={() => onHover(null)}
                >
                  <CompositeFill friendIds={s.friendIds} seed={day * 97 + i} ctx={ctx} />
                </div>
              ))}
            </>
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
                className="absolute left-0.5 right-0.5 rounded-[5px] ring-1 ring-inset ring-black/5 transition-[filter] hover:brightness-105 dark:ring-white/10"
                style={{ top: yOf(s.start), height: Math.max(3, hOf(s.start, s.end) - 2) }}
                onMouseEnter={(e) =>
                  onHover(
                    hoverFrom(
                      e.currentTarget,
                      s.friendIds,
                      `${fmt(s.start)}–${fmt(s.end)}`,
                      `${s.friendIds.length} free · hovered a SEGMENT`,
                    ),
                  )
                }
                onMouseLeave={() => onHover(null)}
              >
                <CompositeFill friendIds={s.friendIds} seed={day * 97 + i} ctx={ctx} />
              </div>
            ))}

            {showViewer &&
              mine.map((a, i) => (
                <div
                  key={i}
                  className="pointer-events-none absolute left-0.5 rounded-[5px] shadow-sm ring-1 ring-inset ring-black/10 dark:ring-white/20"
                  // 12px rail on the right keeps the composite below visible —
                  // otherwise your own solid block hides exactly the answer you
                  // came for (who else is free while you are).
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
          </div>
        )
      }}
    />
  )
}

export const FriendLegend = ({ ids, ctx }: { ids: number[]; ctx: VariantProps['ctx'] }) => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
    {[VIEWER.id, ...ids].map((id) => (
      <div key={id} className="flex items-center gap-1.5">
        <StubBlob id={id} size={22} ctx={ctx} />
        <div className="leading-tight">
          <div className="text-[11px] text-foreground">{friendById(id).name}</div>
          <div className="text-[9px] text-muted-foreground">
            h{friendById(id).hue} · t{friendById(id).tone}
          </div>
        </div>
      </div>
    ))}
  </div>
)
