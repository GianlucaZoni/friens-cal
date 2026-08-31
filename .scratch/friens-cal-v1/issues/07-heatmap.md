# 07 — Everyone's Availability as a heatmap

Status: done
Blocked by: 04, 06

## Parent

[friens-cal v1 map](../../shared-availability-calendar/map.md)

## What to build

The grid stops being yours and becomes the group's. Every non-Hidden Friend's
Availability composes into a heatmap, live over Realtime.

**One hue — the viewer's own — with opacity proportional to how many visible
Friends are free in that slot.** Not a mesh gradient of everyone's colours: that
was prototyped and it dies at 6–8 Friends, and near-identical hues under-report
the count. Opacity is monotonic in the count, so adding a Friend always *adds*
information.

**Your own Availability is a border and a ring, not a solid fill** — a solid
block occludes the density underneath it.

**Per-Friend colour is therefore absent from the grid entirely.** The grid
answers *how many*; **who** is answered only by opening the slot popover. That
popover is now load-bearing, not a nicety.

Realtime honours RLS. Slots are keyed by `(friend_id, slot_start)` — their
natural key — so an optimistic row and its Realtime echo are **the same row**
and the echo is a no-op. Do **not** filter out your own session's events: that
would break your own second device.

## Acceptance criteria

- [x] A boundary sweep segments the day into runs of `{start, end, friendIds[]}`
- [x] Column renders as a single-hue wash in the viewer's colour, opacity ∝ the
      number of visible Friends free — **normalised; see the named deviation**
- [x] The viewer's own Availability is a border + ring, and does not occlude
- [x] Hiding a Friend removes them from the wash immediately
- [x] Clicking a slot opens a popover listing the free Friends by blobatar
- [x] A Realtime insert from another Friend appears without a reload
- [x] Your own write's Realtime echo causes no flicker and no duplicate
- [x] The opacity ramp is tuned separately for light and dark
- [x] `npx tsc -p tsconfig.app.json --noEmit` is clean

## Blocked by

- [04 — The Friend roster and hiding](./04-friend-roster-and-hiding.md)
- [06 — Drawing, erasing, and the write model](./06-drawing-and-the-write-model.md)

## Built

`src/availability/` gains four files; the grid becomes the group's by the removal
of one line.

- **`segments.ts`** — the boundary sweep, pure and tested. `{start, end,
  friendIds[]}`, cut wherever the *set* changes. Its own module because `runsOf`
  in `slots.ts` answers a different question: it merges contiguous *held* slots,
  and a wash needs a boundary wherever the **count** moves.
- **`heat.ts`** — the ramp, and the two numbers per theme.
- **`slot-answer.ts`** — the popover's data model, `answerAt`. Between the sweep
  and the component because it belongs to neither.
- **`lib/css-tokens.ts`** — one token installer, shared with `ui-colour.ts`.

### The grid stopped being yours by deleting `.eq('friend_id', userId)`

Nothing else in the read was per-Friend, because the key carries the Friend. What
it changed is the line above it: the read is paged at 1000 rows because
PostgREST's `db-max-rows` truncates **silently**, and removing that filter
multiplies the row count by the size of the Group. A nine-Friend group at eight
hours a day crosses 1000 rows in under three weeks. The paging stopped being
theoretical here.

### Segments inside runs, which is the half of prototype 05 that survived

Verified against the seeded two-Friend week (`04-demo-second-friend.sql`):
Monday renders **one band 18:00–23:00 holding two segments** — 18:00–19:00 at the
floor with one Friend, 19:00–23:00 at the ceiling with both, and a hard internal
boundary at 19:00. The rounded silhouette and the clip belong to the band; the
edges inside it are flush, because each one is a moment the set changed.

| | free | opacity |
| --- | --- | --- |
| Mon 6 Sep 18:00–19:00 | Demo Friend | 0.14 — floor |
| Mon 6 Sep 19:00–23:00 | both | 0.48 — ceiling |
| Wed 8 Sep 20:00–22:00 | both | 0.48 |
| Fri 10 Sep 10:00–13:00 | Demo Friend | 0.14, **and no own outline** |

Friday is the one to look at: another Friend's Availability as pure density, with
no border, because the viewer does not hold it.

