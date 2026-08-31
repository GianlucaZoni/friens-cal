import { useSession } from '@/auth/use-session'
import {
  mergeSlots,
  slotKey,
  slotsOfDay,
  startOfDayInZone,
  type SlotRow,
} from '@/availability/slots'
import {
  SLOW_WRITE_MS,
  describeSlots,
  withRetries,
  type WriteFailure,
} from '@/availability/write-model'
import { toast } from '@/components/ui/toast-manager'
import { supabase } from '@/lib/supabase'
import { GROUP_TIME_ZONE } from '@/shell/use-calendar-view'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/** Which way a gesture moved the store. The two write paths are symmetric. */
type Stroke = 'draw' | 'erase'

export type AvailabilityStore = {
  /**
   * Is this Friend free in the slot beginning at this instant?
   *
   * **Any** Friend, as of issue 07 — the store holds the whole Group's rows, and
   * always could: it is keyed `(friend_id, slot_start)`, the table's own key
   * (ticket 07), and the key that makes an optimistic row and its Realtime echo
   * the same row rather than two (ticket 19).
   */
  isFree: (friendId: string, slotStart: Date) => boolean
  /**
   * Of these Friends, the ones holding no Availability at all in the current
   * view. CONTEXT.md's **silence**, which the roster marks with a muted dot so
   * that a Friend who has said nothing does not read as a Friend who is busy.
   */
  silent: (friendIds: readonly string[]) => ReadonlySet<string>
  /** `loading` while the range the view is pointed at is still in flight. */
  status: 'loading' | 'ready' | 'error'
  /**
   * Draw these Slots for the viewer — painted at once, written once.
   *
   * Slots the viewer already holds are dropped before either happens, so
   * drawing across the edge of existing Availability writes only the new part
   * and reverts only the new part. Silent on a gesture that adds nothing, which
   * is what redrawing what you already have *is* (CONTEXT.md: merging never
   * happens, because there is never anything to merge).
   */
  draw: (slots: readonly Date[]) => void
  /** Erase these Slots. Symmetric with `draw`, down to the retry. */
  erase: (slots: readonly Date[]) => void
  /**
   * True once some write has been outstanding for `SLOW_WRITE_MS`.
   *
   * Deliberately **not** consumed by the grid. Ticket 15 spent opacity on *how
   * many Friends are free*, so a faded block would read as "fewer people"; this
   * belongs in a channel the grid does not own, and the top bar is it.
   */
  saving: boolean
}

/**
 * PostgREST's page size, and the reason this is not one `select`.
 *
 * Supabase caps every response at `db-max-rows`, 1000 by default, and it does
 * so **silently** — a truncated read is indistinguishable from a Friend who
 * drew less. Slot rows reach that fast: 1000 rows is 500 hours, so a Friend who
 * marks eight hours a day crosses it inside four months.
 *
 * **And the `friend_id` filter is now gone, so multiply that by the size of the
 * Group.** A nine-Friend group at eight hours a day crosses 1000 rows in under
 * three weeks. The paging stopped being theoretical with that one deleted line:
 * without it the grid would simply stop showing Availability past an arbitrary
 * date, with no error anywhere.
 *
 * So the first page IS the one query issue 05 asked for, and the loop below only
 * continues when a page comes back full.
 */
const PAGE_SIZE = 1000

