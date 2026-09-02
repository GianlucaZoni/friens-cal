import { whenOf } from '@/candidates/when'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  facesOf,
  isPast,
  missingSlots,
  nameOf,
  participantIds,
  slotStartsOf,
  stateOf,
  wouldAutoCancel,
  type Hangout,
} from '@/hangouts/hangout'
import { FriendBlob } from '@/identity/friend-blob'
import { SaveError } from '@/identity/save-error'
import { useSaveAction } from '@/identity/use-save-action'
import type { SetUpFriend } from '@/roster/use-roster'
import { GROUP_TIME_ZONE } from '@/shell/use-calendar-view'
import { TZDate } from '@date-fns/tz'
import { useState } from 'react'
import { format } from 'date-fns'
import { ClockIcon, LogOutIcon, Trash2Icon, UserPlusIcon } from 'lucide-react'

/** Everything a Hangout's detail can do, handed down as one object. */
export type HangoutActions = {
  rename: (hangout: Hangout, title: string | null) => Promise<string | null>
  leave: (hangout: Hangout) => Promise<string | null>
  join: (hangout: Hangout, missing: readonly number[]) => Promise<string | null>
}

/**
 * The detail, inside the Sheet on touch and the Popover on desktop.
 *
 * **Ticket 16's amendment is why this exists at all.** Its final answer routed
 * every card action through a detail sheet, and issue 09 found the gap in that:
 * every action it listed — Confirm, Join, Leave, `Change the time…`, Cancel —
 * belonged to *this* slice, so there was nothing for the sheet to carry and
 * confirm shipped as a bare tick. The amendment gave the sheet its own content,
 * **the name**, which is the thing that makes it worth opening on a Hangout that
 * is otherwise just a time.
 *
 * ## What is in here, and in what order
 *
 * The name, then the time, then the people, then the provenance, then the ways
 * out. The name is first because it is the sheet's own content rather than a
 * lifecycle action; the destructive one is last.
 *
 * ## Provenance is quiet, and absent when it is null
 *
 * Ticket 16: *"rendered as quiet lines, not as chrome: they answer a question
 * that only comes up after something surprising"*. Both are nullable and
 * neither line appears when it is — a Hangout confirmed before the provenance
 * migration has no author, and backfilling one would be inventing a fact.
 *
 * `edited by` is the long form of the card's muted `edited` word, and since the
 * word now means *something changed after it was confirmed* rather than *it was
 * moved*, **this is the only place that can say what**. `edited_at` beside the
 * current time range is enough to reconstruct it, which ticket 07 called the
 * sheet's problem rather than the badge's.
 *
 * ## Past freezes everything, including the name
 *
 * Ticket 08 §6: a Past Hangout is *"visually muted, and uneditable — no join,
 * no retime, no cancel"*. A rename is not in that list by name, but the human's
 * answer to ticket 07 makes a rename **an edit** — so "uneditable" now covers
 * it, and freezing the field is the reading that keeps the two decisions
 * consistent.
 *
 * **The reachable case is a Hangout that ends while this is open**, not one
 * opened from the sidebar: `pinned` keeps Past Hangouts out of the right pane
 * entirely, so today the only route here is a plan whose end time passes under
 * a sheet somebody is looking at — on the same `useSlotClock` tick that mutes
 * it on the grid. Which is exactly why the freeze is a branch rather than a
 * comment: it is a live transition, not a state to navigate to.
 */
