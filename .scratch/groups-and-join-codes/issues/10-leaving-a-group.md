# 10 — Leaving a Group, and what goes with you

Type: grilling
Blocked by: 04
Status: resolved

## Question

Ticket 01 said leaving is allowed, your Availability in that Group goes with
you, and you are marked Left on its Hangouts. That sentence is three database
operations that fire two existing triggers, and those triggers were written to
defend invariants this act now walks straight through.

1. **The drop trigger.** v1 issue 10 built a statement-level trigger on
   `availability` delete, implementing ticket 08's **strict** drop rule: removing
   Availability that covered a Hangout drops you from it. Deleting every
   Availability row you hold in a Group therefore drops you from every Hangout
   in it — which is roughly the right outcome, but by accident rather than by
   design. Is "dropped" the right state, or should leaving mark you **Left**?
   They are different: `CONTEXT.md` says Left is sticky and outranks
   Availability permanently, and dropped does not.

2. **The auto-cancel.** The same effort made empty Hangouts auto-cancel from the
   trigger, exempting Past ones. The last Friend leaving a cal therefore deletes
   every future Hangout in it. Ticket 01 said a Group whose last member leaves
   **lingers** so its Code still works — but if leaving has already erased its
   Hangouts and Availability, what lingers is a name and a Code. Is that what
   was meant?

3. **The plural drop dialog.** Issue 10 wrote the confirmation as the trigger it
   predicts, `generate_series` on both sides, "because a dialog that named the
   wrong Hangouts would be believed". Leaving needs its own version of that
   dialog: this is the most destructive act in the product and the first one
   that is not undoable by redrawing.

4. **Rejoining.** You leave, then type the Code again. You are a Member with no
   Availability, and Left on Hangouts that predate you leaving. `CONTEXT.md` says
   Left is never re-added automatically and there is a manual route back via the
   three-dots menu. Does that route still exist for somebody who left the *Group*
   rather than the Hangout, or is Left-by-leaving a different, more final thing?

5. **Where the control lives.** Not in ticket 06's three-dots menu beside rename
   and view code, where it sits one slip away from switching cals. Somewhere
   with more friction.

6. **The order of operations.** Delete Availability (firing the drop trigger and
   possibly the auto-cancel), then delete the Membership row — or the reverse,
   which would delete the Membership while RLS still has to admit the
   Availability delete that follows. One of those orders locks you out of your
   own cleanup.

## From ticket 04, which is now resolved

[04](04-group-schema-and-migration.md) settled the schema and left this ticket
one question sharper than it was.

- **Leaving is a plain `delete` on `membership`**, not an RPC, under
  `using (friend_id = (select auth.uid()))`. ADR-0003's audited set stays at
  three functions, and ticket 04 recorded why this is not a fourth.
- **`membership` has no `left_at`.** The row goes. Rejoining by Code is a fresh
  row and the Code still works.
- **Your Availability in that cal goes by cascade**, because `availability`
  references `(cal_id, friend_id)` on `membership` with `on delete cascade`.
  Nothing has to remember to erase it.
