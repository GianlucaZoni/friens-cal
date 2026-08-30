/**
 * PROTOTYPE — ticket 16. THROWAWAY.
 *
 * The parts every variant shares: the colour border, the blobatar groups, the
 * hover/touch affordances, the 3-dots menu, and the two dialogs ticket 08 makes
 * mandatory. Variants disagree about layout, not about these.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  CalendarClockIcon,
  CheckIcon,
  LogOutIcon,
  MoreHorizontalIcon,
  Trash2Icon,
  UserPlusIcon,
} from 'lucide-react'
import { Blobatar } from '@/components/ui/blobatar'
import {
  idle, happy, sad, surprised, wink,
  sleepy, smug, unsure, scared, thinking,
} from 'blobatar/expression'

/**
 * The ten non-tinting poses (ticket 11 excludes `mad`, `love`, `shy`, `sick`).
 * The React prop is typed `Expression`, an object — over HTTP it would be a
 * plain string, which is the trap two prototypes hit independently.
 */
const POSES = {
  idle, happy, sad, surprised, wink,
  sleepy, smug, unsure, scared, thinking,
}
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { friendColor, friendColorMuted, hardStops, ringSegments } from './color'
import type { BorderTechnique, Theme } from './color'
import {
  duration,
  friendById,
  hhmm,
  nameList,
  timeRange,
  VIEWER_ID,
  type Hangout,
} from './data'

export type Chrome = {
  theme: Theme
  technique: BorderTechnique
  /** false = colour only ever appears on a glowing card. */
  colourEveryCard: boolean
  /** ticket 10: no hover on touch. Forces the persistent affordance route. */
  touch: boolean
  /** The thing ticket 16 item 4 asks: is the force-write a popover at all? */
  retimeSurface: 'popover' | 'dialog'
}

/* ------------------------------------------------------------------ *
 * The colour border.
 * ------------------------------------------------------------------ */

