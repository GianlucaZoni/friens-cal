import { useSession } from '@/auth/use-session'
import { isSetupComplete } from '@/identity/friend-row'
import { Navigate, Outlet } from 'react-router'

/**
 * The gate between "signed in" and "has an identity".
 *
 * It sits inside `RequireAuth`, so by the time it renders there is a session;
 * what it decides is whether the Friend row behind that session has been filled
 * in. Everything downstream — the roster, the heatmap, the Candidate glow —
 * reads `hue` and `tone` as numbers, and this is what makes that safe rather
 * than making twelve components handle a null.
 *
 * The `loading` branch is load-bearing for the same reason `RequireAuth`'s is:
 * the Friend row arrives from a second, slower query than the session, and
 * redirecting before it lands would send every returning Friend through setup
 * again and overwrite what they had already chosen.
 *
 * A failed load is not sent to setup either. Setup would only fail to save,
 * and it would look like the app had forgotten who they were.
 */
export const RequireSetup = () => {
  const { state } = useSession()

  if (state.status !== 'signed-in') return null // `RequireAuth` owns this case.

  if (state.friendStatus === 'loading') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center text-xs text-muted-foreground"
      >
        Loading…
      </div>
    )
  }

  if (state.friendStatus === 'error') {
    return (
      <div
        role="alert"
        className="flex min-h-screen items-center justify-center px-6 text-center text-xs text-muted-foreground"
      >
        We cannot reach your Friend row. Reload, and if it keeps happening say so in the group chat.
      </div>
    )
  }

  if (!isSetupComplete(state.friend)) return <Navigate to="/setup" replace />

  return <Outlet />
}
