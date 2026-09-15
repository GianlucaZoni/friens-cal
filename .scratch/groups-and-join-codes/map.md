# Map: friens-cal — many Groups, joined by Code

Label: `wayfinder:map`

## Destination

A build-ready spec and issue set for turning friens-cal's one implicit Group
into **many named Groups, each entered with a Code** — complete enough to hand
to `/to-issues` and have an agent build without inventing anything. The map is
done when no decision a builder would otherwise guess at is still open.

Planning only. Nothing here ships production code; prototypes are throwaway.

This effort reverses one line of the v1 map's Out of scope section
("Multiple groups / circles… a separate effort if it is ever wanted"). It is
that effort.

## Notes

- **Domain**: `CONTEXT.md` at the repo root, updated by this effort's ticket 01.
  **Group** is redefined — no longer singular and implicit, now many, named and
  joinable — and **Code**, **Membership** and **Invite** are new terms. Use them
  exactly. The UI says "friens cal"; the code says Group.
- **Decisions**: `docs/adr/0001` (Supabase), `docs/adr/0002` (cross-Friend
  availability writes, plus its 2026-09-02 amendment). ADR-0002's RPC must gain
  a Group — see ticket 04.
- **The v1 map is the prior art and is still binding**:
  `.scratch/shared-availability-calendar/map.md`. Nineteen resolved tickets. Do
  not re-decide anything it settled; zoom into the ticket instead. Its
  `Decisions so far` is the index.
- **The v1 build issues** are `.scratch/friens-cal-v1/issues/` — sixteen, all
  built and deployed. Production is **https://friens-cal.vercel.app**.
- **Skills**: every session calls `grilling` and `domain-modeling`. Prototype
  tickets also call `prototype`; research tickets call `research`. UI tickets
  call `shadcn`.
- **Stack**: Vite + React 19 SPA, Base UI via shadcn `base-lyra` style, Tailwind
  v4, MobX-State-Tree available but unused, `lucide` icons, Supabase for data and
  auth. Live project `mvvxyzqbdkkauxkltavw` (EU).
- **The human is new to Supabase.** Any session touching it explains the core
  concepts as it goes rather than assuming them.
- **This effort touches every table.** Per-Group Availability (ticket 01, Q4)
  means `availability`, `hangout`, `hangout_participant` and `friend` all change
  their policies, and the first two change their keys. There is no
  new-table-only version of this.
- **There is live data.** The migration is real, but small: one Group,
  "spiritually unemployed", everybody in it, every existing row backfilled.

## Decisions so far

- [01 — Destination, scope, and the shape of a Group](issues/01-destination-and-scope.md):
  the full charting grill, seventeen answers. **Group is redefined** rather than
  a new word (`CONTEXT.md` reserved it). **Both gates survive**: the email
  allowlist still says who may hold an account, the Code says which Groups you
  are in — so **the Code guards nothing** and can be short, permanent and shown
  openly. **Availability is per Group**, against the recommendation, which drags
  a `group_id` through every table and makes cross-Group blindness deliberate.
  **Identity stays global**, hue collisions accepted. **Any Friend may invite**
  (with `invited_by` provenance), rename, and leave; nobody may remove anybody
  or delete a Group. `/g/:id` with an opaque id; `/` is always the
  join-or-create page. Codes are **six characters** in an unambiguous alphabet,
  entered through shadcn **Input OTP**.

- [02 — Membership-aware RLS, without the recursion trap](issues/02-membership-rls-research.md):
  the guide gained an **"Avoid recursive policies"** section after v1 asked, and
  it settles the shape. Two helpers in a **`private`** schema, returning
  **`setof uuid`** rather than a boolean — because a boolean takes the row's own
  id as an argument and forfeits the per-statement `initPlan` caching. `friend`'s
  policy needs an `id = (select auth.uid())` arm or **a new Friend cannot read
  their own row on the join-or-create page**, which is every account's first
  screen. `membership` becomes the hottest object in the schema and needs its own
  index on `friend_id`. **ADR-0002's "unresolved sharp edge" is closed for policy
  helpers** (`private` is not an exposed schema) and stays open for RPCs — which
  matters, because joining by Code needs one (→ ticket 11). And **v1's
  Realtime-delete reasoning does not survive per-Group Availability** (→ ticket
  12). Four items recorded as could-not-confirm rather than inferred.

## Not yet specified

- **"Copy my availability from another cal."** Born the moment Availability went
  per Group: a Friend in three cals draws the same Saturday three times. A
  sibling of the v1 map's "Copy last week", and deliberately not designed now —
  revisit once somebody has actually been in two cals for a week.
- **The hue clash nudge on join.** Setup happens before you belong to anything,
  so the taken-hue bias sees an empty roster and you may land on a colour the
  cal you join already has. Collisions are cosmetic now (v1 ticket 15 took
  per-Friend colour off the grid), so this is a nicety, not a defect.
- **Whether the allowlist ever gets a reading screen.** Ticket 07 designs
  writing to it. Reading it back is still the SQL Editor, and with invites
  self-serve, "who is in this product and who vouched for them" becomes a
  question somebody will eventually ask from inside the app.

## Out of scope

- **Removing a Friend from a Group.** Settled in ticket 01: nothing in v1
  removes anybody from anything, and a kick is a social feature with a blast
  radius. You can leave; you cannot be made to.
- **Deleting a Group.** A Group whose last member leaves lingers, empty, and its
  Code still works. Deleting would cascade through Hangouts and Availability
  with no undo, to save a row nobody can see.
- **Rotating a Code.** Codes are permanent. Rotation only earns its place as a
  lock-someone-out mechanism, and there is nobody to lock out.
- **Open signup / the Code as the only gate.** Ticket 01 Q3 kept both gates. An
  open door would also collapse ADR-0001's footing for disabling email
  confirmation, which was only defensible because the `before-user-created` hook
  meant an unconfirmed address could never belong to a stranger.
- **An Invite that carries a destination Group.** Inviting admits somebody to
  the product; a Code admits them to a cal. Folding the two would put a pending
  membership in a table with no Friend row to point at, and give an Invite a
  lifecycle (expiry, revocation, what if they join by Code first) it does not
  otherwise need.
- **Per-Group identity, or per-Group hue.** One face, one name, one colour,
  everywhere. v1 ticket 11 already accepted hue collisions on principle.
- **Forbidding cross-Group double-booking.** Ticket 09 warns *you*. Actually
  preventing it needs the cross-Group read that per-Group Availability exists to
  prevent.
- **Per-viewer time zone rendering** is *not* here — it is a live question, see
  ticket 08.
