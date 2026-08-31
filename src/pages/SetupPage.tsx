import { useSession } from '@/auth/use-session'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { TakenHue } from '@/identity/customise-controls'
import { CustomisePanel } from '@/identity/customise-panel'
import { FriendBlob } from '@/identity/friend-blob'
import { asFriendUpdate, identityOf, isSetupComplete } from '@/identity/friend-row'
import { materialise, nearestTakenDistance, type Identity } from '@/identity/identity'
import { SaveError } from '@/identity/save-error'
import { useSaveAction } from '@/identity/use-save-action'
import { useTakenHues } from '@/identity/use-taken-hues'
import type { Friend } from '@/lib/database.types'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { ArrowRightIcon, CheckIcon } from 'lucide-react'

/**
 * Setup: a display name, a blob, and then the blob made yours.
 *
 * **A route rather than a modal**, because it is the first thing a new Friend
 * sees and there is nothing behind it yet to be modal over. Re-customising
 * later is the opposite case and is a dialog over the calendar (see
 * `CustomiseDialog`) — same controls, no walkthrough furniture.
 *
 * `RequireSetup` is what sends an unfinished Friend here. This page's own job is
 * only to fill the row in and get out of the way.
 */
export const SetupPage = () => {
  const { state } = useSession()

  if (state.status !== 'signed-in') return null // `RequireAuth` owns this case.

  if (state.friendStatus === 'loading') return <SetupNotice>Loading…</SetupNotice>

  if (state.friendStatus === 'error') {
    return (
      <SetupNotice>
        We cannot reach your Friend row. Reload, and if it keeps happening say so in the group chat.
      </SetupNotice>
    )
  }

  // Mounted only once the row is known, which is what lets the two gates below
  // read it in a `useState` initialiser rather than having to capture it.
  return <RedirectIfAlreadySetUp friend={state.friend} />
}

/**
 * Whether setup was *already* finished when this Friend arrived.
 *
 * It has to be an initial value rather than a live check: step 1 writes the
 * row, which makes setup complete, so a live check would eject a Friend to the
 * calendar the instant they pressed Continue — before they had seen step 2 at
 * all. `useState` with no setter is how "read this once, at mount" is spelled.
 */
const RedirectIfAlreadySetUp = ({ friend }: { friend: Friend | null }) => {
  const [arrivedComplete] = useState(() => isSetupComplete(friend))

  // Already set up, and arrived here anyway — the profile menu is where you
  // change any of this from now on.
  if (arrivedComplete) return <Navigate to="/" replace />

  return <AwaitTakenHues />
}

/**
 * The taken hues gate.
 *
 * Separated for the same reason: `SetupFlow` materialises its identity in a
 * `useState` initialiser, and it needs the real list of taken hues in hand to
 * do it. Materialising early and correcting later would show a Friend one
 * starting hue and then move it under them — and a starting hue that moves on
 * its own is precisely what the bias must not look like.
 */
const AwaitTakenHues = () => {
  const { loading, taken } = useTakenHues()
  if (loading) return <SetupNotice>Loading…</SetupNotice>
  return <SetupFlow taken={taken} />
}

const SetupFlow = ({ taken }: { taken: TakenHue[] }) => {
  const { state, saveFriend } = useSession()
  const navigate = useNavigate()
  const friend = state.status === 'signed-in' ? state.friend : null

  const takenHues = taken.map((t) => t.hue)

  const [identity, setIdentity] = useState<Identity>(
    // A half-finished row keeps whatever it already had rather than being
    // randomised over — the only way to be here with an identity is to have
    // been interrupted, and losing it would be the wrong half of the coin flip.
    () => identityOf(friend) ?? materialise(takenHues)
  )
  const [displayName, setDisplayName] = useState(friend?.display_name ?? '')
  const [step, setStep] = useState<1 | 2>(1)
  const { error, saving, run } = useSaveAction()

  const save = (onSaved: () => void) =>
    void run(() => saveFriend(asFriendUpdate(identity, displayName)), onSaved)

  const shared = { error, saving }

  return step === 1 ? (
    <StepOne
      {...shared}
      identity={identity}
      taken={taken}
      displayName={displayName}
      onName={setDisplayName}
      onRandomise={() => setIdentity(materialise(takenHues))}
      onContinue={() => save(() => setStep(2))}
    />
  ) : (
    <StepTwo
      {...shared}
      identity={identity}
      taken={taken}
      displayName={displayName}
      onChange={setIdentity}
      onBack={() => setStep(1)}
      onDone={() => save(() => void navigate('/', { replace: true }))}
    />
  )
}

/* ------------------------------------------------------------------ *
 * Step 1 — a name, and a blob you did not choose yet
 * ------------------------------------------------------------------ */

