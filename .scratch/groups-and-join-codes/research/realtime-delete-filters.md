# Realtime `postgres_changes`: delete filters, and when authorization is re-run

Research for [ticket 12](../issues/12-realtime-scoped-per-group.md), which needs
option A's delete boundary pinned down before it can be chosen, and for the
question [ticket 02](../issues/02-membership-rls-research.md) left open.

Fetched 2026-09-15. Sources: `supabase.com/docs` (raw Markdown via the `.md`
suffix), `github.com/supabase/realtime` at `217744c2` on `main` (2026-09-15),
`github.com/supabase/walrus` at `493794f1` on `master` (2026-08-28),
`postgresql.org/docs/17`.

Nothing here was executed against our project. Everything below is either a
quote from published docs, a quote from the shipped SQL, or a quote from
Supabase's own regression-test expected output. Where the three disagree I say
so.

## Short version

1. **For a DELETE the filter is evaluated against the old record.** The docs
   never say this. The SQL says it plainly, and walrus's regression test proves
   it. See [section 1](#1-which-record-the-filter-sees-on-a-delete).

2. **`replica identity full` is not required if you filter on a primary-key
   column.** The docs' flat "you can only filter Delete events ... if the table
   has the `replica identity` set to `full`" is over-broad. A filter on a pkey
   column matches deletes under the default replica identity, because the pkey
   is what the default identity records. `availability`'s key includes `cal_id`,
   so `cal_id=eq.<uuid>` is a pkey filter there.

3. **Postgres Changes authorization is not cached.** RLS is re-run against the
   live database for every WAL record, per subscriber. A newly inserted
   membership row starts letting events through with no reconnect and no new
   JWT. The "cached for the duration of the connection" sentence is about
   `realtime.messages` channel policies, a different gate. See
   [section 2](#2-is-postgres_changes-authorization-cached).

4. **The sting, and it lands on option A.** RLS is skipped entirely for deletes,
   so the filter really is the only boundary, exactly as ticket 12 suspected.
   And with RLS enabled the delete *payload* is trimmed to primary-key columns
   even under `replica identity full`. See
   [section 3](#3-what-a-delete-payload-actually-contains).

5. **`hangout` and `hangout_participant` are the opposite case to point 2, and
   they need `full`.** `cal_id` is not in either key, so without `full` a
   `cal_id=eq.<uuid>` filter matches no delete at all and the event reaches
   nobody, members included. With `full` the filter works, because it is
   evaluated before the payload trim and against the untrimmed identity columns.
   The trim is a payload step, not a filter step. See
   [section 6](#6-follow-up-a-cal_id-filter-on-hangout-where-cal_id-is-not-in-the-key).

## 1. Which record the filter sees on a delete

### What the docs say

Two sentences, and neither answers the question.

> You can only filter Delete events when tracking Postgres Changes if the table
> has the `replica identity` set to `full`. See [Receiving old records].

Source: https://supabase.com/docs/guides/realtime/postgres-changes.md, under
"Limitations > Delete events". Fetched 2026-09-15.

> By default, only `new` record changes are sent but if you want to receive the
> `old` record (previous values) whenever you `UPDATE` or `DELETE` a record, you
> can set the `replica identity` of your table to `full`

Same page, "Receiving `old` records". **Could not confirm from documentation**
which record the filter predicate is applied to.

### Evidence from source

`realtime.apply_rls` is the function that matches WAL records to subscriptions.
It builds two column arrays:

```sql
    -- structured info for wal's columns
    columns realtime.wal_column[];
    -- previous identity values for update/delete
    old_columns realtime.wal_column[];
```

`columns` is built from `wal -> 'columns'`, `old_columns` from
`wal -> 'identity'`. The subscription match is this `where` clause:

```sql
                    where
                        subs.entity = entity_
                        and subs.claims_role = working_role
                        and (
                            realtime.is_visible_through_filters(columns, subs.filters)
                            or (
                              action = 'DELETE'
                              and realtime.is_visible_through_filters(old_columns, subs.filters)
                            )
                        )
```

Source:
https://github.com/supabase/realtime/blob/main/priv/repo/tenant_schema/realtime/functions/apply_rls.sql
(lines 197 to 213 at `217744c2`). Evidence from source, not from documentation.

So the answer is the second disjunct: for a DELETE the predicate is tested
against `old_columns`, the WAL identity fields, which is the old record. The
first disjunct is dead on a delete because wal2json emits no `columns` for one,
and `is_visible_through_filters` with no matching columns returns false
(`count(col.name) = count(1)` fails when the left join produces nulls).

Note also that no filter means every event passes:

```sql
    select
        filters is null
        or array_length(filters, 1) is null
```

Source:
https://github.com/supabase/realtime/blob/main/priv/repo/tenant_schema/realtime/functions/is_visible_through_filters.sql

### Evidence from Supabase's own test output

walrus ships the regression test for this as `issue_50_delete_filters`. Two
subscriptions, `body=eq.bbb` and `id=eq.2`, against
`public.notes(id int primary key, body text)`, then `delete from public.notes`
twice: once under the default replica identity, once under `full`.

Under the **default** replica identity, the two delete records come out with
subscription ids `{}` and `{5211e8ec-...}`. The second uuid is the `id=eq.2`
subscription. The `body=eq.bbb` subscription matches nothing.

Under **`replica identity full`**, the same two deletes come out as
`{f4539ebe-...}` (the `body=eq.bbb` subscription, matched on the row whose old
body was `bbb`) and `{5211e8ec-...}`.

Source:
https://github.com/supabase/walrus/blob/master/test/expected/issue_50_delete_filters.out
and its input at `test/sql/issue_50_delete_filters.sql`. Fetched 2026-09-15.

That is the whole answer in one file: the filter matched the deleted row's old
values, and the pkey filter worked without `full`. The test's own section
comment says it:

> When Replica Identity is Not Full, only filters referencing the pkey are
> respected

For us: `cal_id` is part of the composite key ticket 04 chose for
`availability`, so a `cal_id=eq.<uuid>` filter on that table should filter
deletes under the default replica identity. I would still test it on our schema
before relying on it, because the claim rests on the pkey being in the WAL
identity and I have not run it against a composite key.

## 2. Is `postgres_changes` authorization cached

No. Not the way channel policies are.

### What the docs say, and what they are about

> Client access policies are cached for the duration of the connection. Your
> database is not queried for every Channel message.
>
> Realtime updates the access policy cache for a client based on your RLS
> policies when:
>
> - A client connects to Realtime and subscribes to a Channel
> - A new JWT is sent to Realtime from a client via the [`access_token` message]

Source: https://supabase.com/docs/guides/realtime/authorization.md, section
"Updating RLS policies". Fetched 2026-09-15.

Read the page around it. Every example on it writes policies on
`realtime.messages`, and the section immediately above is a separate one called
"Interaction with Postgres Changes" holding only this:

> When using Postgres Changes on tables with RLS, database records are sent only
> to clients who are allowed to read them based on your RLS policies.
>
> Private and public channels can subscribe to Postgres Changes.

The Postgres Changes page says nothing about caching at all. I grepped it for
"cach": no hits. **Could not confirm from documentation** that the caching
sentence does or does not cover `postgres_changes`. It has to be settled from
source.

### Evidence from source

Two facts settle it.

**The RLS check is a live query per WAL record.** Inside the per-subscription
loop in `apply_rls`:

```sql
                    perform
                        -- Trim leading and trailing quotes from working_role because set_config
                        -- doesn't recognize the role as valid if they are included
                        set_config('role', trim(both '"' from working_role::text), true),
                        set_config('request.jwt.claims', claims::text, true);

                    execute 'execute walrus_rls_stmt' into subscription_has_access;
```

`walrus_rls_stmt` is a prepared `select` against the table itself, rebuilt for
each WAL record from that record's columns
(`execute realtime.build_prepared_statement_sql('walrus_rls_stmt', entity_, columns)`).
`apply_rls` is called from `realtime.list_changes`, which the Elixir
`ReplicationPoller` calls on every poll of the replication slot. So the policy
is evaluated against the database as it is at the moment the change is
processed. Source: `priv/repo/tenant_schema/realtime/functions/apply_rls.sql`
and `.../list_changes.sql`, plus
`lib/extensions/postgres_cdc_rls/replication_poller.ex`.

**What is cached is the JWT claims, not the policy result.** The subscription
row carries `claims`, written at join and re-written on `on conflict do update
set claims = excluded.claims`:

```sql
      insert into realtime.subscription as x(
        subscription_id,
        entity,
        filters,
        claims,
        action_filter,
        selected_columns
      )
```

Source: `lib/extensions/postgres_cdc_rls/subscriptions.ex`.

So the answer to the question as asked: **a membership row inserted after the
client is already connected takes effect immediately, with no reconnect and no
new token.** The new row is database state, and the policy that reads it is
re-run per event. What a stale connection carries is stale *claims*, so
anything that lives in the JWT (a custom claim, `role`, `sub`) does need a new
token pushed via `access_token`, and Realtime rewrites the stored claims when it
gets one (`realtime_channel.ex`, `handle_in("access_token", ...)`, which does
`pg_change_params = Enum.map(pg_change_params, &Map.put(&1, :claims, claims))`
and re-subscribes).

Caveat that matters more than the answer: none of this applies to deletes. See
section 3.

## 3. What a delete payload actually contains

The docs give the warning without the mechanism:

> Caution: RLS policies are not applied to `DELETE` statements, because there is
> no way for Postgres to verify that a user has access to a deleted record.

Source: https://supabase.com/docs/guides/realtime/postgres-changes.md,
"Receiving `old` records".

In the source this is one branch. Once a subscription passes the filter:

```sql
                if not is_rls_enabled or action = 'DELETE' then
                    visible_role_sub_ids = visible_role_sub_ids || subscription_id;
```

Every subscriber whose filter matches gets the delete. No policy is consulted.

The compensation is that the payload is cut down. Building `old_record` for a
delete:

```sql
                                    and ( not is_rls_enabled or (c).is_pkey ) -- if RLS enabled, we can't secure deletes so filter to pkey
```

Both from
https://github.com/supabase/realtime/blob/main/priv/repo/tenant_schema/realtime/functions/apply_rls.sql

walrus tests the four-way matrix explicitly, and its comments state the intent:

> -- Option 4:
> -- Replica Identity Full: true
> -- Row Level Security   : true
> -- Expect:
> -- old_record contains only primary key info because we can not enforce RLS on deletes and some columns might be private

Source:
https://github.com/supabase/walrus/blob/master/test/expected/test_delete_old_record_behavior.out.
The expected output for that case is an `old_record` of `{"pk1": 1}` with the
`body` column absent, while the RLS-off, replica-identity-full case yields
`{"pk1": 1, "body": "take out trash"}`.

Consequences for ticket 12, in order of how much they change the decision:

- **On `availability`, `replica identity full` buys nothing on deletes.** The
  payload is trimmed to the pkey either way, and `cal_id` is already in that
  key. It still changes update payloads. For `hangout` and
  `hangout_participant` the calculation is different and `full` is required:
  see [section 6](#6-follow-up-a-cal_id-filter-on-hangout-where-cal_id-is-not-in-the-key).
- **The filter is the entire delete boundary.** Filtering happens before the
  payload is trimmed and before (in fact, instead of) any policy check. A client
  that subscribes with someone else's `cal_id` receives that cal's delete
  events, carrying the primary key. Option A narrows the leak from "every cal"
  to "any one cal you can name", which is a real improvement and not a closed
  door. Option B closes it.
- walrus's README states the exposure as a rule for schema design:

  > When a delete occurs, the contents of `old_record` will be broadcast to all
  > subscribers to that table so ensure that each table's replica identity only
  > contains information that is safe to expose publicly

  Source: https://github.com/supabase/walrus/blob/master/README.md

## 4. Does re-subscribing on an existing socket re-run authorization

Yes, and the docs say so for channel policies:

> Realtime updates the access policy cache for a client based on your RLS
> policies when:
>
> - A client connects to Realtime and subscribes to a Channel

Source: https://supabase.com/docs/guides/realtime/authorization.md.

Source agrees. `RealtimeChannel.join/3` calls `maybe_assign_policies` on every
join, and that function only does work for private channels
(`%{assigns: %{private?: true}}`); public channels get `policies: nil`. An
unsubscribe plus subscribe is a fresh `phx_join` on the same socket, so it goes
through the same path. Source:
`lib/realtime_web/channels/realtime_channel.ex` at `217744c2`.

For `postgres_changes` specifically there is no separate authorization step to
re-run at subscribe time. Subscribing upserts a row into `realtime.subscription`
carrying the filter and the current claims, and the unique key includes the
filters, so a different filter is a different row rather than a mutation of the
old one:

```sql
        on conflict
        -- coalesce needed: NULL != NULL in unique constraints; NULL selected_columns means all columns
        (subscription_id, entity, filters, action_filter, coalesce(selected_columns, '{}'))
```

Source: `lib/extensions/postgres_cdc_rls/subscriptions.ex`.

## 5. Cost of `replica identity full`

Postgres, on what the setting does:

> This form changes the information which is written to the write-ahead log to
> identify rows which are updated or deleted. In most cases, the old value of
> each column is only logged if it differs from the new value; however, if the
> old value is stored externally, it is always logged regardless of whether it
> changed. This option has no effect except when logical replication is in use.

and, for `FULL`:

> Records the old values of all columns in the row.

Source: https://www.postgresql.org/docs/17/sql-altertable.html, `REPLICA
IDENTITY`. Fetched 2026-09-15.

Supabase, in the replication pipelines FAQ:

> Full replica identity increases WAL volume and only affects new WAL records.
> Fix the setting before generating more changes.

Source:
https://supabase.com/docs/guides/database/replication/pipelines-faq.md. That
page is about replication pipelines to BigQuery, ClickHouse and friends, not
about Realtime, so read it as a statement about the Postgres setting rather than
about our feature.

The often-quoted warning about `FULL` being slow is about the *subscriber* side
of logical replication:

> If there are no such suitable indexes, the search on the subscriber side can
> be very inefficient, therefore replica identity FULL should only be used as a
> fallback if no other solution is possible.

Source: https://www.postgresql.org/docs/17/logical-replication-publication.html.
Realtime is not a logical replication subscriber applying changes to a copy of
the table, it drains a slot with wal2json, so I do not think this sentence
applies to us. Stated as my reading, not as a documented fact.

## 6. Follow-up: a `cal_id` filter on `hangout`, where `cal_id` is not in the key

The question assumed the pkey trim removes `cal_id` from what the filter sees.
It does not. The trim and the filter are two different steps on two different
arrays, and the filter runs first. That changes the answer, so take the
correction before the conclusion.

### The trim never touches what the filter reads

`old_columns` is built once, from `wal -> 'identity'`, at the top of `apply_rls`
(lines 86 to 106 at `217744c2`). It is rebuilt once per role solely to stamp
`is_selectable` onto each column (lines 130 to 142); no column is removed. The
filter is evaluated at line 210. The `old_record` payload, with the pkey trim at
line 339, is assembled at lines 329 to 341, inside a later loop that runs after
the visibility loop has already finished.

`is_rls_enabled` appears at exactly seven places in the function: the
declaration (line 23), two error returns (158, 179), the prepared-statement
guard (187), the delete bypass (215), the payload trim (339), and the returned
row (359). It appears nowhere in the construction of `old_columns`. Source
confirmed, by reading every occurrence in
`priv/repo/tenant_schema/realtime/functions/apply_rls.sql`.

So on an RLS'd table with `replica identity full`, `cal_id` is present in
`old_columns` for a delete, and absent from the `old_record` the client
receives. Both at once.

### What the function does with a column it cannot find

The whole body:

```sql
    select
        filters is null
        or array_length(filters, 1) is null
        or coalesce(
            count(col.name) = count(1)
            and sum(
                realtime.check_equality_op(
                    op:=f.op,
                    type_:=coalesce(col.type_oid::regtype, col.type_name::regtype),
                    val_1:=col.value #>> '{}',
                    val_2:=f.value,
                    negate:=coalesce(f.negate, false)
                )::int
            ) filter (where col.name is not null) = count(col.name),
            false
        )
    from
        unnest(filters) f
        left join unnest(columns) col
            on f.column_name = col.name;
```

Source:
https://github.com/supabase/realtime/blob/main/priv/repo/tenant_schema/realtime/functions/is_visible_through_filters.sql

It does not error, and it does not skip the filter. It returns **false**. The
join is a `left join` from filters to columns, so an unmatched filter still
produces a row, with `col` null. `count(col.name)` counts only matched filters,
`count(1)` counts all of them, and `count(col.name) = count(1)` is the guard
that every filter found its column. One absent column makes that `0 = 1`, the
`and` short-circuits to false, and `coalesce(false, false)` returns false. The
`filter (where col.name is not null)` on the `sum` exists so the null row does
not poison the arithmetic, not so it can be ignored.

The only paths that return true without consulting a column are the first two
lines: a null filter array, or an empty one. A subscription with no filter
receives everything.

This is a reading of the function body, and I want to be exact about its status:
the SQL is quoted verbatim and the semantics are ordinary aggregate behaviour,
but **no walrus test exercises an absent filter column**. I checked all 45 files
in `test/sql`. Only `issue_40_quoted_regtype.sql` and `test_apply_rls_role_leak.sql`
combine row level security with a `user_defined_filter`, and neither performs a
delete. `issue_55_null_passes_filters.sql` is about a column whose *value* is
null, which is a different case. **Could not confirm** the absent-column
behaviour from a test fixture.

### Answer for `hangout` and `hangout_participant`

Neither (a) nor (b) as stated, because the premise about the trim was wrong. The
answer splits on replica identity, and the split is the decision:

- **With `replica identity full`: the filter works.** `wal -> 'identity'` carries
  every column, `cal_id` included, so `cal_id=eq.<uuid>` matches the deleted
  row's old `cal_id` and the event goes to that cal's subscribers and to no one
  else. The proof that a non-pkey column is reachable this way is
  `issue_50_delete_filters.out`, where `body=eq.bbb` matches a delete under
  `full` and matches nothing under the default. That fixture runs with RLS off,
  but per the previous subsection RLS cannot affect `old_columns`.
- **Without it: nothing is delivered.** `wal -> 'identity'` is the primary key
  alone, `id` on `hangout` and `(hangout_id, friend_id)` on
  `hangout_participant`. `cal_id` is absent, `count(col.name) = count(1)` fails,
  the function returns false, and the delete reaches no subscriber carrying that
  filter, legitimate members included. That is your (a), and it is the failure
  mode you get by doing nothing.

So the finding from section 3 needs a boundary drawn around it. "Full replica
identity buys nothing on deletes" holds for `availability`, where `cal_id` sits
in the key. For `hangout` and `hangout_participant` it is the opposite: `full`
is the only thing that makes a per-cal delete filter function at all. It buys
reachability for the filter, not richness in the payload.

The payload stays thin either way, since the trim is unconditional under RLS. A
`hangout` delete arrives as `old_record: {"id": ...}`, a `hangout_participant`
delete as `{"hangout_id": ..., "friend_id": ...}`. No `cal_id` in either. The
client cannot check for itself which cal a delete belonged to and has to trust
the filter and its own local state keyed by id. Given that the filter is a
client-supplied string on a table where RLS is skipped for deletes, that trust
is the same trust ticket 12 flagged, now with a second consequence: the client
cannot even audit it after the fact.

One related thing I noticed while reading, worth knowing before someone assumes
otherwise: `is_visible_through_filters` joins on column name only and never
consults `is_selectable`. A filter can therefore match on a column the
subscriber's role has no `SELECT` privilege on. It changes nothing for us, since
we are not using column privileges, but it means the filter is not a second
permission check in disguise.

## Could not confirm

- **Which record the filter is evaluated against for a delete, from
  documentation.** Section 1 answers it from source and from Supabase's own test
  fixtures only. The docs do not say.
- **Whether `postgres_changes` authorization is cached, from documentation.**
  The only caching statement on `supabase.com/docs` is scoped to
  `realtime.messages`. The Postgres Changes page is silent, so the answer in
  section 2 is read off the shipped SQL.
- **That a filter on a composite-key column matches deletes.** The walrus test
  proves it for a single-column `int` primary key. `availability`'s key is
  composite. The mechanism says it should hold, since the default replica
  identity records all pkey columns, but I have not run it. Test it before
  shipping option A, which is what ticket 12 already asks for.
- **That `is_visible_through_filters` returns false for an absent column, from a
  test.** Section 6 reads it off the quoted function body. None of the 45 files
  in walrus `test/sql` exercises a filter whose column is missing from the array
  it is given, and none combines row level security, a filter and a delete.
- **That our project's installed `apply_rls` matches `main`.** The function
  lives in each tenant database and arrives through Realtime's migrations, so an
  older project can be running an older version. The `or (action = 'DELETE'
  and ...)` branch dates from migration `20240827160934_filter_delete_postgres_changes`.
  Check ours with
  `select prosrc from pg_proc where proname = 'apply_rls';` before trusting any
  of section 1 in production.
- **Any documented cost or quota for `replica identity full` specific to
  Supabase Realtime.** The Postgres Changes page's throughput tables vary RLS
  and client count, never replica identity. No Supabase page I fetched prices or
  limits the setting for Realtime.
- **Whether negated filters (`not.eq`) behave the same on deletes.** Not tested,
  not documented, and not read in the source beyond
  `is_visible_through_filters` passing `negate` through to
  `realtime.check_equality_op`.
