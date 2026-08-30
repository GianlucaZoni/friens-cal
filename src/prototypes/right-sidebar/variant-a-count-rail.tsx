/**
 * PROTOTYPE — ticket 16, variant A: "count rail".
 * THROWAWAY.
 *
 * The count is the primary sort key, so it is given a dedicated rail on the
 * left and set at display size. Date and time are the headline beside it;
 * blobatars are a demoted third row. Default border technique: full ring.
 */
import { PinIcon, PencilLineIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Affordances,
  BlobRow,
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

export const CandidateCardA = ({
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
    <ColourBorder hues={hues} glow={glow} chrome={chrome} className="group/card">
      <div className="flex items-stretch">
        <div className="flex w-14 shrink-0 flex-col items-center justify-center gap-0 border-r border-border/60 px-1 py-2.5">
          {/*
            Ticket 09 says the word goes "in place of the count". Built, it
            breaks the one thing the rail exists for — a numeral column you can
            run your eye down — so the word replaces the *label* instead.
          */}
          <span className="text-xl leading-none font-semibold tabular-nums">{count}</span>
          <span
            className={
              everyone
                ? 'text-[9.5px] font-semibold tracking-tight'
                : 'text-[10px] text-muted-foreground'
            }
          >
            {everyone ? 'everyone' : 'free'}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-2.5 py-2">
          <div className="flex items-start gap-1">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] leading-tight font-medium">
                {dayLabel(candidate.start, now)} · {timeRange(candidate.start, candidate.end, now)}
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {duration(candidate.start, candidate.end)}
              </div>
            </div>
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
          <BlobRow ids={candidate.friendIds} size={22} />
        </div>
      </div>
    </ColourBorder>
  )
}

export const HangoutCardA = ({
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
    <div className="group/card relative border border-foreground/25 bg-muted/40">
      <div className="flex items-stretch">
        <div className="flex w-14 shrink-0 items-center justify-center border-r border-border/60">
          <PinIcon className="size-3.5 text-muted-foreground" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-2.5 py-2">
          <div className="flex items-start gap-1">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[13px] leading-tight font-semibold">
                  {hangout.title}
                </span>
                {hangout.edited && (
                  <PencilLineIcon
                    className="size-3 shrink-0 text-muted-foreground"
                    aria-label="retimed"
                  />
                )}
                {live && (
                  <span className="shrink-0 text-[10px] font-medium text-destructive">now</span>
                )}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {dayLabel(hangout.start, now)} · {timeRange(hangout.start, hangout.end, now)}
              </div>
            </div>
            <Affordances chrome={chrome}>
              {!mine && (
                <Button size="xs" variant="outline">
                  Join
                </Button>
              )}
              <HangoutMenu hangout={hangout} chrome={chrome} />
            </Affordances>
          </div>
          <BlobRow ids={hangout.participantIds} size={22} />
        </div>
      </div>
    </div>
  )
}
