import { SIGNUP_FAILURE, SessionContext, type SessionValue } from '@/auth/use-session'
import type { Friend, FriendUpdate } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import type { AuthError, User } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useState } from 'react'

/**
 * What Supabase has told us, and nothing more. Deliberately NOT `SessionState`:
 * the Friend row is a second, slower fact that arrives from a different query,
 * and the two are joined only at the bottom of this file.
 */
type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; user: User }

/**
 * A fetched Friend row, tagged with whose it is.
 *
 * `failed` separates "no row came back" from "we have not asked yet", which the
 * setup gate needs: an unfinished Friend belongs on `/setup` and a Friend whose
 * row failed to load belongs nowhere until it does.
 */
type FetchedFriend = { forUserId: string; friend: Friend | null; failed: boolean }

/**
 * Sign-in copy.
 *
 * Ticket 18's catch-all — one sentence for every failure — is a SIGNUP
 * requirement, there to close the address-enumeration leak (issue 14). Sign-in
 * has no such leak to close: Supabase answers an unknown address and a wrong
 * password with the same `invalid_credentials` either way. So this says
 * the true thing rather than the vague one.
 */
const signInErrorMessage = (error: AuthError): string =>
  error.code === 'invalid_credentials'
    ? 'That email and password do not match.'
    : 'Could not sign in just now. Try again in a moment.'

export const SessionProvider = ({ children }: { children: React.ReactNode }) => {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' })
  const [fetched, setFetched] = useState<FetchedFriend | null>(null)

  useEffect(() => {
    let live = true

    void supabase.auth.getSession().then(({ data }) => {
      if (!live) return
      setAuth(
        data.session ? { status: 'signed-in', user: data.session.user } : { status: 'signed-out' }
      )
    })

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // Move state and nothing else. supabase-js holds a lock while this fires,
      // so calling back into the client from here deadlocks it.
      setAuth(session ? { status: 'signed-in', user: session.user } : { status: 'signed-out' })
    })

    return () => {
      live = false
      data.subscription.unsubscribe()
    }
  }, [])

  const userId = auth.status === 'signed-in' ? auth.user.id : null

  useEffect(() => {
    if (userId === null) return

    let live = true
    void supabase
      .from('friend')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!live) return
        if (error) {
          // A permission-denied here almost always means the table's grant is
          // missing rather than the query being wrong — the project does not
          // expose new tables automatically. See supabase/01-friend.sql.
          console.error('Could not load the signed-in Friend:', error.message)
          setFetched({ forUserId: userId, friend: null, failed: true })
          return
        }
        setFetched({ forUserId: userId, friend: data, failed: false })
      })

    return () => {
      live = false
    }
  }, [userId])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? signInErrorMessage(error) : null
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password })

    if (error) {
      // Logged, never rendered — and the console is now the only place the real
      // reason survives. `User already registered`, `Password should be at
      // least 6 characters`, and the allowlist hook's own refusal all arrive
      // here and all leave as the same sentence, which is the point
      // (`SIGNUP_FAILURE`). Whoever debugs this from the group chat needs
      // something to go on.
      console.error('Signup failed:', error.code, error.message)
      return SIGNUP_FAILURE
    }

    // Success with no session is not success. Two configurations produce it,
    // both of them Confirm Email being switched back on in the dashboard: a
    // brand-new account waiting on an email that ticket 13 made undeliverable,
    // and an already-registered address, which Supabase then obfuscates into a
    // user with no identities and no error rather than admitting it exists.
    // Neither can happen while Confirm Email is off. If one ever does, this
    // screen wants rewriting rather than patching — but it must not silently
    // hand back a session that is not there and leave the Friend on a form that
    // says nothing.
    if (!data.session) {
      console.error('Signup returned no session — is Confirm Email switched on?')
      return SIGNUP_FAILURE
    }

    // Nothing to do on success: the auth listener flips the session, and the
    // blank Friend row the `01-friend.sql` trigger just made is what sends them
    // through `RequireSetup` to `/setup`.
    return null
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const saveFriend = useCallback(
    async (patch: FriendUpdate) => {
      if (userId === null) return 'You are signed out. Sign in again and try that once more.'

      // `.eq` as well as RLS, and not only for belt and braces: `.single()`
      // needs the statement to name one row, and RLS narrows what is visible
      // rather than what is addressed.
      const { data, error } = await supabase
        .from('friend')
        .update(patch)
        .eq('id', userId)
        .select()
        .single()

      if (error) {
        // A permission-denied here is the column-scoped grant or RLS refusing a
        // column we may not write; a check violation is `tone` outside the six
        // band interiors. Neither is a sentence to show a Friend.
        console.error('Could not save the Friend row:', error.message)
        return 'That did not save. Try again in a moment.'
      }

      setFetched({ forUserId: userId, friend: data, failed: false })
      return null
    },
    [userId]
  )

  const value = useMemo<SessionValue>(() => {
    // Matching on the user id rather than clearing on sign-out is what keeps a
    // previous Friend's name from flashing on the next one's screen.
    const mine = fetched !== null && fetched.forUserId === userId ? fetched : null
    return {
      state:
        auth.status === 'signed-in'
          ? {
              ...auth,
              friend: mine?.friend ?? null,
              friendStatus: mine === null ? 'loading' : mine.failed ? 'error' : 'ready',
            }
          : auth,
      signIn,
      signUp,
      signOut,
      saveFriend,
    }
  }, [auth, fetched, userId, signIn, signUp, signOut, saveFriend])

  return <SessionContext value={value}>{children}</SessionContext>
}
