# 08 — The Hangout lifecycle, end to end

Type: grilling
Status: resolved
Blocked by: —

## Question

Ticket 01 settled the rules. This ticket walks the state machine until it has no
undefined transitions, because this is where the tool's trustworthiness lives —
a Hangout that quietly changes is worse than no Hangout at all.

The known rules: participants seeded at confirmation; removing covering
Availability **drops** you; adding it never **adds** you but surfaces a "Join?";
Join also writes Availability; Left is sticky and does not touch Availability;
anyone may confirm, edit or cancel; force-retiming **extends** participants'
Availability through the ADR-0002 RPC.

Transitions and cases to resolve:

1. **Force-retime onto a time a Participant never claimed.** The RPC extends
   their Availability. What does that Friend *see* — does the grid just silently
   grow a block they did not draw? Is there any acknowledgement, given there are
   no notifications (out of scope)?
2. **Retiming shorter.** Extensions are never reverted, so a Friend keeps
   Availability from a Hangout that moved away. Confirm that is acceptable and
   the human understands the residue.
3. **Retiming so that a Participant is no longer covered.** Does the drop rule
   fire on a Hangout's own retime, dropping the person the retime was about?
   That is a plausible way to lose people accidentally.
4. **Cancellation.** Is a cancelled Hangout deleted or tombstoned? Does it
   vanish from everyone's grid instantly (realtime), and is there any undo?
   Anyone can cancel anyone's Hangout — is that genuinely fine?
5. **The last Participant leaves.** Does an empty Hangout persist, cancel
   itself, or is Leave refused for the last one?
6. **Overlapping Hangouts.** Two confirmed Hangouts at the same time, sharing
   Participants. Allowed? How do they render in one cell?
7. **Past Hangouts.** They leave the sidebar on their day (per 01). Do they stay
   on the grid forever, grey out, become uneditable?
8. **Join on a past Hangout**, or on one happening right now.
9. **"Join?" surfacing.** Exactly when does it appear — Availability covering
   the *whole* Hangout, or partially overlapping it? Partial is the common case
   and needs an explicit rule.
10. **A Left Friend redraws Availability** over the Hangout. Left is sticky, so
    no "Join?" — but can they ever get back in deliberately, or is Left a
    one-way door? Ticket 01 implies re-Join must be possible somehow; make it
    explicit.
11. **Deleting Availability that covers two Hangouts** at once.
12. **Concurrency.** Two Friends confirm the same Candidate simultaneously, or
    one cancels while the other edits.

## Answer

<!-- the state machine, and the rule for each transition above -->

## Decided (round 1)

1. **A retimed Hangout is marked permanently**, the way a chat message shows
   "edited". No provenance on availability slots (ADR-0002 rejected that) and no
   per-viewer seen-state. It is the only signal a Participant gets that slots
   were written for them, since v1 has no notifications.
2. **Retime is unrestricted** — any time, any day. The RPC extends every
   Participant's availability to the new range, so moving Pizza from Saturday
   20:00 to Tuesday 19:00 **writes Tuesday availability for friends who never
   mentioned Tuesday**. *Same-day-only was recommended and the human chose
   unrestricted with the trade-off in front of them.* Consequence to hold: the
   drop rule can never fire on a retime (extension always precedes it), so a
   retime cannot remove anyone — it can only silently enlarge people's stated
   availability, arbitrarily far.
3. **Cancellation is a hard delete**, fronted by a warning dialog. The row and
   its participants go; the title and the fact it existed are unrecoverable, and
   the other Friends learn of it by noticing an absence. *A tombstone with undo
   was recommended — anyone may cancel anyone's Hangout and nobody is notified —
   and the human chose hard delete plus a warning.* The availability extensions
   survive the deletion regardless; that was already settled.
4. **An empty Hangout auto-cancels.** Whether the last Participant left or was
   dropped. This must fire from the **trigger** as well as the UI, because the
   drop rule can empty a Hangout with nobody clicking anything.
5. **"Join?" appears on any overlap**, however small. Join writes the missing
   slots to cover the whole Hangout, so a partial overlap is enough to offer it.
6. **Past Hangouts stay forever, visually muted, and are uneditable** — no join,
   no retime, no cancel. The grid stays consistent with the past Availability
   that is still there (never auto-deleted, ticket 01). A Hangout happening
   *now* stays live until its end time.
7. **Overlapping Hangouts are forbidden outright.** Not "warned when they share
   Participants" — no two Hangouts may occupy overlapping time at all.
   - **Consequence**: with a single Group, the calendar holds **one plan at a
     time**. Two disjoint subsets of friends cannot book different things at
     20:00. Coherent with "when are *we* free", but it is a real limit.
   - **Enforcement is structural**, not application logic: a Postgres
     **exclusion constraint** (`exclude using gist (tstzrange(starts_at,
     ends_at) with &&)`) makes an overlapping row impossible to insert. → adds
     to the schema in ticket 07.
   - Force-writing a time that collides with an existing Hangout must therefore
     be **rejected and surfaced** in the editor, not silently dropped.

## Decided (round 2)

8. **A losing confirmation converts into a Join.** When two Friends confirm the
   same Candidate near-simultaneously, the exclusion constraint rejects the
   second insert; the client turns that rejection into a **Join of the Hangout
   that won**, because that was the intent. For the sibling case — a Hangout
   cancelled while someone else has its edit dialog open — the client detects
   the missing row and closes the dialog with "this hangout was cancelled".
   With hard delete there is no row left to explain the failure, so the message
   must come from the client.
