import { whenOf } from '@/candidates/when'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { covers, facesOf, nameOf, type Hangout } from '@/hangouts/hangout'
import {
  dateValueOf,
  dayFromValue,
  endChoices,
  sameClockOn,
  startChoices,
  todayValue,
} from '@/hangouts/retime'
import { SaveError } from '@/identity/save-error'
import { useSaveAction } from '@/identity/use-save-action'
import type { SetUpFriend } from '@/roster/use-roster'
import { GROUP_TIME_ZONE } from '@/shell/use-calendar-view'
import { useMemo, useState } from 'react'

/**
 * The force-write editor: **a Dialog, not a Popover**, and the four reasons are
 * ticket 16's.
 *
 * 1. Outside-click would silently discard edits on **the one action in this
 *    product that writes other people's data**.
 * 2. A popover occludes the grid being consulted to pick a time.
 * 3. Ticket 08 §7's collision rejection has nowhere to land in a popover, and
 *    it is a real outcome rather than an error case: two plans may not overlap
 *    at all (§7), so a force-write onto a booked evening comes back `23P01` and
 *    has to be **surfaced in the editor** rather than silently dropped.
 * 4. The consequence must be stated **before** the controls, not after.
 *
 * Ticket 16's amendment allows a Sheet to *contain* a Dialog, which is what
 * makes this the same component on both platforms: the detail opens it and
 * closes itself, so the editor is never nested inside a popover.
 *
 * ## The consequence, above the controls
 *
 * Ticket 08 §11: *"the retime-confirmation dialog names the Friends whose
 * calendars it will write to"* — "Marco, Sara and Luca will be marked free Tue
 * 19:00–21:00". This is the one action that edits other people's data, and with
 * no notifications in v1 the person doing it is the only one who can see it
 * happen. Ticket 07's answer makes that load-bearing rather than courteous: the
 * `edited` badge used to be justified as *"the only signal a Participant gets
 * that slots were written for them"*, and now that a rename sets it too, this
 * sentence is where that signal actually lives.
 *
 * It names only the Friends who do **not** already cover the new range, because
 * that is what "will write to" means — and it recomputes as the controls move,
 * so it is the consequence of what is currently selected rather than of what
 * was selected when the dialog opened.
 *
 * ## Not optimistic, and it reports in place
 *
 * The last of issue 10's acceptance criteria, and the reason `retime` resolves
 * to a message rather than raising a toast: the cross-Friend write is not
 * painted anywhere until the database has agreed, and the outcome lands in the
 * dialog that asked for it. A toast would put the answer somewhere the person
 * is no longer looking, next to a dialog still showing the time they proposed.
 *
 * ## Every choice is on the 30-minute grid
 *
 * Ticket 07 §6's obligation on the manual editor, met by having nothing else to
 * offer: the starts are `slotsOfDay`'s own Slots and the ends are whole Slots
 * forward of one (`retime.ts`). There is no free-text time field, so there is
 * nothing to snap — and `05-hangout.sql`'s check constraint would answer `23514`
 * if there were and it went wrong.
 */
