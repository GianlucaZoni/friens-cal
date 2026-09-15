# 14 — The roster reads every Friend in the product

Type: grilling
Status: open

## Question

Split out of [ticket 12](12-realtime-scoped-per-group.md) §7, which found it
while answering a Realtime question and deliberately did not settle it.

**`use-roster.ts:123` is `from('friend').select('*')` with no filter**, and
[ticket 04](04-group-schema-and-migration.md) kept `friend` at `using (true)` on
purpose, so the policy will not scope it either. With one implicit Group that
was correct and invisible. With many cals the sidebar lists **every Friend in
the product**, including people you share no cal with.

Ticket 04's decision is not in question and should not be reopened. It is right:
co-member scoping would render a Friend who left as a **nameless, faceless
Participant** on the past Hangouts they keep, and identity is global by
`CONTEXT.md`. What ticket 04 did was move the scoping burden out of the policy
and into every query that reads `friend`. This is the query that has it, and
nothing else picked it up.

**The subscription is not part of this.** Ticket 12 settled that it stays
table-wide, `event: '*'`, on `postgres_changes`, because a hue change should
reach every screen. Do not "fix" it to match whatever this ticket decides about
the read, or the past-Hangout case ticket 04 protected breaks.

To settle:

1. **Where the scoping happens.** A read through `membership`
   (`select friend(*) from membership where cal_id = ...`) is the obvious shape
   and makes the roster a per-cal query like everything else. Does it embed, or
   does it read `membership` and then `friend` by id?

2. **Who the roster is *for*.** The sidebar's Friends are the people whose
   Availability the grid counts, which is the cal's Members. But the same
   component renders Participants of past Hangouts, who may have left
   ([ticket 10](10-leaving-a-group.md): Left, not dropped). So the set the
   sidebar needs and the set the Hangout cards need are **not the same set**, and
   a per-cal roster read has to leave the second one reachable.

3. **What the table-wide subscription does to a scoped store.** If the read is
   cal-scoped and the subscription is not, a `friend` insert for a stranger folds
   a row into a store the read would never have returned. Harmless today (an
   unrendered row), but it is the same class of bug ticket 12 found on
   `availability`, and it should be named rather than left to be rediscovered.

4. **Whether anything else reads `friend` unscoped.** `use-roster` is the one
   ticket 12 found. It did not go looking for others.