export const HangoutDetail = ({
  hangout,
  friendsById,
  namesById,
  viewerId,
  now,
  holds,
  actions,
  onEditTime,
  onCancel,
}: {
  hangout: Hangout
  /** The whole roster by id, Hidden included — faces. Hiding never hides a Hangout. */
  friendsById: ReadonlyMap<string, SetUpFriend>
  /**
   * Every Friend's *name* by id, including the ones mid-setup.
   *
   * A second map rather than `friendsById` reused, because the two questions
   * genuinely differ: a face needs a finished identity (`setUpOnly`) and a
   * provenance line only needs a name. A Hangout confirmed by somebody who has
   * not finished setup would otherwise read as confirmed by nobody.
   */
  namesById: ReadonlyMap<string, string>
  viewerId: string
  now: number
  /** Whether the viewer holds a given Slot — for the Join and its writes. */
  holds: (slotStart: number) => boolean
  actions: HangoutActions
  /** Opens the retime Dialog. The caller closes this surface first. */
  onEditTime: () => void
  /** Opens the singular cancel warning. Same. */
  onCancel: () => void
}) => {
  const when = whenOf(hangout.startsAt, hangout.endsAt, GROUP_TIME_ZONE)
  const over = isPast(hangout, now)
  const state = stateOf(hangout, viewerId)
  const faces = facesOf(hangout, friendsById)
  const missing = missingSlots(hangout, holds)

  return (
    <div className="flex flex-col gap-3">
      {over ? (
        <p className="text-[11px] text-muted-foreground">
          This one is over. It stays on the calendar, and nothing about it can be changed.
        </p>
      ) : (
        <NameField hangout={hangout} onRename={actions.rename} />
      )}

      {/* The time, and the control that changes it — one row, because the
          control is about the value beside it. */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs tabular-nums">
          {when.date} · {when.range}
        </span>
        {!over && (
          <Button variant="outline" size="sm" onClick={onEditTime}>
            <ClockIcon /> Change the time…
          </Button>
        )}
      </div>

      <Participants faces={faces} hangout={hangout} viewerId={viewerId} />

      <Provenance hangout={hangout} namesById={namesById} />

      {!over && (
        <Ways
          hangout={hangout}
          state={state}
          viewerId={viewerId}
          now={now}
          missing={missing}
          actions={actions}
          onCancel={onCancel}
        />
      )}
    </div>
  )
}

/**
 * The name, editable — the sheet's own content.
 *
 * **`Name this hangout…` is the placeholder, not the value.** Ticket 16
 * rejected "Name this…" as a *default* because it is a nudge, and put it "on
 * the control that does the naming" — which is this one. The value stays
 * `nameOf`'s word everywhere else.
 *
 * **An empty field clears the title** back to null rather than storing `''`,
 * which keeps `nameOf`'s single default true: there is one way for a Hangout to
 * be unnamed, and it is the one the schema already had. A blank string would be
 * a second one that renders identically and compares differently.
 *
 * A form, so Enter saves — the field is one line and reaching for a button with
 * the keyboard already on the text is the wrong shape.
 */
const NameField = ({
  hangout,
  onRename,
}: {
  hangout: Hangout
  onRename: (hangout: Hangout, title: string | null) => Promise<string | null>
}) => {
  const [draft, setDraft] = useState(hangout.title ?? '')
  const { error, saving, run } = useSaveAction()

  const trimmed = draft.trim()
  const next = trimmed === '' ? null : trimmed
  const changed = next !== hangout.title

  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault()
        if (changed)
          void run(
            () => onRename(hangout, next),
            () => {}
          )
      }}
    >
      <div className="flex gap-2">
        <Input
          aria-label="Hangout name"
          placeholder="Name this hangout…"
          value={draft}
          disabled={saving}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button type="submit" variant="outline" size="sm" disabled={saving || !changed}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
      {error ? <SaveError message={error} /> : null}
    </form>
  )
}

/**
 * The Participants, as **faces with names** (ticket 16).
 *
 * Names as well as blobatars for `slot-popover.tsx`'s reason: hue collisions
 * between Friends are permitted (ticket 11), so colour alone cannot identify
 * anybody — the shape disambiguates and the name settles it.
 *
 * **The Friends who Left are counted separately and not drawn.** They are not
 * Participants (`participantIds`), so they do not belong in the row of faces —
 * but saying nothing about them would make a Hangout that three people walked
 * out of look like one that two people were always on.
 */
