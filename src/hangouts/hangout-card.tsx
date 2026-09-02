import { whenOf } from '@/candidates/when'
import { CardDetail } from '@/components/card-detail'
import {
  facesOf,
  isEdited,
  isHappening,
  isPast,
  mayJoin,
  missingSlots,
  nameOf,
  type Hangout,
} from '@/hangouts/hangout'
import { CancelDialog, HangoutDetail, type HangoutActions } from '@/hangouts/hangout-detail'
import { RetimeDialog } from '@/hangouts/retime-dialog'
import { FriendBlob } from '@/identity/friend-blob'
import { cn } from '@/lib/utils'
import type { SetUpFriend } from '@/roster/use-roster'
import { GROUP_TIME_ZONE } from '@/shell/use-calendar-view'
import { useCallback, useState } from 'react'
import { Pin, UserPlus } from 'lucide-react'

/** The five lifecycle writes, as a card needs them. */
export type HangoutControls = HangoutActions & {
  retime: (hangout: Hangout, startsAt: number, endsAt: number) => Promise<string | null>
  cancel: (hangout: Hangout) => Promise<string | null>
}

/**
 * One pinned Hangout card, above the Candidates.
 *
 *     ┌──────────────────────────────────────┐
 *     │ ◔ Pizza  edited              ⊕ Join? │
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
 * ## The body opens the detail; the accelerator is `Join?`
 *
 * Ticket 16's final answer: on touch there are **no controls on the card at
 * all** and a tap opens the detail sheet carrying every action, and on desktop
 * *"clicking a card body opens that same detail as a popover, making the hover
 * tick an accelerator rather than the only route"*. So the card body is the
 * trigger — a real `<button>`, so it is in the tab order and announces that it
 * opens something — and everything a viewer can do is in the detail, once.
 *
 * **One accelerator, and it is Join.** Ticket 16's *Decisions so far* had a
 * hover tick plus a 3-dots on every card, and its final answer then made the
 * detail the route on the grounds that *"with every action inside, there is
 * nothing for a 3-dots to open"*. That sentence is about the popover as much as
 * about the sheet: a menu offering Leave, `Change the time…` and Cancel beside
 * a popover already offering all three is two routes to one place. What is left
 * worth accelerating is the one action that is a plain yes — Join, which
 * ticket 16 itself puts on the card as a real button rather than a menu item.
 * A judgement call, and the one place this card departs from a literal reading
 * of ticket 16's control set.
 *
 * ## The dialogs are the card's, not the detail's
 *
 * Ticket 16's amendment allows a Sheet to contain a Dialog and forbids a
 * Popover from doing it. Rather than build two arrangements, the retime and the
 * cancel warning are **siblings** of the detail here and opening one closes it
 * — which is the same behaviour on both surfaces and needs no nesting anywhere.
 *
 * **`edited` is a small muted word after the title, never an icon** (ticket 08
 * §1, ticket 16) — an icon reads as a button. It now means *something about
 * this Hangout changed after it was confirmed* rather than *it was moved*, and
 * the detail is the only thing that can say what, so the word is a pointer to
 * it rather than a claim on its own.
 */
