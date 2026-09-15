# 07 — Inviting a Friend, and the enumeration leak it reopens

Type: grilling
Status: open

## Question

Ticket 01 gave every Friend the power to put an address on the allowlist, with
`invited_by` recording who. Design the act.

1. **Where it lives.** Proposed: the top-right blobatar menu, because admission
   is account-level and not Group-level. The competing pull is that a Friend
   invites somebody *because of* a particular cal, which argues for the Group
   dropdown — but ticket 01 already ruled an Invite does not carry a
   destination, so putting it there would promise something it does not do.

2. **The leak, which is the hard part.** v1's ticket 18 chose its signup copy
   specifically to close an enumeration leak, and `07-allowlist.sql` rejected the
   documentation's own suggested rejection string as "exactly the leak issue 14
   forbids". An invite screen reopens it from the other side: if it says
   "already on the list", it answers, for any address anyone types, whether that
   person uses this app.

   The options are all unpleasant. Always say "invited", whether or not it was
   already there, and accept that a Friend cannot tell whether they just did
   something. Or say "already invited" and accept the leak on the grounds that
   everybody holding an account is already vetted. Or show the inviter their
   *own* invites and nothing else, so the answer is scoped to what they did.

   Note the asymmetry that makes the third tempting: `invited_by` means the table
   now knows who vouched, so "your invites" is a query that exists anyway.

3. **What the invited person is told, and by whom.** There is no email in this
   product (v1 ticket 13 killed it, and ADR-0001's single-vendor argument depends
   on that staying true). So an Invite writes a row and nothing happens. The
   Friend still has to message them, with the sign-up URL *and* a Code. Does the
   invite dialog hand over a ready-made sentence to paste, and does that sentence
   include a Code — which would quietly make the Invite Group-flavoured after all?

4. **Removing an invite.** Somebody typos an address. It sits on the allowlist
   forever. Is there a delete, and who may do it — anyone, or only `invited_by`?

5. **Validation.** `allowlist.email` has a `check (email = lower(email))`
   constraint, and `07-allowlist.sql` is explicit that "a pasted address arrives
   with a capital or a trailing space more often than not". The client must
   `lower(trim())` before it writes or the insert is refused by a constraint
   whose error message explains nothing.

6. **The grant.** `allowlist` currently revokes everything from `anon` and
   `authenticated` and has RLS with no policies at all — deliberately, since
   there was no row anyone holding a publishable key was allowed to see. That is
   no longer true. Opening an insert path to `authenticated` is the single
   riskiest line in this effort, and it needs its policy written with the same
   care ticket 02 is spending on the others. An RPC may be the better shape than
   a grant.
