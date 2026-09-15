# ADR-0003: Exposed `security definer` RPCs, and the rule they must satisfy

**Status:** Accepted — 2026-09-15

## Context

ADR-0001 made this a pure static SPA: the browser talks to Postgres directly
with a publishable key, and authorization is SQL policies rather than server
code. A `security definer` function runs as its owner and therefore bypasses
those policies, so every one of them is a hole cut deliberately through the only
security layer the project has.

Supabase's RLS guide says, without qualification, "never create a
`security definer` function in a schema listed under Exposed schemas" — yet
`supabase.rpc()` can only call functions in exactly such a schema. ADR-0002's
refinements recorded this as an unresolved sharp edge, and v1's ticket 07 §9
resolved it *for one function* by reading the caution as aimed at policy
helpers, noting the docs state no carve-out, and recording the reading as a
judgement.

Three things have changed since.

**Research ticket 02 of the groups effort settled half of it.** Supabase's guide
now publishes a canonical shape for policy helpers, and it puts them in a
`private` schema that is not exposed. For helpers the tension is gone: they are
simply not reachable over the Data API. The caution's blanket wording remains
unamended, so it is still no carve-out for a *deliberately* browser-callable
function.

**Supabase's database linter turns out to describe this exact object.** Rule
0029, `authenticated_security_definer_function_executable`, lists "keep both
`SECURITY DEFINER` and the `EXECUTE` grant — intentional" as a resolution, gives
"create my profile" and "submit feedback" as examples, and attaches a condition:
the function "should validate inputs and limit what it does — a
`SECURITY DEFINER` exposed to `authenticated` is effectively a public API
endpoint to anyone who can sign up". That is the nearest thing Supabase
publishes to a blessing, and it is a linter rule rather than a guide.

**And the count went from one to three.** The groups effort adds
`join_group(code)` and `create_group(name)`, both forced rather than chosen:
reads are membership-scoped, so a Friend cannot resolve a Code for a Group they
are not in yet, and creating a Group is two inserts that must be atomic or they
orphan rows nobody can reach or delete. PostgREST spans neither, and there is no
server.

So a one-off judgement recorded inside a resolved ticket is the wrong shape. The
question recurs, and the next person to write one of these will not find it
there.

`join_group` is also a genuinely new category, which is what forced this ADR
rather than a second footnote. `retime_hangout` is callable meaningfully only by
somebody who can already see the Hangout. **`join_group` is callable by anyone
holding an account, against a Group they cannot see, and its entire purpose is
to grant access.** ticket 07 §9's "takes one argument, derives everything from
stored rows" does not reach it.

## Decision

An exposed `security definer` function is permitted when **all four** hold.

1. **The caller can never name another Friend.** Every identity the function
   acts on is derived from `auth.uid()` or from rows the function itself read.
   Arguments may say *what* and *where*; never *who*.
2. **It does one thing, and its effects are bounded by the rows it read.**
3. **`set search_path = ''`, schema-qualified throughout, `revoke execute` from
   `public` and `anon`, `grant execute` to `authenticated` alone.**
4. **The reasoning is a comment in the migration beside it**, so the next reader
   does not "fix" it.

Condition 1 is the load-bearing one and it is ADR-0002's own argument
generalised. That ADR refused a `(friend_id, start, end)` signature as "the same
power, behind a safer-looking name", and kept `retime_hangout` narrow by
deriving *who* from the stored row even after the range became an argument. The
three functions satisfy it identically: `retime_hangout` derives its
Participants, `join_group` joins `auth.uid()`, `create_group` makes `auth.uid()`
the first Member.

Rule 0029's condition is met by 1 and 2 together. Its warning about "anyone who
can sign up" is narrower here than the rule assumes, because holding an account
at all requires an Invite: the population is people a Friend vouched for by
name, not the internet.

**This remains a recorded judgement, not a documented carve-out.** The RLS
guide's "never" is unamended and no page states an exception in those words.
Rule 0029 is evidence that the docs contemplate the object; it is not
permission.

## Consequences

- There is one place to look before writing the fourth one of these, instead of
  a footnote inside a closed ticket.
- The rule is testable. Condition 1 can be read off a signature: an argument of
  type `uuid` naming a Friend fails it, visibly, in review.
- It costs a reviewer's judgement on "bounded by the rows it read", which is the
  vaguest of the four and deliberately so — a tighter phrasing would have ruled
  out `retime_hangout`, which writes a range it was handed.
- ADR-0002 is **not** amended. Its property is one audited choke point for "can
  someone else change my calendar", scoped to cross-Friend Availability writes.
  Neither new function touches `availability`, so neither goes near it. The
  refinement's unresolved-sharp-edge note is superseded by this ADR for policy
  helpers (they live in `private`) and by this ADR for RPCs.
- The three functions become a set somebody can audit as a set, which is worth
  more than each being defensible alone.
- If Supabase ever amends the guide, this ADR is where the judgement gets
  retired, not three migrations.

## Amendment (2026-09-15, from issue 04) — the two new functions are `join_cal` and `create_cal`

Issue 04 named the physical table. `group` is a fully reserved word in Postgres,
so the domain term cannot be the identifier without quoting every reference, and
the table is **`cal`** with a `cal_id` column.

This ADR was written before that and names the two new functions `join_group`
and `create_group` throughout. They are **`join_cal(code)` and
`create_cal(name)`**. A function called `join_group` reaching into a table
called `cal` is a seam that makes the next reader ask which of the two is stale.

Nothing else moves. The four conditions stand word for word, and all three
functions still satisfy them: `retime_hangout` derives its Participants from the
stored row, `join_cal` joins `auth.uid()`, `create_cal` makes `auth.uid()` the
first Member.

**The set is still exactly three**, and issue 04 is where that was last tested.
Leaving a Group looked like a fourth candidate and is not one: it is a plain
`delete` on `membership` under `using (friend_id = (select auth.uid()))`, with
the rest following from an `on delete cascade`. A function would have bought
nothing the policies cannot express, and the auditable-as-a-set property in the
Consequences above is the reason to notice that rather than write it.