export const HangoutCard = ({
  hangout,
  friends,
  friendsById,
  namesById,
  viewerId,
  now,
  isFree,
  controls,
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
  /** The same map the faces came from — the detail and its dialogs draw them too. */
  friendsById: ReadonlyMap<string, SetUpFriend>
  /** Every Friend's name by id, for the provenance lines. */
  namesById: ReadonlyMap<string, string>
  viewerId: string
  /** The start of the current Slot — the app's one clock (`useSlotClock`). */
  now: number
  /**
   * The Availability store's question, for **any** Friend.
   *
   * Not narrowed to the viewer, and the retime dialog is why: ticket 08 §11
   * makes it name the Friends whose calendars the move will write to, which is
   * a question about the other Participants' rows. The viewer's own answer is
   * derived from it below.
   */
  isFree: (friendId: string, slotStart: Date) => boolean
  controls: HangoutControls
}) => {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  /**
   * "Does the viewer hold this Slot?" — what `mayJoin`, `missingSlots` and the
   * detail all ask, in the epoch milliseconds a Hangout's Slot lattice is in.
   */
  const holds = useCallback(
    (slotStart: number) => isFree(viewerId, new Date(slotStart)),
    [isFree, viewerId]
  )

  const when = whenOf(hangout.startsAt, hangout.endsAt, GROUP_TIME_ZONE)
  const happening = isHappening(hangout, now)
  const over = isPast(hangout, now)
  const joinable = mayJoin(hangout, viewerId, holds, now)

  /*
   * **The name is always the headline and the time is always the second line**
   * — ticket 16's hierarchy, unconditionally, because `nameOf` means there is
   * no such thing as a Hangout without a name. The earlier version promoted the
   * time to the headline when the title was null, which inverted the hierarchy
   * on every card issue 09 could produce.
   */
  const second = `${when.date} · ${when.range}`

  const body = (
    <button
      type="button"
      /*
        The whole card is the trigger, and its accessible name is its own
        content — which is what a screen reader should hear: the name, the date
        and the range, then that it opens something (Base UI puts the popup
        semantics on here).
      */
      className={cn(
        'flex w-full flex-col gap-1.5 rounded-md border border-foreground/25 bg-muted p-2.5 pl-3 text-left text-card-foreground',
        'focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none',
        happening && 'border-destructive/50',
        over && 'opacity-70'
      )}
    >
      <div className="flex items-baseline justify-between gap-2 pr-6">
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
          {isEdited(hangout) && (
            <span className="shrink-0 text-[10px] text-muted-foreground">edited</span>
          )}
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
    </button>
  )

  return (
    <li className="group relative">
      <CardDetail
        trigger={body}
        open={open}
        onOpenChange={setOpen}
        title={nameOf(hangout)}
        description={over ? `${second} — over` : second}
      >
        <HangoutDetail
          hangout={hangout}
          friendsById={friendsById}
          namesById={namesById}
          viewerId={viewerId}
          now={now}
          holds={holds}
          actions={controls}
          onEditTime={() => {
            setOpen(false)
            setEditing(true)
          }}
          onCancel={() => {
            setOpen(false)
            setCancelling(true)
          }}
        />
      </CardDetail>

      {/*
        `Join?` — ticket 08 §5, on any overlap however small, and absolutely
        positioned so a list of cards does not reflow as the cursor crosses it
        (ticket 16). The header row above reserves the width with `pr-6`.

        **Hidden outright where there is no hover**, which is ticket 16's touch
        rule rather than a fallback: no controls on the card at all, and the
        detail carries Join instead. That is also what replaces issue 09's
        permanently-visible stand-in rather than sitting beside it.
      */}
      {joinable && (
        <button
          type="button"
          onClick={() => void controls.join(hangout, missingSlots(hangout, holds))}
          className={cn(
            'absolute top-1.5 right-1.5 z-10 flex items-center gap-1 rounded-sm px-1',
            'text-[10px] font-medium text-muted-foreground opacity-0 transition-opacity',
            'group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:hidden',
            'hover:bg-accent hover:text-accent-foreground',
            'focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none'
          )}
          aria-label={`Join ${nameOf(hangout)}, ${second}`}
        >
          <UserPlus aria-hidden className="size-3" /> Join?
        </button>
      )}

      {editing && (
        <RetimeDialog
          hangout={hangout}
          friendsById={friendsById}
          isFree={isFree}
          onRetime={(startsAt, endsAt) => controls.retime(hangout, startsAt, endsAt)}
          onClose={() => setEditing(false)}
        />
      )}

      {cancelling && (
        <CancelDialog
          hangout={hangout}
          friendsById={friendsById}
          onConfirm={() => controls.cancel(hangout)}
          onDismiss={() => setCancelling(false)}
        />
      )}
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
  namesById,
  viewerId,
  now,
  isFree,
  controls,
}: {
  hangouts: readonly Hangout[]
  /** The whole roster by id, Hidden included — see `HangoutCard`'s `friends`. */
  friendsById: ReadonlyMap<string, SetUpFriend>
  namesById: ReadonlyMap<string, string>
  viewerId: string
  now: number
  isFree: (friendId: string, slotStart: Date) => boolean
  controls: HangoutControls
}) => (
  <ul aria-label="Confirmed hangouts" className="flex flex-col gap-1.5">
    {hangouts.map((hangout) => (
      <HangoutCard
        key={hangout.id}
        hangout={hangout}
        friends={facesOf(hangout, friendsById)}
        friendsById={friendsById}
        namesById={namesById}
        viewerId={viewerId}
        now={now}
        isFree={isFree}
        controls={controls}
      />
    ))}
  </ul>
)
