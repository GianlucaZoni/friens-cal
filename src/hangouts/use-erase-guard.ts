import type { AvailabilityStore } from '@/availability/use-availability'
import { droppedBy, type Hangout } from '@/hangouts/hangout'
import { useCallback, useMemo, useState } from 'react'

/** An erase waiting on an answer, and what it is about to cost. */
export type PendingErase = {
  /** Exactly the instants the gesture asked for — replayed verbatim on confirm. */
  instants: readonly Date[]
  /** Every Hangout it would drop the viewer from. Never empty while this exists. */
  dropping: readonly Hangout[]
}

export type EraseGuard = {
  /**
   * The grid's erase, gated. Writes straight through when nothing is at stake,
   * which is almost every erase there is.
   */
  requestErase: (instants: readonly Date[]) => void
  /** The dialog's whole state: null when there is nothing to ask about. */
  pending: PendingErase | null
  confirm: () => void
  dismiss: () => void
}

/**
 * Ticket 08 §10's confirmation, in front of the erase that would cost a plan.
 *
 * ## Where this lives, and why it is not the card's dialog
 *
 * Ticket 16 found this dialog had no surface assigned and ticket 08 answered it:
 * it fires on the **grid**, on the path that deletes Availability — the erase
 * drag, or `Erase block` from the slot popover — and it **names every Hangout**
 * the erase would drop you from rather than counting them. The Hangout card's
 * cancel dialog is a different thing entirely: it affects exactly one Hangout,
 * always, and is built singular (ticket 16's correction to its own item 5).
 *
 * With no notifications in v1, ticket 07 §7 calls this *"the only thing standing
 * between a mis-click and silently leaving a plan"* — which is also why the
 * database's rule is strict regardless of what this does. The trigger has to
 * hold for the writes this dialog never sees.
 *
 * ## It has to predict the trigger, not approximate it
 *
 * `droppedBy` is the same expression as
 * `06-hangout-lifecycle.sql` §3's `generate_series`, and the agreement is the
 * feature: a dialog that named the wrong Hangouts would be worse than none,
 * because it would be believed. That is what pins coverage to exact slot-set
 * containment, and the 30-minute grid check constraint to being a constraint.
 *
 * ## Why it gates rather than warns afterwards
 *
 * The strict drop is not undoable — ticket 01 left no undo stack, and re-drawing
 * the Availability does **not** put you back on the plan, because adding
 * Availability never adds you (`CONTEXT.md`). So the only moment this can be
 * said is before the delete.
 *
 * ## The ordinary erase is untouched
 *
 * No pending state, no dialog, no extra render: `requestErase` calls straight
 * through when `dropping` is empty. Erasing Availability that covers nothing is
 * the common case, and ticket 19's whole point is that a gesture's rows land the
 * moment it ends.
 */
export const useEraseGuard = ({
  hangouts,
  availability,
  friendId,
}: {
  /** Every Hangout the app holds, Past ones included — see `droppedBy`. */
  hangouts: readonly Hangout[]
  availability: AvailabilityStore
  /** The signed-in Friend. Null renders a grid nothing can be erased from. */
  friendId: string | null
}) => {
  const [pending, setPending] = useState<PendingErase | null>(null)

  const { erase, isFree } = availability

  /**
   * "Does the viewer hold this Slot?", as `droppedBy` wants it — a predicate
   * over instants rather than the store's `(friendId, Date)` pair.
   *
   * Rebuilt when `isFree` changes, which is when the store's slot set moves —
   * so a Realtime insert while the dialog is open would be reflected by the
   * next answer rather than by a stale closure. The dialog itself does not
   * recompute: what it names was measured when the gesture ended, which is the
   * state the person was looking at.
   */
  const holds = useCallback(
    (slotStart: number) => (friendId === null ? false : isFree(friendId, new Date(slotStart))),
    [friendId, isFree]
  )

  const requestErase = useCallback(
    (instants: readonly Date[]) => {
      if (friendId === null) return

      /*
       * Keyed on the instant, never on the text — `slotKey`'s rule in
       * `slots.ts`, one type over. A `Set<number>` rather than of keys because
       * `droppedBy` walks a Hangout's own Slot lattice in epoch milliseconds,
       * and the Friend is already fixed.
       */
      const erasing = new Set(instants.map((instant) => instant.getTime()))
      const dropping = droppedBy(hangouts, friendId, erasing, holds)

      if (dropping.length === 0) {
        erase(instants)
        return
      }
      setPending({ instants, dropping })
    },
    [friendId, hangouts, holds, erase]
  )

  /**
   * Erase exactly what was described.
   *
   * The instants come out of `pending` rather than out of a closure over the
   * gesture: the dialog's action fires renders later, and what lands has to be
   * what the sentence named. `useAvailability`'s own delta filter runs on the
   * way through, so a Slot somebody else's Realtime event took away in the
   * meantime is simply not deleted twice.
   *
   * Not inside a `setPending` updater, which would put a write inside a
   * function StrictMode invokes twice.
   */
  const confirm = useCallback(() => {
    if (pending === null) return
    erase(pending.instants)
    setPending(null)
  }, [pending, erase])

  const dismiss = useCallback(() => setPending(null), [])

  return useMemo<EraseGuard>(
    () => ({ requestErase, pending, confirm, dismiss }),
    [requestErase, pending, confirm, dismiss]
  )
}
