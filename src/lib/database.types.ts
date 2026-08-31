/**
 * The shape of the Postgres schema, as `supabase gen types typescript` would
 * emit it.
 *
 * Hand-maintained: the project is not linked to the Supabase CLI, so this file
 * is kept in step with `supabase/*.sql` by hand. When a migration adds a table,
 * add it here in the same commit.
 */

export type Database = {
  public: {
    Tables: {
      friend: {
        Row: {
          id: string
          display_name: string | null
          blobatar_seed: string | null
          hue: number | null
          tone: number | null
          expression: string | null
          created_at: string
        }
        /**
         * Present because the generated shape has it, not because the browser
         * can use it: `authenticated` holds no insert grant on `friend`. Rows
         * are created by the `on_auth_user_created` trigger alone.
         */
        Insert: {
          id: string
          display_name?: string | null
          blobatar_seed?: string | null
          hue?: number | null
          tone?: number | null
          expression?: string | null
          created_at?: string
        }
        /** `id` and `created_at` are absent: the update grant excludes them. */
        Update: {
          display_name?: string | null
          blobatar_seed?: string | null
          hue?: number | null
          tone?: number | null
          expression?: string | null
        }
        Relationships: []
      }
      availability: {
        Row: {
          friend_id: string
          slot_start: string
        }
        Insert: {
          friend_id: string
          slot_start: string
        }
        /**
         * Empty because there is **no update grant at all** on this table
         * (supabase/02-availability.sql). The row is two columns and both are
         * the key: changing either one is not an edit, it is a different row.
         * Editing Availability is `insert` and `delete`.
         */
        Update: Record<string, never>
        Relationships: [
          {
            foreignKeyName: 'availability_friend_id_fkey'
            columns: ['friend_id']
            isOneToOne: false
            referencedRelation: 'friend'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

/**
 * A Friend — the person, not the credential. The `auth.users` row behind them
 * is not this (CONTEXT.md).
 *
 * Every identity column is nullable because the row is created blank the moment
 * the account exists; the setup flow fills it in.
 */
export type Friend = Database['public']['Tables']['friend']['Row']

/**
 * The columns a Friend may write on their own row.
 *
 * Exactly the five in the column-scoped `grant update` — `id` and `created_at`
 * are absent because the browser holds no grant on them at all, so RLS never
 * has to defend them (supabase/01-friend.sql).
 */
export type FriendUpdate = Database['public']['Tables']['friend']['Update']

/**
 * One half hour a Friend is free.
 *
 * **Slot rows, not ranges** (ticket 07). A continuous Availability is a run of
 * adjacent rows, reassembled at render time by `runsOf` — merging does not
 * exist in the data at all. `CONTEXT.md`'s Availability entry describes the
 * range model this replaced.
 */
export type Availability = Database['public']['Tables']['availability']['Row']
