import { useSession } from '@/auth/use-session'
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
import { Navigate, useLocation } from 'react-router'
import { TriangleAlertIcon } from 'lucide-react'

/**
 * The honest sentence where a "forgot password?" link would go — ticket 18,
 * draft A, chosen and always visible.
 *
 * There is no reset flow to link to: ticket 13 deleted it outright, because
 * Supabase's default mail service cannot deliver to anyone who is not a project
 * team member. A dead link would be a lie, so the space carries the truth.
 */
const NO_RESET_COPY =
  'Forgotten it? There is no reset email — ask in the group chat and someone will reset it for you.'

export const SignInPage = () => {
  const { state, signIn } = useSession()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (state.status === 'signed-in') {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from ?? '/'} replace />
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    // On success the auth listener flips the session and the redirect above
    // takes over, so there is nothing to do in that branch.
    const message = await signIn(email, password)
    setError(message)
    setSubmitting(false)
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col gap-1 text-center">
          <h1 className="text-sm font-semibold tracking-tight">friens-cal</h1>
          <p className="text-xs text-muted-foreground">Sign in to the calendar.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>Email and password. That is the whole of it.</CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={onSubmit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="signin-email">Email</FieldLabel>
                  <Input
                    id="signin-email"
                    type="email"
                    autoComplete="email"
                    required
                    disabled={submitting}
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
                  disabled={submitting}
                  description={NO_RESET_COPY}
                />

                {error ? (
                  <div
                    role="alert"
                    className="flex gap-2 border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
                  >
                    <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                ) : null}

                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Signing in…' : 'Sign in'}
                </Button>
              </FieldGroup>
            </form>
          </CardContent>

          <CardFooter>
            {/*
              Not "invite-only": there are no invites. CONTEXT.md calls it a
              hand-curated allowlist, and this echoes the second line of the
              signup rejection copy ticket 18 chose.
            */}
            <p className="text-xs text-muted-foreground">
              No account? Everyone here was added by hand.
            </p>
          </CardFooter>
        </Card>
      </div>
    </main>
  )
}
