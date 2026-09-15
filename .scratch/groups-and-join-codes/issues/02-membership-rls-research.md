# 02 — Membership-aware RLS in Supabase, without the recursion trap

Type: research
Status: resolved

## Question

Ticket 01 scoped every read to "Groups I belong to". Expressing that in RLS is
the one part of this effort nobody should write from memory.

The trap: a policy on `friend` that reads `membership` to ask "do we share a
Group?" needs `membership` to be readable, and `membership`'s own policy wants
to ask the same question back. Postgres detects the cycle and errors, or worse,
the policies pass but leak.

Find out, from Supabase's own documentation and Postgres's:

1. **The recursion.** What exactly happens — an error, a silent pass, a
   performance cliff? What is the documented way out? The expected answer is a
   `security definer` helper (`is_member_of(group_id)` or
   `shares_a_group_with(friend_id)`), but confirm it rather than assume it, and
   find whether Supabase publishes a canonical shape for one.

2. **The `search_path = ''` and grant discipline** that v1's ticket 02 found for
   `security definer` functions — does it apply unchanged to a policy helper,
   and who must be able to `execute` it? Note that v1's ADR-0002 refinement
   flagged an unresolved tension: Supabase's RLS guide says never to create a
   `security definer` function in an exposed schema, yet `supabase.rpc()`
   requires exactly that. A policy *helper* is the case that guide was probably
   aimed at. Settle it this time.

3. **Performance.** v1 established `(select auth.uid())` over a bare
   `auth.uid()` so it evaluates once per statement. Does the same trick apply to
   a helper call in a policy, and is there an `initplan` caching story?

4. **Realtime.** Does Realtime apply these policies to `postgres_changes`
   payloads, and what happens for DELETE — v1's ticket 02 found RLS is *not*
   applied to DELETE events, which is why `allowlist` must never be published.
   Same question for `availability` and `hangout` deletes once they carry a
   `group_id`. Can a subscription be filtered server-side by `group_id`, and
   does that filter compose with RLS or replace it?

5. **One helper or five.** Can a single helper serve the policies on `friend`,
   `membership`, `availability`, `hangout` and `hangout_participant`, or do the
   shapes differ enough to need more than one?

Primary sources only: Supabase docs, Postgres docs. Capture findings on a
throwaway `research/membership-rls` branch and link it here.

## Answer

Long-form notes: [`research/membership-rls.md`](../research/membership-rls.md),
on branch `research/membership-rls` (commit `470c449`). Everything below was
fetched from `supabase.com/docs` and `postgresql.org/docs` on **2026-09-15**;
appending `.md` to a Supabase guide URL serves the raw Markdown, so the quotes
are verbatim source rather than paraphrase.

**The headline: the RLS guide now has a section called "Avoid recursive
policies" that did not exist when v1 asked these questions on 2026-08-29.** It
answers Q1 almost word for word and settles Q2 by showing where the helper goes.
Nothing here contradicts v1. Two things sharpen it, and one v1 footnote becomes
a live problem for this effort.

### 1. The recursion: an error, and the way out is confirmed

It errors. Loudly, through PostgREST, not silently and not as a slow query.

