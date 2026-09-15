# 02 — Membership-aware RLS in Supabase, without the recursion trap

Type: research
Status: claimed

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
