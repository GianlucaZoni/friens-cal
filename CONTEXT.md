# CONTEXT

Glossary for `friens-cal`. Terms only — no implementation detail, no decisions
(those live in `docs/adr/` and in the wayfinder map at
`.scratch/shared-availability-calendar/map.md`).

## Friend

A person with an account. Membership is a hand-curated allowlist — there is no
open signup, and no concept of a stranger. Every Friend belongs to the one
Group. Prefer "Friend" over "user" or "member" in UI copy and code; the
`auth.users` row Supabase creates for them is not the Friend, it is the
credential behind one.

## Group

The single shared calendar all Friends belong to. There is exactly one, and it
is implicit — it is never named, switched, or selected in the UI. Its existence
as a term only matters because a future effort may introduce several.

## Availability

A statement by one Friend that they are free for one continuous time range:
*(friend, start, end)*. It has no title, no participants and no invite state —
those belong to a Hangout.

Availability is **binary**: a range is either drawn or it is not. There is no
"maybe". Adjacent or overlapping ranges belonging to the same Friend **merge**
into one continuous range, so a Friend's Availability on any given day is always
a set of non-touching ranges.

Not having drawn Availability is **silence**, not a claim of being busy — but
the tool cannot tell the two apart, and so treats silence as unavailable. The
sidebar marks Friends who are entirely silent in the current view.

## Hidden

A Friend whose Availability is currently filtered out of the calendar by the
viewer. Hiding is a **query tool**, not a blocklist: it defines *who the viewer
is currently trying to meet*, and therefore drives Candidate ranking as well as
the grid. It never hides Hangouts.

## Candidate

A **computed** suggestion: a time range in which two or more non-Hidden Friends
all have Availability. A Candidate is not stored and has no identity — it exists
only as long as the Availability underneath it does, and it is recomputed
whenever that changes.

## Hangout

A **committed** record that a set of Friends is meeting at a given time,
created by confirming a Candidate. It survives changes to the Availability that
produced it, carries an optional title, and is visible to every Friend —
including those who are not Participants.

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
