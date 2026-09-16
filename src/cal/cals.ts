/**
 * The list of cals as rules: the order, the fold after a Join, and what an id
 * in the URL means before any query runs.
 *
 * **No imports, deliberately** — a test file here runs under plain Node, which
 * cannot resolve the `@/` alias. So the shapes below are structural rather than
 * `Cal` from `database.types.ts`: everything here needs an id, and the order
 * needs a name, and neither needs to know a Postgres row exists.
 */

/** The least a cal has to be to take part in these rules. */
type Identified = { id: string }
type Named = Identified & { name: string }

/**
 * What a name may be where it is typed, which is shorter than what the column
 * holds.
 *
 * `cal_has_a_name` allows sixty. Forty is the render budget rather than the
 * storage limit: the name shares a list row with a six-character Code and a
 * copy button, and from ticket 03 it also sits in a dropdown pinned to its
 * trigger's width. Capping where it is typed is the only place a Friend can see
 * the limit happen; truncating at render time would hide it from the one person
 * able to choose a shorter name.
 *
 * Ticket 03's rename dialog caps at the same number, from here.
 */
export const CAL_NAME_MAX = 40

/**
 * What a typed draft would actually write, or null if it would write nothing.
 *
 * Three refusals, and each one is a different thing going wrong:
 *
 * - **empty after trimming**, which the column refuses outright
 *   (`cal_has_a_name` is `length(btrim(name)) between 1 and 60`), so a disabled
 *   button is what keeps a Friend from meeting a `23514`;
 * - **longer than the cap**, which nothing downstream would refuse, since the
 *   column allows sixty. The input's `maxLength` is what a Friend sees stop
 *   them and this is the line behind it;
 * - **the name it already has**, so the Rename button says whether pressing it
 *   would do anything. This is the one that earns its keep in use: the common
 *   near-miss is an added trailing space.
 *
 * The trim is the same one `create_cal` does server-side, so a cal's name means
 * the same thing however it got there.
 */
export const renameTo = (draft: string, current: string): string | null => {
  const name = draft.trim()
  if (name === '' || name.length > CAL_NAME_MAX || name === current) return null
  return name
}

/**
 * Alphabetical, and the same order on every surface that lists cals.
 *
 * Alphabetical rather than by `joined_at` or by whatever Postgres handed back:
 * the list is something a Friend learns the shape of, and an order that changes
 * as cals are joined means the row under the cursor is never the same row
 * twice. `rosterOrder` makes the same argument one table over.
 *
 * `localeCompare` with `sensitivity: 'base'` so case does not decide, then the
 * id, because `cal.name` has no unique constraint and two cals may share one.
 */
export const calOrder = <T extends Named>(cals: readonly T[]): T[] =>
  // Copied first: `sort` is in place, and the array it would sort is React
  // state held elsewhere.
  [...cals].sort(
    (a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id)
  )

/**
 * A cal folded into the list, ordered, whether or not it was already there.
 *
 * This is the client's half of `join_cal` being **idempotent**. A Code for a cal
 * you already hold is not an error: the RPC does `on conflict do nothing` and
 * returns the row either way, so the client cannot tell a fresh Membership from
 * an old one — and must not try, because trying is the preview step ticket 11
 * ruled out as an enumeration oracle. Replacing by id makes both outcomes one
 * code path.
 *
 * Also what `create_cal` returns into, where the row is always new.
 */
export const withCal = <T extends Named>(cals: readonly T[], cal: T): T[] =>
  calOrder(
    cals.some((one) => one.id === cal.id)
      ? cals.map((one) => (one.id === cal.id ? cal : one))
      : [...cals, cal]
  )

/** Where a cal lives. `/g/:id`, with an opaque id rather than the Code. */
export const calPath = (id: string): string => `/g/${id}`

/**
 * Whether a path segment could be a cal id at all.
 *
 * The guard matters because of what Postgres does with the alternative:
 * `.eq('id', 'nonsense')` comes back `22P02 invalid input syntax for type
 * uuid`, an **error** rather than an empty result, so a mistyped URL would read
 * as "we cannot reach your cals" when the honest answer is "no such cal". A
 * uuid that simply is not yours returns no row, which is the same not-found
 * state and is what `cal`'s select policy is for.
 *
 * Shape only. Whether the cal exists, and whether you are in it, are questions
 * for the database.
 */
export const isCalId = (value: string | undefined): value is string =>
  value !== undefined && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