Called a **band** and not a run, deliberately. `CONTEXT.md` defines a run as *one
Friend's* contiguous held Slots, and this is a stretch where anybody is free —
which is also not a Candidate. Three meanings for one word in a file that already
draws the viewer's own `runs` would be three ways to misread it.

### The pixels changed a number an argument would not have

The first ceiling (0.62 light) read as a solid block and **swallowed the
border+ring on top of it** — same hue, so a strong wash and a full-strength
outline are nearly the same value, which is the occlusion ticket 15 kept the
outline to prevent. Measured on a probe of the real stack at five ramp steps in
both themes, then: **light 0.14/0.48, dark 0.12/0.42**, and the wash bleeds full
column width where your own block is inset 3px, so the outline sits *inside* the
density rather than on its edge.

Both floors were pushed *up* off their first values by the same probe: below
~0.11 a lone Friend disappears into near-black.

### Tuned twice, with nothing asking which theme is on

The app has no theme state — light and dark are the `.dark` class and the
stylesheet, and ticket 18 ruled out a switch. So the two numbers per theme are
injected as CSS custom properties and the **cascade** resolves them, exactly as
`installFriendColourTokens()` already did for `--friend-l` and `--friend-c`. The
only thing crossing from JavaScript is the fraction; the arithmetic is a `calc()`
over two `var()`s.

Resolved through the real engine, monotonic in both: light `0.14 → 0.48`, dark
`0.12 → 0.42`, switched by adding the class and nothing else.

### Realtime, measured on a page nobody touched

`03-realtime.sql` publishes `availability` **and** `friend`. A separate session
inserted two slots; the band appeared at 21:00 with one segment and one own
outline, **with no reload and no interaction**. Re-writing the same rows moved
nothing — one band, one segment, one outline — which is the natural key making
the echo a no-op, and the reason there is no dedupe pass and no "is this mine"
bookkeeping (filtering your own session out would break your own second device).
Deleting them removed both the wash and the outline, exercising the removal path
`mergeSlots` structurally cannot express.

**`replica identity full` is not needed, and that is structural.** The default
replica identity is the primary key; here the primary key *is* the whole row, so
a DELETE payload already carries exactly the key the store is keyed on. Asserted
rather than assumed — `verify-realtime.mjs` fails if the payload is short.

**RLS is not applied to DELETE events** (ticket 02 §6.3). Harmless here and
written down so nobody later reads the hole as a leak: the read policy is
`using (true)` and the whole product is a count over other people's rows, so a
delete event carries nothing a `select` would not. The rule that *does* bind is
the general one — never publish a table whose **reads** are restricted, which is
why `allowlist` must stay out of the publication.

**Ticket 02's "could not confirm" is settled, by the wrong kind of evidence.**
`@supabase/supabase-js@2.112.4` wires `auth.onAuthStateChange` to
`realtime.setAuth(token)` on `TOKEN_REFRESHED`, `SIGNED_IN` and
`INITIAL_SESSION` (`_listenForAuthEvents` / `_handleTokenChanged`). That is the
shipped source, not the documentation the ticket asked about, so treat rotation
over a long idle as still unverified: if the grid goes quiet, look here first.

### Realtime on `friend` too, which is not a nicety

The wash counts the Friends the roster knows about. A Friend the roster has not
heard of holds Availability that arrives over Realtime and is then **not
counted** — the grid under-reports by one, silently, until a reload. The two
subscriptions have to exist together or the count is only as fresh as the roster
read. It also makes a Friend's hue change recolour their sidebar row live, which
ticket 11 asked for.

### The silence dot is here, and the ticket beat the issue

