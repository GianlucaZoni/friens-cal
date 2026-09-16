import { CAL_NAME_MAX } from '@/cal/cals'
import { CodeToShare } from '@/cal/copy-code'
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { SaveError } from '@/identity/save-error'
import type { Cal } from '@/lib/database.types'
import { useRef, useState } from 'react'
import { ArrowRightIcon } from 'lucide-react'

/**
 * Creating a cal: the name, then the Code, in two dialogs in a row.
 *
 * ## Why the second dialog rather than the Code appearing on the page
 *
 * A modal whose only content is a string to copy is a pattern worth arguing
 * about, and prototype 05 argued it: the two alternatives were revealing the
 * Code in place on the card and adding the new row to the list with its Code
 * already visible, and both lost. This is **the one moment the Code has to be
 * unmissable**. Everywhere else it is a quiet muted column, and a cal with
 * nobody else in it is useless until the Code has been sent to somebody.
 *
 * It is not a trap either: a Friend who dismisses this without reading it still
 * has the Code on the list behind it.
 *
 * ## The two are one component
 *
 * The second opens as the first closes, so which one is on screen is one piece
 * of state rather than two that have to agree. The parent only says whether the
 * flow is running.
 */
export const CreateCalDialogs = ({
  open,
  onOpenChange,
  create,
  onOpenCal,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  create: CalsState['create']
  onOpenCal: (cal: Cal) => void
}) => {
  /**
   * The cal the second dialog is about, and whether it is on screen — two
   * pieces of state rather than one, and the split is not redundancy.
   *
   * Closing on `setMade(null)` alone empties the dialog in the same frame it
   * starts animating out, so the Friend watches the Code they were just handed
   * blink away into a blank rectangle. Keeping the row until the next create
   * overwrites it lets the exit animation carry its own contents.
   */
  const [made, setMade] = useState<Cal | null>(null)
  const [showing, setShowing] = useState(false)

  return (
    <>
      <NameDialog
        open={open}
        onOpenChange={onOpenChange}
        create={create}
        onMade={(cal) => {
          onOpenChange(false)
          setMade(cal)
          setShowing(true)
        }}
      />

      <Dialog open={showing} onOpenChange={(next) => !next && setShowing(false)}>
        <DialogContent>
          {made ? (
            <>
              <DialogHeader>
                <DialogTitle>{made.name} is live</DialogTitle>
                <DialogDescription>
                  Send this code to whoever should be in it. It never changes and it is not a
                  secret.
                </DialogDescription>
              </DialogHeader>

              <CodeToShare code={made.code} />

              <DialogFooter>
                <DialogClose render={<Button variant="ghost" />}>Later</DialogClose>
                <Button
                  onClick={() => {
                    setShowing(false)
                    onOpenCal(made)
                  }}
                >
                  Open it
                  <ArrowRightIcon data-icon="inline-end" />
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * The first dialog: what everyone in it will call this.
 *
 * `maxLength` at 40 rather than the column's 60, capped where it is typed —
 * which is the only place a Friend can see the limit happen. `cals.ts` holds
 * the number, and ticket 03's rename dialog reads the same one.
 *
 * The name is trimmed by `create_cal` server-side as well as here, because the
 * column's check is `length(btrim(name)) between 1 and 60`: a name that is all
 * spaces is a `23514` rather than a cal, and the disabled button is what keeps
 * a Friend from meeting it.
 */
const NameDialog = ({
  open,
  onOpenChange,
  create,
  onMade,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  create: CalsState['create']
  onMade: (cal: Cal) => void
}) => {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /**
   * A ref rather than the `busy` state, and here it is not a nicety.
   *
   * Two submits in the same tick — Enter and the button, or a double press —
   * both read the old `busy`, and `create_cal` has no `on conflict` to make the
   * second one harmless the way `join_cal` does. There is no delete grant on
   * `cal` either (`08-cal-and-membership.sql` §5), so the second cal is one
   * nobody can ever get rid of.
   */
  const pending = useRef(false)
  /** Which attempt is live. Same reasoning as the Join dialog's. */
  const run = useRef(0)

  const reset = () => {
    run.current += 1
    pending.current = false
    setBusy(false)
    setName('')
    setError(null)
  }

  const submit = async () => {
    if (pending.current) return
    pending.current = true
    const mine = ++run.current
    setBusy(true)
    setError(null)

    const result = await create(name)

    // Cancelled while it was in flight. The cal exists — nothing can undo that
    // — but it is on the list behind this dialog, which is where a Friend who
    // dismissed the flow should find it rather than in a modal they closed.
    if (mine !== run.current) return
    pending.current = false
    setBusy(false)

    if (result.error !== undefined) {
      setError(result.error)
      return
    }
    setName('')
    onMade(result.cal)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <DialogHeader>
            <DialogTitle>Create a new friens cal</DialogTitle>
            <DialogDescription>
              Anyone in it can rename it later, so this is not a decision.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="cal-name">Name</FieldLabel>
              <Input
                id="cal-name"
                autoFocus
                required
                maxLength={CAL_NAME_MAX}
                disabled={busy}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <FieldDescription>What everyone in it will call it.</FieldDescription>
            </Field>
          </FieldGroup>

          {error ? <SaveError message={error} /> : null}

          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
            <Button type="submit" disabled={busy || name.trim() === ''}>
              {busy ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
