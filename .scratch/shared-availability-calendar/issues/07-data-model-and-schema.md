# 07 — The data model and its policies

Type: grilling
Status: resolved
Blocked by: —

## Question

Design the Postgres schema and the RLS policies that go with it. Per ADR-0001
the policies are the authorization, so a table is not designed until its
policies are.

Expected shape (challenge it, do not assume it):

- **friend** — display name, blobatar seed, palette, expression; the link to
  `auth.users`.
- **allowlist** — the emails permitted to sign up. May or may not be a separate
  table depending on what ticket 02 found.
- **availability** — `(friend, start, end)`, UTC.
- **hangout** — start, end, optional title.
- **hangout_participant** — the stored, seeded list, plus the sticky `Left`
  marker.

Questions to resolve:

1. **Where does merging happen?** Availability merges into non-touching ranges.
   Is that enforced by the client before writing, by a database trigger, or by
   an exclusion constraint? What happens if two of the same Friend's devices
   write overlapping ranges concurrently — does the invariant survive?
2. **Row granularity.** Is one Availability one row spanning hours, or is the
   day sliced into 30-minute rows? Spanning rows are fewer and truer to the
   domain; slot rows make overlap computation and realtime diffing trivial.
   This decision propagates into tickets 05 and 09.
3. **How is `Left` represented** — a nullable column on `hangout_participant`,
   a status enum, or a separate table? It must outrank Availability forever.
4. **The drop rule.** "Removing Availability that covered a Hangout drops you"
   — is that a database trigger, or client-side logic? A trigger is correct but
   means the drop happens even when the removal came from another device; client
   logic can silently diverge. What happens to a Hangout when its **last**
   Participant is dropped?
5. **The extend RPC** (ADR-0002) — its exact signature, what it validates, and
   how it refuses anything but extension.
6. **Timezone.** UTC columns with `timestamptz`, and where the fixed group
   timezone lives — a constant in the app, or configuration.
7. **Realtime subscriptions.** What each client subscribes to, and whether the
   grid can be kept correct without refetching everything on every change.
8. **Indexes.** What the Candidate scan (today forward, all Friends) actually
   queries, and what it needs to not be a sequential scan. Small data, but the
   query shape should be deliberate.

## Answer

<!-- the schema, the policies, and why -->

## Decided (round 1)

1. **Slot rows.** One row per `(friend, slot_start)`, 30 minutes each; a
   continuous Availability is a run of adjacent slots reassembled at render
   time. Merging stops existing (drawing the same slot twice is a no-op);
   overlap counting becomes `count(*) group by slot_start`; a unique constraint
   on `(friend, slot_start)` makes concurrent writes safe for free; and the
   ADR-0002 extend-RPC becomes **structurally incapable** of shortening anyone,
   because it only ever runs `insert`. Erasing part of a range — the gesture
   ticket 06 recommends — is just deleting the slots dragged over. Cost accepted:
   ~16 rows and 16 realtime events for an 8-hour drag.
2. **`left_at` on `hangout_participant`.** Row present with `left_at` null =
   Participant; row present with `left_at` set = Left, sticky forever; **no row
   = never joined or auto-dropped**, and therefore eligible for the "Join?"
   affordance. Three states from two facts, no enum, no extra table. An explicit
   re-Join clears `left_at`.
3. **The drop rule lives in a database trigger**, not the client — it must hold
   whatever deleted the slots (another device, a script, the dashboard).
   Statement-level with a transition table (`referencing old table as ...`) so
   it fires **once** per delete rather than once per slot.
4. **Friend row**: `id` (= `auth.users.id`), `display_name`, `blobatar_seed`,
   `hue`, `tone`, `expression`, `created_at`. The seed stays a separate column
   so renaming yourself does not mutate your face. **Email is not exposed** to
   other Friends. The `allowlist` table is readable by **nobody in the browser**
   — `revoke all from anon, authenticated`, reachable only by the
   `before-user-created` hook function.

5. **`timestamptz`, and the grid is built from the time zone.** `slot_start` is
   a `timestamptz` (a true instant); the Group time zone (Europe/Rome) is a
   constant in app code, since no settings UI exists to change it. The week grid
   asks the time zone how many slots the day holds instead of assuming 48 — so
   the 23-hour day in March renders 46 rows and the 25-hour day in October
   renders 50. The stored data is correct either way; only the drawing would be
   wrong. Keeps the door open for per-viewer time zones later.