export const RetimeDialog = ({
  hangout,
  friendsById,
  isFree,
  onRetime,
  onClose,
}: {
  hangout: Hangout
  /** The whole roster by id, Hidden included — the Participants' faces. */
  friendsById: ReadonlyMap<string, SetUpFriend>
  /** The Availability store's question, for the consequence line. */
  isFree: (friendId: string, slotStart: Date) => boolean
  /** Resolves to a message to show, or null once the Hangout has moved. */
  onRetime: (startsAt: number, endsAt: number) => Promise<string | null>
  onClose: () => void
}) => {
  /*
   * The draft reads the Hangout in its initialiser and never reconciles: the
   * caller mounts this on open and unmounts it on close, which is the pattern
   * `profile-dialogs.tsx` set — so there is no stale draft and no reset to
   * remember.
   */
  const [startsAt, setStartsAt] = useState(hangout.startsAt)
  const [endsAt, setEndsAt] = useState(hangout.endsAt)
  const { error, saving, run } = useSaveAction()

  const day = useMemo(() => dayFromValue(dateValueOf(startsAt, GROUP_TIME_ZONE)), [startsAt])
  const starts = useMemo(() => (day === null ? [] : startChoices(day, GROUP_TIME_ZONE)), [day])
  const ends = useMemo(() => endChoices(startsAt, GROUP_TIME_ZONE), [startsAt])

  /**
   * Whose calendars this will be written to — the Participants who do not
   * already cover the proposed range.
   *
   * `covers` is `hangout.ts`'s exact slot-set containment, the same predicate
   * the drop trigger uses, so this cannot disagree with what the RPC will
   * actually insert.
   *
   * **It can over-name, in one direction only.** The store holds Availability
   * from the view's floor forward, so a retime backwards past it reads `false`
   * for Slots nobody has fetched — and the sentence then promises a write that
   * `on conflict do nothing` turns into nothing. Over-naming is the safe half:
   * the failure worth avoiding is a dialog that *fails* to warn.
   */
  const writingTo = useMemo(() => {
    const range = { startsAt, endsAt }
    return facesOf(hangout, friendsById).filter(
      (friend) => !covers(range, (slotStart) => isFree(friend.id, new Date(slotStart)))
    )
  }, [hangout, friendsById, isFree, startsAt, endsAt])

  const proposed = whenOf(startsAt, endsAt, GROUP_TIME_ZONE)
  const current = whenOf(hangout.startsAt, hangout.endsAt, GROUP_TIME_ZONE)
  const moved = startsAt !== hangout.startsAt || endsAt !== hangout.endsAt

  /**
   * Changing the date keeps the wall clock and the duration.
   *
   * *This plan, but on Tuesday* is what somebody means, and both halves of it
   * have to be recomputed rather than shifted by a day of milliseconds — a DST
   * day is 23 or 25 hours long, and only the wall clock survives it.
   */
  const onDay = (value: string) => {
    const picked = dayFromValue(value)
    if (picked === null) return
    const nextStart = sameClockOn(startsAt, picked, GROUP_TIME_ZONE)
    setEndsAt(nextStart + (endsAt - startsAt))
    setStartsAt(nextStart)
  }

  /** Changing the start keeps the duration, so the end follows it. */
  const onStart = (value: string) => {
    const nextStart = Number(value)
    setEndsAt(nextStart + (endsAt - startsAt))
    setStartsAt(nextStart)
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change the time</DialogTitle>
          <DialogDescription>
            {nameOf(hangout)} — currently {current.date} · {current.range}.
          </DialogDescription>
        </DialogHeader>

        {/*
          The consequence, ABOVE the controls (ticket 16). It is the reason this
          dialog exists at all: the controls on their own would read as an
          ordinary edit to an ordinary field.
        */}
        <Consequence friends={writingTo} when={`${proposed.date} · ${proposed.range}`} />

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="retime-date">Day</FieldLabel>
            {/*
              A native date input rather than the calendar component: it is one
              field in a dialog that already has two lists in it, and the picker
              a phone gives it is better than anything this would render.
            */}
            <Input
              id="retime-date"
              type="date"
              min={todayValue(GROUP_TIME_ZONE)}
              disabled={saving}
              value={dateValueOf(startsAt, GROUP_TIME_ZONE)}
              onChange={(event) => onDay(event.target.value)}
            />
          </Field>

          <div className="flex gap-2">
            <Field className="flex-1">
              <FieldLabel htmlFor="retime-start">From</FieldLabel>
              <Select
                items={starts.map((choice) => ({ value: String(choice.at), label: choice.label }))}
                value={String(startsAt)}
                onValueChange={(value) => onStart(String(value))}
                disabled={saving}
              >
                <SelectTrigger id="retime-start" className="w-full tabular-nums">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {starts.map((choice) => (
                    <SelectItem key={choice.at} value={String(choice.at)}>
                      {choice.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field className="flex-1">
              <FieldLabel htmlFor="retime-end">To</FieldLabel>
              <Select
                items={ends.map((choice) => ({ value: String(choice.at), label: choice.label }))}
                value={String(endsAt)}
                onValueChange={(value) => setEndsAt(Number(value))}
                disabled={saving}
              >
                <SelectTrigger id="retime-end" className="w-full tabular-nums">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {ends.map((choice) => (
                    <SelectItem key={choice.at} value={String(choice.at)}>
                      {choice.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/*
            Where ticket 08 §7's rejection lands, and the whole of reason 3 for
            this being a Dialog. `SaveError` is the same one sentence the setup
            route and the profile dialogs show.
          */}
          {error ? <SaveError message={error} /> : null}
        </FieldGroup>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          {/*
            Disabled while nothing has moved: a retime that changes no time
            would still mark the Hangout `edited` and still write everybody's
            calendar, which is a lot of consequence for a no-op.
          */}
          <Button
            onClick={() => void run(() => onRetime(startsAt, endsAt), onClose)}
            disabled={saving || !moved}
          >
            {saving ? 'Moving…' : 'Change the time'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * *"Marco, Sara and Luca will be marked free Tue 19:00–21:00"* — ticket 08 §11,
 * as close to verbatim as a live sentence gets.
 *
 * **Nobody to name is its own sentence, not a blank.** Every Participant
 * already covering the new range is the ordinary case for a small move, and an
 * empty warning box would read as a rendering fault — while no box at all would
 * make the dialog's shape jump as the controls move. So it says the reassuring
 * thing instead, which is also true and worth knowing.
 */
const Consequence = ({ friends, when }: { friends: readonly SetUpFriend[]; when: string }) => (
  <p
    className="border border-foreground/15 bg-muted p-3 text-xs"
    /*
      A live region, because the sentence changes underneath a control the
      viewer is operating rather than in response to a navigation — a screen
      reader that only read it on open would report the consequence of the time
      the dialog started at.
    */
    aria-live="polite"
  >
    {friends.length === 0 ? (
      <>
        Everybody on this hangout is already free {when}. Nobody else&apos;s calendar will be
        changed.
      </>
    ) : (
      <>
        <strong className="font-medium">{listOf(friends.map((friend) => friend.name))}</strong> will
        be marked free {when}. There is no notification, and the extra availability is not removed
        if the hangout moves back.
      </>
    )}
  </p>
)

/**
 * `a`, `a and b`, `a, b and c` — the Oxford-less list ticket 08 §11 writes.
 *
 * Here rather than in `when.ts` because it is about *people*, and this is the
 * only sentence in the product that names a set of Friends in prose.
 */
const listOf = (names: readonly string[]): string =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