Ticket 01 specifies it ("a muted dot beside Friends with zero Availability in the
current view") and issue 07's criteria do not mention it. The spec says the ticket
wins where they disagree, and it is load-bearing now that the grid is a *count*: a
Friend contributing nothing to the wash is either free nowhere or has said
nothing, and `CONTEXT.md` is explicit that the tool cannot otherwise tell those
apart. `availability.silent(friendIds)` answers it, from the view's own instants.

### Four judgement calls, named so they can be overruled

1. **The ramp's denominator is the *visible* set, not the Group.** So the darkest
   wash always means "everyone I am trying to meet is free", and **hiding a
   Friend intensifies the rest — even one who was free nowhere**. This is a
   deviation from the literal wording of both issue 07 and ticket 15 ("opacity ∝
   the number of visible Friends free"), taken because strict proportionality is
   illegible at this group size: one Friend of nine lands at 1/9 of the range.
   Every legible ramp is therefore affine, and the denominator is the free choice
   nobody wrote down. Deliberately the opposite of ticket 09's glow rule, which
   compares against `group_size` counting Hidden — the glow asks "is this a big
   deal for the Group" and the wash asks "how much of who I am looking for is
   free". One line in `heatFraction` if that is wrong.
2. **The hit target is the Slot; the answer unit is the segment.** Issue 07 says
   Slot, prototype 05 Q5 says segment and measured the slot layer "objectively
   worse". That measurement was about **hover** — a panel re-rendering every 24px
   through a block whose answer never changes — and ticket 10 removed hover, and
   with it that failure. So the popover names the Slot in its title and the
   segment in its answer (`2 free · 19:00–23:00`). Cost: two clicks inside one
   segment open the same answer in two places.
3. **A lone countable Friend sits at the FLOOR, not the ceiling.** With one, the
   ramp is degenerate — every segment holds a count of one — and a channel that
   discriminates nothing should sit at its quiet end. The ceiling there painted a
   near-solid block in the viewer's own hue under their own border: ticket 15's
   occlusion reached through the degenerate case. So the ceiling means precisely
   "more than one Friend, and all of them".
4. **Friends who have not finished setup are excluded from the wash** — count and
   denominator both. They cannot have drawn anything (`RequireSetup` blocks the
   route), and counting them would cap the ramp below its top forever. Named
   cost: a row seeded from the SQL editor for such a Friend is invisible to the
   wash until they finish.

### One bug, and it was in the verification

`verify-realtime.mjs` compared timestamp **text**: Realtime renders a
`timestamptz` as `2027-10-05T19:00:00+00:00` and `Date#toISOString` writes
`...000Z`. Same instant, two strings — which is the exact trap `slotKey` exists
to avoid, and its doc comment says so. The app keys on
`new Date(slot_start).getTime()` and was never affected; only the assertion was.

### Two human steps, both now done

`supabase/03-realtime.sql` (the publication) and
`supabase/04-demo-second-friend.sql` (an identity for one blank roster row, plus
three shapes in September 2027 a year out so they cannot be mistaken for real
plans). Neither could be done from the repo: `.env` holds only the publishable
key by design (ADR-0001), and `02-availability.sql`'s `with check` refuses an
insert carrying another Friend's `friend_id` — verified, 42501.

**Realtime caches the publication's table list.** The first verify run
immediately after the paste saw nothing and reported the table as unpublished;
the same run minutes later passed. Worth knowing before believing that message.

### State of the checks

`npx tsc -b` clean for all three projects, `yarn test` 103 passing (85 from
issue 06, 18 new across `segments.test.ts` and `heat.test.ts`), `yarn lint`
unchanged at the 9 errors already on `main`. A fresh tab logs nothing. Verified
at 1440px and at a 34px-column width with both panes open, on an ordinary week
and on the 19–25 Oct 2026 DST week, in both themes.

### Left behind, deliberately

The September 2027 demo data, which is the only way the heatmap shows a count
above one until the real group fills in. It undoes with one `delete` — the
statement is at the bottom of `04-demo-second-friend.sql`. Section 1's identity is
left alone by that on purpose: by the time anybody runs it, the Friend has
probably chosen their own name and colour, and the statement cannot tell those
from the seeded ones.

### Handed to issue 08

`segmentsOf` is the sweep the Candidate scan consumes, and its output is honest:
`friendIds` in roster order, a boundary wherever the set changes, and no segment
at all where nobody is free. `bandsOf` groups contiguous segments — a **Candidate
is a different thing** (two or more Friends, `CONTEXT.md`), so issue 08 filters
segments by `friendIds.length >= 2` rather than reusing bands. Nothing about
Candidates is computed here and the right pane is untouched.
