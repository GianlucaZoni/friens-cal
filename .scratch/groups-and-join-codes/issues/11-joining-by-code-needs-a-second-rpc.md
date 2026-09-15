# 11 — Joining by Code needs a second exposed `security definer` RPC

Type: grilling
Status: open

## Question

Raised by [ticket 02](02-membership-rls-research.md), which found it while
answering something else. It is a genuine chicken-and-egg, and it costs a
security property the project has been treating as settled.

Once `group`'s select policy is `id in (select private.my_group_ids())`, **a
Friend cannot look up a Group by its Code, because they are not in it yet.** And
a `with check` on `membership` scoped the same way rejects the insert that would
have made the check pass. The join flow has no way in.

The two ways out, neither free:

- **`join_group(code)` as a `security definer` RPC** in an exposed schema. It
  works, and ticket 02 confirmed the helper pattern is safe in `private` — but
  an RPC is *not* a helper, it is browser-callable by design, and ticket 02 also
  confirmed that **no Supabase page states a carve-out for one**. v1's ticket 07
  §9 spent a real judgement call on that and ADR-0002 then recorded the
  mitigation: "exactly one such function exists in the whole project (it is now
  a security property, not just tidiness)". A second one ends that sentence.

- **`with check (true)` on `membership`, plus a Code-keyed read on `group`.** No
  new function. But it lets anyone enumerate Groups by guessing six characters
  and join them uninvited — which turns the Code back into a security boundary
  after ticket 01 decided it was not one, and this time a weak one.

So:

1. **Which shape?** If it is the RPC, what exactly does it do — resolve the
   Code, insert the Membership, return the Group — and what does it return for a
   Code that matches nothing, given it must not become an oracle that confirms
   which six-character strings are real?

2. **Rate limiting.** 26^6 is about 300 million, and an RPC that answers "is
   this a Group?" is guessable at machine speed by anybody holding the
   publishable key. v1 never had a brute-forceable surface. What stops this one,
   and can anything stop it without a server?

3. **The ADR.** ADR-0002's "exactly one" line either gets amended honestly or
   this function is smuggled past it. If amended, what is the replacement
   property — "every exposed `security definer` function derives its effects
   from its arguments and grants no read it does not need"? Write the sentence
   that survives the next one.

4. **The other half of ticket 02's finding**, recorded here so it is not lost:
   the exposed-schema tension ADR-0002 flagged as unresolved **is now settled
   for policy helpers** (they live in `private`, which is not an exposed schema,
   and Supabase's guide now shows exactly that). ADR-0002's refinement can be
   marked resolved for that case. It stays unresolved for RPCs, which is this
   ticket.

## Comments

### 2026-09-15 — a second read of ticket 02 found a page that speaks to §1's first bullet

Two research sessions answered ticket 02 in parallel without knowing about each
other. The second answer landed after the ticket was already closed, so it is
not on the route; it sits on branch `research/membership-rls-2` (commit
`37fc411`) at `.scratch/groups-and-join-codes/research/membership-rls.md`. It
agrees with the resolved answer on every load-bearing point. One thing it found
bears directly on this ticket, so it is recorded here rather than left on a
branch nobody opens.

**Supabase's database linter has a rule for exactly this situation, and its
third listed resolution is "keep it."**

> ### 0029_authenticated_security_definer_function_executable
>
> **Summary:** This `SECURITY DEFINER` function is callable by signed-in users.
> [...]
>
> **Option 3: Keep both `SECURITY DEFINER` and the `EXECUTE` grant —
> intentional.** Some functions are deliberately exposed to signed-up users: a
> "create my profile" function that initialises rows the user cannot otherwise
> insert, a "submit feedback" function that writes to a table they cannot
> otherwise write to, etc. If the lint flags one of these, the finding is
> intentional and can be suppressed for that object. The function should
> validate inputs and limit what it does — a `SECURITY DEFINER` exposed to
> `authenticated` is effectively a public API endpoint to anyone who can sign
> up.
>
> — [Supabase, Database Advisors → 0029](https://supabase.com/docs/guides/database/database-linter)

The same rule's rationale names the failure the RLS guide's "never" is aimed at,
and it is not an intentional RPC:

> The result: a developer writes a helper function intending it to be called
> from an admin script, doesn't think about the API surface, and the function
> becomes an exfiltration endpoint for any signed-up user.

**What this changes.** §1's first bullet and §4's closing sentence both rest on
"no Supabase page states a carve-out" for a browser-callable
`security definer` RPC. That is now too strong. No page states the carve-out in
those words, and the RLS guide's "never create one in an exposed schema" is
unamended, so this does not close the question. But 0029 describes this exact
object, calls the lint finding intentional, and tells you to suppress it. The
docs go further than "silent". `join_group(code)` is the case Option 3 is
about, and the last clause is the condition attached to keeping it: validate
inputs, limit what it does, and treat it as a public endpoint for anyone who can
sign up. That last phrase is worth holding against §2, since the allowlist means
"anyone who can sign up" is a smaller set here than the rule assumes.

**Feeds §3.** The replacement property this suggests, offered as a starting
point for the grill rather than an answer: ADR-0002's "exactly one such function
exists in the whole project" becomes **"every exposed `security definer`
function is enumerated in an ADR, derives its effects from stored data or its
own arguments, and grants no read the caller could not already perform."** That
is a property the project can keep true as functions are added, which the
counting one never could.

**Practical, for whoever writes the migration.** Expect a 0029 finding on each
`public` RPC (`retime_hangout` and `join_group`) on the live project. Both are
the documented intentional case. Suppress each with a comment naming the ADR
that authorises it, rather than leaving two standing findings that train
everybody to ignore the advisor.