- **The open question this leaves is the one ticket 01 and ticket 04 disagree
  about.** That cascade is a `delete` on `availability`, so the existing
  statement-level trigger fires and **drops** you from the cal's Hangouts,
  leaving no row. Ticket 01 said leaving marks you **Left**, which is a row with
  `left_at` set and a permanently different meaning (CONTEXT.md: Left "outranks
  Availability permanently"). Ticket 04 guaranteed only that the Availability
  goes and handed the choice here.
- **`hangout_participant` deliberately does not cascade from `membership`**, so
  whichever way that goes, your name stays on past Hangouts — and it stays
  readable, because ticket 04 kept `friend` globally readable for exactly this
  reason.

## Answer

Six questions, and the two that matter were not in the six. Leaving is **Left,
not dropped**, on the cal's future Hangouts — and **your name stays on its past
ones**, which it does not today and would not have.

### 1. Leaving marks you Left, and ticket 01 wins over ticket 04's cascade

Ticket 01 said "marked Left"; ticket 04's cascade delivers "dropped". Left.

Dropped is *no row*, and `CONTEXT.md` makes no row indistinguishable from never
having joined. So dropped is not merely a weaker Left — it is the state that
gets **re-offered**. Leave the cal, rejoin by Code next month, draw a Saturday,
and the sidebar cheerfully offers you back onto the plan you walked out of.
Left is sticky, outranks Availability permanently, and is never re-offered.
That is the entire difference and it only shows up on the rejoin, which is
exactly the path nobody would have tested.

The cost is a `hangout_participant` row that **outlives the `membership` row**,
which sounds wrong and is precisely what ticket 04 §4 built: that table
deliberately does not cascade from `membership`, because a Participant row is a
record that you were there.

**One Left, not two.** A more final leaving-the-cal flavour was considered and
rejected: it needs a column to distinguish it, and to everyone else reading the
Hangout the two are the same fact — Marco isn't coming.

### 2. Your name stays on the cal's past Hangouts — which required finding that it doesn't

**Not in the ticket's six questions, and it would have shipped.** Ticket 04 §4
guarantees "your name stays on past Hangouts" and backs it by keeping
`hangout_participant` off the cascade. That guarantee does not hold.

Leaving cascades **every** Availability row you hold in the cal, past ones
included — the store holds the past and the grid draws it
(`use-availability.ts` fetches a strip backwards on navigation). The drop
trigger has **no Past exemption**: `06-hangout-lifecycle.sql` §3 says so in
terms, and `droppedBy`'s doc comment repeats it ("Past Hangouts are **not**
excluded"). Only the *auto-cancel* exempts the past. So the cascade reaches
back and deletes your Participant row on every past Hangout in that cal. The
row you were promised survives the Membership is deleted by the Availability
that went with it.

Past rows stay **plain Participant** — not Left. Marking them Left is the tidy
implementation and it rewrites history into a lie: it says you walked out of a
dinner you ate. The drop rule answers *are you still coming*, a question the
past does not accept.

### 3. The shield is one predicate, and it reopens nothing

The round-1 framing of this said preserving the past would force a reopening of
v1 ticket 07 §7's strict-without-qualification drop rule, with a blast radius
across ordinary erases. **That was wrong**, and the correction is the mechanism.

`drop_participants_losing_coverage` is `after delete on availability`. Postgres
runs a referential action *after* the parent row is gone, so by the time the
trigger fires on a cascade from `membership`, **the Membership row no longer
exists**. The trigger can therefore ask one question:

```sql
-- in the `suspect` CTE, alongside `p.left_at is null`
and exists (
  select 1 from public.membership m
   where m.cal_id = h.cal_id
     and m.friend_id = p.friend_id
)
```

An ordinary erase always passes it — you are still a Member. A departure never
does. **The drop rule stays strict everywhere it was strict**, past Hangouts
included, for every erase that is an erase. A departure is simply not one.

Two mechanisms lost to it. A transaction-local GUC set by the leave path and
read by the drop trigger works, but it is a flag where a fact will do, and the
fact is already in the database. Exempting Past Hangouts from the drop outright
was the round-1 recommendation; it changes what an ordinary erase of an old
week does, which nobody asked for and which v1 considered and accepted on
purpose.

### 4. A `before delete` trigger on `membership` writes the Left, and the audited set stays at three

Three mechanisms: a trigger, two client statements, or a fourth RPC.

**The trigger.** `before delete on membership`, `security definer`,
`set search_path = ''`, revoked from every browser role — the shape its two
siblings in `06-hangout-lifecycle.sql` already have. It sets `left_at = now()`
on the leaver's `hangout_participant` rows where `left_at is null`, in that cal,
on Hangouts with `ends_at > now()`.

The client alternative is two statements with no transaction around them: a
dead tab between them leaves you a Member marked Left on everything, which is
the one outcome nobody would think to look for. The RPC alternative
(`leave_cal(cal_id)`) buys the same atomicity and spends
[ADR-0003](../../docs/adr/0003-exposed-security-definer-rpcs.md)'s set-of-three
— the property ticket 04 §10 and the ADR's own amendment both explicitly
banked on, and the reason the ADR says the set is "auditable as a set". A
trigger function costs none of it: it is reached by the referential machinery,
not by `supabase.rpc()`, which is the distinction `06-hangout-lifecycle.sql` §3
already draws for the drop trigger.

**Leaving is still a plain `delete` on `membership`** under
`using (friend_id = (select auth.uid()))`. ADR-0003 is amended with one
sentence, because its "with the rest following from an `on delete cascade`" is
now not the whole truth and the next person auditing the set will read it.

### 5. The order falls out, with no dance

The ticket's Q6 worried that one order locks you out of your own cleanup. It
does not arise: leaving is **one statement**, and everything else is
consequence. Traced, because three triggers fire and the sequence is the proof:

1. `before delete on membership` — marks you **Left** on the cal's future
   Hangouts. Left rows are skipped (`left_at is null`); Hangouts you are not on
   have no row and gain none; past Hangouts are untouched.
2. That `update` fires the existing `hangout_participant_autocancels`, which
   calls `cancel_empty_hangouts` — so a future Hangout you were **alone** on is
   deleted, by the rule that already exists rather than by a new one. Past ones
   are exempt there already.
3. The `membership` row is deleted.
4. `availability` cascades — every Slot you held in that cal, past and future.
5. `drop_participants_losing_coverage` fires and **skips everything**: the
   Membership is gone, so §3's predicate fails for every pair.

RLS never enters it. Referential actions and trigger functions do not run as
the caller, so the "delete the Membership while RLS still has to admit the
Availability delete" trap in Q6 is not reachable in this order.

### 6. The dialog names what goes, and hands you the way back

Same shape as [drop-dialog.tsx](../../../src/hangouts/drop-dialog.tsx) and for
the same reasons: the consequence stated **before** the controls, every Hangout
**named rather than counted**, a bounded list that scrolls inside a dialog that
cannot push its own buttons off a phone, `AlertDialog` with a destructive
action whose label names the destructive half.

It carries four things:

- the future Hangouts you will be marked **Left** on;
- which of those are **cancelled outright** because you are the only one on them
  — `wouldAutoCancel`'s prediction, which is the same prediction the trigger
  makes;
- that your Availability in this cal is **erased**;
- that your name **stays** on its past Hangouts. This dialog is otherwise a
  list of losses, and the asymmetry §2 just bought is worth saying once where
  somebody reads it.

**And it shows the Code.** One line — *"You can come back with `ABCDEF`"* —
because leaving is the exact moment the Code becomes unreachable to you, and if
you are the last Member there is nobody left to tell it to you. It leaks
nothing: you are a Member as you read it, and every Member sees the Code.

**No type-to-confirm.** That ceremony exists nowhere in this product. The named
list is the friction, as it is for the erase.

**The dialog does not get its own clock.** It renders Hangout times through
`whenOf`, with whatever zone [08](08-whose-time-zone.md) settles — that ticket
is live and `CONTEXT.md` has already moved to per-viewer zones. A leave dialog
that hardcoded `GROUP_TIME_ZONE` would be the last thing in the product still
believing in a Group clock.

### 7. Rejoining is the same Left and the same door

Nothing new is needed, and this was checked in the shipped client rather than
assumed. **Rejoin** is on the Hangout card by name, always, unconditionally —
ticket 08 §9's *"the tool never suggests rejoining something you walked out of,
but the door is not locked"* — and `use-hangouts.ts` makes Join and re-Join
"the same three statements", so re-Joining **writes the Availability to cover
the range**. After rejoining the cal you hold nothing there, so it writes the
whole range, and `availability`'s FK to `membership` admits it because you are
a Member again.

So Left-by-leaving-the-cal is reachable, sticky, and never automatic — the same
three properties Left has always had. The route back exists and the product
still does not suggest it.

### 8. The control lives on `/`, and it collides with ticket 05's row

**Not** ticket 06's three-dots beside rename and view-code: that sits one slip
from the row that switches cals, and ticket 06 §1 already flags those two
targets as millimetres apart on touch. This is the one act in the product that
redrawing cannot undo.

It lives on **`/`**, the join-or-create page. Leaving is a decision about *the
set of cals you are in*, and `/` is the only screen that shows the set. Getting
there is a deliberate navigation away from the calendar you are leaving, which
is the friction Q5 asked for, and it puts the act beside its inverse.

**[05](05-join-or-create-page.md) resolved while this ticket was open, and its
row now has two targets** — name-and-Code opens the cal, a trailing copy button
flips to a tick — after it fought specifically to stop being one. A leave
control is a **third**, and 05's own handoff to 06 asks whether the three dots
can be dissolved entirely now that copy exists. So: a trailing overflow after
the copy button, holding **Leave** alone, and the two surfaces' menus
deliberately differ — `/` leaves, the dropdown renames. That turns 06's open
question from "is rename alone worth a menu" into "two surfaces, two different
menus, or one menu that must not hold Leave next to a cal switcher". **Handed
to 06, not decided here**, because 06 renders the list a second time and owns
what the row's controls look like.

### 9. And a non-Member at `/g/:id` redirects to `/`

Leaving creates the case — the tab you left open, the bookmark — but it is not
unique to it: a Code-less stranger with a guessed id needs the same answer.
Redirect, silently, to `/`, which is always the join-or-create page and already
carries the Code field. A dedicated "you're not in this cal" screen would be a
second place to type a Code, and against an **opaque** id (ticket 01) it would
confirm the cal exists to anyone who guesses one.

### What this hands to other tickets

- **[06](06-group-dropdown.md)**: §8 above. Leave needs a home on the row, the
  dropdown must not be it, and 05's copy button already spent the row's spare
  target.
- **[12](12-realtime-scoped-per-group.md)**: leaving produces, in one
  transaction, an `update` on `hangout_participant`, a `delete` on `membership`,
  a bulk `delete` on `availability`, and possibly a `delete` on `hangout` — all
  of which the *other* Members' clients must absorb, while the leaver's own
  client must stop listening to a channel it no longer has read access to.
- **[08](08-whose-time-zone.md)**: the dialog renders Hangout times and takes
  its zone from 08. No hardcoded `GROUP_TIME_ZONE`.
- **The build issue for ticket 04's §5 file**, which already rewrites the three
  group-blind function bodies: it gains the §3 membership predicate and the §4
  `before delete on membership` trigger. Both belong in that file, beside the
  functions they change, rather than in a fourth.

### What this does not decide

The migration's treatment of the **existing** cal (there is one, everybody is
in it, nobody has left) needs nothing special: the trigger and the predicate
are both forward-looking and no backfill can produce a Left row that should
exist. Ticket 04 §8's outage reasoning is untouched — none of this widens a key.
