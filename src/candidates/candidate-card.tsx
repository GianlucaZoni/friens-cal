import type { Candidate } from '@/candidates/candidates'
import { insideLabel, whenOf } from '@/candidates/when'
import { FriendBlob } from '@/identity/friend-blob'
import { friendColour } from '@/identity/ui-colour'
import { cn } from '@/lib/utils'
import type { SetUpFriend } from '@/roster/use-roster'
import { GROUP_TIME_ZONE } from '@/shell/use-calendar-view'
import { Check, Loader2 } from 'lucide-react'

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
 * ## The tick
 *
 * Confirming is **the only way a Hangout is ever created** (ticket 01), and
 * ticket 16 puts it on a tick and a 3-dots, *absolutely positioned over the
 * card's right edge so nothing reflows on hover*. The 3-dots opens the
 * force-write editor, which is issue 10's retime; the tick is here.
 *
 * **Revealed on `:hover` AND `:focus-within`** — never hover-only, on any
 * pointer. The button is in the DOM and in the tab order at all times; only its
 * opacity moves, so a keyboard reaches it by tabbing and a screen reader never
 * lost it.
 *
 * **On a touch pointer it is simply always visible** (`hover-none:opacity-100`).
 * Ticket 16's touch answer is a tap-opens-**detail-sheet**, on the grounds that
 * a bare tap must read rather than write — and the sheet it describes carries
 * `Join`, `Leave`, `Change the time…` and `Cancel`, every one of which is issue
 * 10's. So this is that decision's predecessor, which ticket 16's own
 * *Decisions so far* had (a control permanently visible in the card's corner)
 * before the sheet subsumed it. **A visible tick is not a bare tap writing**:
 * it is an explicit control, which is the property the rule was protecting. It
 * is a stand-in, and the sheet replaces it when it has something to carry.
 *
 * **And confirming needs no dialog**, which is worth saying because the sibling
 * action does. Retiming opens a Dialog that names the Friends whose calendars it
 * will write to (ticket 08 §11, ticket 16) — because retiming *writes other
 * people's Availability*. Confirming writes none: a Candidate is by definition a
 * run in which every one of its Friends already holds Availability at every
 * Slot. Nothing has to be warned about, so nothing is.
 */
export const CandidateCard = ({
  candidate,
  friends,
  glowing,
  fullHouse,
  container,
  onConfirm,
  pending,
  busy,
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
  /** Turn this Candidate into a Hangout. */
  onConfirm: () => void
  /** **This** card's confirm is in flight: spinner, and held visible. */
  pending: boolean
  /**
   * **Some** card's confirm is in flight, so this one's tick is inert.
   *
   * Two flags rather than one, and the difference is what keeps the list quiet:
   * the store allows one confirm at a time — two in flight would race each
   * other through the exclusion constraint, and the loser would convert into a
   * Join of a Hangout the same person had just created — but a single flag
   * would light up **every** tick in the list while one of them worked.
   */
  busy: boolean
}) => {
  const when = whenOf(candidate.start, candidate.end, GROUP_TIME_ZONE)

  return (
    <li
      className={cn(
        'group relative flex flex-col gap-1.5 overflow-hidden rounded-md border bg-card p-2.5 pl-3 text-card-foreground',
        // Variant A's "plus a soft shadow": the stripe carries the hue and this
        // carries the lift, so a glowing card sits above the list rather than
        // only being coloured in it.
        glowing && 'shadow-sm'
      )}
    >
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy}
        /*
          `absolute` so it costs no layout: ticket 16 puts the controls **over**
          the card's right edge precisely so that a list of cards does not
          reflow as the cursor crosses it. The header row below reserves the
          width anyway (`pr-6`), because the corner it lands in is where the
          `everyone` pill lives and two things in one corner is worse than a few
          pixels of gutter.

          Opacity rather than mounting, so the button is always focusable —
          `group-focus-within` is what makes it reachable by keyboard, and the
          `hover: none` query is what makes it reachable at all on a touch
          pointer, where `:hover` never fires.
        */
        className={cn(
          'absolute top-1.5 right-1.5 z-10 flex size-6 items-center justify-center rounded-sm',
          'text-muted-foreground opacity-0 transition-opacity',
          'group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100',
          'hover:bg-accent hover:text-accent-foreground',
          'focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none',
          'disabled:pointer-events-none',
          // Held visible only for the card actually working, so one confirm in
          // flight does not light up six ticks.
          pending && 'opacity-100'
        )}
        // The date and range, not "confirm" alone: the list is flat with no day
        // headers, so a bare label would give a screen reader six identical
        // buttons.
        aria-label={`Confirm ${when.date}, ${when.range}`}
      >
        {pending ? (
          <Loader2 aria-hidden className="size-3.5 animate-spin" />
        ) : (
          <Check aria-hidden className="size-3.5" />
        )}
      </button>

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

      {/* `pr-6` reserves the tick's corner — see the button above. */}
      <div className="flex items-baseline justify-between gap-2 pr-6">
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
