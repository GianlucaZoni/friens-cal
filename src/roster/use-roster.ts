import { useSession } from '@/auth/use-session'
import { identityOf } from '@/identity/friend-row'
import type { Identity } from '@/identity/identity'
import type { Friend } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { mergeSelf, rosterOrder, toggled, withoutHidden } from '@/roster/roster'
import { useCallback, useEffect, useMemo, useState } from 'react'

/** A Friend, as the sidebar and the grid need them. */
export type RosterFriend = {
  id: string
  /** Their display name, or a placeholder if they have not set one yet. */
  name: string
  /**
   * Null when this Friend has not finished setup — **not** a filled-in default.
   * A default hue is a *colour*: it would put a Friend on the sidebar in one
   * nobody chose and no column holds, and it would look exactly like a finished
   * Friend (`identityOf`, issue 03).
   */
  identity: Identity | null
  /** You are in the roster, and hideable like anyone else. */
  isSelf: boolean
}

/**
 * A Friend whose setup is finished, so their `identity` is not null.
 *
 * Narrowing it into its own type is what keeps `identity !== null` from being
 * re-checked at every use downstream: the heatmap counts these Friends and the
 * slot popover draws them, and both need a hue and a face. `setUpOnly` is the
 * one place the check happens.
 */
export type SetUpFriend = RosterFriend & { identity: Identity }

/**
 * The Friends among these who have finished setup.
 *
 * Its own function, beside the type, because the predicate is `identityOf`'s
 * answer and the roster is where that lives — a caller writing
 * `filter(f => f.identity !== null)` inline would be restating the codebase's
 * single definition of "has not finished setup".
 */
export const setUpOnly = (friends: readonly RosterFriend[]): SetUpFriend[] =>
  friends.filter((friend): friend is SetUpFriend => friend.identity !== null)

export type RosterState = {
  /** Every Friend in the Group, in roster order. */
  friends: RosterFriend[]
  status: 'loading' | 'ready' | 'error'
  /** Ids. Ephemeral — see below. */
  hidden: ReadonlySet<string>
  toggleHidden: (id: string) => void
  /** `friends` minus the Hidden ones: who the viewer is currently trying to meet. */
  visible: RosterFriend[]
}

/** A Friend whose row exists because their account does, and nothing more. */
const UNNAMED = 'Someone new'

/**
 * The Group, and which of them the viewer is currently looking at.
 *
 * ## Why the two are one hook
 *
 * Hidden is **ephemeral view state** — not persisted anywhere, not even to
 * `localStorage`; losing it on reload is correct (ticket 01, ticket 12
 * decision 3). But it is not the roster's private business either: hiding is a
 * *query tool*, and the query it defines is what issue 07's heatmap and issue
 * 08's Candidate list are computed over (CONTEXT.md). Both of those want the
 * roster and the Hidden set together, and `visible` is the list they actually
 * read — so the two travel as one object, instantiated in `AppShell` beside
 * `useCalendarView`, which is the precedent for where this kind of state sits.
 *
 * **Plain React state, not MobX-State-Tree.** MST is on the stack and nothing
 * in `src/` uses it yet; this is one `Set` and one array behind a prop, which
 * is what the shell already established for view state. Reaching for a store
 * to hold them would be the first use of MST in the codebase, decided by an
 * issue that does not need it.
 *
 * ## The read
 *
 * Not `useTakenHues`, which excludes the signed-in Friend and drops null hues —
 * both of which are exactly wrong here. `select` on `friend` is group-wide
 * (issue 01), so this needs no new grant.
 *
 * **And a Realtime subscription on `friend`**, added by issue 07. Your *own*
 * changes always landed immediately through `mergeSelf`; this is what makes
 * everybody else's land too — a Friend changing their hue recolours their
 * sidebar row, and a Friend finishing setup appears as a Friend rather than as a
 * dashed placeholder.
 *
 * It is not decoration in this slice, which is why it arrives with the heatmap:
 * **the wash counts `visible`**, so a Friend the roster has not heard about is a
 * Friend whose Availability arrives over Realtime and is then not counted. The
 * grid would under-report by one, silently, until a reload. The two
 * subscriptions have to exist together or the count is only as fresh as the
 * roster read.
 */
export const useRoster = (): RosterState => {
  const { state } = useSession()
  const userId = state.status === 'signed-in' ? state.user.id : null
  const self = state.status === 'signed-in' ? state.friend : null

  const [rows, setRows] = useState<Friend[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    if (userId === null) return

    let live = true
    void supabase
      .from('friend')
      .select('*')
      .then(({ data, error }) => {
        if (!live) return
        if (error) console.error('Could not read the roster:', error.message)
        setFailed(error !== null)
        setRows(data ?? [])
      })

    return () => {
      live = false
    }
  }, [userId])

  /**
   * Everybody else's row, as it changes.
   *
   * `*` here, unlike the Availability subscription's two explicit events, and for
   * the mirror-image reason: `friend` rows *are* updated — that is the whole of
   * changing your colour (ticket 11: "freely, from the profile dropdown,
   * propagating over Realtime like any other row") — and they are inserted by
   * the `on_auth_user_created` trigger when a new Friend signs up. Deletes are
   * not reachable from the browser and cost nothing to handle.
   *
   * Folded by id rather than refetched: a re-`select` would be a second source of
   * truth for a row the payload already carries in full, and would race with
   * `mergeSelf`. Your own row still wins through that overlay, which is right —
   * the session provider is the thing that *wrote* it.
   */
  useEffect(() => {
    if (userId === null) return

    const channel = supabase
      .channel('friend')
      .on<Friend>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend' },
        ({ eventType, new: row, old }) => {
          setRows((current) =>
            eventType === 'DELETE'
              ? (current ?? []).filter((existing) => existing.id !== old.id)
              : upsertRow(current ?? [], row)
          )
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId])

  const friends = useMemo(
    () =>
      rosterOrder(
        mergeSelf(rows ?? [], self).map((row) => ({
          id: row.id,
          name: row.display_name?.trim() || UNNAMED,
          // The one predicate for "has not finished setup", used by the order
          // and by the rendering both. `isSetupComplete` is what it is built on.
          identity: identityOf(row),
          isSelf: row.id === userId,
        }))
      ),
    [rows, self, userId]
  )

  const visible = useMemo(() => withoutHidden(friends, hidden), [friends, hidden])

  const toggleHidden = useCallback((id: string) => setHidden((current) => toggled(current, id)), [])

  return {
    friends,
    status: failed ? 'error' : rows === null ? 'loading' : 'ready',
    hidden,
    toggleHidden,
    visible,
  }
}

/**
 * One row folded into the roster's copy, replacing whatever was there.
 *
 * A Friend's row has a stable id and nothing else about it is a key, so an
 * upsert by id is the whole reconciliation — the same property `(friend_id,
 * slot_start)` gives the Availability store, one table along.
 */
const upsertRow = (rows: readonly Friend[], row: Friend): Friend[] =>
  rows.some((existing) => existing.id === row.id)
    ? rows.map((existing) => (existing.id === row.id ? row : existing))
    : [...rows, row]
