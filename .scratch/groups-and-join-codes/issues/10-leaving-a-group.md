# 10 — Leaving a Group, and what goes with you

Type: grilling
Blocked by: 04
Status: open

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
