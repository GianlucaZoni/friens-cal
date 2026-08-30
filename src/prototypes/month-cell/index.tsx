/**
 * PROTOTYPE — throwaway. Ticket 14: what a month cell shows.
 *
 * Ticket 05 proved the week composite does not survive being shrunk and handed
 * over two NON-composite candidates. Both are built here, at the real size, on
 * the same data, side by side:
 *
 *   A · blobatar dot row        — who is around, identity, no time
 *   B · peak numeral + wash     — how good is this day, no identity
 *   C · both, side by side      — the comparison the ticket asks for (default)
 *   D · the failure probes      — where each one actually breaks
 *
 * Everything is fake data in memory. No Supabase, no drag, no persistence.
 * `preview.html` in this folder is a zero-dependency twin of the same pixels.
 *
 * Colour follows ticket 11 (`oklch(L_theme, C_theme, hue)`) and ticket 15 (the
 * grid is a single-hue heatmap in the VIEWER's colour, opacity by count; your
 * own Availability is a border and a ring, not a fill). Both those decisions
 * are under pressure at this size — see the findings.
 */
import { uiColour } from './color'
import {
  DAYS,
  HANGOUTS,
  OTHERS,
  SLOTS_PER_DAY,
  VIEWER,
  fmtSlot,
  friendById,
  metricsFor,
  type DayMetrics,
} from './data'
import { DOTS_NAME, DotsBody, MIN_LEGIBLE_DOT, layoutDots } from './cell-dots'
import { CoverageStrip, NUMERAL_NAME, NumeralBody, NumeralWash } from './cell-numeral'
import {
  HangoutBlobs,
  HangoutBorder,
  HangoutMarker,
  MonthGrid,
  type CellRender,
  type WashRender,
} from './month-grid'
import {
  CELL_H,
  CELL_W,
  type Ctx,
  Face,
  Group,
  Note,
  type Overflow,
  type OwnMarker,
  Pill,
  PrototypeSwitcher,
  Section,
} from './pieces'
import { useCallback, useEffect, useState } from 'react'

const VARIANTS = ['A', 'B', 'C', 'D'] as const
const NAMES: Record<string, string> = {
  A: DOTS_NAME,
  B: NUMERAL_NAME,
  C: 'both, side by side',
  D: 'where each one breaks',
}

/** Above this many Friends, `overflow: 'fallback'` gives up and prints a number. */
const FALLBACK_THRESHOLD = 5

// ---------------------------------------------------------------------------

const dotsBody =
  (): CellRender =>
  ({ m, ctx, w, h, visibleIds }) => {
    if (ctx.overflow === 'fallback' && m.anyone.length > FALLBACK_THRESHOLD) {
      return <NumeralBody m={m} w={w} h={h} />
    }
    return <DotsBody m={m} visibleIds={visibleIds} ctx={ctx} w={w} h={h} />
  }

const numeralBody =
  (): CellRender =>
  ({ m, w, h }) => <NumeralBody m={m} w={w} h={h} />

const numeralWash =
  (): WashRender =>
  ({ m, ctx, visibleIds }) => (
    <>
      <NumeralWash m={m} visibleCount={visibleIds.length} ctx={ctx} />
      <CoverageStrip m={m} ctx={ctx} w={CELL_W} />
    </>
  )

// ---------------------------------------------------------------------------
// Probe 1 — the twin days. Same dot row, opposite meaning.
// ---------------------------------------------------------------------------

