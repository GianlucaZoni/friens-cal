import { busyMark, clashNaming, type Commitment } from '@/hangouts/elsewhere'
import { useViewerZone } from '@/shell/viewer-zone'
import { CalendarClock } from 'lucide-react'

/**
 * The double-booking mark, in its two sizes.
 *
 * Both draw **nothing** when nothing clashes, and that is the feature rather
 * than a guard: there is no green tick, no "no conflicts" and no
 * checked-and-fine anywhere in this product. A warning that covers only one of
 * the people involved is honest right up until somebody reads its absence as a
 * pass (planning ticket 09 §1).
 *
 * ## The colour it does not get
 *
 * **No new token, and not `--destructive`.** That one is already spoken for by
 * `hangout-card.tsx`, which paints a Hangout happening *now* with it — border,
 * text and a `now` pill — so borrowing it would put two unrelated red signals
 * on one card. There is no amber in the palette and inventing one for a single
 * mark on a deliberately non-blocking nicety is not worth a palette entry. A
 * `lucide` `CalendarClock` carries the weight instead of a hue;
 * `AlertTriangle` would overstate something that cannot stop you.
 *
 * ## And it renders on touch
 *
 * The tick and `Join?` hide under `@media (hover: none)` because they are
 * controls and ticket 16 puts every control in the detail on touch. This is
 * information, so it does not follow that rule.
 */

/**
 * The card's line: **the time, and nothing else**.
 *
 * A fourth line in the slot the container annotation already occupies, in the
 * same `text-[11px] text-muted-foreground` — the card is a 17rem column, and
 * §7 cut the naming here after measuring it rather than assuming it.
 */
export const BusyMark = ({ clashes }: { clashes: readonly Commitment[] }) => {
  const mark = busyMark(clashes, useViewerZone())
  if (mark === null) return null

  return (
    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
      <CalendarClock aria-hidden className="size-3 shrink-0" />
      {mark}
    </span>
  )
}

/**
 * The naming, for the surfaces with room for it: the Hangout, its cal, and
 * when.
 *
 * **Every one of them, never a count** — `drop-dialog.tsx`'s principle, which
 * is the one this can afford to honour: a count is a sentence with the
 * information taken out. Two cals can each hold a 20:00 Hangout you are on, so
 * a third cal's Candidate can collide with both, and the card's *"and 1 other"*
 * is the compromise a narrow column forces rather than the thing anybody wants.
 *
 * It names the other cal, which §7 settled: the person reading this is the
 * person who is in both, and *"you are already busy then"* sends them hunting
 * through their own cals to find out whether it even matters.
 */
export const BusyElsewhere = ({ clashes }: { clashes: readonly Commitment[] }) => {
  const zone = useViewerZone()
  if (clashes.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5 border border-foreground/15 bg-muted p-2.5 text-[11px]">
      <span className="flex items-center gap-1 font-medium">
        <CalendarClock aria-hidden className="size-3 shrink-0" />
        {clashes.length === 1
          ? 'That clashes with a plan of your own:'
          : 'That clashes with plans of your own:'}
      </span>
      <ul className="flex flex-col gap-1">
        {clashes.map((clash) => {
          const { what, when } = clashNaming(clash, zone)
          return (
            <li key={clash.hangoutId} className="flex flex-col">
              <span>{what}</span>
              <span className="text-muted-foreground tabular-nums">{when}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