Still open: **~~Q5~~** (timestamptz + DST), then round 2 — RLS policies per table,
the extend-RPC's validation, realtime subscription scope, indexes, and the
unresolved `security definer`-in-an-exposed-schema question from ticket 02.

## Decided (round 2)

6. **A Hangout is a range**, `hangout(starts_at, ends_at)` — it is one
   continuous block by construction, never merges, and its middle is never
   erased. "Does this Friend cover the Hangout?" is then exact slot-set
   containment. **Constraint attached: the manual time editor must snap to the
   same 30-minute grid**, because force-write lets a human type arbitrary times
   and off-grid bounds would make coverage a fuzzy comparison that every
   downstream rule has to qualify.
7. **The drop rule is strict**: *any* loss of coverage drops the Participant.
   Paired with a **confirmation before the delete** — a shadcn dialog/alert
   naming what it will cost ("this drops you from Pizza, Sat 20:00"). The
   trigger stays strict regardless of the UI, because it must hold for writes
   the UI never sees. With no notifications in v1, that dialog is the *only*
   thing standing between a mis-click and silently leaving a plan.
8. **Policies**, per table:
   - `friend` — read by any authenticated Friend; update your own only, with
     both `using` and `with check`.
   - `availability` — read by any Friend; insert and delete your own only,
     `with check` on both so `friend_id` cannot be reassigned.
   - `hangout` — read, insert, update, delete by any authenticated Friend
     (flat trust, ticket 01).
   - `hangout_participant` — read by all; you may set your own `left_at`;
     deletes happen only via the drop trigger.
   - `allowlist` — **no browser access at all**; `revoke all from anon,
     authenticated`, reachable only by the `before-user-created` hook.
   - Every table: `enable row level security` **plus** explicit revoke/grant,
     since grants are a second, independent lock (ADR-0001 refinements).
9. **The `security definer`-in-an-exposed-schema caveat is resolved by reading
   it as scoped to policy helpers.** The danger it describes is a privileged
   helper callable with arbitrary arguments. Ours takes **one argument, a
   hangout id**, derives participants and range from stored rows, sets
   `search_path = ''`, and is revoked from `public` and `anon` then granted to
   `authenticated`. **Write this reasoning into the migration as a comment** so
   the next reader does not "fix" it. The docs state no carve-out — this is a
   judgement, recorded as one.
10. **The client loads all Availability from today forward, for all Friends, at
    boot**, computes Candidates client-side, and subscribes to changes. Eye
    toggles then re-rank with no round-trip, week navigation needs no refetch,
    and the Candidate algorithm is a pure function over data already held. Past
    Availability loads lazily when navigating backwards.
11. **Indexes**: a separate index on `availability(slot_start)` for the
    today-forward scan. The unique constraint on `(friend_id, slot_start)` does
    **not** index `slot_start` alone — leading column only.

## Answer

The schema below is the **intended shape**, not validated SQL: no Supabase
project exists yet (ticket 04), so nothing here has been run.

```
allowlist          email (pk, lower-cased), added_at
                   -> no browser access at all

friend             id (pk, = auth.users.id), display_name, blobatar_seed,
                   hue, tone, expression, created_at
                   -> created blank by an on_auth_user_created trigger;
                      the two-step setup fills it in

availability       friend_id, slot_start (timestamptz)
                   unique (friend_id, slot_start)   <- makes writes idempotent
                   index on (slot_start)            <- the today-forward scan

hangout            id (pk), starts_at, ends_at (timestamptz, 30-min grid),
                   title (nullable), created_at

hangout_participant  hangout_id, friend_id, left_at (nullable timestamptz)
                     primary key (hangout_id, friend_id)
                     index on (friend_id)   <- leading-column trap
                     -> row + null    = Participant
                     -> row + left_at = Left, sticky
                     -> no row        = never joined / auto-dropped -> "Join?"
```

Two pieces of behaviour live in the database, not the client:

- **The drop trigger** — statement-level `after delete on availability`, with a
  transition table so it fires once per delete rather than once per slot.
  Deletes `hangout_participant` rows whose Friend no longer holds every slot in
  their Hangout's range.
- **The extend RPC** (ADR-0002) — `security definer`, one argument (hangout id),
  `search_path = ''`, revoked from `public`/`anon` and granted to
  `authenticated`. **Inserts only**, which is what makes "may extend, never
  shorten" a structural fact rather than a rule the code has to honour.

