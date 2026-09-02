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
      hangout: {
        Row: {
          id: string
          starts_at: string
          ends_at: string
          title: string | null
          created_at: string
          /**
           * Who confirmed it, and who last changed it —
           * `06-hangout-lifecycle.sql` §1. Provenance, not ownership: every
           * policy on this table is still `using (true)`.
           *
           * All three are nullable and every reader has to render the missing
           * case. `created_by` is null for the Hangouts confirmed before that
           * migration, and for a Friend whose row is gone (`on delete set
           * null`); `edited_by` non-null **is** ticket 08 §1's "edited" mark.
           */
          created_by: string | null
          edited_by: string | null
          edited_at: string | null
        }
        /**
         * `id` and `created_at` are optional: both have defaults, and confirming
         * a Candidate supplies neither — `gen_random_uuid()` and `now()` are
         * what make the insert one statement with nothing to invent client-side.
         *
         * `created_by` is **required**, unlike every other nullable column here.
         * The insert policy is `with check (created_by = (select auth.uid()))`,
         * so an insert that omits it is `42501` rather than a row with no
         * author — and this type is what says so before the round trip.
         */
        Insert: {
          id?: string
          starts_at: string
          ends_at: string
          title?: string | null
          created_at?: string
          created_by: string
        }
        /**
         * What an edit may write. `id` and `created_at` are absent because
         * nothing should ever write them — the grant is table-wide rather than
         * column-scoped here (05-hangout.sql §3), so this type is the only
         * thing saying so.
         *
         * `edited_by` is required for the same reason `created_by` is on the
         * insert: the update policy's `with check` refuses an update that does
         * not claim it. `created_by` is absent — an edit never re-authors a
         * Hangout — and so is `edited_at`, which
         * `06-hangout-lifecycle.sql` §2 stamps from a trigger so that
         * provenance never carries a browser's clock.
         */
        Update: {
          starts_at?: string
          ends_at?: string
          title?: string | null
          edited_by: string
        }
        Relationships: []
      }
      hangout_participant: {
        Row: {
          hangout_id: string
          friend_id: string
          left_at: string | null
        }
        /**
         * `left_at` is omitted at confirmation: a seeded Participant has not
         * left, and null is the column's own default. Passing `null`
         * explicitly would be the same row and a worse statement of intent.
         */
        Insert: {
          hangout_id: string
          friend_id: string
          left_at?: string | null
        }
        /**
         * `left_at` alone, because the **grant** is column-scoped to it
         * (05-hangout.sql §4). `hangout_id` and `friend_id` are the key and
         * cannot be written at all, so RLS never has to defend them.
         */
        Update: {
          left_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'hangout_participant_hangout_id_fkey'
            columns: ['hangout_id']
            isOneToOne: false
            referencedRelation: 'hangout'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'hangout_participant_friend_id_fkey'
            columns: ['friend_id']
            isOneToOne: false
            referencedRelation: 'friend'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: Record<string, never>
    Functions: {
      /**
       * ADR-0002's one narrow hole — `06-hangout-lifecycle.sql` §4.
       *
       * Moves a Hangout and extends every current Participant's Availability
       * to cover the new range, in one statement. Three arguments rather than
       * the ADR's original one, which its amendment records and argues: a
       * retime needs the extension to reach the range the Hangout is arriving
       * at, and the stored row only knows the one it is leaving.
       *
       * Returns the moved row, so the store folds the same shape it reads.
       */
      retime_hangout: {
        Args: {
          hangout_id: string
          starts_at: string
          ends_at: string
        }
        Returns: Database['public']['Tables']['hangout']['Row']
      }
    }
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
 * exist in the data at all.
 */
export type Availability = Database['public']['Tables']['availability']['Row']

/**
 * A Hangout row, as Postgres holds it.
 *
 * **A range, where Availability is slot rows** — `starts_at`/`ends_at` rather
 * than a row per half hour, because a Hangout has to outlive the Availability
 * that produced it (ticket 07 §6). The epoch-millisecond form the app actually
 * works in is `Hangout` in `@/hangouts/hangout`; this is the wire shape, and
 * PostgREST renders both timestamps as `…+00:00` rather than `…Z`.
 */
export type HangoutRow = Database['public']['Tables']['hangout']['Row']

/**
 * One Friend on one Hangout — the **stored**, seeded list.
 *
 * Three states out of two facts: row with `left_at` null is a Participant, row
 * with `left_at` set is Left (sticky forever), and no row at all is never
 * joined or auto-dropped.
 */
export type HangoutParticipantRow = Database['public']['Tables']['hangout_participant']['Row']
