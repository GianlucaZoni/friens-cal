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

/**
 * Every way a signup can fail, said the same way.
 *
 * Not a matter of taste — it is the only thing that closes the
 * address-enumeration leak (issue 14). The `before-user-created` hook can
 * refuse an unlisted address without naming the list, but with Confirm Email
 * disabled (ticket 13) an address that ALREADY has an account comes back as
 * Supabase's own `User already registered`, which is a straight answer to "is
 * this person one of you?". Supabase's enumeration protection was a property of
 * the confirmation email, and ticket 13 deleted the email.
 *
 * So both are collapsed into this, along with a weak password and a dropped
 * connection. Ticket 18 weighed three drafts and chose this one on exactly that
 * argument: it is the only one whose shape can absorb `User already registered`
 * without the collapse reading as a lie.
 *
 * The cost was counted and accepted: a Friend who typos their own address is
 * told nothing that would help them notice.
 *
 * `message` is duplicated in `supabase/07-allowlist.sql`, which is what the
 * hook returns to callers that are not this screen. Change one, change the
 * other.
 */
export type SignUpFailure = { message: string; secondary: string }

export const SIGNUP_FAILURE: SignUpFailure = {
  message: 'We could not create an account with those details.',
  secondary:
    'Everyone here was added by hand. If you think you should be in, ask in the group chat.',
}

export type SessionValue = {
  state: SessionState
  /** Resolves to an error message fit to show a Friend, or null on success. */
  signIn: (email: string, password: string) => Promise<string | null>
  /**
   * Resolves to `null` on success, or to the one failure a signup is allowed to
   * report.
   *
   * The return type is the enforcement. There is no channel here through which
   * a Supabase message could reach the screen even by accident, so the
   * catch-all is a property of this contract rather than a rule the signup page
   * has to keep remembering. See `SIGNUP_FAILURE`.
   */
  signUp: (email: string, password: string) => Promise<SignUpFailure | null>
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
