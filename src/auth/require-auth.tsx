import { useSession } from '@/auth/use-session'
import { Navigate, Outlet, useLocation } from 'react-router'

/**
 * The gate on every authenticated route.
 *
 * The `loading` branch is load-bearing rather than cosmetic: a restored session
 * is read from storage asynchronously, so redirecting before it resolves would
 * bounce every returning Friend to sign-in and lose the route they asked for.
 */
export const RequireAuth = () => {
  const { state } = useSession()
  const location = useLocation()

  if (state.status === 'loading') {
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

  if (state.status === 'signed-out') {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
