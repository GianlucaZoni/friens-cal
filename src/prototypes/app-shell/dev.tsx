/** PROTOTYPE — ticket 12. THROWAWAY dev entry for `dev.html`. */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { AppShellPrototype } from './index'
import '@/index.css'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <BrowserRouter>
      <AppShellPrototype />
    </BrowserRouter>
  </StrictMode>
)
