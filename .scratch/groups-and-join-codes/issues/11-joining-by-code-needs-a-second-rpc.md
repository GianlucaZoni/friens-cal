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
