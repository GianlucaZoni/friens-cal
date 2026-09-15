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

- **Domain**: `CONTEXT.md` at the repo root, updated by this effort's tickets 01
  and 08.
  **Group** is redefined — no longer singular and implicit, now many, named and
  joinable — and **Code**, **Membership** and **Invite** are new terms. Use them
  exactly. Three words became two in ticket 04: the glossary concept is
  **Group**, the identifier is **`cal`** (`group` is reserved in Postgres),
  and the UI string is "friens cal".
- **Decisions**: `docs/adr/0001` (Supabase), `docs/adr/0002` (cross-Friend
  availability writes, plus its 2026-09-02 amendment), and **`docs/adr/0003`
  (exposed `security definer` RPCs), written by this effort** — read it before
  adding any function the browser can call. ADR-0002's RPC must gain a Group —
  see ticket 04.
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
  means `availability`, `hangout` and `hangout_participant` all change their
  policies, and the first two change their keys. There is no new-table-only
  version of this. **`friend` changes least and for a different reason**: ticket
  04 kept its `using (true)` read policy, because identity is global by
  decision, and ticket 08 then gave it a `time_zone` column that is a mirror of
  the device rather than a setting. Its policies do not move.
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

- [03 — Does `base-lyra` ship Input OTP](issues/03-input-otp-research.md): **it
  does, and ticket 01's choice stands.** One file, `input-otp@^1.5.0`, zero
  runtime dependencies, so the Radix-versus-Base-UI worry dissolves — it draws
  its own slots from theme tokens and never touches this project's `Input`. The
  work is in **four defaults that are all wrong for a join Code**: `pattern`
  compiles with no flags and is tested *before* `onChange`, so uppercasing in the
  handler cannot rescue a lower-case keystroke and the pattern must admit both
  cases; `pasteTransformer` is a prop that runs before the pattern test;
  `inputMode` defaults to `numeric` for an alphanumeric code; and `autoComplete`
  defaults to `one-time-code`, inviting an SMS autofill that will never come.
  Accessibility is thin. Two things left for the human: the CLI writes
  `import { cn } from "cn"` against this repo's 27-file `@/lib/utils` convention,
  and **Base UI has shipped its own OTP Field** since 1.4.0, one `normalizeValue`
  prop where this is three, behind a bump from the locked 1.2.0.

- [11 — Joining by Code needs a second exposed `security definer` RPC](issues/11-joining-by-code-needs-a-second-rpc.md):
  **two**, not one — `create_group(name)` as well, because a Group insert and a
  Membership insert that are not atomic orphan a Group **nobody is in and nobody
  can reach**, and PostgREST spans neither. It also houses Code generation with
  retry-on-collision, which a column `default` cannot do for itself. **ADR-0002
  turned out not to be threatened at all**: its property is scoped to
  cross-Friend *Availability* writes and neither function touches
  `availability` — this ticket's own framing misquoted it, and the correction is
  recorded in the answer. The judgement instead graduates into
  **[ADR-0003](../../docs/adr/0003-exposed-security-definer-rpcs.md)**, whose
  load-bearing rule is **the caller can never name another Friend**: arguments
  say *what* and *where*, never *who*. **Joining is immediate** — a
  preview-then-confirm step is a pure enumeration oracle that lets somebody
  probe Codes without leaving a Membership row. A bad Code raises, a Code you
  already hold is **idempotent** rather than an error, and success returns the
  Group row. **Brute force is accepted and recorded**: the allowlist means the
  attacker must be someone a Friend vouched for by name, and a successful guess
  appears in a roster.

- [04 — The Group, Membership, and dragging `cal_id` through everything](issues/04-group-schema-and-migration.md):
  the schema the build is generated from, fourteen answers. **The table is
  `cal`** — `group` is fully reserved in Postgres — so the product has two words
  and not three: concept **Group**, identifier `cal`, UI string "friens cal"
  (**[ADR-0003](../../docs/adr/0003-exposed-security-definer-rpcs.md) amended**,
  the RPCs are `join_cal` and `create_cal`). Two findings outrank the rest.
  **The lifecycle triggers are group-blind and that is now a bug**: erasing your
  Saturday in one cal would drop you from another cal's Saturday Hangout, and
  both join predicates have to gain `cal_id`. And **ticket 02's second helper is
  dropped** — `friend` keeps `using (true)`, because `CONTEXT.md` declares
  identity global and co-member scoping would render a Friend who left as a
  **nameless, faceless Participant** on the past Hangouts they keep. One policy
  helper, not two. `availability` **references `membership`** rather than
  `friend`, so leaving a cal erases your Availability there by cascade;
  `hangout_participant` does not, because a Participant row is a record that you
  were there. Its redundant `cal_id` is held honest by a **composite FK**.
  Leaving is a **plain `delete`**, so ADR-0003's audited set stays at three. The
  client's two-part `slotKey` **survives untouched** (one cal on screen at a
  time); the indexes do not. **The migration accepts an outage** and says so: the
  moment the key widens, the deployed client's every draw fails, and at three
  Friends a reload beats a deploy in the middle of a migration. Three files,
  `08`–`10`. `CONTEXT.md` needed no change, and that was checked rather than
  assumed.

