# CONTEXT

Glossary for `friens-cal`. Terms only — no implementation detail, no decisions
(those live in `docs/adr/` and in the wayfinder maps at
`.scratch/shared-availability-calendar/map.md` and
`.scratch/groups-and-join-codes/map.md`).

## Friend

A person with an account. There is no open signup: holding an account at all
requires an Invite, so there is no concept of a stranger. A Friend belongs to
any number of Groups, including none. Prefer "Friend" over "user" or "member" in
UI copy and code; the `auth.users` row Supabase creates for them is not the
Friend, it is the credential behind one.

A Friend is one person everywhere. Their name, face and colour do not vary from
Group to Group, and two Friends in different Groups may share a colour without
it meaning anything.

## Group

A named shared calendar, and the boundary around everything drawn on it. There
are many, a Friend may be in several, and the product calls one a **friens
cal**.

A Group is the unit of privacy as well as of grouping: Availability, Candidates
and Hangouts belong to exactly one Group and are invisible outside it. A Friend
in two Groups states their Availability in each separately, and neither can see
what the other knows — including when the same Friend is committed in both.

A Group keeps one fixed time zone. It is never deleted: a Group nobody is left
in simply persists, and its Code still works.

## Member

A Friend in a Group. Membership is entered by Code and left voluntarily; nobody
can be removed by anyone else, and no Member outranks another. Renaming a Group,
sharing its Code and confirming plans in it are open to every Member equally.

## Code

The six characters that let a Friend into a Group. Every Member can see it and
is expected to share it — it is an address, not a secret, and it never changes.
Holding a Code is not admission to the product: it moves a Friend who already
has an account into a Group, and nothing more.

## Invite

Permission for one email address to hold an account at all, granted by a Friend
and recorded against their name. It admits somebody to the product, not to any
particular Group — an invited person still needs a Code to reach a calendar.

Invite and Code are the two independent gates, and neither substitutes for the
other.

## Slot

Half an hour, on the one grid the whole product is drawn on. It is the smallest
thing anybody can say anything about: nothing in the product refers to a moment
finer than a Slot, and every Availability, Candidate and Hangout begins and ends
on one.

A day is **not** always forty-eight Slots. The Group keeps one fixed time zone,
and twice a year that zone gives a day twenty-three hours or twenty-five.

## Availability

A statement by one Friend, in one Group, that they are free for one Slot:
*(group, friend, slot)*. It has no title, no participants and no invite state —
those belong to a Hangout.

It is scoped to its Group and says nothing anywhere else. A Friend free on
Saturday in two Groups has said so twice, and a Friend who is busy in one Group
is silent rather than unavailable in the other.

Availability is **binary**: a Slot is drawn or it is not. There is no "maybe",
and there is no half a Slot.

A Friend who is free all evening holds a **run** — Slots that happen to sit next
to each other. Say "run", not "range": a run is what a person sees and points
at, but it is not a thing the product holds. It has no identity, no start and no
end of its own; it is only ever its Slots, and it grows, splits and vanishes as
they do. Drawing a Slot you already hold changes nothing, so **merging never
happens** — there is never anything to merge.

Not having drawn Availability is **silence**, not a claim of being busy — but
the tool cannot tell the two apart, and so treats silence as unavailable. The
sidebar marks Friends who are entirely silent in the current view.

## Hidden

A Friend whose Availability is currently filtered out of the calendar by the
viewer. Hiding is a **query tool**, not a blocklist: it defines *who the viewer
is currently trying to meet*, and therefore drives Candidate ranking as well as
the grid. It never hides Hangouts.

## Candidate

A **computed** suggestion, within one Group: a run of Slots in which two or more
non-Hidden Members all have Availability. A Candidate is not stored and has no identity — it exists
only as long as the Availability underneath it does, and it is recomputed
whenever that changes.

## Hangout

A **committed** record that a set of Friends is meeting at a given time, created
by confirming a Candidate in one Group. It survives changes to the Availability that
produced it, carries an optional title, and is visible to every Friend —
including those who are not Participants.

Unlike Availability, a Hangout **is** a range, with a start and an end of its
own. That is what lets it outlive the Availability underneath it: a run
disappears when its Slots do, and a Hangout does not.

Candidate and Hangout look alike on screen and are entirely different things:
a Candidate is a live derivation, a Hangout is a fact that was written down.

## Participant

A Friend on a Hangout. The list is **stored**, seeded at confirmation, and moves
in one direction on its own: removing Availability that covered the Hangout
**drops** you, but adding Availability never **adds** you. Getting in is always
a deliberate act (see Join); getting out can be too (see Left).

## Join

The deliberate act of becoming a Participant in an existing Hangout. It also
writes the Availability to cover it — joining is a statement that you are free.

## Left

An explicit marker that a Friend removed themselves from a Hangout. It outranks
Availability permanently: a Friend who Left is never re-added by drawing
Availability, and is never re-offered automatically. Leaving does not erase the
Availability underneath.
