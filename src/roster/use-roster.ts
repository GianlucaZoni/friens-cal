import { useSession } from '@/auth/use-session'
import { useCurrentCal } from '@/cal/use-current-cal'
import { identityOf } from '@/identity/friend-row'
import type { Identity } from '@/identity/identity'
import { calTopic, rowChange } from '@/lib/broadcast'
import type { Friend, Membership } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import {
  byId,
  membersOnly,
  mergeSelf,
  namesOf,
  rosterOrder,
  rosterStatus,
  toggled,
  withMember,
  withoutHidden,
} from '@/roster/roster'
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
  /**
   * Their device's zone, as last mirrored (`friend.time_zone`) — null for a
   * Friend who has not signed in since the column existed.
   *
   * Read **only** to say how far their clock is from the viewer's. Nothing is
   * ever drawn in it: every grid, card and time string is the viewer's own.
   */
  timeZone: string | null
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
  /**
   * The cal's **Members**, in roster order.
   *
   * Not every Friend in the product, which is what the `friend` read returns
   * and what this was until issue 04. This is the set the arithmetic runs over:
   * the sidebar, its `n of m shown` counter, the silence dots, `groupSize` and
   * the heat ramp's denominator. CONTEXT.md's Candidate has read *"two or more
   * non-Hidden **Members**"* since the effort began.
   */
  friends: RosterFriend[]
  /**
   * Every Friend in the product by id, Hidden and departed included, the ones
   * mid-setup dropped.
   *
   * **In the hook rather than at the call sites, which is the point of it.**
   * There are two sets here and the whole bug class is *which one is this
   * derived from*; built in `AppShell` and in `RightPane`, that was two
   * components each reaching for the obvious array. Nothing outside now holds
   * the unfiltered list, so nothing outside can pick the wrong one.
   *
   * A Hangout's faces come from here, and they are a fact about who was there.
   * A Friend who left the cal keeps their Participant row on the Hangouts that
   * already happened (CONTEXT.md, **Left**), and `facesOf` drops ids it does
   * not know rather than drawing them blank, so a Members-only map would leave
   * a past Hangout's face row silently one short.
   */
  friendsById: ReadonlyMap<string, SetUpFriend>
  /**
   * Every Friend's **name** by id, the ones mid-setup included.
   *
   * A second map beside `friendsById`, because the two are different queries: a
   * face needs a finished identity and a provenance line needs only a name.
   * From the full set for `friendsById`'s reason and one of its own:
   * `hangout-detail.tsx`'s `nameFor` falls back to *"someone else"*, documented
   * as being for a genuine race, and a Members-only map would print it for a
   * live, named Friend who happened to leave the cal.
   */
  namesById: ReadonlyMap<string, string>
  status: 'loading' | 'ready' | 'error'
  /** Ids. Ephemeral — see below. */
  hidden: ReadonlySet<string>
  toggleHidden: (id: string) => void
  /**
   * Clear the filter in one go.
   *
   * Here because a *filter* should be liftable from wherever it is being felt,
   * and the place it is felt is the other pane: issue 08's first empty state is
   * "Show more friends to see when you can meet" and it carries the action that
   * makes that sentence actionable. The eye toggles are the only other way back
   * and they are one Friend at a time.
   */
  showAll: () => void
  /** The Members minus the Hidden ones: who the viewer is currently trying to meet. */
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
 * ## Two reads, and the one that is deliberately not scoped
 *
 * **`friend` is read unscoped, and issue 04 chose that rather than inheriting
 * it.** The obvious shape is `select friend(*) from membership where cal_id =
 * …`, and it is wrong in a way that shows up nowhere: `facesOf` returns `[]`
 * for an id it does not know, so a Members-only read does not produce a
 * nameless Participant on a past Hangout, it produces an **absent** one, with
 * the face row one short and nothing on screen saying so. `namesById` is the
 * second casualty and the quieter one, printing *"someone else"* for a live
 * Friend who left the cal. Identity is global (CONTEXT.md, **Friend**), the
 * policy is `using (true)`, and the browser holding every name is a cost issue
 * 04 of the groups effort already accepted.
 *
 * So: **one product-wide read, two sets.** `friend` feeds identity and
 * `membership` feeds participation, ids only (`select('friend_id')`) rather
 * than PostgREST's embed, which would hand back a second copy of rows this hook
 * already holds and let the two drift.
 *
 * It is a full-table read on every load. Fine at three Friends and at three
 * hundred, wrong at a size this product will not reach, and recorded rather
 * than solved.
 *
 * Not `useTakenHues`, which excludes the signed-in Friend and drops null hues —
 * both of which are exactly wrong here. `select` on `friend` is group-wide
 * (issue 01) and `select` on `membership` is cal-scoped by its own policy
 * (`08-cal-and-membership.sql`), so neither read needs a new grant.
 *
 * **Both reads gate `ready`.** The window where one has landed and the other
 * has not is a visible bug in both directions, so the member set is
 * null-when-unknown and is never coerced. See `rosterStatus`.
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
 *
 * ## Two channels, on two mechanisms
 *
 * Under Members that same sentence needs a second event, because the act that
 * puts somebody on your sidebar is no longer a `friend` insert but a
 * `membership` one. So this hook also joins `cal:<id>:members`, broadcast, the
 * fourth table on ADR-0004's third topic
 * (`supabase/12-cal-members-topic.sql`).
 *
 * **The `friend` subscription stays table-wide on `postgres_changes`, and
 * narrowing it to match the Members read would break two things.** It is how a
 * hue change reaches every screen, and it is the only path by which a
 * *brand-new account* reaches a client that has already read the roster: they
 * sign up, arrive here as a `friend` INSERT, and the members broadcast then
 * makes them a Member. Two events on two mechanisms, both required. Narrowed,
 * the members broadcast would announce a Member whose name nobody holds.
 *
 * That leaves this hook running both of the product's Realtime mechanisms at
 * once, which is the concrete shape of ADR-0004's *"the product runs two
 * Realtime mechanisms deliberately"*.
 */
