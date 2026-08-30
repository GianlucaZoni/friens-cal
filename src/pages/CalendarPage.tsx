import { useSession } from '@/auth/use-session'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LogOutIcon } from 'lucide-react'

/**
 * The calendar, behind the gate.
 *
 * A placeholder: it exists so this slice reaches all the way from the sign-in
 * form to a rendered Friend. The two-sidebar shell replaces it (issue 02) and
 * the setup flow that fills in `display_name` arrives with issue 03.
 */
export const CalendarPage = () => {
  const { state, signOut } = useSession()

  if (state.status !== 'signed-in') return null

  const { user, friend } = state
  // An empty string is not a name. Treating it as one would render a blank
  // title rather than the honest "no name yet" line below.
  const displayName = friend?.display_name || null

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{displayName ?? 'Signed in'}</CardTitle>
          <CardDescription>{user.email}</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {displayName === null ? (
            <p className="text-xs text-muted-foreground">
              No display name yet. A Friend row is created blank the moment the account exists, and
              the setup flow is what fills it in.
            </p>
          ) : null}

          <Button variant="outline" onClick={() => void signOut()}>
            <LogOutIcon data-icon="inline-start" />
            Sign out
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