const StepOne = ({
  identity,
  taken,
  displayName,
  onName,
  onRandomise,
  onContinue,
  error,
  saving,
}: {
  identity: Identity
  taken: TakenHue[]
  displayName: string
  onName: (name: string) => void
  onRandomise: () => void
  onContinue: () => void
  error: string | null
  saving: boolean
}) => {
  const distance = Math.round(
    nearestTakenDistance(
      identity.hue,
      taken.map((t) => t.hue)
    )
  )
  const named = taken.filter((t) => t.display_name !== null)

  return (
    <SetupShell
      title="Step 1 of 2"
      subtitle="What everyone calls you, and the blob they learn to spot."
    >
      <Card>
        <CardHeader>
          <CardTitle>Your name and your blob</CardTitle>
          <CardDescription>
            Both are yours to change later. Nothing here is permanent.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="flex shrink-0 flex-col items-center gap-3">
            <FriendBlob
              identity={identity}
              size="xl"
              animate
              title={displayName ? `${displayName}'s blobatar` : 'Your blobatar'}
            />
            <Button variant="outline" size="sm" onClick={onRandomise} disabled={saving}>
              Try another
            </Button>
          </div>

          <form
            className="flex min-w-0 flex-1 flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              onContinue()
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="display-name">Display name</FieldLabel>
                <Input
                  id="display-name"
                  autoComplete="nickname"
                  autoFocus
                  required
                  disabled={saving}
                  value={displayName}
                  onChange={(event) => onName(event.target.value)}
                />
                <FieldDescription>
                  The name on your sidebar row and on every Hangout you Join.
                </FieldDescription>
              </Field>
            </FieldGroup>

            <TakenHueRow taken={named} hue={identity.hue} distance={distance} />

            {error ? <SaveError message={error} /> : null}

            <div className="flex justify-end">
              <Button type="submit" disabled={saving || displayName.trim() === ''}>
                {saving ? 'Saving…' : 'Continue'}
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </SetupShell>
  )
}

/**
 * The hues already taken, and how far the starting one landed from the nearest.
 *
 * This row is what makes the bias legible **as a default**. Without it a Friend
 * cannot tell they were placed deliberately, and a colour that arrived from
 * nowhere reads as an assignment — which is the one thing the settled collision
 * decision forbids. With it, the next screen's slider moving anywhere, including
 * straight onto someone else's hue, is obviously allowed.
 */
const TakenHueRow = ({
  taken,
  hue,
  distance,
}: {
  taken: TakenHue[]
  hue: number
  distance: number
}) => (
  <div className="flex flex-col gap-2 border border-border p-3">
    <p className="text-xs font-medium">
      {taken.length === 0 ? 'Nobody else has a colour yet' : 'Hues already taken'}
    </p>

    {taken.length > 0 ? (
      <div className="flex flex-wrap items-center gap-3">
        {taken.map((friend) => (
          <span key={friend.id} className="flex items-center gap-1.5 text-xs">
            <span
              className="size-3 rounded-full border border-border"
              style={{ background: `oklch(var(--friend-l) var(--friend-c) ${friend.hue})` }}
            />
            <span className="truncate">{friend.display_name}</span>
            <span className="font-mono text-muted-foreground">{friend.hue}°</span>
          </span>
        ))}
      </div>
    ) : null}

    <p className="text-xs text-muted-foreground">
      You were started at <b className="font-mono">{hue}°</b>
      {taken.length === 0
        ? ' — the first colour in the Group, so nothing to steer around.'
        : `, ${distance}° from the nearest of them.`}{' '}
      That is a <b>default, not a rule</b>: the next screen&apos;s slider goes anywhere, including
      straight onto someone else&apos;s hue.
    </p>
  </div>
)

/* ------------------------------------------------------------------ *
 * Step 2 — customisation
 * ------------------------------------------------------------------ */

const StepTwo = ({
  identity,
  taken,
  displayName,
  onChange,
  onBack,
  onDone,
  error,
  saving,
}: {
  identity: Identity
  taken: TakenHue[]
  displayName: string
  onChange: (next: Identity) => void
  onBack: () => void
  onDone: () => void
  error: string | null
  saving: boolean
}) => (
  <SetupShell title="Step 2 of 2" subtitle="Make the blob yours." wide>
    <Card>
      <CardHeader>
        <CardTitle>How you look</CardTitle>
        <CardDescription>
          Changing your hue recolours your whole calendar — the heatmap renders in your colour. That
          is the fun of it.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <CustomisePanel
          identity={identity}
          onChange={onChange}
          displayName={displayName}
          taken={taken}
        />
        {error ? <SaveError message={error} /> : null}
      </CardContent>

      <CardFooter className="justify-between">
        <Button variant="ghost" onClick={onBack} disabled={saving}>
          Back
        </Button>
        <Button onClick={onDone} disabled={saving}>
          <CheckIcon data-icon="inline-start" />
          {saving ? 'Saving…' : 'Done'}
        </Button>
      </CardFooter>
    </Card>
  </SetupShell>
)

/* ------------------------------------------------------------------ */

const SetupShell = ({
  title,
  subtitle,
  wide,
  children,
}: {
  title: string
  subtitle: string
  wide?: boolean
  children: React.ReactNode
}) => (
  <main className="flex min-h-screen items-start justify-center px-4 py-10">
    <div className={wide ? 'w-full max-w-3xl' : 'w-full max-w-2xl'}>
      <div className="mb-6 flex flex-col gap-1 text-center">
        <h1 className="text-sm font-semibold tracking-tight">{title}</h1>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  </main>
)

const SetupNotice = ({ children }: { children: React.ReactNode }) => (
  <div
    role="status"
    aria-live="polite"
    className="flex min-h-screen items-center justify-center px-6 text-center text-xs text-muted-foreground"
  >
    {children}
  </div>
)