/**
 * Everyone's Availability.
 *
 * Instantiated in `AppShell` beside `useCalendarView` and `useRoster`, and
 * passed down by prop: the established place for state the whole view reaches.
 * It is a third hook rather than a branch of `useRoster` because the two answer
 * different questions and change at different rates — the roster is read once
 * and barely moves, while this one is written on every drag (issue 06) and
 * pushed to by Realtime (issue 07).
 *
 * ## Four writers, one door
 *
 * `held` is the source of truth and `slots` its render mirror; `change` is the
 * only mutator. Four things compose through it, and they are why the ref exists
 * rather than being an optimisation:
 *
 * 1. **The paged read**, folding rows in as a union.
 * 2. **A gesture's optimistic paint** (issue 06, ticket 19) — no pending
 *    treatment, painted the moment the gesture ends.
 * 3. **That gesture's revert**, two seconds later, which has to *read the set
 *    back* to remove only the Slots its own gesture introduced.
 * 4. **Realtime** (issue 07) — and this is the one the union could not serve:
 *    `mergeSlots` cannot express a deletion that happened elsewhere, so a
 *    DELETE event goes through the removal path instead of the fold.
 *
 * ## The write (ticket 19)
 *
 * **Paint first, with no pending treatment**, then one statement per gesture:
 * `insert ... on conflict do nothing` to draw, one `delete ... in (…)` to erase.
 * Both are idempotent on the natural key, which is what makes a retry free —
 * and PostgREST sends a multi-row insert as one statement in one transaction,
 * so **partial failure is not reachable** and there is no chunking to do.
 *
 * On failure: two retries with backoff, then **revert and toast**. The toast
 * names the range, because once the paint is gone there is nothing on screen to
 * point at and ticket 01 left no undo stack.
 *
 * ## The read
 *
 * **One query, from the floor the view needs, unbounded above** — everything
 * from today forward in one go (ticket 07 §10), which is why navigating
 * *forwards* never refetches. Navigating backwards past the floor fetches the
 * strip below it and **merges** into the same store; a replace would blank the
 * week you were just looking at.
 *
 * **Every Friend's rows, in one query with no `friend_id` filter at all.** The
 * key carries the Friend, so nothing else in the read had to change — but it
 * multiplies the row count by the size of the Group, which is what makes the
 * paging above load-bearing rather than defensive.
 *
 * Then a **Realtime subscription** on top, so the grid keeps up with everybody
 * else without a reload. See the effect below for the DELETE hole, the replica
 * identity, and why your own echo needs no bookkeeping.
 */
