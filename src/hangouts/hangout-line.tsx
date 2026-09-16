import { whenOf } from '@/candidates/when'
import { nameOf, wouldAutoCancel, type Hangout } from '@/hangouts/hangout'
import { useViewerZone } from '@/shell/viewer-zone'

/**
 * One Hangout in a list of what an act is about to cost: **the name, then
 * when**, and the auto-cancel where it applies.
 *
 * The hierarchy is ticket 16's, settled for the card, so a Hangout is referred
 * to the same way wherever it is named. `nameOf` is why there is no null case:
 * an unnamed one reads as *"Hangout"* rather than leaving the sentence with a
 * hole in it.
 *
 * **And the auto-cancel.** `wouldAutoCancel` is the same prediction
 * `cancel_empty_hangouts` makes, and the difference it describes is not a
 * detail: leaving a plan and deleting it for everybody are different acts, and
 * only one of them is what the gesture looks like from the outside. There is no
 * tombstone and no undo behind the second (ticket 08 §3).
 *
 * Its own file rather than a local helper, because there are two callers and
 * they are two different acts on two different screens: `drop-dialog.tsx`,
 * where an erase costs you Hangouts, and `cal/leave-dialog.tsx`, where leaving
 * the cal does. The same file for the same reason `DialogShell` is one — the
 * second copy would have been a second copy of the paragraph above, and of the
 * sentence below, which has to say the same thing in both places or the two
 * dialogs describe the same database write differently.
 *
 * The zone comes from `useViewerZone`, which answers above its provider too: on
 * `/` that is the device's zone with no frame, and the frame is a fact about a
 * cal's roster that `/` has no roster to ask about.
 */
export const HangoutLine = ({
  hangout,
  viewerId,
  now,
}: {
  hangout: Hangout
  /** Null renders no auto-cancel line, which is honest: nobody is the viewer. */
  viewerId: string | null
  /** The app's one clock, for the Past exemption `wouldAutoCancel` applies. */
  now: number
}) => {
  const zone = useViewerZone()
  const when = whenOf(hangout.startsAt, hangout.endsAt, zone)

  return (
    <li className="flex flex-col">
      <span className="font-medium">{nameOf(hangout)}</span>
      <span className="text-muted-foreground tabular-nums">
        {when.date} · {when.range}
      </span>
      {viewerId !== null && wouldAutoCancel(hangout, viewerId, now) && (
        <span className="text-destructive">
          …and cancels it — you are the only one on it, and there is no undo.
        </span>
      )}
    </li>
  )
}
