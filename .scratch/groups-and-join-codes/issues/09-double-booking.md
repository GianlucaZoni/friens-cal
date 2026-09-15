# 09 — Double-booking yourself across Groups

Type: grilling
Blocked by: 04
Status: resolved

## Question

v1's ticket 08 §7 forbade any two Hangouts overlapping, because a person cannot
be in two places, and enforced it with an exclusion constraint. Ticket 04 scopes
that constraint per Group, so it stops protecting *you*: your uni cal and your
climbing cal can each confirm 8pm Saturday, and neither grid can see the other,
because that blindness is what per-Group Availability is for.

Ticket 01 chose to **warn you, and only you**. Design the warning.

1. **What it can honestly know.** You are a Participant in both Hangouts, so a
   read across your own memberships exposes nothing to anybody. It follows that
   the app can warn *you* and cannot warn you about *Marco* — and must not try,
   since that would need exactly the cross-Group read per-Group Availability
   exists to prevent. Is a warning that only covers one of the people involved
   worth having, or is it the kind of half-guarantee that is worse than none?

2. **When it fires.** At confirm time, on the Candidate you are about to turn
   into a Hangout. Also on Join, which makes you a Participant just the same. Is
   it also a passive mark on the grid or the Candidate card, or only a
   confirmation-time interruption?

