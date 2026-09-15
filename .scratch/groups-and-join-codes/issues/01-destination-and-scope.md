# 01 — Destination, scope, and the shape of a Group

Type: grilling
Status: resolved

## Question

What is this effort finding its way to, and what is a "friens cal" in the
domain? The loose idea: a larger pool of friends, a join-or-create page after
sign-in, Codes to share, and the `friens` label in the sidebar becoming a
switcher.

Everything downstream hangs on how a Group relates to Availability, to identity,
and to the email allowlist that currently gates the whole product.

## Answer

Seventeen decisions, from three rounds of grilling. Grouped by what they settle.

### The destination

**A build-ready spec and issue set, planning only** — the same shape as the v1
map, which worked. The migration's *plan* is in scope; running it is the build's
job.

### The domain

**Group is redefined, not replaced.** `CONTEXT.md` already reserved the word:
"Its existence as a term only matters because a future effort may introduce
several." It stops being singular and implicit and becomes many, named and
joinable. "Circle" was rejected as a second word for a thing the glossary
already names; "Cal" as too close to the grid the whole product is drawn on,
which `src/shell/calendar.tsx` already owns.

**The UI says "friens cal"; the code says Group.** The same split `CONTEXT.md`
already makes for Friend.

**Code**, **Membership** and **Invite** join the glossary. See `CONTEXT.md`.

### Both gates survive, and that is the load-bearing decision

**The email allowlist stays** as the gate on holding an account at all; the Code
gates which Groups you are in. Three options were live — kill the allowlist and
let the Code be the only gate; keep both; or widen the allowlist and treat the
Code as convenience — and the middle one won.

**The consequence is the point: a Code that guards nothing can be short,
permanent and shown openly**, which is exactly what a right-aligned muted column
on a list of cals wants. Every design decision about the Code below follows from
this and not from taste.

Killing the allowlist was rejected on a second ground as well. ADR-0001 disabled
email confirmation entirely, and that was only defensible because the
`before-user-created` hook meant an unconfirmed address could never belong to a
stranger. Open signup removes that footing and leaves unreachable `auth.users`
rows the app cannot delete.

**Any Friend may add an address to the allowlist**, from a screen in the app.
Keeping it hand-edited would have made the human the bouncer for the entire
product forever: a Friend creating a cal for their climbing group could not
admit any of them without a trip to the SQL Editor. The list changes meaning —
from "people Gianluca vetted" to "people some Friend vetted" — which is honest
for a friends-of-friends product.

**`allowlist` gains `invited_by`**, at the human's request. The table stops
being a bare list and becomes a record of who vouched for whom.

**An Invite is admission only.** It does not carry a destination Group. See the
map's Out of scope for why.

### Availability is per Group

**Against the recommendation.** Global Availability was argued for — `CONTEXT.md`
defines Availability with no Group in it, it needs no migration at all, and it
spares a Friend drawing the same Saturday in three cals. The human chose per
Group anyway ("tedious but good for now"), which buys complete separation and
costs:

- `availability` gains `group_id`; its primary key becomes
  `(group_id, friend_id, slot_start)`.
- `hangout` gains `group_id`, and its exclusion constraint becomes per Group.
- ADR-0002's `retime_hangout` RPC must derive a Group as well as a range.
- Every existing row is backfilled into one Group.
- Cross-Group blindness becomes **deliberate**: your uni cal cannot see that
  your climbing cal has you at 8pm. Ticket 09 is what we do about that.

### Identity is global

