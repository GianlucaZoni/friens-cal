import type { Friend } from '@/lib/database.types'
import type { User } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

/**
 * Who is at the keyboard.
 *
 * `friend` is null in two different situations, and the difference does not
 * matter to any caller yet: the row has not loaded, or it failed to load. Both
 * mean "we cannot name this person right now".
 */
export type SessionState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; user: User; friend: Friend | null }

export type SessionValue = {
  state: SessionState
  /** Resolves to an error message fit to show a Friend, or null on success. */
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

export const SessionContext = createContext<SessionValue | null>(null)

export const useSession = () => {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside a <SessionProvider>')
  return value
}
