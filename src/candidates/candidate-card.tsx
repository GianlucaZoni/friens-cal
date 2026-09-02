import type { Candidate } from '@/candidates/candidates'
import { insideLabel, whenOf } from '@/candidates/when'
import { CardDetail } from '@/components/card-detail'
import { Button } from '@/components/ui/button'
import { FriendBlob } from '@/identity/friend-blob'
import { friendColour } from '@/identity/ui-colour'
import { cn } from '@/lib/utils'
import type { SetUpFriend } from '@/roster/use-roster'
import { GROUP_TIME_ZONE } from '@/shell/use-calendar-view'
import { useState } from 'react'
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
 * **On a touch pointer it is hidden outright, and the card body is the route.**
 * Ticket 16's touch answer is **no controls on the card at all**: a tap opens a
 * detail sheet carrying every action, because a bare tap must read rather than
 * write and confirming writes *other people's* Availability. Issue 09 shipped
 * the opposite as a stand-in — the tick permanently visible under
 * `@media (hover: none)` — for the honest reason that the sheet it describes
 * had nothing to carry until issue 10 built the lifecycle. **That stand-in is
 * gone rather than kept beside this**, which is issue 10's own acceptance
 * criterion: two routes on touch would be exactly the thing ticket 16's
 * revision removed.
 *
 * On desktop the body opens the same detail as a **popover**, which makes this
 * tick an accelerator rather than the only route — the pattern ticket 01 set
 * for ⌥+drag.
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
  const [open, setOpen] = useState(false)
  const when = whenOf(candidate.start, candidate.end, GROUP_TIME_ZONE)

  /**
   * The card box, and **it is the detail's trigger** — ticket 16's route on
   * both platforms, with the tick beside it as the desktop accelerator.
   *
   * A real `<button>` rather than a div with a handler, so it is in the tab
   * order and Base UI can put the popup semantics on it. Its accessible name is
   * its own content, which is the date, the range and the faces' titles — what
   * a screen reader should hear before being told it opens something.
   */
  const body = (
    <button
      type="button"
      className={cn(
        /*
          `relative` is what makes this box the stripe's containing block. The
          `<li>` is positioned too (the tick hangs off it), so without this the
          stripe would resolve against the list item instead — and an
          absolutely positioned element whose containing block is an *ancestor*
          of the `overflow-hidden` box is not clipped by it, so its square
          corners would poke out of this card's rounded left edge.
        */
        'relative flex w-full flex-col gap-1.5 overflow-hidden rounded-md border bg-card p-2.5 pl-3 text-left text-card-foreground',
        'focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none',
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

        Inside the box rather than beside it, because the box is what carries
        `overflow-hidden` and the rounded corners it has to be clipped by.
      */}
      {glowing && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ backgroundImage: stripe(friends) }}
        />
      )}

      {/* `pr-6` reserves the tick's corner — see the tick below. */}
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
    </button>
  )

  return (
    <li className="group relative">
      <CardDetail
        trigger={body}
        open={open}
        onOpenChange={setOpen}
        title={`${when.date} · ${when.range}`}
        description={
          fullHouse ? 'Everybody is free then.' : `${friends.length} friends are free then.`
        }
      >
        <CandidateDetail
          friends={friends}
          container={container === null ? null : insideLabel(container, candidate, GROUP_TIME_ZONE)}
          busy={busy}
          pending={pending}
          onConfirm={() => {
            setOpen(false)
            onConfirm()
          }}
        />
      </CardDetail>

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
          `group-focus-within` is what makes it reachable by keyboard. And it
          is **hidden** where there is no hover rather than pinned visible:
          ticket 16 puts every action in the detail on touch, and the card body
          below is what opens it.
        */
        className={cn(
          'absolute top-1.5 right-1.5 z-10 flex size-6 items-center justify-center rounded-sm',
          'text-muted-foreground opacity-0 transition-opacity',
          'group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:hidden',
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
    </li>
  )
}

/**
 * The Candidate's detail — **the only route on touch**, and the same content in
 * a popover on desktop.
 *
 * Deliberately thin, and that is ticket 16's amendment being honest: a
 * Candidate has no name to set and no lifecycle, so the only thing the detail
 * can carry for it is *who is free* and the one action. Which is exactly why
 * the sheet was not worth building until a Hangout had something of its own to
 * put in it.
 *
 * **Faces with names**, the pairing `slot-popover.tsx` argues for: hue
 * collisions between Friends are permitted (ticket 11), so a coloured dot
 * cannot identify anybody — the blobatar's shape disambiguates and the name
 * settles it. On a card there is no room and the `title` carries it; here there
 * is.
 *
 * **And still no warning.** Retiming opens a Dialog because it writes other
 * people's Availability; confirming writes none — a Candidate is by definition
 * a run in which every one of its Friends already holds Availability at every
 * Slot. So this is a read that leads to a write, which is the shape ticket 16
 * asked for, and not a read that leads to a warning.
 */
const CandidateDetail = ({
  friends,
  container,
  busy,
  pending,
  onConfirm,
}: {
  friends: readonly SetUpFriend[]
  /** The annotation naming the window this one sits inside, if any. */
  container: string | null
  busy: boolean
  pending: boolean
  onConfirm: () => void
}) => (
  <div className="flex flex-col gap-3">
    <ul className="flex flex-col gap-0.5">
      {friends.map((friend) => (
        <li key={friend.id} className="flex items-center gap-2">
          {/* No `title`: the name is written beside it, and a titled blobatar
              would make a screen reader read the Friend twice. */}
          <FriendBlob identity={friend.identity} size="xs" />
          <span className="min-w-0 flex-1 truncate text-xs">{friend.name}</span>
        </li>
      ))}
    </ul>

    {container !== null && <p className="text-[11px] text-muted-foreground">{container}</p>}

    <Button size="sm" disabled={busy} onClick={onConfirm}>
      {pending ? (
        <>
          <Loader2 aria-hidden className="animate-spin" /> Confirming…
        </>
      ) : (
        <>
          <Check aria-hidden /> Confirm this hangout
        </>
      )}
    </Button>
  </div>
)

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