export const useAvailability = (days: readonly Date[]): AvailabilityStore => {
  const { state } = useSession()
  const userId = state.status === 'signed-in' ? state.user.id : null

  const [slots, setSlots] = useState<ReadonlySet<string>>(() => new Set())
  const [loadedFrom, setLoadedFrom] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const [slowWrites, setSlowWrites] = useState(0)

  /**
   * The store, as a ref — the **source of truth**, with `slots` as its render
   * mirror.
   *
   * Not an optimisation and not an accident. Three writers compose through this
   * set: the paged read, a gesture's optimistic paint, and that gesture's revert
   * two seconds later. The last two have to *read it back* — a revert must
   * remove only the Slots its own gesture introduced, or a failed write would
   * un-paint Availability that is on the server and make the grid lie — and a
   * `setSlots(current => …)` updater cannot be read back synchronously. It is
   * also what makes the toast's **Retry** work: a stale closure over `slots`
   * would compute an empty delta and retry nothing at all.
   */
  const held = useRef<ReadonlySet<string>>(slots)

  /** The one mutator. Keeps the ref and its mirror in step, in that order. */
  const change = useCallback((next: (current: ReadonlySet<string>) => ReadonlySet<string>) => {
    held.current = next(held.current)
    setSlots(held.current)
  }, [])

  /**
   * The earliest instant the view needs.
   *
   * Today, or the first day on screen if the viewer has navigated behind it.
   * Taking the *minimum* rather than switching between them is what makes the
   * boot query cover the current week's earlier days as well: they are already
   * in the past by lunchtime, and fetching them as a separate strip a beat
   * later would make Monday flicker in every Friday afternoon.
   */
  const wantedFrom = useMemo(() => {
    const today = startOfDayInZone(new Date(), GROUP_TIME_ZONE).getTime()
    const firstVisible = days[0]
    return firstVisible === undefined
      ? today
      : Math.min(today, startOfDayInZone(firstVisible, GROUP_TIME_ZONE).getTime())
  }, [days])

  /**
   * How far back Postgres has already been asked. A ref, not state, because it
   * is a **request log** rather than something the render reads — and because
   * writing it from inside the effect that reads it is exactly the synchronous
   * `setState` that `eslint-plugin-react-hooks` calls a cascading render.
   *
   * It also makes this StrictMode-safe for free: the double-invoked effect
   * finds its own floor already recorded and does nothing.
   */
  const requestedFrom = useRef<number | null>(null)

  useEffect(() => {
    if (userId === null) return

    const alreadyRequested = requestedFrom.current
    if (alreadyRequested !== null && wantedFrom >= alreadyRequested) return
    requestedFrom.current = wantedFrom

    /**
     * Rebuilt per page rather than held: a PostgREST builder is single-use, and
     * `range` on a spent one throws rather than paging.
     */
    const page = (index: number) => {
      const query = supabase
        .from('availability')
        // Everyone's, and there is nothing here that says so: the key carries
        // the Friend, so the whole of "the grid stops being yours and becomes
        // the group's" was the removal of one `.eq('friend_id', …)`. The read
        // policy is `using (true)` (02-availability.sql) because the whole
        // product is a count over other people's rows.
        .select('friend_id, slot_start')
        .gte('slot_start', new Date(wantedFrom).toISOString())
        // Ordered because `range` is meaningless over an unordered result:
        // without it the pages may overlap and miss rows between them.
        .order('slot_start')
        .range(index * PAGE_SIZE, index * PAGE_SIZE + PAGE_SIZE - 1)

      return alreadyRequested === null
        ? // Unbounded above: today forward, all of it.
          query
        : // Only the strip of the past the store does not already hold.
          query.lt('slot_start', new Date(alreadyRequested).toISOString())
    }

    void readEveryPage(page).then(({ data, error }) => {
      if (error) {
        // Put the floor back, or this range would never be asked for again.
        // Nothing re-runs on its own, though — the effect's inputs have not
        // moved — so the retry happens on the viewer's next navigation.
        requestedFrom.current = alreadyRequested
        console.error('Could not read Availability:', error.message)
        setFailed(true)
        return
      }
      setFailed(false)
      // No `live` flag on this promise, deliberately. A merge is idempotent, so
      // a result that lands late — after a StrictMode remount, or after the
      // viewer has navigated on — is the same rows arriving in the same store.
      // Discarding it would be the only way to lose them.
      //
      // A union, so a read that lands mid-gesture cannot un-paint it either:
      // the optimistic rows are already in `held` and the server's answer adds
      // to them rather than replacing them.
      change((current) => mergeSlots(current, data))
      setLoadedFrom((current) => (current === null ? wantedFrom : Math.min(current, wantedFrom)))
    })
  }, [userId, wantedFrom, change])

  /**
   * Everyone else's edits, as they happen.
   *
   * `postgres_changes` rather than Broadcast: Supabase now recommends Broadcast
   * for scale, and the scale it means is three orders of magnitude past a group
   * of nine (ticket 02 §6.1). **Unfiltered**, and filtered in the client — there
   * is no `filter` expression for "rows overlapping the visible week", and one
   * built from two column comparisons would need the channel torn down and
   * re-subscribed on every calendar navigation (§6.4).
   *
   * ## Two events, not `*`
   *
   * `update` is unreachable: `02-availability.sql` withholds the update grant
   * outright, because the row is two columns and both are the key — changing
   * either is not an edit, it is a different row. Subscribing to it would be
   * subscribing to something the database cannot produce.
   *
   * ## Why a DELETE payload is enough, and why `replica identity full` is not
   * needed
   *
   * The default replica identity is the **primary key**, and here the primary
   * key *is* the whole row: `(friend_id, slot_start)` and nothing else. So a
   * delete payload carries exactly the key this store is keyed on — the reason
   * `03-realtime.sql` deliberately does not set `replica identity full`, which
   * would cost write amplification for a copy of two columns we already have.
   *
   * ## The documented hole, and why it is harmless here
   *
   * **RLS is not applied to DELETE events** (ticket 02 §6.3, quoting Supabase's
   * own caution: there is no way for Postgres to check access to a row that no
   * longer exists). So every subscriber sees every delete on this table. That
   * leaks nothing: the select policy is `using (true)` and the entire product is
   * a count over other Friends' rows, so a delete event says nothing a `select`
   * would not. Written down rather than left implicit, so a later reader does
   * not mistake the hole for a leak — it is a rule to remember before
   * publishing a table whose *reads* are restricted, and this is not one.
   *
   * ## Your own echo is a no-op, and is not filtered out
   *
   * The key is the natural key, so an optimistic row and its echo are the same
   * row and `mergeSlots` changes nothing (ticket 19). There is deliberately no
   * "is this event mine" bookkeeping: filtering out your own session's events
   * would break **your own second device**, and drawing on a laptop has to reach
   * the phone.
   *
   * ## Auth
   *
   * Ticket 02 could not confirm from the docs whether Realtime's token refreshes
   * as the session rotates. Reading the installed client settles it:
   * `@supabase/supabase-js@2.112.4` wires `auth.onAuthStateChange` to
   * `realtime.setAuth(token)` on `TOKEN_REFRESHED`, `SIGNED_IN` and
   * `INITIAL_SESSION`, and to `setAuth()` on `SIGNED_OUT`
   * (`_listenForAuthEvents` / `_handleTokenChanged`). So nothing is needed here
   * — but that is evidence from the shipped source, not from the documentation
   * the ticket asked about, and the ticket's advice stands: if the grid ever
   * goes quiet after a long idle, this is the first thing to check.
   */
  useEffect(() => {
    if (userId === null) return

    const channel = supabase
      .channel('availability')
      .on<SlotRow>(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'availability' },
        ({ new: row }) => change((current) => mergeSlots(current, [row]))
      )
      .on<SlotRow>(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'availability' },
        ({ old: { friend_id: friendId, slot_start: slotStart } }) => {
          // `old` is `Partial<SlotRow>` in the types, and honestly so: under a
          // narrower replica identity than this table happens to have, it would
          // be. Nothing to do if either half of the key is missing.
          if (friendId === undefined || slotStart === undefined) return
          /*
           * The removal path `mergeSlots` cannot express. Its doc comment says
           * so: a union folds rows *in* and has no way to say a row went away
           * somewhere else. This is the subscription it was waiting for, and it
           * goes through `change` like every other writer — the paged read, a
           * gesture's optimistic paint, and that gesture's revert.
           */
          change((current) => withSlots(current, friendId, [new Date(slotStart)], false))
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, change])

  const isFree = useCallback(
    (friendId: string, slotStart: Date) => slots.has(slotKey(friendId, slotStart)),
    [slots]
  )

  /**
   * Every Slot the current view can show, as instants.
   *
   * Built from each day's **own** slots array rather than from a 48-row
   * assumption: a day is 46, 48 or 50 slots (`slotsOfDay`), and the 25-hour
   * Sunday holds 02:00 twice.
   */
  const viewInstants = useMemo(
    () => days.flatMap((day) => slotsOfDay(day, GROUP_TIME_ZONE).map((slot) => slot.start)),
    [days]
  )

  /**
   * Of these Friends, the ones holding **no** Availability anywhere in the
   * current view — CONTEXT.md's *silence*.
   *
   * "Not having drawn Availability is silence, not a claim of being busy — but
   * the tool cannot tell the two apart." The roster marks these Friends with a
   * muted dot (ticket 01) so an inactive Friend does not read as a busy one,
   * which is a real confusion in a product whose only signal is presence.
   *
   * Answered here rather than in the sidebar because this is the only thing that
   * holds the rows, and answered by asking about the view's own instants rather
   * than by scanning the store: the set is keyed `friendId|instant` and cannot
   * be range-queried, but the question is only ever about the ~350 Slots on
   * screen. Nine Friends over a week is ~3000 set lookups behind a `useMemo`.
   */
  const silent = useCallback(
    (friendIds: readonly string[]): ReadonlySet<string> =>
      new Set(
        friendIds.filter(
          (friendId) => !viewInstants.some((instant) => slots.has(slotKey(friendId, instant)))
        )
      ),
    [viewInstants, slots]
  )

  /**
   * How a gesture is re-run from the toast's **Retry**.
   *
   * A ref, written in an effect, because the round trip that raises the toast
   * closes over `stroke` before `stroke` exists — and by the time anybody can
   * click Retry the effect has run many times over. Ticket 01 left no undo
   * stack, so this button and redrawing by hand are the only two routes back.
   */
  const again = useRef<(kind: Stroke, instants: readonly Date[]) => void>(() => {})

  /**
   * One gesture, from the failed round trip onwards.
   *
   * Split from `stroke` only so the paint is not inside an `async` function:
   * the paint must happen in the same tick as the gesture, and an `await` before
   * it would put it a microtask later — one frame of the grid not showing what
   * the hand just drew, which is the whole thing ticket 19 forbids.
   */
  const perform = useCallback(
    async (kind: Stroke, friendId: string, instants: readonly Date[]) => {
      const failure = await announcingIfSlow(setSlowWrites, () =>
        withRetries(() => writeStroke(kind, friendId, instants))
      )
      if (failure === null) return

      /*
       * Revert, then say so. Reverting silently was rejected outright in ticket
       * 19 — Availability would simply vanish — and so was retrying forever,
       * which leaves the screen permanently lying.
       *
       * One accepted race, named rather than left to be found: a second gesture
       * that redraws the same Slot inside the ~2s this takes to fail has its
       * paint reverted with ours. It survives as a row on the server if its own
       * write landed, so the next read repairs it.
       */
      change((current) => withSlots(current, friendId, instants, kind === 'erase'))

      const range = describeSlots(instants, GROUP_TIME_ZONE)
      /*
       * `raised.id` is filled in by the very next statement, and read only when
       * Retry is pressed. Base UI does **not** close a toast when its action is
       * pressed, and leaving "couldn't save Thu 20:00–23:00" on screen above the
       * block that just saved is the one thing worse than not saying anything.
       */
      const raised: { id?: string } = {}
      raised.id = toast.add({
        type: 'error',
        title: `Couldn't ${kind === 'draw' ? 'save' : 'erase'} ${range}`,
        description: failure.message,
        // Stays until it is dismissed. A toast that names something no longer
        // on screen is the only record that it existed.
        timeout: 0,
        actionProps: {
          children: 'Retry',
          onClick: () => {
            if (raised.id !== undefined) toast.close(raised.id)
            again.current(kind, instants)
          },
        },
      })
    },
    [change]
  )

  /**
   * Paint, then write — the whole of a gesture's effect on the world.
   *
   * The **delta first**: only the Slots this gesture actually changes are
   * painted, written and reverted. Drawing across Availability you already hold
   * is the most ordinary action in the app (ticket 19), and it should neither
   * re-write those rows nor put them at risk if the new part fails.
   */
  const stroke = useCallback(
    (kind: Stroke, instants: readonly Date[]) => {
      if (userId === null) return

      const affected = instants.filter(
        (instant) => held.current.has(slotKey(userId, instant)) === (kind === 'erase')
      )
      if (affected.length === 0) return

      change((current) => withSlots(current, userId, affected, kind === 'draw'))
      void perform(kind, userId, affected)
    },
    [userId, change, perform]
  )

  useEffect(() => {
    again.current = stroke
  }, [stroke])

  const draw = useCallback((instants: readonly Date[]) => stroke('draw', instants), [stroke])
  const erase = useCallback((instants: readonly Date[]) => stroke('erase', instants), [stroke])

  return {
    isFree,
    silent,
    draw,
    erase,
    saving: slowWrites > 0,
    // Derived, never assigned from inside the effect — the shape issue 04 hit
    // with the mini calendar and solved the same way. `loading` therefore also
    // covers a backwards navigation whose strip has not landed, which is right:
    // an unloaded past week and a week you drew nothing in look identical.
    status: failed
      ? 'error'
      : loadedFrom !== null && loadedFrom <= wantedFrom
        ? 'ready'
        : 'loading',
  }
}

