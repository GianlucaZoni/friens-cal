/**
 * PROTOTYPE — ticket 16, variant B: "avatar-led".
 * THROWAWAY.
 *
 * The opposite bet from A: the blobatars are the headline, at a size where you
 * can actually tell the shapes apart, and the count is written out in a
 * sentence under them ("4 of 6 free" / "everyone's free"). Time is the second
 * line. Default border technique: a top ribbon, no ring.
 */
import { PencilLineIcon } from 'lucide-react'
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
  GROUP_SIZE,
  isEveryone,
  nameList,
  timeRange,
  VIEWER_ID,
  type Candidate,
  type Hangout,
} from './data'

export const CandidateCardB = ({
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
  const hues = candidate.friendIds.map((id) => friendById(id).hue)

  return (
    <ColourBorder hues={hues} glow={glow} chrome={chrome} className="group/card">
      <div className="flex flex-col gap-2 px-2.5 pt-3 pb-2.5">
        <div className="flex items-start gap-2">
          <BlobRow ids={candidate.friendIds} size={28} />
          <div className="ml-auto">
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
        </div>

        <div>
          <div className="text-[13px] leading-tight font-medium">
            {isEveryone(count) ? 'Everyone’s free' : `${count} of ${GROUP_SIZE} free`}
          </div>
          <div className="truncate text-[12px] text-muted-foreground">
            {dayLabel(candidate.start, now)} · {timeRange(candidate.start, candidate.end, now)}
            <span className="tabular-nums"> · {duration(candidate.start, candidate.end)}</span>
          </div>
        </div>
      </div>
    </ColourBorder>
  )
}

export const HangoutCardB = ({
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
    <div className="group/card relative border border-foreground/25 bg-muted/40 px-2.5 pt-3 pb-2.5">
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <BlobRow ids={hangout.participantIds} size={28} />
          <div className="ml-auto">
            <Affordances chrome={chrome}>
              {!mine && (
                <Button size="xs" variant="outline">
                  Join
                </Button>
              )}
              <HangoutMenu hangout={hangout} chrome={chrome} />
            </Affordances>
          </div>
        </div>
        <div>
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
            {live && <span className="text-[10px] font-medium text-destructive">now</span>}
          </div>
          <div className="truncate text-[12px] text-muted-foreground">
            {dayLabel(hangout.start, now)} · {timeRange(hangout.start, hangout.end, now)}
          </div>
          <div className="truncate text-[11px] text-muted-foreground/80">
            {nameList(hangout.participantIds)}
          </div>
        </div>
      </div>
    </div>
  )
}