- [05 — Prototype: the join-or-create page, and the Code's three dialogs](issues/05-join-or-create-page.md):
  three variants built and driven, and **the brief survives contact on all five
  questions**. The empty state reads as *not yet* rather than as nothing,
  because it is the same card a Friend keeps forever. **Two dialogs in a row on
  create stand**: the modal earns its place as the one moment the Code is
  unmissable, and a Friend who dismisses it still has the Code on the list
  behind it. **Input OTP beat a plain formatted input**, built alongside it
  precisely so the comparison was real: six boxes say *six characters, exactly*,
  and the verification-code feeling is roughly true for a Code somebody just
  sent you. One thing changed: **the Code gets a copy button, and the list row
  stops being a single button to make room for it** — a row that navigates
  swallows any attempt to drag-select the Code inside it, so select-and-copy was
  never on offer in the first place. Ticket 03's `input-otp` corrections are now
  **verified rather than inferred**: lower-case typing survives the two-case
  pattern, and `aria-hidden` cleans the accessibility tree. Three things the
  build must carry: the registry rewrites the `cn` import on every
  `shadcn add`, the screen-reader pass is still owed, and the list has no
  ordering rule — which **ticket 06 now settles for both surfaces**.

- [07 — Inviting a Friend, and the enumeration leak it reopens](issues/07-inviting-and-the-leak.md):
  eight answers, and two findings the ticket did not have when it was written.
  **`allowlist` never had an `invited_by` column**, so this is a schema change
  and the five seeded rows carry a null inviter forever. And **ADR-0003's
  condition 1 cannot be met by an invite function**: its only meaningful
  argument is a person's address, which is *who*. The rule was not widened.
  **The function was not written**, and the audited set stays at exactly three
  for the second time in this effort ([ADR-0003 amended
  again](../../docs/adr/0003-exposed-security-definer-rpcs.md)). The lever was
  the **read** side: "show me my own invites" was refused because it needs a
  `select` path on the address table, and `07-allowlist.sql` is built end to end
  on nothing there being readable by a publishable key. With no read, the write
  is a **plain `insert` grant** plus `with check (invited_by = (select
  auth.uid()))`, one verb wide, upserted `on conflict do nothing` with
  `return=minimal` so the response cannot distinguish a new address from a known
  one. The inviter therefore learns nothing about prior state, and the copy
  states an outcome rather than an event: *"rob@gmail.com can now create an
  account."* **A typo is a live door, not a mess**: `friend` is `using (true)`,
  so a mistyped address buys a stranger the whole roster. No delete ships;
  **confirm-before-write** is the mitigation, and the radius is recorded as
  accepted alongside unlimited invite writes. The dialog lives in the blobatar
  menu, is disabled until a Friend row exists (the FK, not ticket 18's reason),
  and is shaped as **two steps whose second one is yours** — there is no email,
  so it hands over a pasteable sentence carrying the origin and the current
  cal's Code. **The row stays cal-free**: ticket 01's ruling governs what the
  row holds, not what a human sends. The check constraint tightens to
  `lower(btrim(email))`, because the old one let a trailing space through and
  that row would match the hook never. One file, `11-invite.sql`. `CONTEXT.md`
  needed no change, and that was checked rather than assumed.
- [08 — Whose time zone does the grid draw](issues/08-whose-time-zone.md): the
  grid draws **the viewer's zone**, against the recommendation, and **`cal.time_zone`
  is dropped before it is ever written** — once every grid is its own, nothing
  asks what the cal means by Saturday, so ticket 01's "either way the column is
  not wasted" turns out to be the one part of its split that did not survive.
  Two things were found by looking rather than reasoning. **A hybrid already
  ships and nobody chose it**: `startOfDayInZone` has always read the *device's*
  civil date and only reinterpreted it in Rome, so per-viewer is the only
  position consistent with what is deployed. And **overlap is exact-instant
  matching**, which makes a `:45` zone silently produce no Candidates and then
  fail `hangout_on_the_slot_grid` on confirm — so slots are pinned to the
  absolute `epoch % 1800 = 0` grid and `availability.slot_start` gains the check
  `hangout` already has (→ ticket 04's file `09`). A Friend's zone is a
  **mirror** of the device, written on sign-in, never a setting, and read only
  by other people: the roster shows `8h ahead` when it differs. A time string
  names its frame as **`GMT+2`** — `CEST` is unusable, because `Intl`'s `short`
  is locale-*inverted* (`en-GB` gives Rome `CEST` and New York `GMT-4`; `en-US`
  gives the reverse) — and only when the cal actually spans zones, so every cal
  today shows nothing. DST needed nothing built and that was checked. **No ADR**:
  the whole decision is what the words mean, so it lands in `CONTEXT.md`, where
  **Group** loses its clock, **Slot** becomes an instant, and **Availability**
  gains the write side. Reverses the v1 map's per-viewer out-of-scope line, the
  second of its rulings this effort has overturned.

- [10 — Leaving a Group, and what goes with you](issues/10-leaving-a-group.md):
  **Left, not dropped** — ticket 01 beats ticket 04's cascade, because a dropped
  Participant is indistinguishable from one who never joined and the sidebar
  **re-offers them the plan they walked out of** the moment they rejoin and draw.
  The finding that outranks the six questions: **ticket 04 §4's "your name stays
  on past Hangouts" does not hold.** Leaving cascades every Availability row
  including past ones, and the drop trigger has no Past exemption — so leaving
  erases you from the cal's history. The shield is **one predicate**: the trigger
  fires after the Membership row is already gone, so it asks whether the Friend
  is still a Member and skips a departure. **The strict drop stays strict** — the
  round-1 fear of reopening v1 ticket 07 §7 was wrong, and the correction is the
  mechanism. Left is written by a **`before delete on membership` trigger**, not
  a fourth RPC, so **ADR-0003's set stays at three** ([amended](../../docs/adr/0003-exposed-security-definer-rpcs.md)
  so the next auditor can find where the Left is written). Order needs no dance:
  one statement, five consequences, RLS never enters it. The dialog names every
  Hangout, says the past is safe, and **shows the Code**, because leaving is the
  moment it becomes unreachable to you. Rejoining needs nothing new — Rejoin is
  unconditional and writes the Availability to cover the range. The control lives
  on **`/`**, which **collides with ticket 05's two-target row** and is handed to
  06 rather than decided. `CONTEXT.md`'s **Left** gained the Group case.

- [13 — Prototype: a run that crosses the viewer's midnight](issues/13-midnight-straddle-prototype.md):
  **an open edge and a chevron, and nothing else** — the composite, the month
  and the Candidate card all come back untouched. Branch
  `prototype/13-midnight-straddle`, which mounts the real grid twice over one
  store. Two findings outrank the five questions. **This ticket's own premise is
  wrong**: a run splits only where the far viewer's midnight lands *inside* it,
  an offset of about +0:30 to +4:00, so "far enough away" is backwards — past
  four hours the evening stops fragmenting and instead lands **whole on a day
  nobody drew on**, which is commoner and which nothing can mark, because
  Availability is slot rows and there is no stored fact that a run has a home
  day. And where it does split it splits into a **30-minute sliver** that reads
  as a mis-click, with the two fragments ~960px apart in the scroller so no
  scroll position shows both. That sliver is what beats *nothing*. The named
  variant lost because its label **truncates at week-column width**, the width
  where splits are commonest, and the card already says it. **The off-screen
  case dissolved**: a chevron pointing *down* is not an arrow at a column, so
  the lie lived in a spelling nobody built — though continuation is still asked
  of the **store** and not of the columns on screen, which is the part the build
  must carry. The month gains a **phantom day** — one more than the drawer's,
  holding a 2½-hour tail and painted as dark as a whole evening, because
  `peakOf` is concurrency and ticket 15 forbade a second channel — **accepted**.
  The Candidate card needed nothing and turns out to be the **authority** the
  split grid defers to: `scanCandidates` runs on instants, so both zones hold
  byte-identical windows and only the words move. Worth building, and **not
  gated on the cal spanning zones**: a Rome Friend drawing 22:00–01:00 gets the
  same two fragments today, so this is a v1 defect per-viewer rendering merely
  makes common.

## Not yet specified

- **"Copy my availability from another cal."** Born the moment Availability went
  per Group: a Friend in three cals draws the same Saturday three times. A
  sibling of the v1 map's "Copy last week", and deliberately not designed now —
  revisit once somebody has actually been in two cals for a week.
- **The hue clash nudge on join.** Setup happens before you belong to anything,
  so the taken-hue bias sees an empty roster and you may land on a colour the
  cal you join already has. Collisions are cosmetic now (v1 ticket 15 took
  per-Friend colour off the grid), so this is a nicety, not a defect.
- **Base UI's own OTP Field, and the `@base-ui/react` bump behind it.** Ticket
  03 found it does in one prop what `input-otp` needs three to do, but it sits
  behind a version bump that every other `base-lyra` component in the project
  rides on. Not worth deciding for one component; worth revisiting the next time
  anything else wants that bump.
- **Whether the allowlist ever gets a reading screen.** Ticket 07 designed the
  write and **refused the read**, and it now has a price rather than a shrug: a
  screen needs a policy-scoped `select` on a table of personal addresses, which
  is the one property `07-allowlist.sql` was built to hold. Removal rides along
  with it, since ticket 07 shipped no delete and a row you cannot see is a row
  you cannot remove. Still fog because nothing on the route needs it, and still
  coming, because with invites self-serve "who is in this product, who vouched
  for them, and how do I undo that typo" is a question somebody will ask from
  inside the app.

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
