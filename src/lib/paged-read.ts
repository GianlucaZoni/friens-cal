/**
 * Reading a whole table out of PostgREST, rather than the first page of it.
 *
 * Supabase caps every response at `db-max-rows`, 1000 by default, and it does
 * so **silently** — a truncated read is indistinguishable from a Friend who
 * drew less, or from a group that has made fewer plans. There is no error and
 * no flag; the rows simply stop.
 *
 * Extracted from `useAvailability`, which is where it was first needed and
 * where the reasoning below was worked out. `useHangouts` reads two more tables
 * with exactly the same hazard, and a second copy of a `while` loop that has to
 * get its termination condition right is the wrong kind of duplication.
 */

/**
 * PostgREST's page size, and the reason a read is a loop rather than a `select`.
 *
 * Slot rows reach 1000 fast: that is 500 hours, so a Friend who marks eight
 * hours a day crosses it inside four months — and the Availability read carries
 * **no `friend_id` filter at all**, so multiply that by the size of the Group. A
 * nine-Friend group at eight hours a day crosses 1000 rows in under three weeks.
 *
 * Hangouts are far sparser (the exclusion constraint means one plan at a time),
 * but "sparser" is not a bound, and the failure mode is the same one: the grid
 * quietly stops showing plans past an arbitrary date, with no error anywhere.
 *
 * The first page IS the one query the caller wanted; the loop only continues
 * when a page comes back full.
 */
export const PAGE_SIZE = 1000

/** What a PostgREST read answers with, as narrowly as this module needs it. */
type Page<Row> = { data: Row[] | null; error: { message: string } | null }

/**
 * Every page of a read, concatenated — or the rows read so far plus the error
 * that stopped it.
 *
 * `page` is rebuilt per index rather than held, because **a PostgREST builder is
 * single-use**: calling `range` on a spent one throws instead of paging.
 */
export const readEveryPage = async <Row>(
  page: (index: number) => PromiseLike<Page<Row>>
): Promise<{ data: Row[]; error: { message: string } | null }> => {
  const rows: Row[] = []
  let index = 0
  let full = true

  /*
   * A `while`, and the repo's style rule permits it: it forbids `for`,
   * `for...of` and `for...in`, which this is none of. There is nothing to
   * iterate over — the page count is not known until a page comes back short.
   */
  while (full) {
    const { data, error } = await page(index)
    if (error) return { data: rows, error }
    rows.push(...(data ?? []))
    full = (data?.length ?? 0) === PAGE_SIZE
    index += 1
  }

  return { data: rows, error: null }
}
