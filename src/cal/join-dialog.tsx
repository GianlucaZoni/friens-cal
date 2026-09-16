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
import type { Cal } from '@/lib/database.types'
import { useRef, useState } from 'react'
import { TriangleAlertIcon } from 'lucide-react'

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

  const submit = async (value: string) => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError(null)

    const result = await join(value)

    pending.current = false
    setBusy(false)
    if (result.error !== undefined) {
      setError(result.error)
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
        if (!next) {
          setCode('')
          setError(null)
        }
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

        {error ? (
          <div
            role="alert"
            className="flex gap-2 border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
          >
            <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

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