> Two tables whose policies read each other never resolve. Postgres raises
> `42P17`, `infinite recursion detected in policy for relation`, and the query
> fails for every role the policies apply to.
> — [Avoid recursive policies](https://supabase.com/docs/guides/database/postgres/row-level-security#avoid-recursive-policies)

The guide's rejected example is our exact shape with `lists` / `list_members`
where we have `group` / `membership`. The cycle exists because a policy
expression is ordinary SQL run as the caller, which Postgres states:

> Policy expressions are run as part of the query and with the privileges of the
> user running the query, although security-definer functions can be used to
> access data not available to the calling user.
> — [PostgreSQL 5.9](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

So yes, a `security definer` helper, and **Supabase does publish a canonical
shape**, though not the `is_member_of(group_id) returns boolean` this ticket
guessed at. It returns **`setof uuid`** and the policy is `in (select ...)`:

```sql
create schema if not exists private;

create function private.user_list_ids()
returns setof uuid
language sql
security definer
set search_path = ''
stable
as $$
  select list_id from public.list_members
  where user_id = (select auth.uid())
$$;

revoke execute on function private.user_list_ids() from public;
grant usage on schema private to authenticated;
grant execute on function private.user_list_ids() to authenticated;

create policy "members read lists" on lists for select
to authenticated
using ( id in (select private.user_list_ids()) );
```

The shape matters for Q3; see below.

**The condition nobody would guess**, and it is in the same section: "a
`security definer` function only skips RLS when its owner can. On Supabase the
owner is `postgres`, which has `bypassrls`. A function owned by a role without
`bypassrls`, or reading a table set to `force row level security`, evaluates the
membership policy again and stays recursive." Create the helper in the SQL
Editor so it is owned by `postgres`, and never add `force row level security` to
`membership`. Worth a comment in the migration, because that second one would
break every read in the product from a line that looks like hardening.

Postgres's own docs never describe this check. Only the errcode `42P17
invalid_object_definition` appears there. The behaviour is documented by
Supabase alone.

### 2. `search_path`, grants, and the exposed-schema tension, settled

**`search_path = ''` applies unchanged.** "Set `search_path = ''` on every
`security definer` function and schema-qualify the names inside it. Without a
pinned `search_path`, a caller can point an unqualified name at their own object
and run it with the function owner's privileges."
([RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security#use-security-definer-functions))
"Every" includes helpers, and the canonical helper carries it.

**Who executes it: the caller.** Policy expressions run as the querying user, so
`authenticated` needs `execute` on the function and `usage` on `private`. The
`revoke` first is not decoration, because two separate defaults hand out
`execute`: Postgres grants it to `PUBLIC` for all functions
([PostgreSQL 5.8](https://www.postgresql.org/docs/current/ddl-priv.html)), and
Supabase adds its own ("Functions receive `EXECUTE`",
[Securing your API](https://supabase.com/docs/guides/api/securing-your-api)).
`anon` needs nothing, since `to authenticated` stops evaluation before the
expression runs.

**The tension ADR-0002 flagged is closed for helpers, and the answer is boring:
put it in `private`.** The caution still reads "Never create one in a schema
listed under 'Exposed schemas'", and both worked examples in the guide now
create the helper in a `private` schema, with `create schema if not exists
private` written into the recursion one. `private` is not in the project's
Exposed schemas (a PostgREST setting, not a grant), so the helper is unreachable
over the Data API. **v1's reading was right and this effort does not have to
spend a judgement call.** ADR-0002's "unresolved sharp edge" can be marked
resolved *for policy helpers*.

**Still open, and do not read the above as cover for it:** no page states a
carve-out for a deliberately browser-callable `security definer` RPC like
`retime_hangout`. That remains v1 ticket 07 §9's recorded judgement. The docs got
clearer about helpers while saying nothing new about RPCs.

**Which matters more than it sounds, because joining by Code needs a second
one.** Once `group`'s select policy is `id in (select private.my_group_ids())`,
a Friend cannot look up a Group by its Code, because they are not in it yet.
And a `with check` on `membership` rejects the insert that would make the check
pass. So the join flow is an RPC (`join_group(code)`), in an exposed schema,
`security definer`. That breaks ADR-0002's mitigation "exactly one such function
exists in the whole project (it is now a security property, not just tidiness)".
**This needs a decision in ticket 04/05 and probably an ADR amendment**, not a
silent second function. The alternative, `with check (true)` on `membership`
plus a Code-keyed read on `group`, lets anyone enumerate Groups by guessing six
characters and join them uninvited.

### 3. Performance: the trick applies, and dictates the helper's shape

> This method works well for JWT functions like `auth.uid()` and `auth.jwt()` as
> well as `security definer` Functions. Wrapping the function causes an
> `initPlan` to be run by the Postgres optimizer, which allows it to "cache" the
> results per-statement, rather than calling the function on each row.
>
> **Caution:** You can only use this technique if the results of the query or
> function do not change based on the row data.
> — [Call functions with `select`](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select)

**That caution is why the helper takes no arguments.** An
`is_member_of(group_id)` boolean helper is fed the row's own `group_id`, so its
result changes per row and the caching does not apply. `group_id in (select
private.my_group_ids())` is evaluated once per statement. Postgres backs the
mechanism from its side for a `stable` function: "This category allows the
optimizer to optimize multiple calls of the function to a single call"
([36.7 Function Volatility](https://www.postgresql.org/docs/current/xfunc-volatility.html)).
"Allows", not guarantees, and Postgres never uses the word initPlan, so treat
per-statement evaluation as documented intent on both sides rather than a
contract.

Two rules that will bite harder than the caching:

- **No joins in policy expressions.** The performance guide's worked rewrite is
  our membership shape exactly: replace `(select auth.uid()) in (select user_id
  from team_user where team_user.team_id = test_table.team_id)` with `team_id in
  (select team_id from team_user where user_id = (select auth.uid()))`
  ([RLS performance](https://supabase.com/docs/guides/database/postgres/row-level-security-performance)).
  The helper is that rewrite with the set moved into a function.
- **`membership` needs its own index on `friend_id`.** The RLS guide's
  leading-column example is, unnervingly, our table: "A membership table keyed on
  `(team_id, user_id)` has no index on `user_id`". Ticket 04 Q2 proposes exactly
  that key, and the helper filters on `friend_id`. This is v1 ticket 07 §11's
  trap for the third time in this schema, and this time it sits inside every
  policy in the product.

### 4. Realtime: the delete hole stopped being harmless

**RLS is applied to `postgres_changes`.** "When using Postgres Changes on tables
with RLS, database records are sent only to clients who are allowed to read them
based on your RLS policies."
([Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization#interaction-with-postgres-changes)),
and authorization runs per subscriber per event
([Scaling Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes#scaling-postgres-changes)).

**DELETE is still exempt, in the same words v1 found**: "RLS policies are not
applied to `DELETE` statements, because there is no way for Postgres to verify
that a user has access to a deleted record." There is a second, independent
limitation: "You can only filter Delete events ... if the table has the `replica
identity` set to `full`."

**v1 concluded this cost nothing. That conclusion does not survive per-Group
Availability.** `03-realtime.sql` reasoned it away because the read policy was
`using (true)`, so a delete event "carries nothing a `select` would not have
handed over". After this effort `availability` and `hangout` are tables *whose
reads are restricted*, which is the exact case that file's own rule warns
against. Concretely: with default replica identity a delete payload carries the
primary key, and ticket 04's new key is `(group_id, friend_id, slot_start)`, so
every Friend with the app open would receive, for every erased half-hour in every
cal in the product, a row naming the Group, the Friend and the time. Not
catastrophic. Precisely the cross-Group visibility ticket 01 decided against,
arriving through a side door.

**Server-side filtering by `group_id` works**: `filter: 'group_id=eq.<uuid>'`, or
`in.(...)` for a Friend in several cals (max 100 values). Filters are
"`column=operator.value` expression ... that Realtime evaluates on the server, so
filtered-out events never leave the database", and multiple conditions
comma-combine as AND only.

**Does the filter compose with RLS or replace it? It composes, and it narrows**,
though no single sentence says so, so this is a reading of two: authorization is
stated unconditionally, and the filter drops events before they leave. An event
must survive both, so a filter can never widen what a subscriber sees. The
exception is the one that matters: for deletes RLS contributes nothing, so the
filter is the *only* gate, and it needs `replica identity full` to apply at all.

**So per-Group Realtime has two documented shapes**, and this ticket can frame
the choice but not close it, because it has client consequences:

- **A. `postgres_changes` + per-Group filter + `replica identity full`** on
  `availability` and `hangout`. One-line change to hooks that already exist, at
  the cost `03-realtime.sql` deliberately avoided (the whole old row into the WAL
  on every write), and with the delete boundary living in a client filter string
  rather than in a database policy.
- **B. Broadcast from the database, on a `group:<id>` topic.** Supabase's own
  ranking: "1. Broadcast. This is the recommended method for scalability and
  security. 2. Postgres Changes. This is a simpler method ... but does not scale
  as well"
  ([Subscribing to Database Changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)).
  A trigger calls `realtime.broadcast_changes()`, the client joins a `private:
  true` channel, and an RLS policy on `realtime.messages` using
  `realtime.topic()` gates the join against the same membership helper. **This
  closes the delete hole properly**, because a delete is just a message on a
  topic you had to be authorized to join. Costs: a trigger per table, three hooks
  rewritten, `setAuth()` before subscribing, and a three-day copy of every change
  sitting in `realtime.messages`.

My read: B is the right destination and A is the honest v1-scale answer, if and
only if the client filter is treated as load-bearing and written down as such.

### 5. One helper or five: two, plus one schema decision

**Helper 1, `private.my_group_ids() returns setof uuid`.** The Groups I am in.
Serves `group` (`id in (...)`), `membership`, `availability` and `hangout`
(`group_id in (...)`). Writes keep their v1 self-check and gain the Group check,
so `availability` insert becomes `with check (friend_id = (select auth.uid())
and group_id in (select private.my_group_ids()))`.

**Helper 2, `private.my_co_member_ids() returns setof uuid`.** The Friends I
share a Group with. `friend` has no `group_id`, so written inline it is a
correlated join to the source table, which §3 says to avoid. Its policy needs a
second arm that is easy to miss:

```sql
using (
  id = (select auth.uid())
  or id in (select private.my_co_member_ids())
)
```

**The `id = (select auth.uid())` arm is not redundant.** A Friend who has signed
up and not yet joined a cal has no `membership` row, so the helper returns
nothing and they cannot read their own row, and setup has nothing to render.
Ticket 01 made `/` always the join-or-create page, so that is not an edge case,
it is every new account's first screen.

**`hangout_participant` is the odd one out.** It has `(hangout_id, friend_id,
left_at)` and no `group_id`, so its policy must reach the Group through
`hangout`: `exists (select 1 from public.hangout h where h.id = hangout_id and
h.group_id in (select private.my_group_ids()))`. That is correct and does not
recurse, but it is the per-row correlated join §3 says to rewrite. Three ways
out, my preference first: **give `hangout_participant` a `group_id`** (a ticket
04 call, one redundant column, the policy then collapses to helper 1); or a
third helper `my_hangout_ids()` (correct, but grows without bound against the
guide's 1000-item note); or leave the `exists` (free at five friends, and the one
policy in the schema that does not look like the others).

Both helpers read `membership`, both `setof uuid`, both in `private`, both
`stable` with `search_path = ''`, both revoked from `public` and granted to
`authenticated`. Which makes `membership` the hottest object in the schema:
every policy in the product now depends on it being readable by the helper and
indexed on `friend_id`.

### Could not confirm

Flagged as unresolved rather than inferred:

- Whether `postgres_changes` authorization is **cached per connection** the way
  `realtime.messages` channel policies are ("Client access policies are cached
  for the duration of the connection"). If it is, a Friend who joins a cal
  mid-session may not receive its events until they reconnect.
- **Which record a Realtime `filter` is evaluated against for a delete** once
  `replica identity full` is set. The docs say only that filtering deletes
  requires `full`. Under option A that filter is the only thing between a delete
  and the wrong subscriber, so ticket 04 should test it rather than trust it.
- Any **carve-out for intentionally exposed `security definer` RPCs**. Still
  nothing, same as v1.
- Whether **GiST's leading equality column** satisfies "index your policy filter
  column" for `hangout (group_id)`. The guide's wording is "only when it comes
  first in a `btree` index", which reads as excluding GiST. A plain btree index
  is cheap insurance.
