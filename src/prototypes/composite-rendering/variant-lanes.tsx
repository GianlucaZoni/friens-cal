/**
 * PROTOTYPE — variant C: LANES (the control).
 *
 * No compositing at all. Each visible Friend gets a sliver lane inside the day
 * column and their Availability is drawn flat in their own colour. Here to show
 * what the mesh gradient is actually buying: this is unambiguous and ugly, and
 * it collapses the moment there are 8 Friends and a narrow column.
 * Hover target = one Friend's range.
 */
import { hueToneColor } from './color'
import { AVAILABILITY, VIEWER, availabilityFor, fmt, friendById } from './data'
import { COL_H, MonthShell, WeekShell, hOf, yOf } from './grid'
import { StubBlob, col, hoverFrom, type VariantProps } from './pieces'

export const LANES_NAME = 'Lanes — no compositing (control)'

export const VariantLanes = ({ ids, showViewer, ctx, onHover, mode }: VariantProps) => {
  if (mode === 'month') {
    return (
      <MonthShell
        renderCell={(day) => {
          const free = [...new Set(availabilityFor(day, ids).map((a) => a.friendId))].sort(
            (a, b) => a - b,
          )
          if (free.length === 0) return null
          return (
            <div
              className="absolute inset-x-1 bottom-1 flex flex-wrap content-end gap-0.5"
              onMouseEnter={(e) =>
                onHover(hoverFrom(e.currentTarget, free, 'Day', `${free.length} Friends free`))
              }
              onMouseLeave={() => onHover(null)}
            >
              {free.map((id) => (
                <StubBlob key={id} id={id} size={14} ctx={ctx} />
              ))}
            </div>
          )
        }}
      />
    )
  }

  const lanes = showViewer ? [VIEWER.id, ...ids] : ids
  return (
    <WeekShell
      renderDay={(day) => (
        <div className="absolute inset-0" style={{ height: COL_H }}>
          {lanes.map((id, li) => {
            const f = friendById(id)
            const w = 100 / lanes.length
            const isViewer = id === VIEWER.id
            return AVAILABILITY.filter((a) => a.day === day && a.friendId === id).map((a, i) => (
              <div
                key={`${id}-${i}`}
                className="absolute rounded-[3px]"
                style={{
                  left: `calc(${li * w}% + 1px)`,
                  width: `calc(${w}% - 2px)`,
                  top: yOf(a.start),
                  height: Math.max(3, hOf(a.start, a.end) - 2),
                  background: isViewer
                    ? hueToneColor(f.hue, f.tone, 0.95)
                    : col(f, 0.62, ctx),
                  outline: isViewer ? '1px solid rgba(0,0,0,.25)' : undefined,
                }}
                onMouseEnter={(e) =>
                  onHover(
                    hoverFrom(
                      e.currentTarget,
                      [id],
                      `${f.name} ${fmt(a.start)}–${fmt(a.end)}`,
                      'hovered ONE Friend’s range',
                    ),
                  )
                }
                onMouseLeave={() => onHover(null)}
              />
            ))
          })}
        </div>
      )}
    />
  )
}
