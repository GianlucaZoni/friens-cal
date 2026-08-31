import { RequireAuth } from '@/auth/require-auth'
import { SessionProvider } from '@/auth/session-provider'
import { RequireSetup } from '@/identity/require-setup'
import { CalendarPage } from '@/pages/CalendarPage'
import { DesignSystemPage } from '@/pages/DesignSystem'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { SetupPage } from '@/pages/SetupPage'
import { SignInPage } from '@/pages/SignInPage'
import { BrowserRouter, Route, Routes } from 'react-router'

export const AppRoutes = () => {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />

          <Route element={<RequireAuth />}>
            {/*
              `/setup` is signed-in but deliberately NOT behind `RequireSetup` —
              it is the screen that satisfies it, so gating it on itself would
              be a redirect loop. It sends an already-finished Friend to `/`
              itself; from then on the profile menu is the way back in.
            */}
            <Route path="/setup" element={<SetupPage />} />

            {/*
              Two gates rather than one, because they answer different
              questions: `RequireAuth` asks whether there is a session, and this
              asks whether the Friend behind it has an identity. Everything
              inside reads `hue` and `tone` as numbers.
            */}
            <Route element={<RequireSetup />}>
              <Route path="/" element={<CalendarPage />} />
            </Route>
          </Route>

          <Route path="/design-system" element={<DesignSystemPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  )
}