3. **What it says, and how much it says.** The other Hangout is in a cal the
   current cal cannot see. Naming it ("you are in *drinks* with **spiritually
   unemployed** then") is fine for *you*, since you are in both — but the dialog
   is rendered inside the other cal's UI, and a screenshot travels. Does it name
   the other cal, or say only "you are already busy then"?

4. **What it does.** A warning you can proceed past, or a block? Ticket 01 said
   warn. Confirm that proceeding is allowed, and that the resulting state is not
   treated as an error anywhere afterwards.

5. **The existing machinery it must not disturb.** v1's ticket 08 used the
   exclusion constraint to resolve confirm races by converting the loser into a
   Join. That behaviour is per Group and stays; this warning sits in front of it
   and must not change it.

6. **Retime.** v1 issue 10 made retime unrestricted, and a retime can move a
   Hangout onto a time you are committed to elsewhere. Same warning, or is
   retime deliberately quieter?

## Answer

**The warning is a mark, not an interruption**, and the ticket's own framing of
§2 — "a confirmation-time interruption" — is the part that did not survive.

The finding that outranks the six questions was found by reading the card rather
than reasoning about it. [`candidate-card.tsx:63`](../../../src/candidates/candidate-card.tsx)
states a rule this ticket would have broken: *"confirming needs no dialog, which
is worth saying because the sibling action does. Retiming opens a Dialog … because
retiming writes other people's Availability. Confirming writes none. Nothing has
to be warned about, so nothing is."* Confirm is a hover tick with no modal
anywhere behind it, and Join is a one-click accelerator. A confirm-time dialog
would have been the first modal on the one action deliberately built without one,
and it would have had to be either eagerly-fetched anyway or opened a round trip
after the click — a tick that sometimes opens a dialog a moment later being the
worst interaction in the set.

So the warning moved earlier, to where it is useful while you are *scanning* for
a plan rather than at the instant you commit to one.

### 1. It survives, and the all-clear is what makes it honest

§1 asked whether a warning covering only one of the people involved is worse than
none. It is not, because it is not a guarantee and must never be dressed as one.
It says "you, personally, said yes to two things" — never "this plan is safe."
The danger in a half-guarantee is somebody reading its *absence* as a pass, so
there is **no cleared state at all**: no green tick, no "no conflicts", no
checked-and-fine anywhere. The mark appears, or nothing appears, and nothing is
not an answer. That sentence turns out to be load-bearing twice more, in §8 and
§9 below.

The asymmetry is honest rather than awkward. The app knows your commitments
because you made them; it cannot know Marco's because that blindness is the
entire point of per-Group Availability.

### 2. Blocking was never actually on the table

§4 asked warn-or-block, and ticket 01 said warn. Worth recording that this was
not only a preference: ticket 04 made the constraint
`exclude using gist (cal_id with =, tstzrange(starts_at, ends_at) with &&)`, so
a cross-cal *block* needs a new cross-cal constraint or trigger — precisely the
coupling per-Group Availability exists to remove. Warning is the only option
that does not spend that decision a second time.

You proceed, and the resulting state is legal everywhere afterwards. No badge on
either Hangout, no conflicts list, no re-warning on reopening. §5's machinery is
untouched: the per-cal exclusion constraint still converts a losing confirm race
into a Join of the winner, and this mark sits in front of that without touching
it.

### 3. The predicate

You are busy at a proposed range when there is a Hangout **in any cal you are a
Member of**, where you are a **Participant with `left_at is null`**, that is
**not Past**, whose range **overlaps at all** — mirroring v1 ticket 08 §5's "any
overlap, however small", which is already how Join decides to offer itself.

Not counted, each for its own reason:

- **Hangouts in your cals you are not on.** Other people's plans, not your
  commitments.
- **Your Availability elsewhere.** `CONTEXT.md` has silence meaning nothing; the
  converse is that a drawn Slot is an offer, not a promise. Only a Hangout is a
  commitment.
- **Hangouts you Left.** Ticket 10 made Left the outcome of leaving a cal too,
  and the Membership row goes with it, so those fall out of `my_cal_ids()`
  anyway. The predicate is right twice over.

The current cal satisfies the predicate and can never fire in it, since its own
exclusion constraint makes the overlap impossible. **Left in rather than
special-cased**, so one predicate stays correct if that constraint ever moves.

**The read is free and needs nothing new.** After ticket 04 `hangout` is
`cal_id in (select private.my_cal_ids())`, so "Hangouts in cals I am in" is
already readable. No RPC, nothing for
[ADR-0003](../../docs/adr/0003-exposed-security-definer-rpcs.md) to audit, and
no policy change.

### 4. The rule that keeps §2 and §5 from contradicting each other

**The mark appears on a commitment you could take on, never on one you hold.**

Without it the ticket is self-contradictory: §4 says nothing marks the
double-booked state afterwards, and the mark also belongs on Hangout cards,
which is where Join and Rejoin live. The boundary is the offer. A Hangout card
offering `Join?` carries the mark; the instant you are a Participant it is not
an offer and the mark is gone — even though the conflict is still true, and now
permanent.

Confirming therefore makes the mark vanish from the card that was just clicked.
That is correct, not a glitch: the warning was about a decision, and the
decision is made.

This is written out because a builder reading §2 and §5 separately gets it
wrong, and it is the same rule that keeps **drawing Availability** unmarked —
drawing is an offer, not a commitment, so it is not an act the mark covers,
either as source (§3) or as target.

### 5. Four acts, not two — and where each one renders

§2 named confirm and Join. **Ticket 10 added a third after this ticket was
written**: Rejoin is unconditional and writes the Availability to cover the
range, which makes you a Participant exactly as the other two do. Retime is the
fourth, and it moves a Hangout you already hold onto a time you may be committed
to elsewhere.

- **Confirm, Join and Rejoin** are cards, and get the mark.
- **Retime** gets a line in its Dialog (§7).
- **The grid gets nothing.** Faint shading of your other cals' commitments was
  considered and rejected: the grid is the cal's shared surface, per-Group
  blindness is the point of it, and another cal's commitments drawn on it —
  however faintly, however private — make it no longer "what this cal knows."
  It would also collide visually with Availability and Hangouts, which are the
  two things it exists to draw.
- **The Candidate list never reorders.** Demotion is *available*, since
  `CONTEXT.md` already has Hidden driving ranking per viewer, and it is still
  wrong: the list's order is an argument about the cal, your commitments are an
  argument about you, and folding one into the other makes a shared-looking list
  secretly personal — with no way to tell a Candidate that sank from one that
  was never there.

### 6. Its form, and the colour it does not get

**No new token.** `--destructive` is already spoken for by `hangout-card.tsx`,
which uses it for a Hangout happening **now** — border, text, and a `now` pill —
so borrowing it puts two unrelated red signals on the same card. There is no
amber, and inventing one for a single mark on a deliberately non-blocking
nicety is not worth a palette entry.

The mark is a **fourth line in the slot the `insideLabel` container line already
occupies** (`text-[11px] text-muted-foreground`), with a `lucide` `CalendarClock`
carrying the weight instead of a hue. `AlertTriangle` overstates something that
cannot stop you. It renders **on touch as well as desktop** — the tick hides
under `@media (hover: none)` because it is a control, and this is information,
so it does not follow that rule.

### 7. What it says, and the one place §3's answer narrows

§3 asked whether it names the other cal. **It does**, and the screenshot
objection does not hold: the person holding the screenshot is you, you could
type the cal's name into a message in a second, and `CONTEXT.md` already has the
Code as "an address, not a secret". Nothing in this product defends against a
Member choosing to disclose. What naming buys is the difference between an
actionable warning and a superstition — "you are already busy then" sends you
hunting through your own cals to find out whether it even matters.

**On the card, the naming is deferred one tap**, and this was re-tested against a
width rather than assumed. The card is a narrow sidebar card whose rows already
carry a date, an `everyone` pill, a time, the faces and sometimes a container
label; `spiritually unemployed` plus a title plus a range truncates. So:

- **Card**: the time only — `Busy 20:00 – 21:00`. That is the part that says
  whether the conflict matters at all (a thirty-minute sliver of a four-hour
  Candidate is a different fact from total overlap), and it is bounded at exactly
  one range however anybody names their cal.
- **Detail, retime dialog**: the full naming — the cal, the Hangout, the time.

One tap on a card that is already the route to everything is not a hunt, and a
truncated cal name is worse than no cal name, because it costs the width and
cannot be read.

**Multiplicity splits the same way.** Two cals can each hold a 20:00 Hangout you
are on, so a third cal's Candidate can collide with both. The card names the
**earliest-starting one** and says "and 1 other"; the detail carries the full
list, drop-dialog style. That preserves `drop-dialog.tsx`'s principle — name
every Hangout, because a count is a sentence with the information taken out —
on the surface that has room to honour it.

**Nested cards do not inherit.** Each computes from its own range: a child
Candidate that does not reach 20:00 is not conflicted and must not say it is.

**No `GMT+2` marker on this string, ever.** Ticket 08 fires that only when a
Member's mirrored zone differs from yours, which is a per-cal test — and two
rosters could answer differently when the string describes another cal's
Hangout. The question dissolves rather than needing an answer: the frame exists
to disambiguate between *Friends* reading the same string, and this string is
rendered for exactly one person, in that person's own zone, and nobody else will
ever see it.

### 8. Retime is the best instance of the whole feature

§6 asked whether retime is deliberately quieter. It is the opposite. Its Dialog
already states its consequence above the controls ("Marco, Sara and Luca will be
marked free Tue 19:00–21:00"), so it is the one surface with somewhere to put
this — and unlike every other surface here, retime is **live**. The picker moves,
so the conflict appears and vanishes as you choose.

Its own line directly under the consequence block, **recomputing as the picker
moves**. Everywhere else the mark comments on a time somebody else proposed;
here it steers you off the collision while the control is still in your hand.

### 9. Snapshot, not live — and it must land with the first paint

A **snapshot, refreshed when the view window or the current cal changes.** These
are your own commitments, made by you, elsewhere; one landing during the seconds
you are looking at this grid is rare, and the cost of missing it is one warning
that was never binding anyway.

It is a **third parallel fetch on the gate `use-hangouts` already has** for its
hangout pages and participant pages — narrow, wanting only your own non-Left
Participant rows in your *other* cals over the window, not every Hangout in every
cal you are in. Landing with the first paint is not a nicety: a mark
materialising late, under a cursor already reaching for the tick, is worse than
one that was never there.

**And when it fails it fails like its siblings**, taking the list's existing
failure path rather than quietly rendering an unmarked list. This is §1's rule
biting: a failed fetch that draws no marks converts "nothing is not an answer"
into an answer, and a wrong one.

### 10. The accessible name, because a mark in pixels is not a warning

The tick carries `aria-label={`Confirm ${when.date}, ${when.range}`}`, verbose on
purpose so a flat list does not give a screen reader six identical buttons. A
mark rendered as a line in the card body is read when the body is read — and
somebody tabbing straight to the tick never hears it, which would make this
invisible to exactly the users who cannot glance at it.

So the accelerator's label gains the conflict when there is one:
`Confirm Sat 6 Sep, 20:00 – 23:00 — you are busy 20:00 – 21:00 elsewhere`. Same
for `Join?` and Rejoin.

### 11. What was checked and needed nothing

- **`CONTEXT.md` gains nothing.** Looked for rather than assumed. This adds no
  term: it is an affordance over Participant, Hangout and Group as they already
  stand. Same call ticket 08 made about a mirrored device setting.
- **No ADR.** Reversible, unsurprising, and the trade-off underneath it (warn,
  never block) is recorded in ticket 01 and *enforced* by ticket 04's constraint.
  Nothing here for a future reader to wonder at.
- **It is invisible today.** Every cal in existence has everybody in it, so
  nobody is in two, so this shows nothing to anyone until the second cal exists —
  the same shape as ticket 08's zone markers.
- **It is the first consumer of cross-cal data**, which open ticket 12 needs to
  know. Recorded there.
