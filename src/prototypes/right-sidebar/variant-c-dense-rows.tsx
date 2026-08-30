/**
 * PROTOTYPE — ticket 16, variant C: "dense rows".
 * THROWAWAY.
 *
 * No card chrome at all. The list is rows on hairlines, time-led, with the
 * count as a numeral on the right and the blobatars overlapped into a stack.
 * Built to test the long list: A and B are ~76px a card, this is ~44px, which
 * is the difference between seeing four Candidates and seeing eight.
 * Default border technique: the left stripe.
 */
import { PencilLineIcon, PinIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Affordances,
  BlobStack,
  CandidateMenu,
  ColourBorder,
  ConfirmTick,
  HangoutMenu,
  type Chrome,
} from './pieces'
import {
  dayLabel,
  duration,
  friendById,
  glows,
  isEveryone,
  timeRange,
  VIEWER_ID,
  type Candidate,
  type Hangout,
} from './data'

export const CandidateCardC = ({
  candidate,
  chrome,
  now,
}: {
  candidate: Candidate
  chrome: Chrome
  now: number
}) => {
  const count = candidate.friendIds.length
  const glow = glows(count)
  const everyone = isEveryone(count)
  const hues = candidate.friendIds.map((id) => friendById(id).hue)

  return (
    <ColourBorder
      hues={hues}
      glow={glow}
      chrome={chrome}
      className={cn('group/card border-x-0 border-t-0', glow && 'bg-muted/30')}
    >
      <div className="flex items-center gap-2 py-1.5 pr-1.5 pl-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] leading-tight font-medium">
            {dayLabel(candidate.start, now)} {timeRange(candidate.start, candidate.end, now)}
          </div>
          <div className="text-[11px] text-muted-foreground tabular-nums">
            {duration(candidate.start, candidate.end)}
            {everyone && ' · everyone'}
          </div>
        </div>

        <BlobStack ids={candidate.friendIds} size={22} cap={4} />

        {/* the numeral keeps its column; the word lives on the second line */}
        <span
          className={cn(
            'w-4 shrink-0 text-right text-[11px] tabular-nums',
            glow ? 'font-semibold' : 'text-muted-foreground',
          )}
        >
          {count}
        </span>

        <Affordances chrome={chrome}>
          <ConfirmTick chrome={chrome} />
          <CandidateMenu
            friendIds={candidate.friendIds}
            start={candidate.start}
            end={candidate.end}
            chrome={chrome}
          />
        </Affordances>
      </div>
    </ColourBorder>
  )
}

export const HangoutCardC = ({
  hangout,
  chrome,
  now,
}: {
  hangout: Hangout
  chrome: Chrome
  now: number
}) => {
  const live = hangout.start <= now && hangout.end > now
  const mine = hangout.participantIds.includes(VIEWER_ID)
  return (
    <div className="group/card flex items-center gap-2 border-b border-border bg-muted/40 py-1.5 pr-1.5 pl-1.5">
      <PinIcon className="size-3 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="truncate text-[12px] leading-tight font-semibold">{hangout.title}</span>
          {hangout.edited && (
            <PencilLineIcon className="size-3 shrink-0 text-muted-foreground" aria-label="retimed" />
          )}
          {live && <span className="text-[10px] font-medium text-destructive">now</span>}
        </div>
        <div className="truncate text-[11px] text-muted-foreground">
          {dayLabel(hangout.start, now)} {timeRange(hangout.start, hangout.end, now)}
        </div>
      </div>
      <BlobStack ids={hangout.participantIds} size={22} cap={4} />
      <Affordances chrome={chrome}>
        {!mine && (
          <Button size="xs" variant="outline">
            Join
          </Button>
        )}
        <HangoutMenu hangout={hangout} chrome={chrome} />
      </Affordances>
    </div>
  )
}
