/**
 * Reading a database change that arrived as a **broadcast message**.
 *
 * Realtime carries `availability`, `hangout` and `hangout_participant` on
 * private per-cal topics rather than on `postgres_changes`
 * ([ADR-0004](../../docs/adr/0004-broadcast-for-cal-scoped-realtime.md)), and
 * the three tables are no longer in the `supabase_realtime` publication at all.
 * That closes the delete hole properly — a delete is a message on a topic a
 * `realtime.messages` policy had to authorise — and it costs one thing the old
 * mechanism gave away free: **supabase-js no longer knows the shape of what
 * arrives.** A `postgres_changes` handler was typed `RealtimePostgresPayload<Row>`
 * by the library; a broadcast handler is handed `payload: unknown`.
 *
 * So this file is the boundary where an untrusted message becomes a typed row,
 * and it is the only place in the client that knows the payload's spelling.
 *
 * **No `@/` imports, deliberately.** `broadcast.test.ts` runs under plain Node
 * (`yarn test`), which cannot resolve the alias — the same split `slots.ts`,
 * `roster.ts` and `identity.ts` already make.
 */

/** The three operations a row change can be. Matches `TG_OP`. */
export type ChangeOperation = 'INSERT' | 'UPDATE' | 'DELETE'

/**
 * What `realtime.broadcast_changes()` sends, per row.
 *
 * `record` is null on a delete and `old_record` is null on an insert; on an
 * update both are present. The row is the **whole** row rather than the primary
 * key, which is the one way broadcast is richer than what it replaced: a
 * `postgres_changes` delete on an RLS'd table arrives trimmed to key columns.
 */
export type RowChange<Row> = {
  operation: ChangeOperation
  schema: string
  table: string
  record: Row | null
  old_record: Row | null
}

/**
 * The topic a cal's changes are published on. One per hook, per cal.
 *
 * Three streams for three hooks, and that is a rule rather than a coincidence:
 * supabase-js discourages two channels on one topic, so two hooks sharing one
 * would need a shared channel provider. `useHangouts` carries `hangout` and
 * `hangout_participant` on a single topic because it is a single hook.
 *
 * `members` is the roster's, added by issue 04 and by ADR-0004's issue 14
 * amendment (`supabase/12-cal-members-topic.sql`). `useRoster` is the one hook
 * that also runs a channel on the other mechanism: `friend` stays table-wide on
 * `postgres_changes`, because identity is global and a brand-new account
 * reaches a running client nowhere else.
 */
export const calTopic = (calId: string, stream: 'availability' | 'hangouts' | 'members'): string =>
  `cal:${calId}:${stream}`

const OPERATIONS: readonly string[] = ['INSERT', 'UPDATE', 'DELETE']

/**
 * The message, if it is a row change for this table — and null otherwise.
 *
 * A guard rather than a cast, because the alternative is a cast: the handler is
 * handed `unknown`, and something has to decide. What it checks is only the
 * spelling the trigger controls — the operation, the table, and that the row
 * that should be there is an object. **It does not check the cal**, and that is
 * deliberate rather than an oversight: the topic is the boundary, authorised by
 * a `realtime.messages` policy before the channel joined, and re-checking it in
 * the browser would suggest the policy were optional.
 *
 * `table` is a parameter because `useHangouts` carries two tables on one topic
 * and has to tell them apart — the same channel delivers `hangout` and
 * `hangout_participant`.
 *
 * A message that does not match is dropped in silence. There is nothing useful
 * to do with one: it is either a table this handler does not fold, or a payload
 * from a future migration this build predates.
 */
export const rowChange = <Row>(payload: unknown, table: string): RowChange<Row> | null => {
  if (typeof payload !== 'object' || payload === null) return null

  const change = payload as Partial<RowChange<Row>>
  if (typeof change.operation !== 'string' || !OPERATIONS.includes(change.operation)) return null
  if (change.table !== table) return null

  // The row that must be present for this operation. An insert with no `record`
  // would fold `null` into the store, and a delete with no `old_record` has
  // nothing to name the row it is removing.
  const row = change.operation === 'DELETE' ? change.old_record : change.record
  if (typeof row !== 'object' || row === null) return null

  return {
    operation: change.operation as ChangeOperation,
    schema: typeof change.schema === 'string' ? change.schema : 'public',
    table: change.table,
    record: (change.record ?? null) as Row | null,
    old_record: (change.old_record ?? null) as Row | null,
  }
}
