import { SessionContext, type SessionValue } from '@/auth/use-session'
import type { Friend } from '@/lib/database.types'
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

/** A fetched Friend row, tagged with whose it is. */
type FetchedFriend = { forUserId: string; friend: Friend | null }

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
          setFetched({ forUserId: userId, friend: null })
          return
        }
        setFetched({ forUserId: userId, friend: data })
      })

    return () => {
      live = false
    }
  }, [userId])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? signInErrorMessage(error) : null
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const value = useMemo<SessionValue>(() => {
    // Matching on the user id rather than clearing on sign-out is what keeps a
    // previous Friend's name from flashing on the next one's screen.
    const friend = fetched !== null && fetched.forUserId === userId ? fetched.friend : null
    return {
      state: auth.status === 'signed-in' ? { ...auth, friend } : auth,
      signIn,
      signOut,
    }
  }, [auth, fetched, userId, signIn, signOut])

  return <SessionContext value={value}>{children}</SessionContext>
}
