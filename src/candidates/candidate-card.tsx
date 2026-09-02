import type { Candidate } from '@/candidates/candidates'
import { insideLabel, whenOf } from '@/candidates/when'
import { FriendBlob } from '@/identity/friend-blob'
import { friendColour } from '@/identity/ui-colour'
import { cn } from '@/lib/utils'
import type { SetUpFriend } from '@/roster/use-roster'
import { GROUP_TIME_ZONE } from '@/shell/use-calendar-view'

/**
 * One Candidate card.
 *
 * The anatomy is the **app-shell prototype's card** — the one the human picked
 * over ticket 16's own variants A, B and C:
 *
 *     ┌─┬───────────────────────────────────┐
 *     │ │ Sat 5 Sep              EVERYONE   │
 *     │ │ 20:00 – 23:00        ◍ ◍ ◍ ◍ ◍ ◍  │
 *     └─┴───────────────────────────────────┘
 *      └ the stripe, only when it glows
 *
 * **No count numeral, anywhere.** The count is read off the faces. Ticket 16
 * recommended a 56px numeral rail and was overruled; ticket 09's amendment
 * about where the `everyone` label goes was written for that rail and is
 * superseded with it — there is no numeral for a label to replace, so the pill
 * carries `everyone` alone.
 *
 * **The blobatars wrap; they are never an overlapped `+N` stack.** Prototype 16
 * measured that a stack hides people on exactly the cards that matter most.
 * With this Group's size a wrapped row is at most a handful of faces, so a cap
 * would never fire — and could not hide anyone as the Group grows.
 *
 * **No controls.** Ticket 16's final answer puts confirm behind a detail — a
 * hover tick and a click-to-open popover on desktop, a tap-opens-sheet on touch
 * — and all of it writes *other people's* Availability, which is issue 09's.
 * A card that only reads is the honest state of this slice.
 */
export const CandidateCard = ({
  candidate,
  friends,
  glowing,
  fullHouse,
  container,
}: {
  candidate: Candidate
  /** The Friends in it, in roster order — same order as the stripe's segments. */
  friends: readonly SetUpFriend[]
  /** `2 × friends > groupSize`. The stripe *is* the glow. */
  glowing: boolean
  /** Every Friend in the Group, Hidden included. */
  fullHouse: boolean
  /** The Candidate this one sits inside, if any. */
  container: Candidate | null
}) => {
  const when = whenOf(candidate.start, candidate.end, GROUP_TIME_ZONE)

  return (
    <li
      className={cn(
        'relative flex flex-col gap-1.5 overflow-hidden rounded-md border bg-card p-2.5 pl-3 text-card-foreground',
        // Variant A's "plus a soft shadow": the stripe carries the hue and this
        // carries the lift, so a glowing card sits above the list rather than
        // only being coloured in it.
        glowing && 'shadow-sm'
      )}
    >
      {/*
        The multi-colour border, as a left stripe — and **only when it glows**.
        Reserving colour for `2n > groupSize` is what makes the top of the list
        findable; colouring every card collapses the scan into a rainbow.
      */}
      {glowing && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ backgroundImage: stripe(friends) }}
        />
      )}

      <div className="flex items-baseline justify-between gap-2">
        {/* Every card states its own date: the list has no day headers. */}
        <span className="text-[11px] font-medium text-muted-foreground">{when.date}</span>
        {fullHouse && (
          <span className="shrink-0 rounded-sm bg-foreground px-1 text-[9px] font-semibold tracking-wide text-background uppercase">
            everyone
          </span>
        )}
      </div>

      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium tabular-nums">{when.range}</span>
        <div className="flex flex-wrap justify-end gap-1">
          {friends.map((friend) => (
            <FriendBlob
              key={friend.id}
              identity={friend.identity}
              size="xs"
              className="size-5"
              // Named, because nothing on this card writes their names out and
              // an unlabelled avatar is `alt=""` and skipped.
              title={friend.name}
            />
          ))}
        </div>
      </div>

      {/*
        Ticket 16: `6 · Tue 20:00–20:30` sitting above `5 · Tue 19:00–21:30` is
        the same evening twice, and without this the pair reads as the list
        repeating itself. Ticket 09 chose deliberately not to absorb
        sub-Candidates, and this is what that choice costs.
      */}
      {container !== null && (
        <span className="text-[11px] text-muted-foreground">
          {insideLabel(container, candidate, GROUP_TIME_ZONE)}
        </span>
      )}
    </li>
  )
}

/**
 * The stripe: one hard-edged segment per Friend, in `oklch(L_theme, C_theme,
 * hue)`.
 *
 * Ticket 05's mesh gradient died because **lightness varied**. Under ticket
 * 11's model it cannot: every segment is iso-lightness and iso-chroma by
 * construction (`friendColour`, whose chroma is the largest sRGB can hold at
 * every hue), hard-edged, and three pixels wide — so six colours read as one
 * tonal band changing hue along its length. A ladder, not a rainbow.
 *
 * Two stops per colour at the same two percentages is what makes the edge hard:
 * a gradient with one stop each would interpolate between neighbouring hues and
 * put a smear of a colour nobody owns between every pair of Friends.
 */
const stripe = (friends: readonly SetUpFriend[]): string => {
  const segments = friends.map((friend, index) => {
    const from = ((index / friends.length) * 100).toFixed(2)
    const to = (((index + 1) / friends.length) * 100).toFixed(2)
    return `${friendColour(friend.identity.hue)} ${from}% ${to}%`
  })

  return `linear-gradient(to bottom, ${segments.join(', ')})`
}
