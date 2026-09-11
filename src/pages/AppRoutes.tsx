import { RequireAuth } from '@/auth/require-auth'
import { SessionProvider } from '@/auth/session-provider'
import { RequireSetup } from '@/identity/require-setup'
import { CalendarPage } from '@/pages/CalendarPage'
import { DesignSystemPage } from '@/pages/DesignSystem'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { SetupPage } from '@/pages/SetupPage'
import { SignInPage } from '@/pages/SignInPage'
import { SignUpPage } from '@/pages/SignUpPage'
import { BrowserRouter, Route, Routes } from 'react-router'

export const AppRoutes = () => {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />

          {/*
            Reachable by URL and by nothing else, on purpose (issue 14). No
            screen links here: a new Friend is told this address in the group
            chat, in the same message that tells them they were added to the
            allowlist. The gate that matters is the `before-user-created` hook
            either way — this is only about not advertising a door that five
            people can open and everyone else bounces off, uninformatively.
          */}
          <Route path="/sign-up" element={<SignUpPage />} />

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
