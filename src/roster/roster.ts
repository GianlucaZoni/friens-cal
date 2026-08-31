/**
 * The roster's rules, as pure functions over the smallest shapes that carry
 * them: what order the Friends come in, whose row wins, and who is Hidden.
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
  /** Has this Friend been through setup? */
  complete: boolean
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
      Number(b.complete) - Number(a.complete) ||
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