Realtime subscriptions cover `availability`, `hangout`, `hangout_participant`
and `friend`. Note the documented hole from ticket 02: **RLS is not applied to
DELETE events**.

## Amendment (from ticket 08)

`hangout` gains an **exclusion constraint** forbidding overlapping ranges:

```
exclude using gist (tstzrange(starts_at, ends_at) with &&)
```

Ticket 08 forbade overlapping Hangouts outright, so this is structural rather
than application logic — and it doubles as the concurrency answer: two
simultaneous confirmations cannot both win, and the loser is converted into a
Join client-side. Requires the `btree_gist` extension.

The drop trigger also **auto-cancels a Hangout whose last Participant leaves or
is dropped** — the UI path is not sufficient, since the trigger can empty a
Hangout with nobody clicking anything.

## Amendment — `tone` is an enum of six values, not a 0–1 float

Ticket 11's amendment establishes that blobatar resolves `tone` by band, and
that the table's numbers are upper edges. The column must therefore be
constrained to the six **band interiors** —
`0.10, 0.28, 0.49, 0.71, 0.86, 0.96` — and not to `0..1`, which would let a
Friend store `1.0` and silently render as *pastel* instead of *ink*.

A `check` constraint on the six values, or a small enum, either way.

## Amendment — provenance columns on `hangout` (from issue 09)

`hangout` gains three nullable columns:

```
hangout   created_by uuid null references friend (id) on delete set null,
          retimed_by uuid null references friend (id) on delete set null,
          retimed_at timestamptz null
```

**This does not reverse §8's flat trust, and the distinction is the whole
amendment.** §8 says the policies on `hangout` are read/insert/update/delete by
any authenticated Friend, and `05-hangout.sql` spells out *"there is no owner
column because there is no owner"*. That sentence is about **permission**, and
it stands: nothing below gates who may retime or cancel anything.

These columns are **provenance** — who *did* act, recorded, gating nothing. They
earn their place precisely *because* of flat trust rather than despite it:
anyone may cancel or move anyone's Hangout, there are no notifications in v1
(ticket 13), and ticket 08 §3 accepts that *"the other Friends learn of it by
noticing an absence."* Provenance is the only thing that can answer *who moved
this* after the fact. Ownership would answer *who is allowed to*, which is a
question this product has deliberately refused to ask.

### `retimed_by` **is** ticket 08 §1's "edited" mark

Not a separate `edited boolean`. Non-null is the mark, so the two facts cannot
disagree — a boolean beside a name is two columns that can contradict each
other, and the contradiction would surface as a card claiming an edit by nobody.

Named for retiming rather than for editing, because that is what ticket 08 §1's
mark actually promises. Its reasoning: *"It is the only signal a Participant
gets that slots were written for them."* A **rename does not write anybody's
Availability**, so marking a renamed Hangout "edited" would spend that signal on
something harmless and teach Friends to ignore it. → see *Needs the human*.

### `with check`, or the columns are decorative

**A column recording who did something, which anybody may set to anybody,
records nothing.** With a table-wide update grant and `using (true)`, any Friend
could write somebody else's id into either column. So:

- the `insert` policy needs `with check (created_by = (select auth.uid()))`;
- the `update` policy needs `with check (retimed_by = (select auth.uid()))`.

This is ADR-0002's refinement — *"`with check` is load-bearing"* — applied to a
second table for the same reason. `auth.uid()` reads the JWT claim rather than
the role, so it is still the calling Friend inside the `security definer` retime
RPC, and the RPC can set `retimed_by` honestly.

### Nullable, and `on delete set null`

**Nullable** because Hangouts confirmed before this migration have no author, and
backfilling one would be inventing a fact. Every reader must render the missing
case rather than assume it away.

**`set null`, never `cascade`**: cascading would delete the *Hangout* when a
Friend's row goes, and the plan still happened. Null then reads honestly as
"confirmed by somebody no longer in the Group".

## Needs the human

1. **Does a rename count as "edited"?** Recommended above: no —
   `retimed_by`/`retimed_at` mean *moved*, because ticket 08 §1's mark exists to
   say "availability was written for you" and a rename writes none. The cost of
   that recommendation: a renamed Hangout carries **no** provenance at all, so
   "who called it that?" is unanswerable. The alternative is a second pair
   (`renamed_by`/`renamed_at`), which is four provenance columns on a table with
   five real ones. A single `edited_by` covering both was rejected for weakening
   the one signal ticket 08 asked for — but it is the cheapest option and worth
   overruling this on if the provenance matters more than the signal.
