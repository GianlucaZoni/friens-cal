import type { Friend, FriendUpdate } from '@/lib/database.types'
import type { User } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

/**
 * Who is at the keyboard.
 *
 * `friend` is null in two different situations and `friendStatus` is what tells
 * them apart: the row has not loaded yet, or loading it failed. Issue 01 said
 * the difference did not matter to any caller. It does now — the setup gate has
 * to send an unfinished Friend to `/setup` and must not send a Friend there
 * merely because their row is still in flight.
 */
export type SessionState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | {
      status: 'signed-in'
      user: User
      friend: Friend | null
      friendStatus: 'loading' | 'ready' | 'error'
    }

export type SessionValue = {
  state: SessionState
  /** Resolves to an error message fit to show a Friend, or null on success. */
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  /**
   * Writes columns on the signed-in Friend's own row and keeps the copy in this
   * provider in step with what Postgres actually stored.
   *
   * The write returns the updated row rather than the patch, so local state is
   * what the database holds and not what we hoped it would hold — which matters
   * because `tone` is constrained to six values in SQL and a bad one comes back
   * as an error rather than as a silent no-op.
   *
   * Resolves to an error message fit to show a Friend, or null on success.
   */
  saveFriend: (patch: FriendUpdate) => Promise<string | null>
}

export const SessionContext = createContext<SessionValue | null>(null)

export const useSession = () => {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside a <SessionProvider>')
  return value
}