export const ColourBorder = ({
  hues,
  glow,
  chrome,
  className,
  children,
}: {
  hues: number[]
  glow: boolean
  chrome: Chrome
  className?: string
  children: ReactNode
}) => {
  const on = glow || chrome.colourEveryCard
  const colors = hues.map((h) =>
    glow ? friendColor(h, chrome.theme) : friendColorMuted(h, chrome.theme, 0.5),
  )

  if (!on) {
    return (
      <div className={cn('relative border border-border bg-card', className)}>{children}</div>
    )
  }

  if (chrome.technique === 'bar') {
    return (
      <div className={cn('relative border border-border bg-card', className)}>
        <div
          aria-hidden
          className="absolute inset-x-0 top-0"
          style={{
            height: glow ? 4 : 3,
            backgroundImage: hardStops(colors, 'to right'),
            boxShadow: glow ? `0 0 10px -1px ${colors[0]}` : undefined,
          }}
        />
        {children}
      </div>
    )
  }

  if (chrome.technique === 'stripe') {
    return (
      <div className={cn('relative border border-border bg-card', className)}>
        <div
          aria-hidden
          className="absolute inset-y-0 left-0"
          style={{
            width: glow ? 5 : 3,
            backgroundImage: hardStops(colors, 'to bottom'),
            boxShadow: glow ? `0 0 10px -1px ${colors[0]}` : undefined,
          }}
        />
        {children}
      </div>
    )
  }

  const segments = ringSegments(colors)
  const w = glow ? 2 : 1.25
  return (
    <div className={cn('relative bg-card', className)}>
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full overflow-visible"
        preserveAspectRatio="none"
      >
        {glow && (
          <g style={{ filter: 'blur(5px)', opacity: 0.55 }}>
            {segments.map((s, i) => (
              <rect
                key={`g${i}`}
                x={w}
                y={w}
                width={`calc(100% - ${w * 2}px)`}
                height={`calc(100% - ${w * 2}px)`}
                pathLength={100}
                fill="none"
                stroke={s.color}
                strokeWidth={w * 2}
                strokeDasharray={s.dash}
                strokeDashoffset={s.offset}
              />
            ))}
          </g>
        )}
        {segments.map((s, i) => (
          <rect
            key={i}
            x={w / 2}
            y={w / 2}
            width={`calc(100% - ${w}px)`}
            height={`calc(100% - ${w}px)`}
            pathLength={100}
            fill="none"
            stroke={s.color}
            strokeWidth={w}
            strokeDasharray={s.dash}
            strokeDashoffset={s.offset}
          />
        ))}
      </svg>
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Blobatars.
 * ------------------------------------------------------------------ */

export const Blob = ({ id, size = 24 }: { id: string; size?: number }) => {
  const f = friendById(id)
  return (
    <Blobatar
      name={f.seed}
      style={{ width: size, height: size }}
      className="ring-1 ring-border"
      blobatar={{
        hue: f.hue,
        expression: POSES[f.expression as keyof typeof POSES] ?? idle,
        title: f.name,
      }}
    />
  )
}

export const BlobRow = ({ ids, size = 24 }: { ids: string[]; size?: number }) => (
  <div className="flex flex-wrap items-center gap-1">
    {ids.map((id) => (
      <Blob key={id} id={id} size={size} />
    ))}
  </div>
)

/** Overlapped, capped, with a +N. Compact — and past four you cannot read it. */
export const BlobStack = ({ ids, size = 22, cap = 4 }: { ids: string[]; size?: number; cap?: number }) => {
  const shown = ids.slice(0, cap)
  const rest = ids.length - shown.length
  return (
    <div className="flex items-center">
      {shown.map((id, i) => (
        <div key={id} style={{ marginLeft: i === 0 ? 0 : -size * 0.32, zIndex: 10 - i }}>
          <Blob id={id} size={size} />
        </div>
      ))}
      {rest > 0 && (
        <span className="ml-1 text-[11px] text-muted-foreground tabular-nums">+{rest}</span>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Hover affordances, with the non-hover route ticket 10 will require.
 *
 * `touch` makes them permanent instead of hover-revealed; `focus-within`
 * covers keyboard in both modes. Nothing is *only* reachable by hovering.
 * ------------------------------------------------------------------ */

export const Affordances = ({
  chrome,
  children,
}: {
  chrome: Chrome
  children: ReactNode
}) => (
  <div
    className={cn(
      'flex items-center gap-0.5 transition-opacity',
      chrome.touch
        ? 'opacity-100'
        : 'opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100',
    )}
  >
    {children}
  </div>
)

export const ConfirmTick = ({ chrome, label = 'Confirm' }: { chrome: Chrome; label?: string }) =>
  chrome.touch ? (
    <Button size="xs" variant="outline">
      <CheckIcon data-icon="inline-start" />
      {label}
    </Button>
  ) : (
    <Button size="icon-sm" variant="ghost" aria-label={label}>
      <CheckIcon />
    </Button>
  )

/* ------------------------------------------------------------------ *
 * The 3-dots menu.
 * ------------------------------------------------------------------ */

export const CandidateMenu = ({
  friendIds,
  start,
  end,
  chrome,
}: {
  friendIds: string[]
  start: number
  end: number
  chrome: Chrome
}) => {
  const [retime, setRetime] = useState(false)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button size="icon-sm" variant="ghost" aria-label="More" />}
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuGroup>
            <DropdownMenuItem>
              <CheckIcon />
              Confirm as a hangout
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setRetime(true)}>
              <CalendarClockIcon />
              Confirm at another time…
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <RetimeSurface
        open={retime}
        onOpenChange={setRetime}
        title="Confirm at another time"
        friendIds={friendIds}
        start={start}
        end={end}
        chrome={chrome}
      />
    </>
  )
}

export const HangoutMenu = ({ hangout, chrome }: { hangout: Hangout; chrome: Chrome }) => {
  const [retime, setRetime] = useState(false)
  const [cancel, setCancel] = useState(false)
  const isParticipant = hangout.participantIds.includes(VIEWER_ID)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button size="icon-sm" variant="ghost" aria-label="More" />}
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setRetime(true)}>
              <CalendarClockIcon />
              Change the time…
            </DropdownMenuItem>
            {isParticipant ? (
              <DropdownMenuItem>
                <LogOutIcon />
                Leave
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem>
                <UserPlusIcon />
                Join
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem variant="destructive" onClick={() => setCancel(true)}>
              <Trash2Icon />
              Cancel this hangout…
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <RetimeSurface
        open={retime}
        onOpenChange={setRetime}
        title={`Move ${hangout.title}`}
        friendIds={hangout.participantIds}
        start={hangout.start}
        end={hangout.end}
        chrome={chrome}
      />
      <CancelDialog open={cancel} onOpenChange={setCancel} hangout={hangout} />
    </>
  )
}

/* ------------------------------------------------------------------ *
 * The force-write editor — the same body in a Popover and in a Dialog, so the
 * question "is this a popover at all" is answered by looking at both.
 * ------------------------------------------------------------------ */

const HALF_HOUR = 30 * 60 * 1000

const RetimeBody = ({
  friendIds,
  start,
  end,
  onChange,
}: {
  friendIds: string[]
  start: number
  end: number
  onChange: (next: { start: number; end: number }) => void
}) => {
  const day = new Date(start)
  const collides = new Date(start).getHours() === 21 && new Date(start).getDate() === 3
  const moveTo = (date: Date) => {
    const next = new Date(date)
    next.setHours(new Date(start).getHours(), new Date(start).getMinutes(), 0, 0)
    onChange({ start: next.getTime(), end: next.getTime() + (end - start) })
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="-mx-1 flex justify-center">
        <Calendar
          mode="single"
          selected={day}
          onSelect={(d) => d && moveTo(d)}
          className="p-0"
        />
      </div>

      <div className="flex items-center gap-2">
        <Stepper
          label="Start"
          value={hhmm(start)}
          onStep={(d) => onChange({ start: start + d * HALF_HOUR, end })}
        />
        <Stepper
          label="End"
          value={hhmm(end)}
          onStep={(d) => onChange({ start, end: Math.max(start + HALF_HOUR, end + d * HALF_HOUR) })}
        />
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {duration(start, end)}
        </span>
      </div>

      {/* ticket 08 #11: name the Friends whose calendars this writes to. */}
      <p className="border border-border bg-muted/40 p-2 text-xs/relaxed">
        <strong className="font-medium">{nameList(friendIds)}</strong> will be marked free{' '}
        {new Date(start).toDateString().slice(0, 10)} {hhmm(start)}–{hhmm(end)}.
      </p>

      {collides && (
        <p className="border border-destructive/40 bg-destructive/10 p-2 text-xs/relaxed text-destructive">
          Pizza at Marco’s is already at this time. Two hangouts cannot overlap — pick another
          slot.
        </p>
      )}
    </div>
  )
}

const Stepper = ({
  label,
  value,
  onStep,
}: {
  label: string
  value: string
  onStep: (delta: number) => void
}) => (
  <div className="flex flex-col gap-1">
    <span className="text-[11px] text-muted-foreground">{label}</span>
    <div className="flex items-center border border-border">
      <Button size="icon-xs" variant="ghost" onClick={() => onStep(-1)} aria-label={`${label} earlier`}>
        −
      </Button>
      <span className="w-11 text-center text-xs tabular-nums">{value}</span>
      <Button size="icon-xs" variant="ghost" onClick={() => onStep(1)} aria-label={`${label} later`}>
        +
      </Button>
    </div>
  </div>
)

export const RetimeSurface = ({
  open,
  onOpenChange,
  title,
  friendIds,
  start,
  end,
  chrome,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  friendIds: string[]
  start: number
  end: number
  chrome: Chrome
}) => {
  const [range, setRange] = useState({ start, end })
  const body = (
    <RetimeBody friendIds={friendIds} start={range.start} end={range.end} onChange={setRange} />
  )
  const surface = chrome.retimeSurface

  if (surface === 'popover') {
    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        {/* anchored to the card's right edge in the real thing */}
        <PopoverTrigger render={<span className="sr-only" />} />
        <PopoverContent align="end" side="left" className="w-80">
          <p className="text-sm font-medium">{title}</p>
          {body}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => onOpenChange(false)}>
              Write it in
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            This writes availability for everyone below, whether or not they said they were free.
          </DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onOpenChange(false)}>Write it in</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ *
 * The hard-delete warning (ticket 08 #3).
 * ------------------------------------------------------------------ */

export const CancelDialog = ({
  open,
  onOpenChange,
  hangout,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  hangout: Hangout
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>Cancel {hangout.title}?</DialogTitle>
        <DialogDescription>
          This deletes it for everyone, right away. There is no undo, and nobody is notified —
          they will find out by noticing it is gone.
        </DialogDescription>
      </DialogHeader>
      <div className="border border-border p-2 text-xs/relaxed">
        <div className="font-medium">{hangout.title}</div>
        <div className="text-muted-foreground">
          {timeRange(hangout.start, hangout.end, hangout.start)} ·{' '}
          {nameList(hangout.participantIds)}
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Keep it
        </Button>
        <Button variant="destructive" onClick={() => onOpenChange(false)}>
          <Trash2Icon data-icon="inline-start" />
          Cancel the hangout
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)
