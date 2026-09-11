import { useSession, type SignUpFailure } from '@/auth/use-session'
import { PasswordField } from '@/components/password-field'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useState } from 'react'
import { Link, Navigate } from 'react-router'
import { TriangleAlertIcon } from 'lucide-react'

/**
 * Signing yourself up, if you were already on the list.
 *
 * Two things about this screen are unusual enough to say out loud here, because
 * both look like bugs to anyone reading it cold.
 *
 * **It shows the same message for every failure**, and that is the feature
 * rather than laziness — see `SIGNUP_FAILURE`, which is where the reasoning
 * lives. It cannot even do otherwise: `signUp` has no channel for a Supabase
 * message to arrive through.
 *
 * **Nothing in the app links here.** Issue 14 decided it: the sign-in footer's
 * "Everyone here was added by hand." stays a full stop, and a new Friend is sent
 * this URL in the group chat along with the news that they were added. A link
 * would invite exactly the people this screen is built to turn away, and turning
 * them away is deliberately uninformative.
 */
export const SignUpPage = () => {
  const { state, signUp } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [failure, setFailure] = useState<SignUpFailure | null>(null)
  const [submitting, setSubmitting] = useState(false)

  /*
    Straight to `/`, not to `/setup`. The route that decides where a brand-new
    Friend belongs already exists and already handles a blank Friend row:
    `RequireAuth` lets the fresh session through and `RequireSetup` sends it to
    `/setup`, because the row the `01-friend.sql` trigger just made has no
    `hue`. Naming `/setup` here would be a second copy of that rule, and the two
    would drift.
  */
  if (state.status === 'signed-in') return <Navigate to="/" replace />

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setFailure(null)
    // On success the auth listener flips the session and the redirect above
    // takes over, so there is nothing to do in that branch.
    setFailure(await signUp(email, password))
    setSubmitting(false)
  }

  const invalid = failure !== null

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col gap-1 text-center">
          <h1 className="text-sm font-semibold tracking-tight">friens-cal</h1>
          <p className="text-xs text-muted-foreground">Make yourself an account.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>First time</CardTitle>
            <CardDescription>
              Email and a password. You are signed in the moment it exists — there is nothing to
              confirm.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={onSubmit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="signup-email">Email</FieldLabel>
                  <Input
                    id="signup-email"
                    type="email"
                    autoComplete="email"
                    required
                    disabled={submitting}
                    aria-invalid={invalid}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>

                {/*
                  Both fields are marked invalid together, because the message
                  above them refuses to say which one was wrong. Marking only
                  one would leak the very thing the copy withholds.
                */}
                <PasswordField
                  id="signup-password"
                  label="Password"
                  autoComplete="new-password"
                  value={password}
                  onChange={setPassword}
                  disabled={submitting}
                  invalid={invalid}
                />

                {failure ? (
                  <div
                    role="alert"
                    className="flex gap-2 border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
                  >
                    <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
                    <div className="flex flex-col gap-1">
                      <span>{failure.message}</span>
                      <span className="text-destructive/80">{failure.secondary}</span>
                    </div>
                  </div>
                ) : null}

                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Creating…' : 'Create account'}
                </Button>
              </FieldGroup>
            </form>
          </CardContent>

          <CardFooter>
            {/*
              This direction is uncontroversial and the other one is not: someone
              handed this URL who already has an account needs a way out, whereas
              a link the other way would advertise a door that only five people
              can walk through.
            */}
            <p className="text-xs text-muted-foreground">
              Already have an account?{' '}
              <Link to="/sign-in" className="underline underline-offset-2 hover:text-foreground">
                Sign in
              </Link>
              .
            </p>
          </CardFooter>
        </Card>
      </div>
    </main>
  )
}