const Participants = ({
  faces,
  hangout,
  viewerId,
}: {
  faces: readonly SetUpFriend[]
  hangout: Hangout
  viewerId: string
}) => {
  const left = hangout.participants.filter((on) => on.leftAt !== null).length

  return (
    <div className="flex flex-col gap-1">
      {faces.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Nobody is on this hangout.</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {faces.map((friend) => (
            <li key={friend.id} className="flex items-center gap-2">
              {/* No `title`, so a screen reader does not read the name twice —
                  `slot-popover.tsx`'s rule for the same pairing. */}
              <FriendBlob identity={friend.identity} size="xs" />
              <span className="min-w-0 flex-1 truncate text-xs">{friend.name}</span>
              {friend.id === viewerId && (
                <span className="shrink-0 text-[10px] text-muted-foreground">you</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {left > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {left === 1 ? 'One friend left this hangout.' : `${left} friends left this hangout.`}
        </p>
      )}
    </div>
  )
}

/**
 * `confirmed by …` and `edited by …`, quietly, and only when they are there.
 *
 * A null `created_by` reads honestly as *"confirmed by somebody no longer in
 * the Group"* — but ticket 16 is explicit that both lines *"simply do not appear
 * when absent"*, so nothing is said rather than something being guessed. The
 * Hangouts this applies to are the ones confirmed before the provenance
 * migration, plus any whose Friend row has gone (`on delete set null`).
 */
const Provenance = ({
  hangout,
  namesById,
}: {
  hangout: Hangout
  namesById: ReadonlyMap<string, string>
}) => {
  const confirmedBy = hangout.createdBy === null ? null : nameFor(hangout.createdBy, namesById)
  const editedBy = hangout.editedBy === null ? null : nameFor(hangout.editedBy, namesById)
  if (confirmedBy === null && editedBy === null) return null

  return (
    <div className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
      {confirmedBy !== null && <span>confirmed by {confirmedBy}</span>}
      {editedBy !== null && (
        <span>
          edited by {editedBy}
          {/*
            The timestamp is what makes the badge's "something changed"
            reconstructable — ticket 07's residue, handed to the sheet. Null is
            reachable only for a row written before the stamping trigger, which
            is why it is a suffix rather than part of the sentence.
          */}
          {hangout.editedAt === null
            ? ''
            : ` · ${format(new TZDate(hangout.editedAt, GROUP_TIME_ZONE), 'EEE d LLL, HH:mm')}`}
        </span>
      )}
    </div>
  )
}

/**
 * A provenance id as a name.
 *
 * The fallback is for a genuine race — an id whose Friend the roster has not
 * read yet — rather than for a departed Friend, whose column is set to null by
 * the foreign key and so never reaches here at all.
 */
const nameFor = (friendId: string, namesById: ReadonlyMap<string, string>): string =>
  namesById.get(friendId) ?? 'someone else'

/**
 * The ways in and out: Join, Rejoin, Leave, and Cancel.
 *
 * **Join only on an overlap, and never for a Friend who Left.** Ticket 08 §5
 * puts "Join?" on *any* overlap however small, because Join writes whatever is
 * missing to cover the whole range — so a partial overlap is somebody plainly
 * interested in the evening. §9 keeps it away from a Friend who walked out:
 * *"the tool never suggests rejoining something you walked out of, but the door
 * is not locked"* — so **Rejoin** is here, by name, always, and it is a
 * different sentence from an offer.
 *
 * **Leave says when it will cancel the plan.** `wouldAutoCancel` is the client
 * side of `06-hangout-lifecycle.sql`'s second trigger, and the difference is
 * worth a line rather than a discovery: leaving a plan and hard-deleting it for
 * everybody are different acts, and ticket 08 §3 left no undo behind the second
 * one.
 *
 * **Cancel is behind a warning naming the single Hangout** — ticket 16's
 * correction to its own item 5. Its earlier text cited ticket 08's
 * multi-Hangout naming, which is a miscitation: that is §10's strict-drop
 * dialog and it lives on the grid. Cancelling from a card affects exactly one
 * Hangout, always.
 */
const Ways = ({
  hangout,
  state,
  viewerId,
  now,
  missing,
  actions,
  onCancel,
}: {
  hangout: Hangout
  state: ReturnType<typeof stateOf>
  viewerId: string
  now: number
  missing: readonly number[]
  actions: HangoutActions
  onCancel: () => void
}) => {
  const { error, saving, run } = useSaveAction()
  const overlaps = missing.length < slotStartsOf(hangout).length
  const lastOne = wouldAutoCancel(hangout, viewerId, now)

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-2">
      {state === 'participant' && (
        <>
          <Button
            variant="outline"
            size="sm"
            className="justify-start"
            disabled={saving}
            onClick={() =>
              void run(
                () => actions.leave(hangout),
                () => {}
              )
            }
          >
            <LogOutIcon /> {saving ? 'Leaving…' : 'Leave'}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            {lastOne
              ? 'You are the only one on it, so leaving cancels the hangout for everybody. There is no undo.'
              : 'Your availability stays as it is.'}
          </p>
        </>
      )}

      {state === 'left' && (
        <Button
          variant="outline"
          size="sm"
          className="justify-start"
          disabled={saving}
          onClick={() =>
            void run(
              () => actions.join(hangout, missing),
              () => {}
            )
          }
        >
          <UserPlusIcon /> {saving ? 'Rejoining…' : 'Rejoin'}
        </Button>
      )}

      {state === 'not-involved' && (
        <>
          <Button
            variant="outline"
            size="sm"
            className="justify-start"
            disabled={saving}
            onClick={() =>
              void run(
                () => actions.join(hangout, missing),
                () => {}
              )
            }
          >
            <UserPlusIcon /> {saving ? 'Joining…' : 'Join'}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            {overlaps
              ? 'Joining also marks you free for the whole hangout.'
              : 'You have not said you are free then — joining marks you free for all of it.'}
          </p>
        </>
      )}

      {error ? <SaveError message={error} /> : null}

      <Button
        variant="ghost"
        size="sm"
        className="justify-start text-destructive hover:text-destructive"
        onClick={onCancel}
      >
        <Trash2Icon /> Cancel this hangout…
      </Button>
    </div>
  )
}

/**
 * **Singular, always** — ticket 16's correction to its own item 5.
 *
 * It names the Hangout, its time and every Participant, because a hard delete
 * (ticket 08 §3) leaves nothing to check afterwards: no tombstone, no undo, and
 * the other Friends find out by noticing an absence. And **anyone may cancel
 * anyone's plan** (ticket 01), so the person reading this is quite likely not
 * the person who made it — which is the case the Participant list is for.
 */
export const CancelDialog = ({
  hangout,
  friendsById,
  onConfirm,
  onDismiss,
}: {
  hangout: Hangout
  friendsById: ReadonlyMap<string, SetUpFriend>
  /** Resolves to a message to show, or null once it is gone. */
  onConfirm: () => Promise<string | null>
  onDismiss: () => void
}) => {
  const when = whenOf(hangout.startsAt, hangout.endsAt, GROUP_TIME_ZONE)
  const names = facesOf(hangout, friendsById).map((friend) => friend.name)
  const { error, saving, run } = useSaveAction()

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onDismiss()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel {nameOf(hangout)}?</AlertDialogTitle>
          <AlertDialogDescription>
            {when.date} · {when.range}
            {names.length > 0 && <> — with {names.join(', ')}</>}. It is deleted outright: there is
            no undo, no record that it existed, and nobody is told.{' '}
            {participantIds(hangout).length > 1
              ? 'The others will find out by noticing it is gone.'
              : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error ? <SaveError message={error} /> : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={saving}
            onClick={() => void run(onConfirm, onDismiss)}
          >
            {saving ? 'Cancelling…' : 'Cancel the hangout'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