export const useRoster = (): RosterState => {
  const { state } = useSession()
  const { calId } = useCurrentCal()
  const userId = state.status === 'signed-in' ? state.user.id : null
  const self = state.status === 'signed-in' ? state.friend : null

  const [rows, setRows] = useState<Friend[] | null>(null)
  const [failed, setFailed] = useState(false)
  /**
   * The cal's Members, tagged with the cal they are the Members **of**.
   *
   * The tag rather than a bare Set, because the alternative is clearing the Set
   * from inside the effect that re-reads it, and a set read for the cal you
   * just left is not a slow answer about this one, it is an answer to another
   * question. Tagged, the stale window cannot be rendered: `memberIds` below is
   * null until this cal's read lands. `useAvailability` and `useHangouts` lean
   * on `key={calId}` remounting them instead, which works and is one slice's
   * decision away from not working.
   */
  const [members, setMembers] = useState<{ calId: string; ids: ReadonlySet<string> } | null>(null)
  const [membersFailed, setMembersFailed] = useState(false)
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
   * Who is in this cal.
   *
   * Ids and nothing more. The rows are already here from the read above, and a
   * `select('friend(*)')` embed would walk the foreign key and hand back a
   * second copy of each of them, which the fold above would then have to keep
   * in step.
   */
  useEffect(() => {
    if (userId === null) return

    let live = true
    void supabase
      .from('membership')
      .select('friend_id')
      .eq('cal_id', calId)
      .then(({ data, error }) => {
        if (!live) return
        if (error) console.error("Could not read the cal's Members:", error.message)
        setMembersFailed(error !== null)
        setMembers({ calId, ids: new Set((data ?? []).map((row) => row.friend_id)) })
      })

    return () => {
      live = false
    }
  }, [userId, calId])

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

  /**
   * Who joins and who leaves this cal.
   *
   * The second channel, on the other mechanism, and the one that keeps the
   * sidebar live now that the set is the Members rather than the product.
   * Broadcast on a private topic, so the boundary is the `realtime.messages`
   * policy rather than a filter string in this file.
   *
   * Two events, not three: nothing updates `membership` and nothing can, since
   * `08-cal-and-membership.sql` grants no `update` on it and there is nothing
   * on the row to change. The trigger is `after insert or delete` to match.
   *
   * **Dropped while the read is still in flight**, because folding an id into
   * `null` would invent a cal of one. That leaves the read-then-subscribe gap
   * the other two hooks already live with: a Membership written between the
   * read being issued and this channel joining is missed until a reload. The
   * fold is idempotent in both directions, so the overlap costs nothing.
   */
  useEffect(() => {
    if (userId === null) return

    const fold = (friendId: string, present: boolean) =>
      setMembers((current) =>
        current === null || current.calId !== calId
          ? current
          : { calId, ids: withMember(current.ids, friendId, present) }
      )

    const channel = supabase
      .channel(calTopic(calId, 'members'), { config: { private: true } })
      .on('broadcast', { event: 'INSERT' }, ({ payload }) => {
        const joined = rowChange<Membership>(payload, 'membership')?.record
        if (joined == null) return
        fold(joined.friend_id, true)
      })
      .on('broadcast', { event: 'DELETE' }, ({ payload }) => {
        const left = rowChange<Membership>(payload, 'membership')?.old_record
        if (left == null) return
        fold(left.friend_id, false)
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, calId])

  /**
   * Every Friend in the product, in roster order.
   *
   * Held as one array and then split, rather than filtered on the way in: the
   * two maps below are built from this and the sidebar's list is not. That is
   * the whole of issue 04's decision, in the four memos that follow.
   */
  const everyFriend = useMemo(
    () =>
      rosterOrder(
        mergeSelf(rows ?? [], self).map((row) => ({
          id: row.id,
          name: row.display_name?.trim() || UNNAMED,
          // The one predicate for "has not finished setup", used by the order
          // and by the rendering both. `isSetupComplete` is what it is built on.
          identity: identityOf(row),
          timeZone: row.time_zone,
          isSelf: row.id === userId,
        }))
      ),
    [rows, self, userId]
  )

  /**
   * The cal's Members, or null until *this* cal's read has landed.
   *
   * The one place the tag is read, and the reason it exists: null here is
   * "not known yet", and it is never coerced in either direction.
   */
  const memberIds = members?.calId === calId ? members.ids : null

  /*
   * Empty while the Members are unknown, and `status` is `loading` for exactly
   * as long — so nothing draws this. What is never done is the other coercion:
   * treating a null member set as "no filter yet" would flash every Friend in
   * the product, which is the defect this slice exists to remove, reintroduced
   * as a flicker.
   */
  const friends = useMemo(
    () => (memberIds === null ? [] : membersOnly(everyFriend, memberIds)),
    [everyFriend, memberIds]
  )

  const friendsById = useMemo(() => byId(setUpOnly(everyFriend)), [everyFriend])
  const namesById = useMemo(() => namesOf(everyFriend), [everyFriend])

  const visible = useMemo(() => withoutHidden(friends, hidden), [friends, hidden])

  const toggleHidden = useCallback((id: string) => setHidden((current) => toggled(current, id)), [])

  /*
   * A fresh empty Set rather than a reused constant: `hidden` is React state
   * and every other writer here hands back a new one, so a shared instance
   * would be the only object in this hook whose identity outlived a render.
   */
  const showAll = useCallback(() => setHidden(new Set()), [])

  return {
    friends,
    friendsById,
    namesById,
    status: rosterStatus(rows, memberIds, failed || membersFailed),
    hidden,
    toggleHidden,
    showAll,
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
