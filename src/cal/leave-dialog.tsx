import { useSession } from '@/auth/use-session'
import { CodeToShare } from '@/cal/copy-code'
import { leavingConsequence } from '@/cal/leaving'
import type { CalsState } from '@/cal/use-cals'
import { useLeaving } from '@/cal/use-leaving'
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
import { HangoutLine } from '@/hangouts/hangout-line'
import { SaveError } from '@/identity/save-error'
import { useSaveAction } from '@/identity/use-save-action'
import type { Cal } from '@/lib/database.types'
import { useState } from 'react'

/**
 * Leaving a cal, named before it happens.
 *
 *     ┌────────────────────────────────────────────┐
 *     │ Leave climbing crew?                       │
 *     │ Leaving takes you off 2 hangouts here that │
 *     │ have not happened yet:                     │
 *     │   Pizza                                    │
 *     │   Sat 4 Sep · 20:00 – 23:00                │
 *     │   Climbing                                 │
 *     │   Sun 5 Sep · 10:00 – 12:00                │
 *     │   …and cancels it — you are the only one   │
 *     │   on it                                    │
 *     │ The ones that already happened keep your   │
 *     │ name. Your availability here goes with you.│
 *     │ You can come back with this code:          │
 *     │   H3DKW9                          [Copy]   │
 *     │                    [Stay] [Leave this cal] │
 *     └────────────────────────────────────────────┘
 *
 * Same shape as [drop-dialog.tsx](../hangouts/drop-dialog.tsx) and for the same
 * reasons: the consequence stated **before** the controls, every Hangout
 * **named rather than counted**, a bounded list that scrolls inside a dialog
 * that cannot push its own buttons off a phone, and an `AlertDialog` whose
 * action names the destructive half.
 *
 * ## The three things it says, and why the third is here at all
 *
 * **What goes.** The cal's future Hangouts the viewer is on, each one named,
 * with the ones that will be **cancelled outright** marked — `wouldAutoCancel`
 * is the same prediction `cancel_empty_hangouts` makes, and leaving a plan and
 * deleting it for everybody are different acts.
 *
 * **What stays.** The past keeps your name. This dialog is otherwise a list of
 * losses, and the asymmetry is worth saying once where somebody reads it: a
 * past Hangout is a record of who was there, and leaving says nothing about
 * where you were (`CONTEXT.md`). It is not free, either — it is a predicate in
 * `10-lifecycle-per-cal.sql` §2 that exists only to keep this true.
 *
 * **The Code.** Leaving is the exact moment the Code becomes unreachable to
 * you, and if you are the last Member there is nobody left to ask for it. It
 * leaks nothing: you are a Member as you read it, and every Member sees the
 * Code. The way back is that Code and nothing else — `join_cal` is idempotent,
 * so typing it again makes a fresh Membership, and Rejoin on a Hangout is
 * unconditional and still there.
 *
 * **No type-to-confirm.** That ceremony exists nowhere in this product. The
 * named list is the friction, as it is for the erase.
 *
 * The lines are `HangoutLine`, shared with the erase's dialog, which is also
 * where the zone is read: `useViewerZone` answers above the shell's provider
 * too, and on `/` that is the device's clock with no `GMT+2` frame. A leave
 * dialog that hardcoded a cal's zone would be the last thing in the product
 * still believing a cal has a clock of its own.
 */
export const LeaveCalDialog = ({
  cal,
  leave,
  onClose,
}: {
  cal: Cal
  leave: CalsState['leave']
  onClose: () => void
}) => {
  const { state } = useSession()
  const viewerId = state.status === 'signed-in' ? state.user.id : null

  /*
   * The instant the dialog opened, held rather than ticked. `useSlotClock` is
   * the app's clock and it lives in the shell, which this page is not inside;
   * more to the point, a plan dropping off this list while somebody is reading
   * it is worse than one that is half a minute stale. The read is issued with
   * this value and the list is filtered by it, so the two cannot disagree.
   */
  const [now] = useState(() => Date.now())
  const leaving = useLeaving(cal.id, viewerId, now)
  const { error, saving, run } = useSaveAction()

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        // Escape and the backdrop both arrive here, and both mean Stay. Not
        // while the delete is in flight: the dialog is what will report a
        // failure, so it has to outlive the statement.
        if (!open && !saving) onClose()
      }}
    >
      {/*
        The same cap as `drop-dialog.tsx`, which carries the measurement: a busy
        month names a dozen plans, and unbounded they take the two buttons off
        the bottom of a phone. Driven at 375x812 with nine: the content scrolls
        and the footer's bottom edge lands at 761.
      */}
      <AlertDialogContent className="max-h-[calc(100svh-2rem)] grid-rows-[auto_1fr_auto]">
        <AlertDialogHeader>
          <AlertDialogTitle>Leave {cal.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {leaving.status === 'loading'
              ? 'Checking what leaving takes with it…'
              : leaving.status === 'error'
                ? 'We could not read the plans in this cal, so this cannot name what leaving takes you off.'
                : leavingConsequence(leaving.hangouts.length)}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto text-left text-xs">
          {leaving.hangouts.length > 0 && (
            <ul className="flex flex-col gap-2">
              {leaving.hangouts.map((hangout) => (
                <HangoutLine key={hangout.id} hangout={hangout} viewerId={viewerId} now={now} />
              ))}
            </ul>
          )}

          {/*
            The asymmetry, said once. Two sentences rather than one because they
            are two different facts: one is a promise the database keeps for you
            and the other is a deletion.
          */}
          <p className="text-muted-foreground">
            Hangouts here that already happened keep your name. The availability you drew in this
            cal goes with you, and everywhere else is untouched.
          </p>

          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground">
              This code is the way back in. Keep it — once you leave, this is the last place you can
              read it.
            </p>
            <CodeToShare code={cal.code} />
          </div>

          {error ? <SaveError message={error} /> : null}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Stay</AlertDialogCancel>
          {/*
            "Leave this cal", not "Confirm": the label has to name the
            destructive half of what was just described, because that is the
            half somebody skim-reading acts on.

            Disabled while the list is still being read, so nobody answers a
            question whose consequence is still loading. A failed read does
            **not** disable it — an outage in a separate query is not a reason
            to hold somebody in a cal, and the other two things this dialog owes
            them are on screen either way.
          */}
          <AlertDialogAction
            variant="destructive"
            disabled={saving || leaving.status === 'loading'}
            onClick={() => void run(() => leave(cal.id), onClose)}
          >
            {saving ? 'Leaving…' : 'Leave this cal'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
