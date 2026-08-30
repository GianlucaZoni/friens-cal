/**
 * PROTOTYPE — ticket 18. THROWAWAY.
 *
 * The five screens. Nothing here talks to Supabase; every submit is a stub that
 * moves local state, which is the point — the question is what the screens say
 * and contain, not whether auth works.
 */
import { useMemo, useState } from 'react'
import {
  ArrowRightIcon,
  CheckIcon,
  LogOutIcon,
  PaletteIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Blob,
  ExpressionPicker,
  HueSlider,
  PasswordField,
  RerollButton,
  StoredRow,
  ToneSwatches,
} from './pieces'
import {
  ENUMERATION_CAVEAT,
  FORGOT_COPY,
  REJECT_COPY,
  type ForgotCopyKey,
  type RejectCopyKey,
} from './copy'
import {
  EXISTING_FRIENDS,
  TAKEN_HUES,
  avatarColours,
  materialise,
  nearestTakenDistance,
  newSeed,
  uiColour,
  type Identity,
} from './identity'

type Theme = 'light' | 'dark'

const Shell = ({
  title,
  subtitle,
  children,
  wide,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  wide?: boolean
}) => (
  <div className="flex min-h-[calc(100vh-8rem)] items-start justify-center px-4 py-10">
    <div className={wide ? 'w-full max-w-3xl' : 'w-full max-w-sm'}>
      <div className="mb-6 flex flex-col gap-1 text-center">
        <h1 className="text-sm font-semibold tracking-tight">{title}</h1>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  </div>
)

/* ================================================================== *
 * 1. Sign in
 * ================================================================== */

export const SignIn = ({ copyKey }: { copyKey: ForgotCopyKey }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [failed, setFailed] = useState(false)
  const [disclosed, setDisclosed] = useState(false)
  const copy = FORGOT_COPY[copyKey]

  return (
    <Shell title="friens-cal" subtitle="Sign in to the calendar.">
      <Card>
        <CardHeader>
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>Email and password. That is the whole of it.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setFailed(true)
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="signin-email">Email</FieldLabel>
                <Input
                  id="signin-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>

              <PasswordField
                id="signin-password"
                label="Password"
                autoComplete="current-password"
                value={password}
                onChange={setPassword}
                description={
                  copy.placement === 'inline' ? (
                    <span>{copy.body}</span>
                  ) : copy.placement === 'disclosure' ? (
                    <button
                      type="button"
                      className="text-left underline underline-offset-4 hover:no-underline"
                      onClick={() => setDisclosed((d) => !d)}
                    >
                      {copy.heading}
                    </button>
                  ) : undefined
                }
              />

              {copy.placement === 'disclosure' && disclosed ? (
                <div className="border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
                  {copy.body}
                </div>
              ) : null}

              {failed ? (
                <div
                  role="alert"
                  className="flex gap-2 border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
                >
                  <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
                  <span>
                    {copy.placement === 'on-failure'
                      ? copy.body
                      : 'That email and password do not match.'}
                  </span>
                </div>
              ) : null}

              <Button type="submit">Sign in</Button>
            </FieldGroup>
          </form>
        </CardContent>
        <CardFooter className="flex-col items-start gap-1">
          <p className="text-xs text-muted-foreground">
            No account? Signing up is invite-only.
          </p>
        </CardFooter>
      </Card>

      <ProtoNote>
        <p>
          <b>The hole this fills.</b> Ticket 13 deleted the reset flow: no email, no{' '}
          <code>PASSWORD_RECOVERY</code> handling, no two reset screens. A dead
          &ldquo;forgot password?&rdquo; link would be a lie, so the space it would occupy carries
          the truth instead.
        </p>
        <p className="mt-2">
          <b>Draft {copyKey} — {copy.name}.</b> {copy.note}
        </p>
        <p className="mt-2 text-muted-foreground">
          Press <kbd>c</kbd> to cycle the drafts.
        </p>
      </ProtoNote>
    </Shell>
  )
}

/* ================================================================== *
 * 2. Sign up, including the rejection
 * ================================================================== */

