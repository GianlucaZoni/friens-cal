# 07 — The grid draws the viewer's time zone

Status: ready-for-human — built, 3 criteria await the cutover
Blocked by: 01

## Parent

[friens-cal — many Groups, joined by Code](../../groups-and-join-codes/map.md)

## What to build

Every Friend's grid is drawn in **their own** zone. A cal has no clock of its
own, and `cal.time_zone` was dropped before it was ever written — once every
grid is its own, nothing asks what the cal means by Saturday.

**A hybrid already ships and nobody chose it.** `startOfDayInZone` has always
read the *device's* civil date and only reinterpreted it in Rome, so per-viewer
is the only position consistent with what is deployed. This slice finishes a
move that was half-made by accident.

**A Friend's zone is a mirror of the device, not a setting.** Written on
sign-in, never editable, and read only by other people: the roster shows
`8h ahead` beside a Friend whose zone differs from yours. `friend.time_zone`
ships in slice 01's `09-per-cal.sql`.

**Slots are pinned to the absolute grid.** Overlap is exact-instant matching, so
a `:45` zone would silently produce no Candidates at all and then fail
`hangout_on_the_slot_grid` on confirm. `availability.slot_start` gains the
`epoch % 1800 = 0` check that `hangout` already carries — also in slice 01.

**A time string names its frame as `GMT+2`, never `CEST`.** `Intl`'s `short`
token is locale-*inverted*: `en-GB` gives Rome `CEST` and New York `GMT-4`,
`en-US` gives the reverse. And the frame is shown **only when the cal actually
spans zones**, so every cal today shows nothing.

DST needs nothing built beyond what v1 already does — the row count still comes
from the zone, and which day is short is now a fact about the viewer rather than
about the cal, so one week can hold two different short days.

The glossary already carries this: **Group** lost its clock, **Slot** became an
instant, and **Availability** gained the write side.

## Acceptance criteria

- [ ] A Friend's `time_zone` is written on sign-in and updates if their device
      zone changes
- [ ] The grid renders in the viewer's own zone, and two browsers in different
      zones read different wall clocks off the same drawn Slot
- [ ] The roster shows an offset beside a Friend whose zone differs, and nothing
      when it does not
- [x] Time strings render as `GMT+2`, and only when the cal spans zones
- [x] A Candidate computed in one zone is byte-identical in the other
- [x] The DST week still derives its row count from the viewer's zone, and two
      Friends can have their short day on different dates in one week
- [x] `npx tsc -b` is clean, `yarn test` passes, lint unchanged at nine

## Blocked by

- [01 — The cutover](./01-the-cutover.md)

## Built

`GROUP_TIME_ZONE` is gone and `Europe/Rome` has no reader left anywhere in
`src/`. Two new modules carry what replaced it:

- **`src/shell/zone.ts`** — pure, `@/`-free, tested under plain Node. The
  device's zone, the `GMT+2` frame, the roster's `8h ahead`, the spans-zones
  predicate, and `viewerZoneAmong`, which is the three of them composed the one
  way the app composes them.
- **`src/shell/viewer-zone.ts`** — a context holding a `ViewerZone`, and
  `useViewerZone`. `AppShell` fills it beside `now`.

Everything else is call sites: thirteen files that imported the constant now
take the viewer's zone, `whenOf` takes a `ViewerZone` instead of a string, and
`slotContaining` lost its zone entirely.

### Five decisions the slice had to make

**1. The zone is a function; only the frame needs a context.** `deviceTimeZone()`
answers "which zone" anywhere in the tree and always gives the same answer.
Whether the cal *spans* zones is a fact about the roster, and threading it as a
prop would cross seven layers to reach a string that is null in every cal today.
So the context carries `{ timeZone, frame }`, `AppShell` computes it once, and
the two stores instantiated above the provider call `deviceTimeZone()` directly
and say why. Splitting `AppShell` in two to get the stores under the provider
was the alternative, and it buys nothing: neither store renders a frame.

**2. "A different zone" means a different clock, not a different IANA id.** The
ticket says the frame shows when "at least one Friend on the roster has a zone
different from the viewer's". Read literally that lights up a Rome-and-Berlin
cal, which has two ids and one clock — and the roster beside it would be showing
no offsets at all, because `offsetLabel` correctly returns null for a zero
difference. The frame and the roster have to agree about whether there is
anything to say, so `spansZones` and `offsetLabel` sit on one subtraction.
The seasonal consequence is accepted and is the honest one: Sydney and Lord Howe
are one clock in January and half an hour apart in July, and the frame appears
and disappears with that.

**3. `slotContaining` has no zone at all.** §3 of the planning ticket pins a Slot
to `epoch % 1800 = 0`; the horizon is a point on that grid, so flooring it to a
wall clock was the one lattice-per-viewer bug the whole section exists to
prevent. `useSlotClock()` loses its argument with it. The v1 test that asserted
Kathmandu floors to its own `:15` lattice is **reversed**, and says so in place.

