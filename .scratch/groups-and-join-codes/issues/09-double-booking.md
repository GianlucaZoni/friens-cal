# 09 — Double-booking yourself across Groups

Type: grilling
Blocked by: 04
Status: open

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