export const SignUp = ({ copyKey }: { copyKey: RejectCopyKey }) => {
  const [email, setEmail] = useState('stranger@example.com')
  const [password, setPassword] = useState('')
  const [state, setState] = useState<'idle' | 'pending' | 'rejected'>('idle')
  const copy = REJECT_COPY[copyKey]
  const rejected = state === 'rejected'

  return (
    <Shell title="friens-cal" subtitle="Create your account.">
      <Card>
        <CardHeader>
          <CardTitle>Join the calendar</CardTitle>
          <CardDescription>
            No confirmation email — you are signed in the moment the account exists.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setState('pending')
              window.setTimeout(() => setState('rejected'), 550)
            }}
          >
            <FieldGroup>
              <Field data-invalid={rejected || undefined}>
                <FieldLabel htmlFor="signup-email">Email</FieldLabel>
                <Input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  aria-invalid={rejected || undefined}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setState('idle')
                  }}
                />
              </Field>

              <PasswordField
                id="signup-password"
                label="Password"
                autoComplete="new-password"
                value={password}
                onChange={setPassword}
                invalid={rejected}
                description="At least six characters. It cannot be reset by email, so pick one you will keep."
              />

              {rejected ? (
                <div
                  role="alert"
                  className="flex flex-col gap-1 border border-destructive/40 bg-destructive/10 p-3 text-xs"
                >
                  <span className="flex items-center gap-2 font-medium text-destructive">
                    <TriangleAlertIcon className="size-3.5 shrink-0" />
                    {copy.message}
                  </span>
                  <span className="text-muted-foreground">{copy.secondary}</span>
                </div>
              ) : null}

              <Button type="submit" disabled={state === 'pending'}>
                {state === 'pending' ? 'Creating account…' : 'Create account'}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <ProtoNote>
        <p>
          <b>Where this message actually comes from.</b> The{' '}
          <code>before-user-created</code> hook returns{' '}
          <code>{'{ error: { http_code, message } }'}</code> and Supabase hands that{' '}
          <code>message</code> to the client verbatim. So this copy is a SQL string in{' '}
          <code>public.hook_restrict_signup_to_allowlist</code>, not a React constant — the screen
          only renders what came back.
        </p>
        <p className="mt-2">
          <b>Draft {copyKey} — {copy.name}.</b> {copy.note}
        </p>
        <p className="mt-2 text-destructive">
          <b>Leak that copy cannot close.</b> {ENUMERATION_CAVEAT}
        </p>
        <p className="mt-2 text-muted-foreground">
          Press <kbd>c</kbd> to cycle the drafts.
        </p>
      </ProtoNote>
    </Shell>
  )
}

/* ================================================================== *
 * 3. Step 1 — display name and a randomised blobatar
 * ================================================================== */

