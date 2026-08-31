import { useSession } from '@/auth/use-session'
import { PasswordField } from '@/components/password-field'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { CustomisePanel } from '@/identity/customise-panel'
import { asIdentityUpdate } from '@/identity/friend-row'
import type { Identity } from '@/identity/identity'
import { SaveError } from '@/identity/save-error'
import { useSaveAction } from '@/identity/use-save-action'
import { useTakenHues } from '@/identity/use-taken-hues'
import { supabase } from '@/lib/supabase'
import { useState } from 'react'

/**
 * The three dialogs behind the profile menu.
 *
 * Each is mounted only while it is open, by the menu that owns it. That is what
 * makes their drafts correct without an effect: a dialog's `useState` reads the
 * current row in its initialiser, every time it opens, so there is no stale
 * draft to reconcile and no reset to remember.
 *
 * None of them is a route. Ticket 18 settled that re-customising is a dialog
 * over the calendar rather than a settings page, and returning to the calendar
 * underneath is the expected end of it.
 */

/* ------------------------------------------------------------------ *
 * How you look — the same controls as setup's step 2
 * ------------------------------------------------------------------ */

export const CustomiseDialog = ({
  identity,
  displayName,
  onClose,
}: {
  identity: Identity
  displayName: string
  onClose: () => void
}) => {
  const { saveFriend } = useSession()
  const { taken } = useTakenHues()
  const [draft, setDraft] = useState(identity)
  const { error, saving, run } = useSaveAction()

  const onDone = () => void run(() => saveFriend(asIdentityUpdate(draft)), onClose)

  return (
    <DialogShell
      title="How you look"
      onClose={onClose}
      wide
      description="Changing your hue recolours your calendar, and everyone else's view of you, as soon as you are done. There is no notification."
    >
      {/*
        The walkthrough furniture is what is missing here, and nothing else: the
        panel below is the identical control set step 2 renders. Scrolls rather
        than compresses, because the expression grid is ten real blobs of yours
        and shrinking them defeats the point of rendering your own face.
      */}
      <div className="max-h-[65vh] overflow-y-auto pr-1">
        <CustomisePanel
          identity={draft}
          onChange={setDraft}
          displayName={displayName}
          taken={taken}
        />
      </div>

      {error ? <SaveError message={error} /> : null}

      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={onDone} disabled={saving}>
          {saving ? 'Saving…' : 'Done'}
        </Button>
      </DialogFooter>
    </DialogShell>
  )
}

/* ------------------------------------------------------------------ *
 * Profile — the name, and the address it hangs off
 * ------------------------------------------------------------------ */

export const ProfileDialog = ({
  displayName,
  email,
  onClose,
}: {
  displayName: string
  email: string | undefined
  onClose: () => void
}) => {
  const { saveFriend } = useSession()
  const [name, setName] = useState(displayName)
  const { error, saving, run } = useSaveAction()

  const onSave = () => void run(() => saveFriend({ display_name: name.trim() }), onClose)

  return (
    <DialogShell
      title="Profile"
      onClose={onClose}
      description="Your name, as everyone else sees it."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onSave()
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="profile-name">Display name</FieldLabel>
            <Input
              id="profile-name"
              autoComplete="nickname"
              required
              disabled={saving}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <FieldDescription>
              Changing it renames you everywhere at once, including on Hangouts you already joined.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="profile-email">Email</FieldLabel>
            <Input id="profile-email" value={email ?? ''} readOnly disabled />
            {/*
              Not editable, and not an oversight. The address is the credential
              (CONTEXT.md: the auth.users row is not the Friend), changing it is
              a confirmation-email flow, and ticket 13 deleted email outright.
            */}
            <FieldDescription>
              Changed from the Supabase dashboard. Ask in the group chat.
            </FieldDescription>
          </Field>

          {error ? <SaveError message={error} /> : null}
        </FieldGroup>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || name.trim() === ''}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </form>
    </DialogShell>
  )
}

/* ------------------------------------------------------------------ *
 * Change password
 * ------------------------------------------------------------------ */

/**
 * Ticket 13 deleted the password *reset* flow, which needed email that this
 * project cannot deliver. It did not delete `updateUser({ password })`, which
 * needs no email at all and works for a Friend who is already signed in — so
 * the dashboard round-trip is now only for a genuinely forgotten password
 * (ticket 18 decision 2).
 *
 * The current password is checked by signing in with it first. Supabase's own
 * `updateUser` does not require it unless the project's "Secure password
 * change" setting is on, and an unlocked session being able to change the
 * password with no challenge at all is not a thing to ship because a dashboard
 * toggle exists. A failed `signInWithPassword` leaves the existing session
 * untouched; a successful one refreshes it, which the session provider already
 * handles as an ordinary auth event.
 */
export const ChangePasswordDialog = ({
  email,
  onClose,
}: {
  email: string | undefined
  onClose: () => void
}) => {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const { error, saving, setError, run } = useSaveAction()

  /** Resolves to a message to show, or null once the password has changed. */
  const changePassword = async (): Promise<string | null> => {
    if (email === undefined) {
      return 'We cannot tell which account this is. Sign in again and try that once more.'
    }

    const { error: wrongCurrent } = await supabase.auth.signInWithPassword({
      email,
      password: current,
    })
    if (wrongCurrent) return 'That is not your current password.'

    const { error: rejected } = await supabase.auth.updateUser({ password: next })
    // Supabase's own message is the useful one here — it is what says "at least
    // six characters" or "same as the old one", and there is no enumeration to
    // protect: we already know who is signed in.
    return rejected ? rejected.message : null
  }

  const onSubmit = () => {
    // Checked before the round trip rather than by it, because nothing but this
    // client knows what was typed in the second box.
    if (next !== confirm) {
      setError('The two new passwords do not match.')
      return
    }
    void run(changePassword, onClose)
  }

  return (
    <DialogShell
      title="Change password"
      onClose={onClose}
      description="You stay signed in. There is still no reset email — this only works while you know your current password."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
      >
        <FieldGroup>
          <PasswordField
            id="current-password"
            label="Current password"
            autoComplete="current-password"
            value={current}
            onChange={setCurrent}
            disabled={saving}
          />
          <PasswordField
            id="new-password"
            label="New password"
            autoComplete="new-password"
            value={next}
            onChange={setNext}
            disabled={saving}
            description="Pick one you will keep — a forgotten one is a message in the group chat and a trip to the dashboard."
          />
          <PasswordField
            id="confirm-password"
            label="New password again"
            autoComplete="new-password"
            value={confirm}
            onChange={setConfirm}
            disabled={saving}
          />

          {error ? <SaveError message={error} /> : null}
        </FieldGroup>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || current === '' || next === ''}>
            {saving ? 'Changing…' : 'Change password'}
          </Button>
        </DialogFooter>
      </form>
    </DialogShell>
  )
}

/* ------------------------------------------------------------------ */

/**
 * `open` is hard-coded because the caller mounts these on open and unmounts
 * them on close — the dialog's own dismissals (Escape, the backdrop, the close
 * button) all arrive through `onOpenChange`, and every one of them means the
 * same thing here.
 */
const DialogShell = ({
  title,
  description,
  wide,
  onClose,
  children,
}: {
  title: string
  description: React.ReactNode
  wide?: boolean
  onClose: () => void
  children: React.ReactNode
}) => (
  <Dialog
    open
    onOpenChange={(open) => {
      if (!open) onClose()
    }}
  >
    <DialogContent className={wide ? 'sm:max-w-2xl' : undefined}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      {children}
    </DialogContent>
  </Dialog>
)
