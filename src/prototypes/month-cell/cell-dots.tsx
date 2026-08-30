/**
 * PROTOTYPE — throwaway. Ticket 14, candidate language A: THE BLOBATAR DOT ROW.
 *
 * "Who is around that day", identity preserved, no time information at all.
 *
 * Everything here is geometry under pressure. The cell is 78×72; the date
 * numeral takes the top ~17px; the dots get a 70×48 box. What fits in that box
 * is the entire argument, so the five overflow strategies are all real and all
 * switchable — the ticket's item 2 is not a preference question, it is a
 * measurement.
 */
import { Dot, type Ctx } from './pieces'
import { friendById, type DayMetrics } from './data'

export const DOTS_NAME = 'blobatar dot row'

const GAP = 2
const MAX_DOT = 18
/** Below this, a blobatar stops being a face and becomes a coloured pixel. */
export const MIN_LEGIBLE_DOT = 12

type Layout = { size: number; rows: number[][]; plus: number; lanes: boolean }

/**
 * The whole of language A's fate, in one function.
 *
 * `innerW` is what is left of the cell after padding; `innerH` after the date
 * numeral. Note how little the strategies actually differ in *outcome* at 8
 * Friends — that is the finding, not the code.
 */
export function layoutDots(ids: number[], innerW: number, innerH: number, ctx: Ctx): Layout {
  const n = ids.length
  if (n === 0) return { size: 0, rows: [], plus: 0, lanes: false }

  const fitRow = (k: number) => Math.floor((innerW - (k - 1) * GAP) / k)

  if (ctx.overflow === 'lanes') {
    // One fixed lane per *visible Friend*, always in the same place, whether or
    // not they are free. Position is stable down a column; the cost is that the
    // lane width is set by the group, not by the day.
    const size = Math.min(MAX_DOT, fitRow(n))
    return { size, rows: [ids], plus: 0, lanes: true }
  }

  if (ctx.overflow === 'wrap') {
    const rows = n <= 4 ? 1 : n <= 8 ? 2 : 3
    const per = Math.ceil(n / rows)
    const size = Math.min(MAX_DOT, fitRow(per), Math.floor((innerH - (rows - 1) * GAP) / rows))
    const out: number[][] = []
    for (let i = 0; i < n; i += per) out.push(ids.slice(i, i + per))
    return { size, rows: out, plus: 0, lanes: false }
  }

  if (ctx.overflow === 'plusN') {
    // Shrink until MIN_LEGIBLE_DOT, then truncate and spend one slot on a +N chip.
    if (fitRow(n) >= MIN_LEGIBLE_DOT) {
      return { size: Math.min(MAX_DOT, fitRow(n)), rows: [ids], plus: 0, lanes: false }
    }
    let shown = n - 1
    while (shown > 1 && fitRow(shown + 1) < MIN_LEGIBLE_DOT) shown--
    return {
      size: Math.min(MAX_DOT, fitRow(shown + 1)),
      rows: [ids.slice(0, shown)],
      plus: n - shown,
      lanes: false,
    }
  }

  // 'row' — one row, shrink to whatever fits. No floor. This is the naive
  // reading of "a row of blobatar dots", and the one worth seeing fail.
  return { size: Math.min(MAX_DOT, fitRow(n)), rows: [ids], plus: 0, lanes: false }
}

export function DotsBody({
  m,
  visibleIds,
  ctx,
  w,
  h,
}: {
  m: DayMetrics
  visibleIds: number[]
  ctx: Ctx
  w: number
  h: number
}) {
  const innerW = w - 8
  const innerH = h - 20
  const ids = ctx.overflow === 'lanes' ? visibleIds : m.anyone

  if (m.anyone.length === 0) return null

  const { size, rows, plus, lanes } = layoutDots(ids, innerW, innerH, ctx)
  const dead = size < MIN_LEGIBLE_DOT

  return (
    <div
      className="flex flex-col items-center justify-center gap-[2px]"
      style={{ width: innerW, height: innerH }}
    >
      {rows.map((row, ri) => (
        <div key={ri} className="flex items-center" style={{ gap: GAP }}>
          {row.map((id) => {
            const free = m.anyone.includes(id)
            if (lanes && !free) {
              // A reserved, empty lane. The price of stable position.
              return (
                <span
                  key={id}
                  className="inline-block shrink-0 rounded-full border border-dashed border-border"
                  style={{ width: size, height: size, opacity: 0.45 }}
                />
              )
            }
            return <Dot key={id} id={id} size={size} ctx={ctx} />
          })}
          {ri === rows.length - 1 && plus > 0 ? (
            <span
              className="inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground tabular-nums"
              style={{ width: size, height: size, fontSize: Math.max(7, size * 0.55) }}
            >
              +{plus}
            </span>
          ) : null}
        </div>
      ))}
      {dead ? (
        // Not decoration — a marker so the failure is countable in a screenshot.
        <span
          className="pointer-events-none absolute right-[3px] bottom-[2px] rounded-[2px] bg-red-500/70 px-[2px] text-[7px] leading-[9px] font-bold text-white"
          title={`dot is ${size}px — below the ${MIN_LEGIBLE_DOT}px at which a blobatar shape reads`}
        >
          {size}
        </span>
      ) : null}
    </div>
  )
}

/**
 * What the dot row cannot say, said out loud. Used by the compare view.
 * Two days can carry an identical dot row and mean opposite things.
 */
export function dotRowSignature(m: DayMetrics) {
  return m.anyone.map((id) => friendById(id).name).join(',')
}
