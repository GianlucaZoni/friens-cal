# 11 — Joining by Code needs a second exposed `security definer` RPC

Type: grilling
Status: resolved

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

## Answer

**First, a correction to this ticket's own framing**, because it changes the
stakes. §1 and §3 above claim a second RPC would end ADR-0002's "exactly one
such function exists in the whole project (it is now a security property, not
just tidiness)". **That sentence is not in ADR-0002.** It came from a research
summary's paraphrase and was written into this ticket without being checked
against the source. What ADR-0002 actually says is:

> There is one choke point to audit and test for "can someone else change my
> calendar", instead of an open permission that any bug can walk through.

That property is scoped to **cross-Friend Availability writes**. Neither new
function touches `availability`, so **ADR-0002 is not threatened and is not
amended.** The thing genuinely at stake was weaker: v1 ticket 07 §9's recorded
judgement, which read the exposed-schema caution as scoped to policy helpers on
the grounds that its own function "takes one argument, a hangout id, derives
participants and range from stored rows".

### 1. It is two new functions, not one

`join_group(code)` **and** `create_group(name)`. Creating a Group is
`insert into group` plus `insert into membership`, and if the second fails the
first has orphaned a Group **nobody is in and nobody can ever reach** — you
cannot join it without its Code, and you cannot read its Code because reads are
membership-scoped. Those rows are unrecoverable outside the SQL Editor.
PostgREST cannot span two statements and this project has no server, which is
the same argument ADR-0002's own amendment used to give `retime_hangout` three
arguments.

`create_group` is also the natural home for generating the Code with
retry-on-collision, which a column `default` cannot do for itself. That answers
half of [ticket 04](04-group-schema-and-migration.md) Q3.

### 2. `join_group` is a new category, and that is what forced an ADR

`retime_hangout` is callable meaningfully only by somebody who can already see
the Hangout. **`join_group` is callable by anyone holding an account, against a
Group they cannot see, and its entire purpose is to grant access.** Ticket 07
§9's "one argument, derives everything from stored rows" does not reach it, so
the judgement had to be rewritten rather than extended.

### 3. The rule, and where it lives: **[ADR-0003](../../../docs/adr/0003-exposed-security-definer-rpcs.md)**

A new ADR, not an amendment. Four conditions, all required, of which the first
is load-bearing: **the caller can never name another Friend** — every identity
is derived from `auth.uid()` or from rows the function itself read, and
arguments may say *what* and *where*, never *who*. That is ADR-0002's own
argument against a `(friend_id, start, end)` signature, generalised from
Availability to everything. All three functions satisfy it identically.

Recorded honestly in the ADR: this is still a **judgement, not a carve-out**.
The RLS guide's blanket "never" is unamended. Linter rule 0029 (found by the
parallel session, see Comments) is evidence the docs contemplate the object,
not permission to build it.

### 4. Joining is immediate — no preview, no confirm step

Type six characters, you are in, the app routes to `/g/:id`.

A preview that resolves the Code and shows the Group's name and size before you
commit **feels** more careful and is strictly worse: it is a pure enumeration
oracle, letting somebody probe Codes and learn what exists **without leaving a
Membership row behind**. Immediate join has no such gap — guessing right *joins*
you, so there is no way to learn a Code is real without also appearing in a
roster five friends look at. It also keeps ticket 01's code-in-you're-in
decision, which a preview quietly reopens.

The cost, accepted: a typo landing on a *real* other Group drops you into a
stranger's calendar unannounced. With a handful of Groups in a 729-million space
this is close to impossible, and ticket 01 made leaving free.

### 5. Returns and the two failure cases

- **Code matching nothing** — raise. It is the honest PostgREST shape and needs
  no sentinel. There is no oracle to protect here, per §4.
- **Code for a Group you are already in** — *not* an error.
  `insert ... on conflict do nothing`, return the Group, route there as if it
  had been picked from the list. This makes the whole call **idempotent**, so a
  double-submit or a retry on a flaky connection is harmless.
- **On success, return the Group row**, not just its id. The client needs the
  name to route and to say something, and a second read would succeed anyway.

Consequence for [ticket 05](05-join-or-create-page.md): raising means the error
text is whatever Postgres and PostgREST produce, so the join dialog must catch
and replace it — exactly as the signup screen already replaces every failure
with one sentence.

### 6. Brute force is accepted, and written down rather than waved past

729 million codes, no per-user rate limit on the Data API by default. **No
throttle, and no cap on how many Groups a Friend may create.**

Two structural mitigations already exist, neither designed for this:

1. **The allowlist.** Rule 0029 warns an exposed function is "effectively a
   public API endpoint to anyone who can sign up". Here that population is
   *people a Friend vouched for by name*. Ticket 01's decision to keep both
   gates pays off somewhere nobody was looking.
2. **A successful guess is loud.** The guesser appears in a roster with a
   blobatar and a name. There is no quiet win.

So an attacker must be someone you let in, spend days hammering, and then show
up by name in your sidebar. A throttle is a table, a policy and a failure mode
of its own, defending against a threat the membership model has already mostly
removed.

Status: resolved