export const StepOne = ({
  identity,
  onRandomise,
  displayName,
  onName,
  theme,
}: {
  identity: Identity
  onRandomise: () => void
  displayName: string
  onName: (name: string) => void
  theme: Theme
}) => {
  const distance = nearestTakenDistance(identity.hue, TAKEN_HUES)

  return (
    <Shell
      title="Step 1 of 2"
      subtitle="What everyone calls you, and the blob they will learn to spot."
      wide
    >
      <Card>
        <CardHeader>
          <CardTitle>Your name and your blob</CardTitle>
          <CardDescription>
            Both are yours to change later. Nothing here is permanent.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="flex flex-col items-center gap-3">
            <Blob identity={identity} size="xl" animate title={displayName || 'your blobatar'} />
            <Button variant="outline" size="sm" onClick={onRandomise}>
              Try another
            </Button>
          </div>

          <div className="flex flex-1 flex-col gap-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="display-name">Display name</FieldLabel>
                <Input
                  id="display-name"
                  autoComplete="nickname"
                  placeholder="Sam"
                  value={displayName}
                  onChange={(e) => onName(e.target.value)}
                />
                <FieldDescription>
                  This is the name on your sidebar row and on every Hangout you Join.
                </FieldDescription>
              </Field>
            </FieldGroup>

            <div className="flex flex-col gap-2 border border-border p-3">
              <p className="text-xs font-medium">Hues already taken</p>
              <div className="flex flex-wrap items-center gap-3">
                {EXISTING_FRIENDS.map((f) => (
                  <span key={f.id} className="flex items-center gap-1.5 text-xs">
                    <Blob identity={f} size="sm" />
                    <span>{f.display_name}</span>
                    <span className="font-mono text-muted-foreground">{f.hue}°</span>
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                You were started at <b className="font-mono">{identity.hue}°</b> —{' '}
                {Math.round(distance)}° from the nearest of them. That is a{' '}
                <b>default, not a rule</b>: step 2&apos;s slider goes anywhere, including straight
                onto {EXISTING_FRIENDS[0]!.display_name}&apos;s hue.
              </p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button>
            Continue
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </CardFooter>
      </Card>

      <div className="mt-4">
        <StoredRow identity={identity} theme={theme} />
      </div>

      <ProtoNote>
        <p>
          <b>Materialised, not null.</b> &ldquo;Try another&rdquo; writes a new{' '}
          <code>blobatar_seed</code> <em>and</em> writes <code>hue</code> and <code>tone</code> as
          numbers. Ticket 11 is explicit that leaving them null would let the first reroll in step 2
          move the colour. Watch the two values above change together here — and{' '}
          <em>not</em> change on step 2&apos;s reroll.
        </p>
      </ProtoNote>
    </Shell>
  )
}

/* ================================================================== *
 * 4. Step 2 — customisation
 * ================================================================== */

export const Customise = ({
  identity,
  setIdentity,
  theme,
  displayName,
  compact,
}: {
  identity: Identity
  setIdentity: (next: Identity) => void
  theme: Theme
  displayName: string
  compact?: boolean
}) => {
  const [lastHeadBeforeReroll, setLastHeadBeforeReroll] = useState<string>()
  const colours = useMemo(() => avatarColours(identity), [identity])

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
      {/* One live preview, not a grid of pre-rendered options to pick from. */}
      <div className="flex shrink-0 flex-col items-center gap-3 sm:sticky sm:top-4">
        <Blob identity={identity} size="xl" animate title={displayName || 'your blobatar'} />
        <RerollButton
          onReroll={() => {
            setLastHeadBeforeReroll(colours.head)
            setIdentity({ ...identity, blobatar_seed: newSeed() })
          }}
        />
        <p className="max-w-[10rem] text-center text-[11px] text-muted-foreground">
          Reroll changes the shape. It can never change your colour — the seed stopped governing
          that the moment step 1 wrote hue and tone down.
        </p>

        {!compact ? (
          <>
            <Separator />
            <WhereItShows identity={identity} theme={theme} displayName={displayName} />
          </>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-5">
        <FieldGroup>
          <HueSlider
            hue={identity.hue}
            onChange={(hue) => setIdentity({ ...identity, hue })}
            taken={EXISTING_FRIENDS}
            theme={theme}
          />
          <ToneSwatches
            hue={identity.hue}
            tone={identity.tone}
            onChange={(tone) => setIdentity({ ...identity, tone })}
          />
          <ExpressionPicker
            identity={identity}
            onChange={(expression) => setIdentity({ ...identity, expression })}
          />
        </FieldGroup>

        <StoredRow identity={identity} theme={theme} previousHead={lastHeadBeforeReroll} />
      </div>
    </div>
  )
}

export const StepTwo = (props: {
  identity: Identity
  setIdentity: (next: Identity) => void
  theme: Theme
  displayName: string
}) => (
  <Shell title="Step 2 of 2" subtitle="Make the blob yours." wide>
    <Card>
      <CardHeader>
        <CardTitle>How you look</CardTitle>
        <CardDescription>
          Changing your hue recolours your whole grid — the heatmap renders in your colour. That is
          the fun of it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Customise {...props} />
      </CardContent>
      <CardFooter className="justify-end">
        <Button>
          <CheckIcon data-icon="inline-start" />
          Done
        </Button>
      </CardFooter>
    </Card>

    <ProtoNote>
      <p>
        <b>Direct controls, not a swatch grid.</b> Ticket 11: whatever N avatars were pre-rendered
        would become the hues the Group actually has, which is quantisation by the back door and
        contradicts the settled continuous hue.
      </p>
      <p className="mt-2">
        <b>Reroll proof.</b> Hit reroll and watch the <code>head</code> hex in the stored row. It is
        checked live — the badge turns destructive if it ever moves.
      </p>
    </ProtoNote>
  </Shell>
)

/** The three places a Friend's colour still appears after ticket 15. */
const WhereItShows = ({
  identity,
  theme,
  displayName,
}: {
  identity: Identity
  theme: Theme
  displayName: string
}) => {
  const ui = uiColour(identity.hue, theme)
  return (
    <div className="flex w-full flex-col gap-2 text-[11px]">
      <p className="font-medium">Where this colour shows up</p>

      <div className="flex items-center gap-2 border border-border px-2 py-1.5">
        <span className="size-2 shrink-0 rounded-full" style={{ background: ui }} />
        <Blob identity={identity} size="xs" />
        <span className="truncate">{displayName || 'You'}</span>
        <span className="ml-auto text-muted-foreground">sidebar row</span>
      </div>

      <div
        className="border px-2 py-1.5"
        style={{ borderColor: ui, boxShadow: `0 0 0 2px color-mix(in oklab, ${ui} 25%, transparent)` }}
      >
        <span className="text-muted-foreground">Candidate glow</span>
      </div>

      <div className="flex flex-col gap-px">
        {[0.2, 0.45, 0.7, 1].map((o) => (
          <div
            key={o}
            className="h-3 border border-border/50"
            style={{ background: `color-mix(in oklab, ${ui} ${o * 100}%, transparent)` }}
          />
        ))}
        <span className="pt-0.5 text-muted-foreground">grid heatmap, in your colour</span>
      </div>
    </div>
  )
}

/* ================================================================== *
 * 5. The profile dropdown
 * ================================================================== */

export const ProfileMenu = ({
  identity,
  setIdentity,
  theme,
  displayName,
}: {
  identity: Identity
  setIdentity: (next: Identity) => void
  theme: Theme
  displayName: string
}) => {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
      {/* Ticket 12 places this cluster; this screen only decides what is inside. */}
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-xs font-semibold">friens-cal</span>
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            {EXISTING_FRIENDS.map((f) => (
              <Blob key={f.id} identity={f} size="sm" title={f.display_name} />
            ))}
          </div>
          <Separator orientation="vertical" className="h-5" />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label="Your profile"
                  className="rounded-full focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                />
              }
            >
              <Blob identity={identity} size="md" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="flex items-center gap-2 py-2">
                <Blob identity={identity} size="md" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-xs font-medium">{displayName || 'You'}</span>
                  <span className="truncate text-[11px] font-normal text-muted-foreground">
                    you@example.com
                  </span>
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setOpen(true)}>
                  <PaletteIcon />
                  How you look…
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem variant="destructive">
                  <LogOutIcon />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center p-6">
        <p className="max-w-md text-center text-xs text-muted-foreground">
          The calendar lives here. Click your blob, top right.
        </p>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>How you look</DialogTitle>
            <DialogDescription>
              Changing your hue recolours your grid, and everyone else&apos;s view of you, straight
              away. There is no notification and no confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] overflow-y-auto pr-1">
            <Customise
              identity={identity}
              setIdentity={setIdentity}
              theme={theme}
              displayName={displayName}
              compact
            />
          </div>
          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="px-4 pb-6">
        <ProtoNote>
          <p>
            <b>Three items, and the two that are missing.</b> Identity (who you are signed in as),
            &ldquo;How you look…&rdquo;, and sign out.
          </p>
          <ul className="mt-2 ml-4 flex list-disc flex-col gap-1">
            <li>
              <b>No &ldquo;change password&rdquo;.</b> Ticket 13 removed the whole reset apparatus.
              <code> updateUser({'{ password }'})</code> would still work for a signed-in Friend, so
              this is a real choice — see Needs the human.
            </li>
            <li>
              <b>No theme switch here.</b> Ticket 01 keeps view state ephemeral; light/dark is not a
              Friend column and does not belong beside things that are.
            </li>
            <li>
              <b>No &ldquo;delete account&rdquo;.</b> Membership is a hand-curated allowlist. Leaving
              is a conversation, not a button.
            </li>
          </ul>
          <p className="mt-2">
            Customisation reopens as a <code>Dialog</code>, not a route: it is the same control set
            as step 2 with the walkthrough furniture stripped, and returning to the calendar
            underneath is the expected end of it.{' '}
            <Badge variant="secondary">no separate settings page</Badge>
          </p>
        </ProtoNote>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

export const ProtoNote = ({ children }: { children: React.ReactNode }) => (
  <div className="mt-4 border border-dashed border-border bg-muted/40 p-3 text-[11px] leading-relaxed">
    {children}
  </div>
)

export const freshIdentity = (): Identity => materialise(TAKEN_HUES)
