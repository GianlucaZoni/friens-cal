import type { Database } from '@/lib/database.types'
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !publishableKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env and fill them in.'
  )
}

/**
 * The one Supabase client.
 *
 * The publishable key in the bundle is PUBLIC and that is intended — the
 * protection is row level security plus table grants, not secrecy (ADR-0001).
 */
export const supabase = createClient<Database>(url, publishableKey, {
  auth: {
    /**
     * Set explicitly because the docs never state the default (ticket 13). With
     * no email links anywhere in v1, PKCE's same-browser requirement costs
     * nothing, so we take the stronger of the two.
     */
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    /**
     * Nothing ever arrives back as a URL fragment: there is no confirmation
     * email, no magic link and no password reset (ticket 13).
     */
    detectSessionInUrl: false,
  },
})
