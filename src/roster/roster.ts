/**
 * The roster's rules, as pure functions over the smallest shapes that carry
 * them: what order the Friends come in, whose row wins, who is Hidden, and
 * which of them are the cal's Members.
 *
 * **No imports, deliberately.** These are the claims worth a test, and a test
 * file here runs under plain Node (`yarn test`), which cannot resolve the `@/`
 * alias — the same split `identity.ts` and `friend-row.ts` already make. So the
 * Postgres row, the Supabase read and the React state all stay next door in
 * `use-roster.ts`, and this file knows about none of them.
 */

/** What ordering needs to know, and nothing else. */
export type RosterEntry = {
  id: string
  /** Already resolved for display — never a null column. */
  name: string
  /**
   * Null when this Friend has not finished setup. Structural on purpose: this
   * module cannot import `Identity` and does not need to — the roster's one
   * predicate for "unfinished" is that there is no identity, and stating it
   * once here is what keeps the order and the rendering from disagreeing.
   */
  identity: object | null
}

/**
 * Alphabetical, with the Friends who have not finished setup last.
 *
 * Alphabetical rather than "you first": the order then does not depend on who
 * is looking, and with a hand-curated group this size there is nothing to
 * scroll past. Your own row is marked instead (`isSelf`).
 *
 * Unfinished Friends go last because they are the only rows with no colour and
 * nothing to hide — sorted in among the rest they read as a rendering fault.
 */
export const rosterOrder = <T extends RosterEntry>(entries: readonly T[]): T[] =>
  // Copied first: `sort` is in place, and the array it would sort is React
  // state held elsewhere.
  [...entries].sort(
    (a, b) =>
      Number(a.identity === null) - Number(b.identity === null) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
      // Two Friends may share a display name. Without this the comparator
      // returns 0 and the order is whatever the engine's sort did last.
      a.id.localeCompare(b.id)
  )

/**
 * Your own row, overlaid on the roster query's copy of it.
 *
 * The roster reads `friend` once; your own row also arrives — and is *rewritten*
 * — through the session provider, which knows nothing about that query. Without
 * this, changing your own hue would leave your roster row the old colour until a
 * reload, and the roster would be empty for the beat before the query lands
 * even though the one row we already have is yours.
 *
 * Not Realtime, which would keep *everyone's* row fresh. That is issue 07's.
 */
export const mergeSelf = <T extends { id: string }>(rows: readonly T[], self: T | null): T[] => {
  if (self === null) return [...rows]
  if (!rows.some((row) => row.id === self.id)) return [...rows, self]
  return rows.map((row) => (row.id === self.id ? self : row))
}

/**
 * Hidden, toggled — a new Set every time, because this is React state and a
 * mutated Set is the same object.
 */
export const toggled = (hidden: ReadonlySet<string>, id: string): Set<string> => {
  const next = new Set(hidden)
  if (!next.delete(id)) next.add(id)
  return next
}

/**
 * The Friends the viewer is currently trying to meet.
 *
 * Hiding is a query tool, not a blocklist (CONTEXT.md): this list is what the
 * grid's heatmap and the Candidate list are computed over, which is why it
 * lives with the roster rather than inside it.
 */
export const withoutHidden = <T extends { id: string }>(
  entries: readonly T[],
  hidden: ReadonlySet<string>
): T[] => entries.filter((entry) => !hidden.has(entry.id))

/* ==================================================================== *
 * The cal's Members
 *
 * Two sets out of one read. The roster reads every Friend in the product
 * (`friend` is `using (true)`, because identity is global: CONTEXT.md) and a
 * second read of `membership` says which of them are in this cal. Filtering
 * here rather than in the query is what keeps a Friend who left the cal
 * nameable: they are still a Participant on the past Hangouts they were on,
 * and `facesOf` drops ids it does not know rather than rendering them blank.
 * ==================================================================== */

/**
 * The cal's Members, out of every Friend in the product.
 *
 * What the sidebar lists, and the set the arithmetic runs over: `groupSize`,
 * the heat ramp's denominator, and the silence dots. CONTEXT.md's Candidate has
 * said **Members** since the effort began; this is the query catching up.
 *
 * The member set is `null` until its read lands and is never coerced, so this
 * is only ever called with an answer. An empty set is one: a cal nobody is in
 * lists nobody, rather than falling back to everybody.
 */
export const membersOnly = <T extends { id: string }>(
  entries: readonly T[],
  memberIds: ReadonlySet<string>
): T[] => entries.filter((entry) => memberIds.has(entry.id))

/**
 * A Member folded in on a join, or out on a leave.
 *
 * A new Set every time, for `toggled`'s reason: this is React state and a
 * mutated Set is the same object. Both directions are idempotent, which is what
 * the gap between the read and the channel join needs, since a Membership
 * written in that window can arrive twice or not at all.
 */
export const withMember = (
  memberIds: ReadonlySet<string>,
  friendId: string,
  present: boolean
): Set<string> => {
  const next = new Set(memberIds)
  if (present) next.add(friendId)
  else next.delete(friendId)
  return next
}

/**
 * These entries by id.
 *
 * Built from the **full** set of Friends by its one caller, which is the point
 * of it living in the hook rather than at two call sites: a Hangout's faces are
 * a fact about who was there, and neither Hidden nor Membership touches it.
 */
export const byId = <T extends { id: string }>(entries: readonly T[]): Map<string, T> =>
  new Map(entries.map((entry) => [entry.id, entry]))

/**
 * Their names by id, the Friends mid-setup included.
 *
 * A separate map from `byId`, because the two answer different questions: a
 * face needs a finished identity and a provenance line needs only a name. A
 * Hangout confirmed by somebody who has not finished setup would otherwise read
 * as confirmed by *someone else*, which is the fallback for a race.
 */
export const namesOf = <T extends RosterEntry>(entries: readonly T[]): Map<string, string> =>
  new Map(entries.map((entry) => [entry.id, entry.name]))

/**
 * Where the roster's two reads have got to.
 *
 * **Both gate `ready`, and either failing is `error`.** The window where one has
 * returned and the other has not is a visible bug in both directions: a member
 * set read as empty flashes a cal with nobody in it, and one read as "no filter
 * yet" flashes every Friend in the product. Null is the third state that makes
 * neither representable.
 */
export const rosterStatus = <T>(
  everyFriend: readonly T[] | null,
  memberIds: ReadonlySet<string> | null,
  failed: boolean
): 'loading' | 'ready' | 'error' =>
  failed ? 'error' : everyFriend === null || memberIds === null ? 'loading' : 'ready'
