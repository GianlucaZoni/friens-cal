import { CurrentCalContext } from '@/cal/use-current-cal'
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
import { looksLikeAnAddress, normaliseAddress, pasteableInvite } from '@/identity/invite'
import { SaveError } from '@/identity/save-error'
import { useSaveAction } from '@/identity/use-save-action'
import { supabase } from '@/lib/supabase'
import { useContext, useState } from 'react'
import { CheckIcon, CopyIcon } from 'lucide-react'

/**
 * Putting an email address on the allowlist, which is the whole of this
 * project's admission control and now happens here instead of in the SQL
 * Editor.
 *
 * ## Two steps, and the second one is yours
 *
 * There is no email in friens cal and there will not be, so writing the row
 * does nothing to anybody. The failure worth designing against is not the leak,
 * it is the Friend who clicks Invite, reads a success message, assumes a mail
 * went out and never sends the message. So the sentence in step two is not a
 * convenience under a success state, it is the other half of the action, and
 * the copy says so.
 *
 * ## Why it confirms before writing
 *
 * There is no delete. Not here, not anywhere a key in a bundle can reach:
 * `allowlist` grants `authenticated` exactly `insert`, and removing a row is a
 * trip to the SQL Editor. And a mistyped address is not untidy, it is a live
 * door. `rob@gmail.com` for `bob@gmail.com` is somebody, that somebody can now
 * create an account, and `friend` is `using (true)` for every authenticated
 * reader, so they read every display name and blobatar seed in the product.
 * That is the whole radius, it is small, and confirm-before-write is the whole
 * mitigation.
 *
 * ## What it can never tell you
 *
 * Whether the address was already on the list. `allowlist` has no read path for
 * anybody holding a publishable key, and a screen that said "already invited"
 * would answer, for any address anyone types, whether that person uses this
 * app. So the write is silent about prior state by construction (a trigger in
 * `supabase/13-invite.sql` §5 makes the two responses identical) and the copy
 * states an outcome rather than an event: *rob@gmail.com can now create an
 * account*, which is true either way.
 */