9. **A Friend who Left rejoins from the Hangout's 3-dots menu**, which clears
   `left_at`. No prompt ever appears for them — the tool never *suggests*
   rejoining something you walked out of, but the door is not locked.
10. **The delete-confirmation dialog names every affected Hangout**, not a
    count: "this drops you from Pizza Sat 20:00 and Climbing Sun 10:00".
11. **The retime-confirmation dialog names the Friends whose calendars it will
    write to**: "Marco, Sara and Luca will be marked free Tue 19:00–21:00". This
    is the one action in the product that edits other people's data, and with no
    notifications the person doing it is the only one who can see it happen.

## Answer

### Hangout states

- **Live** — starts in the future, or is happening now. Fully actionable.
- **Past** — end time has passed. Visually muted, **uneditable**: no join, no
  retime, no cancel. Stays on the grid forever.
- **Deleted** — hard-deleted, unrecoverable. No tombstone, no undo.

### A Friend's three states toward a Hangout

Derived from `hangout_participant` (ticket 07):

- **Not involved** — no row. Eligible for the "Join?" affordance.
- **Participant** — row, `left_at` null.
- **Left** — row, `left_at` set. Sticky: no prompt will ever appear again.

### Transitions

| From | To | Trigger | Notes |
|---|---|---|---|
| — | Hangout exists | Confirm a Candidate | Only entry point (ticket 01). Exclusion constraint forbids overlapping an existing Hangout; a colliding force-write is rejected and surfaced in the editor |
| Not involved | Participant | Confirm (seeded), or **Join** | "Join?" prompt shows on **any** overlap; Join writes the missing slots to cover the whole Hangout |
| Participant | Not involved | **Drop** — deleting availability that covered it | Strict: any loss of coverage. Statement-level trigger. Confirmation dialog lists every Hangout affected |
| Participant | Left | **Leave** | Availability underneath is untouched |
| Left | Participant | **Join from the 3-dots menu** | Clears `left_at`. Never offered automatically |
| Live | Live, retimed | **Retime** — unrestricted, any time or day | RPC extends every Participant to the new range, so a retime **cannot drop anyone**. Hangout is permanently marked "edited". Confirm dialog names the Friends whose calendars it writes |
| Live | Deleted | **Cancel** by anyone | Hard delete, warning dialog first. Availability extensions survive |
| Live | Deleted | **Last Participant leaves or is dropped** | Auto-cancel; must fire from the trigger, not only the UI |
| Live | Past | Time passes | Freezes: muted and uneditable |
| Confirm losing a race | Participant | Exclusion constraint rejects the insert | Converted client-side into a Join of the winner |

### What the database enforces, not the client

- **No two Hangouts may overlap** — exclusion constraint. This also makes the
  concurrency case resolve itself rather than needing a lock.
- **Strict drop on availability deletion** — statement-level trigger with a
  transition table.
- **Auto-cancel on the last Participant leaving** — same trigger path.
- **Extension may only ever add slots** — the RPC runs `insert` only.

## Where the plural drop dialog lives

Ticket 16 found this ticket's §10 dialog — the strict-drop confirmation that
**names every affected Hangout** — had no surface assigned. It is **not** a
sidebar dialog: it fires on the **grid**, on the path that deletes Availability
(the erase drag, or clearing a block) when that Availability covers one or more
Hangouts.

It is distinct from the Hangout card's cancel dialog, which always affects
**exactly one** Hangout and is built singular.

No ticket owns it because the tickets either side of it are resolved; it is a
build detail fully specified here, not an open decision.

## Amendment — the "edited" mark names who, and the confirmer is recorded

From issue 09, once flat trust was live and the consequence was visible.

**§1 stands and gains a name.** A retimed Hangout is still marked permanently,
still as a small muted *word* rather than an icon (ticket 16) — but the mark now
carries **who moved it**, from `retimed_by` (ticket 07's provenance amendment).
The same amendment records **who confirmed it**, in `created_by`.

**Why this is not a reversal of "anyone may confirm, edit or cancel".** That
rule is about permission and is untouched; every policy stays `using (true)`.
These are records of what happened, and §3 is the argument for them: cancellation
is a hard delete with no tombstone and no notification, so *"the other Friends
learn of it by noticing an absence."* The same silence covers a retime. In a
product where anybody may move anybody's plan and nobody is told, **the only
thing that can answer "who moved this?" is a column that wrote it down.**

Two transitions in the table above therefore gain an effect:

| From | To | Trigger | Added |
|---|---|---|---|
| — | Hangout exists | Confirm a Candidate | writes `created_by = auth.uid()` |
| Live | Live, retimed | Retime | writes `retimed_by = auth.uid()`, `retimed_at = now()` |

Both need `with check` on their policies or they record nothing — see ticket 07's
amendment, which is where the enforcement lives.

**What it does not do:** it does not make the confirmer a Participant by any
different route (they are seeded like everyone else, from the Candidate's Friend
set), it does not survive cancellation (hard delete, §3), and it gates nothing.

Open, and deliberately left in ticket 07 rather than answered here: whether a
**rename** is also an "edit". Recommended no, because §1's mark exists to say
*availability was written for you* and a rename writes none.