/** The same set with these Slots added, or taken out. */
const withSlots = (
  current: ReadonlySet<string>,
  friendId: string,
  instants: readonly Date[],
  holding: boolean
): ReadonlySet<string> => {
  const next = new Set(current)
  instants.forEach((instant) => {
    const key = slotKey(friendId, instant)
    if (holding) next.add(key)
    else next.delete(key)
  })
  return next
}

/**
 * One gesture, one statement.
 *
 * **Draw** is `insert ... on conflict do nothing`, which supabase-js spells
 * `upsert` with `ignoreDuplicates` — and which needs no `update` grant, because
 * `do nothing` never updates. That matters: `02-availability.sql` withholds the
 * update grant on purpose, and a `merge-duplicates` upsert would be refused by
 * it.
 *
 * **Erase** is one `delete ... in (…)`. Deleting a row that is already gone is a
 * no-op, so the erase path retries exactly as safely as the insert path.
 *
 * Never chunked, in either direction. PostgREST puts a multi-row write in one
 * transaction, so the "some landed, some did not" case ticket 19 asked about
 * cannot arise unless we build it.
 */
const writeStroke = async (
  kind: Stroke,
  friendId: string,
  instants: readonly Date[]
): Promise<WriteFailure | null> => {
  const starts = instants.map((instant) => instant.toISOString())

  const { error } =
    kind === 'draw'
      ? await supabase.from('availability').upsert(
          starts.map((slot_start) => ({ friend_id: friendId, slot_start })),
          { onConflict: 'friend_id,slot_start', ignoreDuplicates: true }
        )
      : await supabase
          .from('availability')
          .delete()
          .eq('friend_id', friendId)
          .in('slot_start', starts)

  return error === null ? null : { message: error.message }
}