export const InviteDialog = ({
  inviterId,
  inviterName,
  onClose,
}: {
  /** The signed-in Friend's id. `invited_by` references `friend(id)`. */
  inviterId: string
  /** Their display name, for the sentence step two hands over. */
  inviterName: string | null
  onClose: () => void
}) => {
  /*
    The cal on screen, read through the context rather than `useCurrentCal`,
    which throws when there is none. A page outside the provider (the
    join-or-create page is the one that matters) has no cal to name, and the
    sentence carries the URL alone there.
  */
  const current = useContext(CurrentCalContext)

  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [invited, setInvited] = useState<string | null>(null)
  const { error, saving, run } = useSaveAction()

  const address = normaliseAddress(email)

  const onConfirm = () =>
    void run(
      () => writeInvite({ email: address, note, invitedBy: inviterId }),
      () => setInvited(address)
    )

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a frien</DialogTitle>
          <DialogDescription>
            Adding someone here lets them create an account. It doesn&apos;t message them. That
            part&apos;s on you.
          </DialogDescription>
        </DialogHeader>

        {invited === null ? (
          <InviteForm
            email={email}
            note={note}
            address={address}
            saving={saving}
            error={error}
            onEmail={setEmail}
            onNote={setNote}
            onConfirm={onConfirm}
            onCancel={onClose}
          />
        ) : (
          <InviteSent
            address={invited}
            sentence={pasteableInvite({
              origin: window.location.origin,
              inviterName,
              cal: current?.cal ?? null,
            })}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ *
 * Step one: the address, and reading it back before it is written
 * ------------------------------------------------------------------ */

const InviteForm = ({
  email,
  note,
  address,
  saving,
  error,
  onEmail,
  onNote,
  onConfirm,
  onCancel,
}: {
  email: string
  note: string
  /** `email`, normalised. What gets written, and what the confirm step shows. */
  address: string
  saving: boolean
  error: string | null
  onEmail: (value: string) => void
  onNote: (value: string) => void
  onConfirm: () => void
  onCancel: () => void
}) => {
  const [confirming, setConfirming] = useState(false)
  const ready = looksLikeAnAddress(email)

  if (confirming) {
    return (
      <>
        {/*
          The address, at a size somebody can proofread, because this is the
          last moment it can be taken back. Not a summary of the form: the one
          field that matters, in the spelling that is about to be stored.
        */}
        <div className="border p-4 text-center">
          <p className="text-sm text-muted-foreground">Let</p>
          <p className="my-1 text-base font-medium break-all">{address}</p>
          <p className="text-sm text-muted-foreground">create an account?</p>
        </div>

        <p className="text-xs text-muted-foreground">
          There is no undo in here. Taking an address back off the list is a trip to the Supabase
          dashboard.
        </p>

        {error ? <SaveError message={error} /> : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setConfirming(false)} disabled={saving}>
            Back
          </Button>
          <Button onClick={onConfirm} disabled={saving}>
            {saving ? 'Inviting…' : 'Yes, invite them'}
          </Button>
        </DialogFooter>
      </>
    )
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (ready) setConfirming(true)
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="invite-email">Their email address</FieldLabel>
          {/*
            `autoComplete="off"` because this is somebody else's address and
            offering the Friend their own is how the wrong one gets invited.
            `autoCapitalize` and `spellCheck` for the phone, which otherwise
            capitalises the first letter of a field it has no other hints
            about. `type="email"` strips surrounding whitespace itself, so a
            pasted address arrives here already trimmed and `normaliseAddress`
            is left holding the case.
          */}
          <Input
            id="invite-email"
            type="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            required
            value={email}
            onChange={(event) => onEmail(event.target.value)}
          />
          <FieldDescription>
            The one they will sign up with. It has to match exactly, so paste it rather than typing
            it if you can.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="invite-note">Who is this?</FieldLabel>
          <Input
            id="invite-note"
            autoComplete="off"
            value={note}
            onChange={(event) => onNote(event.target.value)}
          />
          <FieldDescription>
            Optional, and only ever read from the Supabase dashboard. An address on its own is not
            always enough to remember.
          </FieldDescription>
        </Field>
      </FieldGroup>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!ready}>
          Continue
        </Button>
      </DialogFooter>
    </form>
  )
}

/* ------------------------------------------------------------------ *
 * Step two: the part the product cannot do
 * ------------------------------------------------------------------ */

const InviteSent = ({
  address,
  sentence,
  onClose,
}: {
  address: string
  sentence: string
  onClose: () => void
}) => (
  <>
    {/*
      An outcome, not an event. "Added to the list" would be a claim about what
      just happened, and nothing here knows whether anything did: the response
      to inviting somebody already listed is identical to the response to
      inviting somebody new, on purpose. This sentence is true either way.
    */}
    <p role="status" className="text-sm">
      <span className="font-medium break-all">{address}</span> can now create an account.
    </p>

    <div className="border-t pt-4">
      <p className="text-sm font-medium">Send them this:</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Nothing has been sent. friens cal has no email, so this message is the invite.
      </p>

      {/*
        In a field rather than a paragraph so it can be selected and copied by
        hand. The button below is the convenience; this is the fallback when the
        clipboard is refused, which happens over plain http and in some
        in-app browsers.
      */}
      <Input readOnly value={sentence} className="mt-3 text-xs" onFocus={selectAll} />
    </div>

    <DialogFooter>
      <CopyButton sentence={sentence} />
      <Button variant="ghost" onClick={onClose}>
        Done
      </Button>
    </DialogFooter>
  </>
)

const selectAll = (event: React.FocusEvent<HTMLInputElement>) => event.target.select()

const CopyButton = ({ sentence }: { sentence: string }) => {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sentence)
      setCopied(true)
    } catch {
      // Refused, which is a real case rather than a bug: the clipboard API
      // needs a secure context. The field above is the way out, so say so
      // instead of showing an error.
      setCopied(false)
    }
  }

  return (
    <Button variant="outline" onClick={() => void copy()}>
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? 'Copied' : 'Copy the message'}
    </Button>
  )
}

/* ------------------------------------------------------------------ */

/**
 * The write. One insert, no returning clause, and nothing read back.
 *
 * A plain `insert` rather than the upsert the design called for: PostgREST's
 * upsert emits `on conflict (email)`, and inferring an arbiter index needs
 * `select` on the column it is inferred over, which this table grants nobody.
 * The duplicate is swallowed by a `before insert` trigger instead, so an
 * address already on the list comes back as the same `201` a new one does.
 * `supabase/13-invite.sql` §5 has the measurements.
 *
 * Every failure resolves to a sentence rather than to Supabase's own message.
 * Not taste: the messages this table produces name constraints, and one of them
 * would be `duplicate key value violates unique constraint` if the trigger ever
 * came off.
 */
const writeInvite = async ({
  email,
  note,
  invitedBy,
}: {
  email: string
  note: string
  invitedBy: string
}): Promise<string | null> => {
  const { error } = await supabase.from('allowlist').insert({
    email,
    note: note.trim() === '' ? null : note.trim(),
    // Sent rather than left to the column default, because the policy's
    // `with check` compares this value to `auth.uid()` and an explicit one is
    // what makes the refusal a refusal instead of a silent correction.
    invited_by: invitedBy,
  })

  if (error === null) return null

  if (error.code === '23514') {
    return 'That address has something in it we cannot store. Check it for stray characters.'
  }
  if (error.code === '23503') {
    return 'Your account is still being set up. Give it a moment and try again.'
  }

  return 'We could not add that address. Try again, and if it keeps happening say so in the group chat.'
}
