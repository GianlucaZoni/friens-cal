import { CAL_NAME_MAX, renameTo } from '@/cal/cals'
import type { CalsState } from '@/cal/use-cals'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { DialogShell } from '@/identity/dialog-shell'
import { SaveError } from '@/identity/save-error'
import { useSaveAction } from '@/identity/use-save-action'
import type { Cal } from '@/lib/database.types'
import { useState } from 'react'

/**
 * Renaming a cal, from either menu.
 *
 * The same input rules as the create dialog next door, from the same constant:
 * `maxLength` at 40 rather than the column's 60, capped **where it is typed**,
 * which is the only place a Friend can see the limit happen. What is different
 * is that there is a name already, so `renameTo` decides whether the button
 * does anything: a draft that trims to nothing, or to the name it already has,
 * is not a rename and the button says so by being disabled.
 *
 * Mounted on open and unmounted on close by the menu that owns it, which is
 * what makes the draft start from the row as it is now with no effect to reset
 * it. That is also why this needs neither the create dialog's run counter nor
 * its pending ref: there is no continuation to cancel, because closing the
 * dialog unmounts the thing the continuation would write into, and a second
 * submit renames a cal to the name the first one gave it.
 *
 * "Everybody in it sees the new name" is the whole warning there is. Every
 * Member may rename a cal and no Member outranks another (CONTEXT.md), and
 * there is no notification anywhere in this product.
 */
export const RenameCalDialog = ({
  cal,
  rename,
  onClose,
}: {
  cal: Cal
  rename: CalsState['rename']
  onClose: () => void
}) => {
  const [draft, setDraft] = useState(cal.name)
  const { error, saving, run } = useSaveAction()

  /** What pressing Rename would write, or null if it would write nothing. */
  const name = renameTo(draft, cal.name)

  const onSave = () => {
    if (name === null) return
    void run(async () => (await rename(cal.id, name)).error ?? null, onClose)
  }

  return (
    <DialogShell
      title="Rename this friens cal"
      onClose={onClose}
      description="Everybody in it sees the new name, without being told."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          onSave()
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="rename-cal-name">Name</FieldLabel>
            <Input
              id="rename-cal-name"
              autoFocus
              required
              maxLength={CAL_NAME_MAX}
              disabled={saving}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <FieldDescription>What everyone in it will call it.</FieldDescription>
          </Field>
        </FieldGroup>

        {error ? <SaveError message={error} /> : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || name === null}>
            {saving ? 'Renaming…' : 'Rename'}
          </Button>
        </DialogFooter>
      </form>
    </DialogShell>
  )
}