/**
 * Run a write, and count it as slow if it is still going after 400ms.
 *
 * The 400ms lives here rather than in a render effect on purpose: a `setTimeout`
 * started and cleared inside one `async` call needs no state to remember whether
 * it fired, and `eslint-plugin-react-hooks` v7 rejects the synchronous
 * `setState` in an effect that the state version would need (the same wall
 * issues 04 and 05 hit).
 *
 * `announced` is a plain local, not a ref: this function runs once per gesture,
 * so there is nothing for a second invocation to get wrong.
 */
const announcingIfSlow = async (
  setSlowWrites: (update: (count: number) => number) => void,
  run: () => Promise<WriteFailure | null>
): Promise<WriteFailure | null> => {
  let announced = false
  const timer = setTimeout(() => {
    announced = true
    setSlowWrites((count) => count + 1)
  }, SLOW_WRITE_MS)

  try {
    return await run()
  } finally {
    clearTimeout(timer)
    if (announced) setSlowWrites((count) => count - 1)
  }
}

/**
 * Every page of one range, concatenated.
 *
 * A `while` rather than recursion or `reduce`: the page count is not known
 * before the last short page arrives, so there is nothing to iterate over. The
 * repo's style rule forbids `for`, `for...of` and `for...in`; this is none of
 * them.
 */
const readEveryPage = async (
  page: (
    index: number
  ) => PromiseLike<{ data: SlotRow[] | null; error: { message: string } | null }>
): Promise<{ data: SlotRow[]; error: { message: string } | null }> => {
  const rows: SlotRow[] = []
  let index = 0
  let full = true

  while (full) {
    const { data, error } = await page(index)
    if (error) return { data: rows, error }
    rows.push(...(data ?? []))
    full = (data?.length ?? 0) === PAGE_SIZE
    index += 1
  }

  return { data: rows, error: null }
}
