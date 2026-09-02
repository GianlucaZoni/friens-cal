import { whenOf } from '@/candidates/when'
import { facesOf, isHappening, nameOf, type Hangout } from '@/hangouts/hangout'
import { FriendBlob } from '@/identity/friend-blob'
import { cn } from '@/lib/utils'
import type { SetUpFriend } from '@/roster/use-roster'
import { GROUP_TIME_ZONE } from '@/shell/use-calendar-view'
import { Pin } from 'lucide-react'

/**
 * One pinned Hangout card, above the Candidates.
 *
 *     ┌──────────────────────────────────────┐
 *     │ ◔ Pizza                              │
 *     │ Sat 4 Sep · 20:00 – 23:00   ◍ ◍ ◍    │
 *     └──────────────────────────────────────┘
 *      └ the pin, in the rail the Candidate spends on nothing
 *
 * **The same skeleton as a Candidate card, and deliberately a different
 * object.** *A Candidate and a Hangout look alike on screen and are entirely
 * different things* (`CONTEXT.md`), so the differences are the design rather
 * than an accident of two components:
 *
 * - **No hue, anywhere.** Colour in this sidebar means *this many Friends are
 *   free* — the stripe on a Candidate card **is** its glow. A Hangout is not an
 *   offer, so there is nothing for a hue to be proportional to, and a coloured
 *   Hangout would put the two objects on the same scale.
 * - **Muted fill and a solid `foreground/25` border**, where a Candidate is
 *   `bg-card` on the plain theme border. A fact is heavier than a suggestion.
 * - **The title is the headline and the time is the second line** — the inverse
 *   of a Candidate, which leads with its date because a Candidate has nothing
 *   else to be called.
 * - **`now` in the destructive colour** while it is happening. A Hangout stays
 *   Live until its end time (ticket 08 §6), so this is the state between
 *   "coming up" and "over" and it is the one worth shouting.
 *
 * **No controls.** Ticket 16 puts `Join` on this card as a real button rather
 * than a menu item, and a 3-dots carrying `Change the time…`, `Leave` and a
 * destructive `Cancel this hangout…` — every one of which is issue 10's
 * lifecycle. A card that only reads is the honest state of this slice, the same
 * call `CandidateCard` made in issue 08 and for the same reason.
 *
 * **The name is the headline, and every Hangout has one.** `nameOf` supplies
 * *"Hangout"* when no title is set, which is every Hangout issue 09 can create
 * — naming one is the detail sheet's job (issue 10). Without the default the
 * hierarchy would invert on exactly those cards.
 *
 * **`edited` is not here yet either.** Ticket 08 §1 marks a retimed Hangout
 * permanently, as a small muted *word* after the title and never an icon (an
 * icon reads as a button). There is no column for it in issue 09's schema and
 * nothing that could set one: retime is the only thing that marks a Hangout, and
 * retime is issue 10's. It arrives with the migration that writes it.
 */
export const HangoutCard = ({
  hangout,
  friends,
  now,
}: {
  hangout: Hangout
  /**
   * The Participants' faces, in roster order.
   *
   * Resolved against the **whole** roster, Hidden Friends included. Hiding
   * never hides a Hangout (ticket 01), and ticket 16 rejected even *muting* a
   * Hidden Friend's blob here: that is a partial hide through the back door.
   */
  friends: readonly SetUpFriend[]
  /** The start of the current Slot — the app's one clock (`useSlotClock`). */
  now: number
}) => {
  const when = whenOf(hangout.startsAt, hangout.endsAt, GROUP_TIME_ZONE)
  const happening = isHappening(hangout, now)

  /*
   * **The name is always the headline and the time is always the second line**
   * — ticket 16's hierarchy, unconditionally, because `nameOf` means there is
   * no such thing as a Hangout without a name. The earlier version promoted the
   * time to the headline when the title was null, which inverted the hierarchy
   * on every card issue 09 can produce.
   */
  const second = `${when.date} · ${when.range}`

  return (
    <li
      className={cn(
        'relative flex flex-col gap-1.5 rounded-md border border-foreground/25 bg-muted p-2.5 pl-3 text-card-foreground',
        happening && 'border-destructive/50'
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <Pin
            aria-hidden
            /*
              `self-center` on a baseline row: the glyph has no baseline of its
              own, and aligning its box to the text's would hang it below the
              cap height.
            */
            className={cn(
              'size-3 shrink-0 self-center text-muted-foreground',
              happening && 'text-destructive'
            )}
          />
          <span className={cn('truncate text-[13px] font-medium', happening && 'text-destructive')}>
            {nameOf(hangout)}
          </span>
        </span>
        {happening && (
          <span className="shrink-0 rounded-sm bg-destructive px-1 text-[9px] font-semibold tracking-wide text-white uppercase">
            now
          </span>
        )}
      </div>

      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] text-muted-foreground tabular-nums">{second}</span>
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
    </li>
  )
}

/**
 * The pinned region: the Hangouts, chronological, with no heading.
 *
 * **Neither region in this pane gets a heading** (ticket 16) — the pin glyph
 * and the card treatment carry the distinction, and two headings is more chrome
 * than a 17rem column supports. The divider between the regions belongs to the
 * pane, because it exists only when *both* regions do.
 */
export const PinnedHangouts = ({
  hangouts,
  friendsById,
  now,
}: {
  hangouts: readonly Hangout[]
  /** The whole roster by id, Hidden included — see `HangoutCard`'s `friends`. */
  friendsById: ReadonlyMap<string, SetUpFriend>
  now: number
}) => (
  <ul aria-label="Confirmed hangouts" className="flex flex-col gap-1.5">
    {hangouts.map((hangout) => (
      <HangoutCard
        key={hangout.id}
        hangout={hangout}
        friends={facesOf(hangout, friendsById)}
        now={now}
      />
    ))}
  </ul>
)