**4. The mirror write does not go through `saveFriend`.** Nothing on your own
screen reads your own mirrored zone — the grid reads the device, and the roster
never measures you against yourself — so folding the row back into session state
would be a render for a value with no reader, which
`eslint-plugin-react-hooks` also refuses as a cascading render. It writes with a
bare `update`, logs a failure and shows nothing. It re-checks on `focus` and
`visibilitychange` as well as when a session resolves, which is what makes it
follow a device that changed zone: a phone that lands does so with the tab in
the background.

**5. The gutter header carries the frame; the month carries nothing.** A
screenshot of the grid has no `whenOf` string to hang a frame on, so the week's
header gutter gets one — stacked under the load dot, empty in every cal today. A
month cell shows no times at all, so there is nothing there to frame.

### The `:45` gutter, which shipped broken inside this slice and was caught

`opensHour` was `label.endsWith(':00')`. Once a day begins at the first
half-hour instant *at or after* local midnight, a Kathmandu day reads
`00:15, 00:45, 01:15, …` and **no row ends in `:00`** — so the hour gutter
rendered empty and every row carried the faint half-hour rule instead of the
hour one. It is now the minutes the day itself opens on, read off the first row
rather than derived from the offset, which is what keeps *both* 02:00 rows of the
autumn Sunday marked; a rule phrased as "the first row whose hour differs from
the one before" would have dropped the second. The gutter writes the whole label
when the hour does not open on `:00`, because `00` beside a row that begins a
quarter past is a fifteen-minute lie.

### What was verified, and how

Unit tests only. The live database has no `time_zone` column, so nothing was run
against it and no dev server was pointed at production.

```
ℹ tests 266
ℹ pass 266
ℹ fail 0
```

`npx tsc -b` is clean for all three projects. `yarn lint` is **9**, unchanged.

28 new assertions. The ones that carry the decision:

- **The frame is locale-proof.** `zoneFrame` is held against `Intl`'s
  `shortOffset` for Rome, New York, Kathmandu, Tokyo and UTC, in **both**
  `en-GB` and `en-US`, at a summer and a winter instant. That is the check the
  planning ticket's §6 measurement asks for, and it is why the label is computed
  rather than formatted.
- **A Candidate is byte-identical across zones.** Marco drags his Tuesday
  lunchtime in Rome; Bea, in Kathmandu, drags what her own gutter calls a quarter
  to four. The two arrays of instants are `deepEqual`, the scan yields one
  Candidate, and its `id`, `start`, `end` and `friendIds` are asserted whole.
  The next test reads that same Candidate as `12:00 – 14:00 GMT+2` and
  `15:45 – 17:45 GMT+5:45`.
- **Every slot of every day is on the grid**, across seven zones — whole-hour,
  half-hour, quarter-hour and one that shifts by thirty minutes — on an ordinary
  day and both DST days.
- **Two short days in one week.** 2026-10-25 is 50 rows in Rome and 48 in New
  York; 2026-11-01 is 48 and 50. Lord Howe's 2027-04-04 is 49.
- **The offset is a fact about an instant.** Rome and New York are `6h behind`
  in July and `5h behind` on 27 October, when the EU has moved and the US has
  not.

### What was left behind

- **No SQL, by ticket.** `friend.time_zone` is in `src/lib/database.types.ts`
  and in `09-per-cal.sql`'s scope, not here.
- **The `whenOf(hangout.startsAt, hangout.endsAt, zone)` line is repeated in
  seven components.** It was repeated before this slice with the constant in it,
  and collapsing it into `whenOfHangout(hangout, zone)` is a good change that
  belongs to nothing this ticket decided.
- **A run that crosses midnight is still two column fragments**, and for a
  Friend several zones away that is now most evening Candidates rather than only
  late-night ones. That is
  [13](../../groups-and-join-codes/issues/13-midnight-straddle-prototype.md),
  filed before this slice started.
- **The day panel's Availability windows carry no frame.** Only `whenOf` strings
  and the gutter header do, which is what §6 settled; the windows are read off
  slot labels that are already the viewer's.

### Left for after the cutover

Three criteria need the migrated database, and one of them needs two machines.

- **`time_zone` written on sign-in.** Needs `09-per-cal.sql` run. Then sign in
  and check the row. **The column grant is the thing to watch**:
  `supabase/01-friend.sql` has `grant update (display_name, blobatar_seed, hue,
  tone, expression) on table public.friend to authenticated`, and a
  `time_zone` that is not added to that list makes every mirror write `42501`.
  The client logs it and shows nothing, so the symptom is a roster that never
  grows an offset rather than an error anybody sees.
- **Two browsers in different zones off one Slot.** Set the machine's zone (or
  launch a second browser under `TZ=`), draw a run in one and read the other.
  What to check: the same block, two wall clocks, and the Candidate appearing
  for both — that last one is the property the absolute grid exists for.
- **The roster's offset on screen.** Needs a second account whose `time_zone`
  differs. The label itself is proven; what is not is that the row still lays
  out at 17rem with a name, an offset, a silence dot and `you` on it.
