import { CAL_NAME_MAX } from '@/cal/cals'
import { CopyCode } from '@/cal/copy-code'
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
import type { Cal } from '@/lib/database.types'
import { useState } from 'react'
import { ArrowRightIcon, TriangleAlertIcon } from 'lucide-react'

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
  const [made, setMade] = useState<Cal | null>(null)

  return (
    <>
      <NameDialog
        open={open}
        onOpenChange={onOpenChange}
        create={create}
        onMade={(cal) => {
          onOpenChange(false)
          setMade(cal)
        }}
      />

      <Dialog open={made !== null} onOpenChange={(next) => !next && setMade(null)}>
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

              <div className="flex items-center justify-between gap-2 border border-border p-3">
                <span className="font-mono text-sm tracking-[0.3em]">{made.code}</span>
                <CopyCode code={made.code} label="Copy" />
              </div>

              <DialogFooter>
                <DialogClose render={<Button variant="ghost" />}>Later</DialogClose>
                <Button
                  onClick={() => {
                    const cal = made
                    setMade(null)
                    onOpenCal(cal)
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

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError(null)

    const result = await create(name)

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
        if (!next) {
          setName('')
          setError(null)
        }
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
            <Button type="submit" disabled={busy || name.trim() === ''}>
              {busy ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
