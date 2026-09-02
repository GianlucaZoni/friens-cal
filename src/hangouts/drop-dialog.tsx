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
import { nameOf, wouldAutoCancel, type Hangout } from '@/hangouts/hangout'
import { GROUP_TIME_ZONE } from '@/shell/use-calendar-view'

/**
 * Ticket 08 §10: **the erase that costs a plan, named before it happens.**
 *
 *     ┌────────────────────────────────────────────┐
 *     │ Erase this availability?                   │
 *     │ …Erasing it drops you from:                │
 *     │   Pizza                                    │
 *     │   Sat 4 Sep · 20:00 – 23:00                │
 *     │   Climbing                                 │
 *     │   Sun 5 Sep · 10:00 – 12:00                │
 *     │   and cancels it — you are the only one    │
 *     │   on it                                    │
 *     │                    [Keep it] [Erase anyway]│
 *     └────────────────────────────────────────────┘
 *
 * **Every Hangout, not a count.** That is the whole of §10 — *"this drops you
 * from Pizza Sat 20:00 and Climbing Sun 10:00"* — and a list rather than one
 * sentence because there is no upper bound on how many a long erase reaches,
 * and a sentence with six clauses in it is a count with extra steps.
 *
 * **It is the grid's dialog, not the card's.** The card's cancel affects exactly
 * one Hangout and is built singular (ticket 16's correction to its own item 5);
 * this one fires on the Availability-delete path and is plural by construction.
 * The two are different questions: *am I still coming* and *is this still
 * happening*.
 *
 * **An `AlertDialog`, and the action is destructive.** There is no undo (ticket
 * 01) and re-drawing the Availability does not put you back — adding
 * Availability never adds you (`CONTEXT.md`) — so this is a one-way door and
 * the button says so.
 */
export const DropDialog = ({
  dropping,
  viewerId,
  now,
  onConfirm,
  onDismiss,
}: {
  /** Every Hangout this erase drops the viewer from — never empty. */
  dropping: readonly Hangout[]
  /** The viewer's own id, so the last-Participant line is about them. */
  viewerId: string
  /** The app's one clock, for the Past exemption `wouldAutoCancel` applies. */
  now: number
  onConfirm: () => void
  onDismiss: () => void
}) => (
  <AlertDialog
    open
    onOpenChange={(open) => {
      if (!open) onDismiss()
    }}
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Erase this availability?</AlertDialogTitle>
        <AlertDialogDescription>
          {/*
            The consequence stated **before** the controls, which is ticket 16's
            rule for the sibling dialog and is right for the same reason here:
            the sentence is the only thing that makes the buttons mean anything.
          */}
          {dropping.length === 1
            ? 'It is holding you on a confirmed hangout. Erasing it drops you from:'
            : 'It is holding you on confirmed hangouts. Erasing it drops you from:'}
        </AlertDialogDescription>
      </AlertDialogHeader>

      <ul className="flex flex-col gap-2 text-left text-xs">
        {dropping.map((hangout) => (
          <DropLine key={hangout.id} hangout={hangout} viewerId={viewerId} now={now} />
        ))}
      </ul>

      <AlertDialogFooter>
        <AlertDialogCancel>Keep it</AlertDialogCancel>
        {/*
          "Erase anyway", not "Confirm": the label has to name the destructive
          half of what was just described, because that is the half somebody
          skim-reading acts on.
        */}
        <AlertDialogAction variant="destructive" onClick={onConfirm}>
          Erase anyway
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)

/**
 * One line: **the name, then when** — the hierarchy ticket 16 settled for the
 * card, so a Hangout is referred to the same way wherever it is named.
 *
 * `nameOf`, so an unnamed one reads as *"Hangout"* rather than leaving the
 * sentence with a hole in it. That default is why this dialog needs no null
 * case at all.
 *
 * **And the auto-cancel, where it applies.** `wouldAutoCancel` is the same
 * prediction `06-hangout-lifecycle.sql`'s trigger makes, and the difference it
 * describes is not a detail: leaving a plan and deleting it for everybody are
 * different acts, and only one of them is what this gesture looks like from the
 * outside. Ticket 08 §3 has no tombstone and no undo behind it.
 */
const DropLine = ({
  hangout,
  viewerId,
  now,
}: {
  hangout: Hangout
  viewerId: string
  now: number
}) => {
  const when = whenOf(hangout.startsAt, hangout.endsAt, GROUP_TIME_ZONE)

  return (
    <li className="flex flex-col">
      <span className="font-medium">{nameOf(hangout)}</span>
      <span className="text-muted-foreground tabular-nums">
        {when.date} · {when.range}
      </span>
      {wouldAutoCancel(hangout, viewerId, now) && (
        <span className="text-destructive">
          …and cancels it — you are the only one on it, and there is no undo.
        </span>
      )}
    </li>
  )
}