function TwinProbe({ visibleIds, ctx }: { visibleIds: number[]; ctx: Ctx }) {
  const a = metricsFor(5, visibleIds)
  const b = metricsFor(6, visibleIds)
  const Strip = ({ m, label }: { m: DayMetrics; label: string }) => (
    <div className="flex items-start gap-3">
      <div className="w-[190px] shrink-0">
        <div className="mb-1 text-[11px] font-medium">{label}</div>
        <div className="relative h-[24px] w-full overflow-hidden rounded-[4px] border border-border bg-muted/40">
          {m.perSlot.map((n, s) =>
            n > 0 ? (
              <span
                key={s}
                className="absolute top-0 bottom-0"
                style={{
                  left: `${(s / SLOTS_PER_DAY) * 100}%`,
                  width: `${100 / SLOTS_PER_DAY}%`,
                  background: uiColour(VIEWER.hue, ctx.dark, 0.15 + 0.75 * (n / Math.max(1, visibleIds.length))),
                }}
              />
            ) : null,
          )}
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground">
          peak {m.peak} · {m.anyone.length} with Availability · coverage{' '}
          {Math.round(m.coverage * 100)}%
        </div>
      </div>
      <div className="flex gap-3">
        <div>
          <div className="mb-1 text-[9px] tracking-wide text-muted-foreground uppercase">dots</div>
          <div
            className="relative overflow-hidden rounded-[5px] border border-border bg-card"
            style={{ width: CELL_W, height: CELL_H }}
          >
            <span className="absolute inset-x-[4px] top-[17px] bottom-[3px] flex items-center justify-center">
              <DotsBody m={m} visibleIds={visibleIds} ctx={ctx} w={CELL_W} h={CELL_H} />
            </span>
          </div>
        </div>
        <div>
          <div className="mb-1 text-[9px] tracking-wide text-muted-foreground uppercase">
            numeral
          </div>
          <div
            className="relative overflow-hidden rounded-[5px] border border-border bg-card"
            style={{ width: CELL_W, height: CELL_H }}
          >
            <NumeralWash m={m} visibleCount={visibleIds.length} ctx={ctx} />
            <CoverageStrip m={m} ctx={ctx} w={CELL_W} />
            <span className="absolute inset-x-[4px] top-[17px] bottom-[3px] flex items-center justify-center">
              <NumeralBody m={m} w={CELL_W} h={CELL_H} />
            </span>
          </div>
        </div>
      </div>
    </div>
  )
  return (
    <div className="flex flex-col gap-4">
      <Strip m={a} label="Sat 5 — everyone free, nobody together" />
      <Strip m={b} label="Sun 6 — everyone free, all at once" />
      <Note>
        The same {visibleIds.length} Friends have Availability on both days. On the 5th not one
        pair overlaps, so there is <strong>no Candidate at all</strong>; on the 6th they are all
        free in the same two hours. The dot rows are <strong>identical</strong>. The numeral is 1
        versus {b.peak}. A dot row does not answer the question the month view is asked.
      </Note>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Probe 2 — the edge is oversubscribed. Item 3.
// ---------------------------------------------------------------------------

function EdgeProbe({ visibleIds, ctx }: { visibleIds: number[]; ctx: Ctx }) {
  const m = metricsFor(12, visibleIds)
  const hangoutM = metricsFor(26, visibleIds)
  const cases: { label: string; own: OwnMarker; today: boolean; sel: boolean; hang: boolean }[] = [
    { label: 'plain', own: 'none', today: false, sel: false, hang: false },
    { label: 'yours (ring)', own: 'ring', today: false, sel: false, hang: false },
    { label: 'yours + today', own: 'ring', today: true, sel: false, hang: false },
    { label: 'yours + today + selected', own: 'ring', today: true, sel: true, hang: false },
    { label: '…+ Hangout glow', own: 'ring', today: true, sel: true, hang: true },
    { label: 'yours as underline', own: 'underline', today: true, sel: true, hang: true },
    { label: 'yours as date pill', own: 'datepill', today: false, sel: true, hang: true },
  ]
  return (
    <div className="flex flex-wrap gap-4">
      {cases.map((c) => {
        const mm = c.hang ? hangoutM : m
        const cc: Ctx = { ...ctx, own: c.own, hangout: c.hang ? 'blobs' : 'off' }
        return (
          <div key={c.label} className="w-[104px]">
            <div className="mb-1 h-8 text-[10px] leading-tight text-muted-foreground">{c.label}</div>
            <div
              className="relative overflow-visible rounded-[5px] border border-border bg-card"
              style={{ width: CELL_W, height: CELL_H }}
            >
              <NumeralWash m={mm} visibleCount={visibleIds.length} ctx={cc} />
              <span className="absolute inset-x-0 top-0 flex h-[17px] items-center px-[4px]">
                <span
                  className="text-[10px] leading-none font-medium tabular-nums"
                  style={
                    c.own === 'datepill' && mm.youFree
                      ? {
                          background: uiColour(VIEWER.hue, ctx.dark),
                          color: '#fff',
                          borderRadius: 999,
                          padding: '2px 4px',
                        }
                      : c.today
                        ? {
                            background: 'var(--foreground)',
                            color: 'var(--background)',
                            borderRadius: 999,
                            padding: '2px 4px',
                          }
                        : { color: 'var(--muted-foreground)' }
                  }
                >
                  {c.hang ? 26 : 12}
                </span>
              </span>
              <span className="absolute inset-x-[4px] top-[17px] bottom-[3px] flex items-center justify-center">
                <NumeralBody m={mm} w={CELL_W} h={CELL_H} />
              </span>
              {c.own === 'ring' && mm.youFree ? (
                <span
                  className="pointer-events-none absolute inset-0 rounded-[5px]"
                  style={{
                    boxShadow: `inset 0 0 0 2px ${uiColour(VIEWER.hue, ctx.dark)}, inset 0 0 0 4px ${uiColour(VIEWER.hue, ctx.dark, 0.28)}`,
                  }}
                />
              ) : null}
              {c.own === 'underline' && mm.youFree ? (
                <span
                  className="pointer-events-none absolute bottom-0 left-0 h-[3px]"
                  style={{
                    width: `${Math.max(12, mm.youFraction * 100)}%`,
                    background: uiColour(VIEWER.hue, ctx.dark),
                  }}
                />
              ) : null}
              {c.hang && mm.hangout ? (
                <>
                  <HangoutBorder participants={mm.hangout.participants} ctx={cc} />
                  <HangoutBlobs participants={mm.hangout.participants} ctx={cc} w={CELL_W} />
                </>
              ) : null}
              {c.sel ? (
                <span
                  className="pointer-events-none absolute inset-0"
                  style={{ boxShadow: 'inset 0 0 0 2px var(--ring)' }}
                />
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Probe 3 — the size ladder. Where does each language actually die.
// ---------------------------------------------------------------------------

const LADDER: [number, number, string][] = [
  [120, 104, 'desktop, roomy'],
  [96, 88, 'desktop, tight'],
  [CELL_W, CELL_H, 'the ticket’s 78×72'],
  [64, 58, 'small laptop'],
  [46, 44, 'mobile month'],
]

function LadderProbe({ visibleIds, ctx }: { visibleIds: number[]; ctx: Ctx }) {
  const m = metricsFor(12, visibleIds)
  return (
    <div className="flex items-end gap-5 overflow-x-auto pb-2">
      {LADDER.map(([w, h, label]) => {
        const { size } = layoutDots(m.anyone, w - 8, h - 20, ctx)
        return (
          <div key={label} className="shrink-0">
            <div className="mb-1 text-[10px] text-muted-foreground">
              {w}×{h} · {label}
            </div>
            <div className="flex gap-2">
              <div
                className="relative overflow-hidden rounded-[5px] border border-border bg-card"
                style={{ width: w, height: h }}
              >
                <span className="absolute inset-x-[4px] top-[17px] bottom-[3px] flex items-center justify-center">
                  <DotsBody m={m} visibleIds={visibleIds} ctx={ctx} w={w} h={h} />
                </span>
              </div>
              <div
                className="relative overflow-hidden rounded-[5px] border border-border bg-card"
                style={{ width: w, height: h }}
              >
                <NumeralWash m={m} visibleCount={visibleIds.length} ctx={ctx} />
                <CoverageStrip m={m} ctx={ctx} w={w} />
                <span className="absolute inset-x-[4px] top-[17px] bottom-[3px] flex items-center justify-center">
                  <NumeralBody m={m} w={w} h={h} />
                </span>
              </div>
            </div>
            <div
              className={`mt-1 text-[10px] ${size < MIN_LEGIBLE_DOT ? 'font-semibold text-red-500' : 'text-muted-foreground'}`}
            >
              dot {size}px
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Probe 4 — the Hangout paradox. Item 4.
// ---------------------------------------------------------------------------

function HangoutProbe({ visibleIds, ctx }: { visibleIds: number[]; ctx: Ctx }) {
  const withH = metricsFor(26, visibleIds)
  const h = HANGOUTS.find((x) => x.day === 26)!
  const long = HANGOUTS.find((x) => x.day === 9)!
  return (
    <div className="flex flex-wrap gap-6">
      {(['blobs', 'marker', 'off'] as const).map((mode) => (
        <div key={mode}>
          <div className="mb-1 text-[10px] text-muted-foreground">
            {mode === 'off' ? 'no Hangout treatment' : mode}
          </div>
          <div className="flex gap-3">
            {[
              { d: 26, m: withH, hh: h },
              { d: 9, m: metricsFor(9, visibleIds), hh: long },
            ].map(({ d, m, hh }) => (
              <div key={d}>
                <div
                  className="relative overflow-hidden rounded-[5px] border border-border bg-card"
                  style={{ width: CELL_W, height: CELL_H }}
                >
                  <NumeralWash m={m} visibleCount={visibleIds.length} ctx={ctx} />
                  <span className="absolute inset-x-[4px] top-[17px] bottom-[3px] flex items-center justify-center">
                    <NumeralBody m={m} w={CELL_W} h={CELL_H} />
                  </span>
                  {mode === 'marker' ? <HangoutMarker title={hh.title} /> : null}
                  {mode === 'blobs' ? (
                    <>
                      <HangoutBorder participants={hh.participants} ctx={ctx} />
                      <HangoutBlobs participants={hh.participants} ctx={ctx} w={CELL_W} />
                    </>
                  ) : null}
                </div>
                <div className="mt-1 w-[78px] text-[9px] leading-tight text-muted-foreground">
                  {hh.title} · {hh.participants.length}p
                  <br />
                  peak {m.peak} · underneath {metricsFor(d, visibleIds, true).peak}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <Note>
        Both days were among the best in the month before the Hangout landed on them. Ticket 09
        blanks a Hangout's slots for everyone, so the 26th's peak numeral reads{' '}
        <strong>{withH.peak}</strong> where the day underneath is{' '}
        <strong>{metricsFor(26, visibleIds, true).peak}</strong> — the cell says "nothing here"
        about the busiest day of the month. A Hangout marker is therefore{' '}
        <em>mandatory, not decorative</em>: without it, language B renders its own best day as
        blank. Note also that the dot row is <em>immune</em> to this — Availability still exists
        under a Hangout, so language A shows the same dots either way and never lies. And note
        the glow bleeding past the cell edge: month cells share borders, so it lands on the
        neighbours.
      </Note>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hover panel — item 5.
// ---------------------------------------------------------------------------

function HoverPanel({
  day,
  visibleIds,
  ctx,
  onClose,
}: {
  day: number
  visibleIds: number[]
  ctx: Ctx
  onClose: () => void
}) {
  const m = metricsFor(day, visibleIds)
  const peakSlot = m.perSlot.indexOf(m.peak)
  return (
    <div className="w-[240px] shrink-0 rounded-lg border border-border bg-card p-3 text-[11px]">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold">{DAYS[day].date} September</span>
        <button className="text-muted-foreground hover:text-foreground" onClick={onClose}>
          ✕
        </button>
      </div>
      {m.hangout ? (
        <div className="mb-2 rounded-md bg-muted p-2">
          <div className="font-medium">Hangout · {m.hangout.title}</div>
          <div className="text-muted-foreground">
            {fmtSlot(m.hangout.from)}–{fmtSlot(m.hangout.to)} · {m.hangout.participants.length}{' '}
            Participants
          </div>
        </div>
      ) : null}
      <div className="mb-2 text-muted-foreground">
        peak {m.peak} at {fmtSlot(Math.max(0, peakSlot))} · {Math.round(m.coverage * 100)}% of the
        day has 2+ free
      </div>
      <div className="flex flex-col gap-1.5">
        {m.anyone.length === 0 ? (
          <span className="text-muted-foreground">Nobody has drawn Availability.</span>
        ) : (
          m.anyone.map((id) => (
            <div key={id} className="flex items-center gap-2">
              <Face id={id} size={20} ctx={ctx} />
              <span>{friendById(id).name}</span>
              {m.atPeak.includes(id) ? (
                <span className="ml-auto text-[9px] text-muted-foreground">at peak</span>
              ) : null}
            </div>
          ))
        )}
      </div>
      <div className="mt-2 border-t border-border pt-2 text-[10px] text-muted-foreground">
        At 8 Friends this panel is ~{80 + 8 * 26}px tall and 240px wide — three month columns. It
        cannot sit beside the cell the way the week view's does.
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

export default function MonthCellPrototype() {
  const [variant, setVariant] = useState<string>(
    () => new URLSearchParams(window.location.search).get('variant')?.toUpperCase() ?? 'C',
  )
  const [dark, setDark] = useState(false)
  const [count, setCount] = useState(5)
  const [own, setOwn] = useState<OwnMarker>('ring')
  const [dotColour, setDotColour] = useState<'avatar' | 'ui'>('avatar')
  const [overflow, setOverflow] = useState<Overflow>('row')
  const [wash, setWash] = useState<'coverage' | 'peak'>('coverage')
  const [hangout, setHangout] = useState<'blobs' | 'marker' | 'off'>('marker')
  const [chrome, setChrome] = useState(true)
  const [selected, setSelected] = useState<number | null>(null)

  const change = useCallback((v: string) => {
    setVariant(v)
    const u = new URL(window.location.href)
    u.searchParams.set('variant', v)
    window.history.replaceState(null, '', u)
  }, [])

  useEffect(() => {
    if (!VARIANTS.includes(variant as (typeof VARIANTS)[number])) change('C')
  }, [variant, change])

  const ctx: Ctx = {
    dark,
    own,
    dotColour,
    overflow,
    wash,
    hangout,
    chrome,
    w: CELL_W,
    h: CELL_H,
  }
  const visibleIds = [VIEWER.id, ...OTHERS.slice(0, count - 1).map((f) => f.id)]

  const gridProps = {
    visibleIds,
    ctx,
    selected,
    onSelect: setSelected,
    w: CELL_W,
    h: CELL_H,
  }

  return (
    <div className={dark ? 'dark' : ''}>
      <div className="min-h-screen bg-background px-6 pt-5 pb-28 text-foreground">
        <div className="mx-auto max-w-[1500px]">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h1 className="text-sm font-semibold">Month cell — what a day shows</h1>
            <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
              PROTOTYPE · ticket 14 · throwaway · fake data
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-3">
              <Group label="friends">
                {[3, 5, 8].map((n) => (
                  <Pill key={n} on={count === n} onClick={() => setCount(n)}>
                    {n}
                  </Pill>
                ))}
              </Group>
              <Group label="yours">
                {(['ring', 'underline', 'datepill', 'corner', 'none'] as OwnMarker[]).map((o) => (
                  <Pill key={o} on={own === o} onClick={() => setOwn(o)}>
                    {o}
                  </Pill>
                ))}
              </Group>
              <Group label="dots">
                {(['avatar', 'ui'] as const).map((d) => (
                  <Pill key={d} on={dotColour === d} onClick={() => setDotColour(d)}>
                    {d}
                  </Pill>
                ))}
              </Group>
              <Group label="overflow">
                {(['row', 'plusN', 'wrap', 'lanes', 'fallback'] as Overflow[]).map((o) => (
                  <Pill key={o} on={overflow === o} onClick={() => setOverflow(o)}>
                    {o}
                  </Pill>
                ))}
              </Group>
              <Group label="wash">
                {(['coverage', 'peak'] as const).map((x) => (
                  <Pill key={x} on={wash === x} onClick={() => setWash(x)}>
                    {x}
                  </Pill>
                ))}
              </Group>
              <Group label="hangout">
                {(['blobs', 'marker', 'off'] as const).map((x) => (
                  <Pill key={x} on={hangout === x} onClick={() => setHangout(x)}>
                    {x}
                  </Pill>
                ))}
              </Group>
              <Group label="chrome">
                <Pill on={chrome} onClick={() => setChrome((v) => !v)}>
                  today+sel
                </Pill>
              </Group>
              <Group label="theme">
                <Pill on={!dark} onClick={() => setDark(false)}>
                  light
                </Pill>
                <Pill on={dark} onClick={() => setDark(true)}>
                  dark
                </Pill>
              </Group>
            </div>
          </div>

          {variant === 'A' ? (
            <Section title="A · blobatar dot row — who is around this month">
              <div className="flex items-start gap-5">
                <MonthGrid {...gridProps} label="A · dots" renderBody={dotsBody()} />
                {selected !== null ? (
                  <HoverPanel
                    day={selected}
                    visibleIds={visibleIds}
                    ctx={ctx}
                    onClose={() => setSelected(null)}
                  />
                ) : null}
              </div>
              <Note>
                Identity is preserved and time is thrown away entirely. Compare the 5th and the
                6th (variant D, first probe): identical rows, opposite days. Switch{' '}
                <code>friends</code> to 8 and watch the dot size in the red badge.
              </Note>
            </Section>
          ) : null}

          {variant === 'B' ? (
            <Section title="B · peak numeral over a density wash — where the good days are">
              <div className="flex items-start gap-5">
                <MonthGrid
                  {...gridProps}
                  label="B · numeral"
                  renderBody={numeralBody()}
                  renderWash={numeralWash()}
                />
                {selected !== null ? (
                  <HoverPanel
                    day={selected}
                    visibleIds={visibleIds}
                    ctx={ctx}
                    onClose={() => setSelected(null)}
                  />
                ) : null}
              </div>
              <Note>
                The numeral is O(1) in Friends — 8 renders exactly as well as 3. The wash is the
                viewer's own hue at ticket 15's ramp. Flip <code>wash</code> between{' '}
                <code>coverage</code> and <code>peak</code>: only one of the two agrees with what
                opacity means in the week grid.
              </Note>
            </Section>
          ) : null}

          {variant === 'C' ? (
            <Section title="C · the same month, both languages, same data">
              <div className="flex flex-wrap items-start gap-6">
                <MonthGrid {...gridProps} label="A · dots" renderBody={dotsBody()} />
                <MonthGrid
                  {...gridProps}
                  label="B · numeral + wash"
                  renderBody={numeralBody()}
                  renderWash={numeralWash()}
                />
                {selected !== null ? (
                  <HoverPanel
                    day={selected}
                    visibleIds={visibleIds}
                    ctx={ctx}
                    onClose={() => setSelected(null)}
                  />
                ) : null}
              </div>
              <Note>
                Scan each grid for "when should we do something". In B the answer is a number you
                read without stopping. In A you have to count dots, and counting dots gives you the
                wrong answer, because a dot means "has Availability today", not "is free at the
                same time as anyone else".
              </Note>
            </Section>
          ) : null}

          {variant === 'D' ? (
            <>
              <Section title="D1 · the twin days — the dot row's blind spot">
                <TwinProbe visibleIds={visibleIds} ctx={ctx} />
              </Section>
              <Section title="D2 · the edge is already spoken for — item 3">
                <EdgeProbe visibleIds={visibleIds} ctx={ctx} />
                <Note>
                  Ticket 15 paid for "your own Availability" with a border and a ring because a
                  week column's edge was free. A month cell's edge carries the grid rule, today,
                  the selected day and a Hangout's glow. By the fifth card there are four
                  concentric rings on a 78×72 box and none of them is readable. The occlusion
                  problem does not recur — <em>ticket 15's fix does not transfer</em>.
                </Note>
              </Section>
              <Section title="D3 · the size ladder — where each language dies">
                <LadderProbe visibleIds={visibleIds} ctx={ctx} />
              </Section>
              <Section title="D4 · Hangouts in a cell — item 4">
                <HangoutProbe visibleIds={visibleIds} ctx={ctx} />
              </Section>
            </>
          ) : null}

          <Section title="Who is in this month">
            <div className="flex flex-wrap gap-4">
              {visibleIds.map((id) => {
                const f = friendById(id)
                return (
                  <div key={id} className="flex items-center gap-2 text-[11px]">
                    <Face id={id} size={26} ctx={ctx} />
                    <div>
                      <div className="font-medium">{f.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        hue {f.hue} · {f.note ?? 'viewer'}
                      </div>
                    </div>
                    <span
                      className="size-4 rounded-full"
                      style={{ background: uiColour(f.hue, dark) }}
                      title="ticket 11 UI colour — oklch(L_theme, C_theme, hue)"
                    />
                  </div>
                )
              })}
            </div>
            <Note>
              The small square is the ticket 11 <em>UI</em> colour; the blobatar is the{' '}
              <em>avatar</em>. They share hue and differ in lightness, which ticket 11 accepted.
              Giulia (262) and Luca (268) are the deliberate near-collision; Elena is{' '}
              <code>pale neutral</code> and Teo is <code>ink</code>.
            </Note>
          </Section>
        </div>

        {!import.meta.env.PROD ? (
          <PrototypeSwitcher
            variants={[...VARIANTS]}
            current={variant}
            name={NAMES[variant] ?? ''}
            onChange={change}
          />
        ) : null}
      </div>
    </div>
  )
}
