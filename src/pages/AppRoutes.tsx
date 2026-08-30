import { RequireAuth } from '@/auth/require-auth'
import { SessionProvider } from '@/auth/session-provider'
import { CalendarPage } from '@/pages/CalendarPage'
import { DesignSystemPage } from '@/pages/DesignSystem'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { SignInPage } from '@/pages/SignInPage'
import { BrowserRouter, Route, Routes } from 'react-router'

export const AppRoutes = () => {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />

          <Route element={<RequireAuth />}>
            <Route path="/" element={<CalendarPage />} />
          </Route>

          <Route path="/design-system" element={<DesignSystemPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  )
}
