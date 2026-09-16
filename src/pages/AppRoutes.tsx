import { RequireAuth } from '@/auth/require-auth'
import { SessionProvider } from '@/auth/session-provider'
import { RequireSetup } from '@/identity/require-setup'
import { CalendarPage } from '@/pages/CalendarPage'
import { DesignSystemPage } from '@/pages/DesignSystem'
import { JoinOrCreatePage } from '@/pages/JoinOrCreatePage'
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
              {/*
                `/` is the join-or-create page and **never a redirect into a
                cal**, whatever the Friend is a Member of (groups ticket 01). A
                bounce to the last cal used would make the page unreachable, and
                it is the only place the Codes are and the only way to reach a
                second cal.

                `/g/:id` carries an **opaque id, not the Code**. `/g/:CODE`
                would make the address bar a shareable invite, which welds the
                Code to every bookmark and makes it a live invite link the day
                signup opens. The provider under this route is what turns the id
                into a cal, and what refuses one you are not a Member of.
              */}
              <Route path="/" element={<JoinOrCreatePage />} />
              <Route path="/g/:id" element={<CalendarPage />} />
            </Route>
          </Route>

          <Route path="/design-system" element={<DesignSystemPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  )
}