One name, one blobatar, one hue, everywhere. **Hue collisions are accepted**:
v1 ticket 11 accepted them on principle already ("the blobatar's shape is what
disambiguates"), and ticket 15 took per-Friend colour off the grid entirely in
favour of a single-hue heatmap in the viewer's own colour, so a collision is now
cosmetic. The taken-hue bias degrades from a guarantee to per-Group advice.

**Setup still comes first**: sign up, `/setup`, then the join-or-create page.
Identity precedes any Group. The known wrinkle is in the map's fog.

### Size

**A cal stays small**, five to ten. "Larger pool" means more cals, not one
inflated cal — which is what the design implies anyway. This matters because
several v1 decisions have hard ceilings: ticket 14's month cells wrap avatars
and explicitly refuse a `+N` overflow, ticket 09's Candidate pipeline extends
Friend-sets maximally before pruning, and the client loads every Friend's
Availability from today forward into memory. None of them are being asked to
stretch.

### Visibility

**The roster is scoped to shared Groups.** `friend` is `using (true)` today:
every Friend reads every Friend. With a larger pool spread across many cals that
means everyone in the product can read everyone else's name, blobatar and hue,
including people they share nothing with. It is a leak that grows with exactly
the thing being grown, and far harder to retrofit than to write now.

This is the hard part of the effort, not a policy tweak — a membership-aware
policy on `friend` is the classic Supabase RLS recursion trap. Ticket 02.

### Routing

**`/g/:id`, with an opaque id.** `/g/:CODE` was tempting — the address bar
becomes a shareable invite — but it welds the Code to every bookmark, so the
Code could then never change, and it becomes a live invite link the day signup
opens. `localStorage` was rejected outright: it breaks deep links, which
`.scratch/friens-cal-v1/issues/16-deploy-to-vercel.md` went to the trouble of a
catch-all rewrite to preserve, and it breaks two tabs on two cals.

**`/` is always the join-or-create page**, never a bounce to the last cal used.
A redirect would make the page unreachable.

**The landing page and the dropdown are the same list, and that is fine.** The
landing page shows Codes inline because it is for sharing; the dropdown hides
them one level down under the three dots because it is for switching. No "all
cals" item is needed in the dropdown — the dropdown already does everything the
landing page does.

### The Code

**Six characters**, uppercase, from an alphabet with `0 O 1 I L U` removed so
nothing is ambiguous read aloud. Case-insensitive on input, uppercase on
display. ~1e9 combinations, so collisions are a unique constraint and a retry.
Word-based codes (`brave-otter-42`) were rejected as three times as wide in a
list column.

**Codes never rotate.** Rotation earns its place as a lock-someone-out
mechanism, and nobody can be locked out.

**Entry is shadcn Input OTP**, at the human's request. Not currently installed,
and whether `base-lyra` ships it is ticket 03.

### Who may do what

Flat trust, consistent with every Hangout policy in the codebase being
`using (true)` and with v1 issue 10's finding that provenance earns its place
*because* anybody may cancel anybody's plan:

- **Rename**: anyone in the Group. No owner, no creator privilege.
- **Leave**: yes. Your Availability in that Group goes with you and you are
  marked Left on its Hangouts. The mechanics are ticket 10 — the existing strict
  drop trigger and the auto-cancel both fire on exactly this.
- **Remove someone else**: no.
- **Delete a Group**: no. A Group whose last member leaves lingers and its Code
  still works.

### Double-booking

Per-Group Hangouts mean the exclusion constraint stops protecting *you*: two
cals can each confirm 8pm Saturday and neither can see the other. **Warn you,
and only you** — you are a Participant in both, so the app can read both without
exposing anything to anybody. It cannot warn you that Marco is busy elsewhere,
and it must not try. Ticket 09, deliberately a later ticket rather than a
founding one.

### Time zone

**A Group gets a `time_zone` column now**, defaulting to `Europe/Rome`, so
nothing changes for the existing cal. Nearly free while the table is being
created, and a second migration if skipped.

The human asked whether the grid could instead read the device's zone. It can,
but that *is* per-viewer time zone rendering, which the v1 map ruled out for a
reason. Storage is instants, so formatting is trivial; the cost is the **day
column boundary**. A day starts at midnight somewhere, so a viewer in London and
a viewer in Rome have Saturday columns covering different instants, and "free
Saturday evening" stops being one shared statement.

Those are two separable things and both are wanted:

- **The Group's zone** is what the Group *means* by Saturday. That is the
  column.
- **The viewer's zone** is what the viewer's grid draws. That is ticket 08.

Either way the column is not wasted.

### The migration

**Preserve, and it is small.** Everything that exists today becomes one Group,
named **"spiritually unemployed"**. Every existing Friend is a Member of it.
Every existing `availability` and `hangout` row is backfilled to it with a
single `update`, because there is exactly one Group to backfill to. Every
existing `allowlist` row gets `invited_by` set to the human.
