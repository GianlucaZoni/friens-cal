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
      /**
       * A Group — named `cal` because `group` is a fully reserved word in
       * Postgres (supabase/08-cal-and-membership.sql).
       *
       * No `time_zone`: a cal has no clock of its own, and every grid is drawn
       * in its own viewer's zone. No provenance either — who made a cal is the
       * Member with the earliest `joined_at`, and a `created_by` would be the
       * first hint of an ownership model CONTEXT.md refuses.
       */
      cal: {
        Row: {
          id: string
          name: string
          code: string
          created_at: string
        }
        /**
         * Present because the generated shape has it, not because the browser
         * can use it: `authenticated` holds no insert grant on `cal`. The one
         * legitimate creator is the `create_cal` RPC, which also mints the
         * Code.
         */
        Insert: {
          id?: string
          name: string
          code: string
          created_at?: string
        }
        /**
         * `name` alone, because the update grant is column-scoped to it. The
         * Code never changes (CONTEXT.md) and that is what makes it true.
         */
        Update: {
          name?: string
        }
        Relationships: []
      }
      /**
       * A Friend in a Group, and the hottest object in the schema:
       * `private.my_cal_ids()` reads it, so every policy in the product depends
       * on it.
       *
       * No `left_at`. Leaving is a hard delete — nothing asks whether somebody
       * was ever in a cal, and the Hangouts they were on keep their name
       * regardless.
       */
      membership: {
        Row: {
          cal_id: string
          friend_id: string
          joined_at: string
        }
        /**
         * No insert grant either: `create_cal` and `join_cal` are the only
         * legitimate creators, and a browser-side insert would make the Code
         * unnecessary, which is the entire gate.
         */
        Insert: {
          cal_id: string
          friend_id: string
          joined_at?: string
        }
        /** Empty: there is nothing on the row to change, and no update grant. */
        Update: Record<string, never>
        Relationships: [
          {
            foreignKeyName: 'membership_cal_id_fkey'
            columns: ['cal_id']
            isOneToOne: false
            referencedRelation: 'cal'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'membership_friend_id_fkey'
            columns: ['friend_id']
            isOneToOne: false
            referencedRelation: 'friend'
            referencedColumns: ['id']
          },
        ]
      }
      friend: {
        Row: {
          id: string
          display_name: string | null
          blobatar_seed: string | null
          hue: number | null
          tone: number | null
          expression: string | null
          /**
           * A **mirror of the device**, not a setting — written from
           * `Intl.DateTimeFormat().resolvedOptions().timeZone` on sign-in and
           * whenever the device disagrees with it. There is no picker and no
           * edit path.
           *
           * The grid never reads it: it reads the live device on every render,
           * so travelling just works. This column exists for the two readers
           * that are other people — the roster's `8h ahead`, and whether the
           * cal spans zones at all. Null for a Friend who has not signed in
           * since the column existed.
           */
          time_zone: string | null
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
          time_zone?: string | null
          created_at?: string
        }
        /** `id` and `created_at` are absent: the update grant excludes them. */
        Update: {
          display_name?: string | null
          blobatar_seed?: string | null
          hue?: number | null
          tone?: number | null
          expression?: string | null
          time_zone?: string | null
        }
        Relationships: []
      }
      availability: {
        Row: {
          /**
           * Which cal this statement was made in. Availability is
           * *(group, friend, slot)* — a Friend free on Saturday in two cals has
           * said so twice, and neither row says anything about the other.
           */
          cal_id: string
          friend_id: string
          slot_start: string
        }
        Insert: {
          cal_id: string
          friend_id: string
          slot_start: string
        }
        /**
         * Empty because there is **no update grant at all** on this table
         * (supabase/02-availability.sql). The row is three columns and all
         * three are the key: changing any one is not an edit, it is a different
         * row. Editing Availability is `insert` and `delete`.
         */
        Update: Record<string, never>
        Relationships: [
          {
            /**
             * To `membership`, not to `friend` (supabase/09-per-cal.sql §2).
             * That is what makes "you cannot hold Availability in a cal you are
             * not in" structural, and what erases your Availability when you
             * leave, by cascade rather than by anybody remembering to.
             */
            foreignKeyName: 'availability_membership_fkey'
            columns: ['cal_id', 'friend_id']
            isOneToOne: false
            referencedRelation: 'membership'
            referencedColumns: ['cal_id', 'friend_id']
          },
        ]
      }
      hangout: {
        Row: {
          id: string
          /**
           * The cal the plan is in. The exclusion constraint is
           * `(cal_id with =, tstzrange(starts_at, ends_at) with &&)`, so the
           * calendar holds one plan at a time **per cal** rather than one plan
           * at a time.
           */
          cal_id: string
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
          cal_id: string
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
         *
         * `cal_id` is absent for a third reason, which is neither of those: a
         * plan does not move between cals. The update grant is table-wide, so
         * `10-lifecycle-per-cal.sql` §1 pins the column in the same trigger
         * that pins `created_by` — this type is what says so before the round
         * trip silently does nothing.
         */
        Update: {
          starts_at?: string
          ends_at?: string
          title?: string | null
          edited_by: string
        }
        Relationships: [
          {
            foreignKeyName: 'hangout_cal_id_fkey'
            columns: ['cal_id']
            isOneToOne: false
            referencedRelation: 'cal'
            referencedColumns: ['id']
          },
        ]
      }
      hangout_participant: {
        Row: {
          hangout_id: string
          /**
           * Redundant with its Hangout's, and **unable to disagree with it**:
           * `hangout` carries a `unique (id, cal_id)` so this table can
           * reference both columns together (supabase/09-per-cal.sql §4). It is
           * here so the policy reads like every other one rather than being a
           * per-row join through `hangout` — and it is what lets the broadcast
           * trigger find the topic with no join at all.
           */
          cal_id: string
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
          cal_id: string
          friend_id: string
          left_at?: string | null
        }
        /**
         * `left_at` alone, because the **grant** is column-scoped to it
         * (05-hangout.sql §4). `hangout_id`, `cal_id` and `friend_id` cannot be
         * written at all, so RLS never has to defend them.
         */
        Update: {
          left_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'hangout_participant_hangout_fkey'
            columns: ['hangout_id', 'cal_id']
            isOneToOne: false
            referencedRelation: 'hangout'
            referencedColumns: ['id', 'cal_id']
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
      /**
       * Make a cal and become its first Member, in one transaction —
       * `08-cal-and-membership.sql` §7.
       *
       * Two inserts that must not come apart: a failed second one orphans a cal
       * nobody is in and nobody can ever reach, because you cannot join it
       * without its Code and you cannot read its Code without being in it.
       *
       * One argument, and it says *what*, never *who* — ADR-0003 condition 1.
       * The Code is minted inside, with retry on collision, which a column
       * default cannot do for itself.
       */
      create_cal: {
        Args: {
          name: string
        }
        Returns: Database['public']['Tables']['cal']['Row']
      }
      /**
       * Resolve a Code and become a Member — `08-cal-and-membership.sql` §7.
       *
       * Exposed and `security definer` because `cal` reads are
       * membership-scoped, so a Friend cannot look up a cal they are not in
       * yet. **Idempotent**: a Code for a cal you already hold returns the row
       * rather than erroring, so a double-submit is harmless. A Code matching
       * nothing raises, and the caller replaces the message — there is no
       * enumeration oracle to protect, because guessing right puts you in a
       * roster five friends look at.
       *
       * Case and surrounding space are normalised server-side, which is what
       * lets the client's field accept `^[A-Za-z0-9]*$` — deliberately wider
       * than the server's thirty characters, so it can never reject a keystroke
       * the RPC would have accepted.
       */
      join_cal: {
        Args: {
          code: string
        }
        Returns: Database['public']['Tables']['cal']['Row']
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
 * A Group, as Postgres holds it — `cal` in the schema, "friens cal" on screen.
 *
 * The domain term is Group; `group` is a fully reserved word in Postgres, so
 * the identifier could not be it without quoting every reference.
 */
export type Cal = Database['public']['Tables']['cal']['Row']

/**
 * A Friend in a Group. `(cal_id, friend_id)` and when they arrived, and
 * nothing else: identity is global (CONTEXT.md), so nothing varies per
 * Membership.
 */
export type Membership = Database['public']['Tables']['membership']['Row']

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
