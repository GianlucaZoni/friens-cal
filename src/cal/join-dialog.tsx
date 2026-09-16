import { isCompleteCode } from '@/cal/code'
import { CodeField } from '@/cal/code-field'
import type { CalsState } from '@/cal/use-cals'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { SaveError } from '@/identity/save-error'
import type { Cal } from '@/lib/database.types'
import { useEffect, useRef, useState } from 'react'

/**
 * Typing a Code, and being in.
 *
 * ## There is no preview step, and that is a security decision rather than a
 * shortcut
 *
 * A dialog that resolved the Code and showed the cal's name and size before
 * committing would feel more careful and be strictly worse: it is a pure
 * enumeration oracle, letting somebody probe Codes and learn what exists
 * **without leaving a Membership row behind**. Joining immediately has no such
 * gap — guessing right joins you, and you appear in a roster five friends look
 * at. Groups ticket 11 §4.
 *
 * ## Two ways to submit, one submission
 *
 * `onComplete` fires the moment the sixth character lands, typed or pasted,
 * which is what makes the common case one gesture. The button is still there
 * for the Friend who filled the field and then looked away, and for anybody
 * driving this by keyboard who expects a form to have one. `pending` is a ref
 * rather than the `busy` state because two events in the same tick would both
 * read the old state.
 *
 * ## A Code you already hold is not a failure
 *
 * `join_cal` is idempotent: it returns the cal either way. So there is no
 * third outcome to design for here — the dialog routes you there exactly as if
 * the row had been picked from the list behind it.
 */
export const JoinDialog = ({
  open,
  onOpenChange,
  join,
  onJoined,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  join: CalsState['join']
  onJoined: (cal: Cal) => void
}) => {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const field = useRef<HTMLInputElement>(null)
  /**
   * Which attempt is the live one.
   *
   * This dialog is always mounted — the page renders it whether or not it is
   * open — so closing it during "Joining…" does not unmount the continuation
   * below the `await`. Without this, Cancel or Escape mid-flight would still
   * route the Friend into the cal they just backed out of, or write an error
   * onto a dialog that is no longer on screen and have it waiting the next time
   * they open it. Closing bumps the counter; a continuation whose run is no
   * longer current writes nothing.
   */
  const run = useRef(0)

  /**
   * The caret goes back into the emptied field, and it has to happen here
   * rather than in the failure branch: the input carries `disabled` while the
   * attempt is in flight, and a disabled input cannot take focus — calling
   * `focus()` beside `setBusy(false)` runs a commit too early and does nothing
   * at all. Verified, rather than reasoned: it silently did nothing.
   */
  useEffect(() => {
    if (error !== null && !busy) field.current?.focus()
  }, [error, busy])

  /** Back to the state the dialog opens in, with anything in flight abandoned. */
  const reset = () => {
    run.current += 1
    pending.current = false
    setBusy(false)
    setCode('')
    setError(null)
  }

  const submit = async (value: string) => {
    if (pending.current) return
    pending.current = true
    const mine = ++run.current
    setBusy(true)
    setError(null)

    const result = await join(value)

    if (mine !== run.current) return // Closed, or reopened, under us.
    pending.current = false
    setBusy(false)

    if (result.error !== undefined) {
      setError(result.error)
      /*
       * The field is emptied on a failure, and that is the retry rather than
       * tidiness. `onComplete` fires on a five-to-six transition, so a field
       * left holding six wrong characters never auto-submits again — and
       * `input-otp` splices a paste in at the caret, so pasting the right Code
       * over the wrong one silently produces a mixture of the two. Emptying it
       * makes both ways of trying again behave the way they did the first time.
       * The sentence above says what was wrong with it; the characters
       * themselves are not worth keeping.
       */
      setCode('')
      return
    }
    // Closed first, then routed: the dialog is unmounted by the navigation
    // either way, and closing it explicitly is what puts focus back where it
    // came from if the route happens to keep this page mounted.
    onOpenChange(false)
    setCode('')
    onJoined(result.cal)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        // Cleared on close rather than on open, so a dialog that is reopened
        // does not flash the last attempt before the effect that would clear it.
        if (!next) reset()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Join with a code</DialogTitle>
          <DialogDescription>
            Six characters, from whoever is already in it. Case does not matter.
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor="join-code">Code</FieldLabel>
          <CodeField
            id="join-code"
            inputRef={field}
            value={code}
            onChange={(next) => {
              setCode(next)
              setError(null)
            }}
            onComplete={(value) => void submit(value)}
            disabled={busy}
            invalid={error !== null}
          />
          <FieldDescription>Paste works too, dashes and all.</FieldDescription>
        </Field>

        {error ? <SaveError message={error} /> : null}

        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          <Button disabled={busy || !isCompleteCode(code)} onClick={() => void submit(code)}>
            {busy ? 'Joining…' : 'Join'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
