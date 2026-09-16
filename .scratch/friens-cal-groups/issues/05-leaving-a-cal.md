# 05 — Leaving a cal

Status: done
Blocked by: 02, 03

## Parent

[friens-cal — many Groups, joined by Code](../../groups-and-join-codes/map.md)

## What to build

The client half of leaving. The database half ships in slice 01 — a
`before delete on membership` trigger, not a fourth RPC, so ADR-0003's audited
set stays at three.

**Left, not dropped.** A dropped Participant is indistinguishable from one who
never joined, so the sidebar would **re-offer them the plan they walked out of**
the moment they rejoin and draw. Leaving marks you Left on every Hangout in that
cal that has not yet happened; the ones that already happened keep you as a
Participant, because a past Hangout is a record of who was there and leaving
says nothing about where you were.

**The dialog names every Hangout** it will mark you Left on, says the past is
safe, and **shows the Code** — leaving is the moment the Code becomes
unreachable to you, so it is the last chance to keep it.

**Rejoin needs nothing new.** It is unconditional and writes the Availability to
cover the range, exactly as Join does.

**The control lives on `/`**, in the list row's overflow menu, alongside Rename.
It is deliberately not on the shell's dropdown (slice 03). Leaving routes you
out of `/g/:id` back to `/`.

## Acceptance criteria

- [ ] Leave is reachable from the row's overflow on `/` and not from the shell
      dropdown
- [ ] The dialog names every future Hangout you will be marked Left on, states
      that past ones keep you, and shows the Code
- [ ] Leaving marks you Left on future Hangouts in that cal and leaves past ones
      holding your name
- [ ] Your Availability in that cal is gone and your Availability elsewhere is
      untouched
- [ ] Leaving routes you to `/` and the cal is no longer in your list
- [ ] Rejoining by Code works, and Rejoin on a Hangout writes the covering
      Availability
- [ ] A Hangout whose last Participant leaves is auto-cancelled if it has not
      happened yet
- [ ] `npx tsc -b` is clean, `yarn test` passes, lint unchanged at nine

## Blocked by

- [02 — Join or create a cal at `/`](./02-join-or-create.md)
- [03 — The cal dropdown in the app shell](./03-cal-dropdown.md)

## Comments

**From slice 03, which is built: your slot exists and Rename is already in
it.** `/`'s row overflow is `CalOverflow` with `surface="list"`
(`src/pages/JoinOrCreatePage.tsx`, third sibling after the `Link` and the copy
button), and it holds Rename today.

To add Leave, in order:

1. `src/cal/cal-menu.ts`: add `'leave'` to `CalAction`, to the `list` array
   (not to `switcher`, which slice 03 kept it off), and to `CAL_ACTION_LABEL`.
2. `src/cal/cal-action-dialogs.tsx`: a third branch. The `satisfies never` at
   the bottom will refuse to compile until you write it. It already takes the
   whole `CalsState`, so a `leave` added to `use-cals.ts` reaches you with no
   prop to thread through either call site.
3. Leave's **destructive** treatment has nowhere to live yet.
   `CAL_ACTION_LABEL` carries labels and nothing else, and
   `DropdownMenuItem` takes `variant="destructive"`, so that is a second map
   or a case in `src/cal/cal-overflow.tsx`.

Also worth knowing before you drive it: the dots inside the **switcher** does
not respond to synthetic events (`element.click()`, or a hand-dispatched
pointerdown/click) and does respond to a real one from the browser harness.
`/`'s dots, which is not nested in a menu, responds to both.

## Built

Three new modules and eleven files touched. New in `src/cal/`: `leaving.ts`
(+ `leaving.test.ts`, the prediction and the sentence), `use-leaving.ts` (the
read behind the dialog) and `leave-dialog.tsx`. `cal-menu.ts` gains the union
member, the `list` row and a second map; `cal-overflow.tsx` hands that map to
`DropdownMenuItem`; `cal-action-dialogs.tsx` gains the third branch;
`use-cals.ts` gains `leave`; `code.ts` gains its sentence. `copy-code.tsx`
gains `CodeToShare`, which `code-dialog.tsx` and `create-dialogs.tsx` now use
instead of their own copies. The bounded extra touched `app-shell.tsx`,
`cal-switcher.tsx` and `use-elsewhere.ts`.

**No SQL.** The question the ticket left open — whether a Hangout whose last
Participant leaves is auto-cancelled — was answered by running it rather than
by reading it, and the answer is yes, with the machinery that already exists.
See below.

Everything here was driven in a browser against the local rehearsal stack with
`00`-`13` applied, signed in as a real account, at 1280x860 and at 375x812, on
two fixture cals of this slice's own (`g05 leaver`, `g05 keeper`) so nothing
another session was looking at moved underneath it. The live project is
pre-cutover and was never touched.

### The decisions this slice had to make

1. **No `supabase/14`, and the check is the point.** The ticket's last
   criterion asked whether `cancel_empty_hangouts` counts `left_at is null`
   Participants and whether the Left written by the membership trigger reaches
   it. It does, both halves, and the chain was traced on the stack rather than
   argued: `mark_left_on_leaving_cal` issues an `update` on
   `hangout_participant`, that statement fires `hangout_participant_autocancels`
   — `after update ... for each statement`, which fires for a statement issued
   from inside a `before delete` row trigger — and `cancel_empty_hangouts`
   deletes where `ends_at > now()` and no Participant has `left_at is null`.
   Rehearsed inside a transaction and rolled back before anything was built:
   a future Hangout the leaver was alone on was **gone**, the shared one kept
   its other Participant, and the past one was untouched. A new SQL file would
   have re-stated a rule that already fires.
2. **`leave` returns a sentence or null, not `CalResult`.** Every other write
   on `CalsState` hands back the `cal` row it wrote. There is no row here — the
   cal is the thing that is now gone — and `string | null` is exactly the shape
   `useSaveAction`'s `run` takes, so the dialog wires straight to it.
3. **The list is folded after the delete lands, not optimistically.** Same rule
   as `withCal` three lines up: the list is local state after the first read,
   and a statement that came back without an error is the whole answer. A
   re-read would be a round trip to learn what the first one already said, on a
   page that is nothing but this list. Optimism would win only that round trip,
   and there is no navigation waiting on it — the control is on `/`, which is
   where leaving leaves you. A delete that matched no row is **not** treated as
   a failure: it means the Membership was already gone from another tab, which
   is the state the line was trying to reach.
4. **The dialog does its own read, and it reads the whole cal.** `/` is outside
   `CurrentCalProvider` and outside the shell, so there is no Hangout store
   here and `useElsewhere` cannot be reused (it wants a cal on screen, and its
   filter is `neq` where this needs `eq`). The read takes the **other**
   Participants too, nested in one embed, because `wouldAutoCancel` needs them:
   *"leaving cancels it for everybody"* is a different sentence from *"you come
   off it"*, and planning ticket 10 §6 asks for both. It is paged, because a
   silently truncated list in the one dialog whose job is to be believed is
   worse than no dialog.
5. **The dialog's clock is the instant it opened, and it does not tick.** The
   read is issued with that value and the list is filtered by it, so the two
   cannot disagree — and a plan dropping off the list while somebody is halfway
   through reading it is worse than one that is half a minute stale.
6. **A failed read does not disable Leave.** It disables it while the read is
   *in flight*, so nobody answers a question whose consequence is still
   loading. But a failure is a different thing: an outage in a separate query
   is not a reason to hold somebody in a cal, and two of the dialog's three
   duties (the past keeps your name; here is the Code) are on screen either
   way. The sentence says plainly that it cannot name what goes.
7. **The write's failure is inline, not a toast, and that is a deviation from
   the task's instruction.** `/` does not render a `<Toaster />` — there is one
   for the app and it is mounted in `AppShell` (`app-shell.tsx`), which this
   page is not inside. A toast raised here would render nowhere at all. So the
   failure takes the other existing path, the one every dialog in `src/cal/`
   already uses: `useSaveAction` plus `SaveError` inside the dialog, which also
   keeps the dialog open, which is what a failed destructive act wants. The
   sentence carries a second clause the others do not — *"Nothing has
   changed"* — because leaving is one statement and everything else is
   consequence inside its transaction, so a Friend who has just read a list of
   three plans needs telling that none of it landed.
8. **The destructive treatment is a second map in `cal-menu.ts`, not a case in
   the component.** `CAL_ACTION_VARIANT` uses `DropdownMenuItem`'s own prop name
   and its own two values, so the component hands it straight through and there
   is no third vocabulary in between. A `Record` rather than a `Set` of
   destructive actions, so a fourth item cannot join a menu without somebody
   deciding its colour.
9. **There is no route change and no path that needs one.** Planning ticket 10
   said leaving "routes you out of `/g/:id` back to `/`"; slice 03 and this one
   put Leave on `surface="list"` only, `/` is the only place that surface is
   rendered, and `/` is outside `CurrentCalProvider`. So the case cannot arise
   from the control. The tab left open on `/g/:id` is still handled, by slice
   02's provider: a cal you are not a Member of returns no row and the provider
   renders its dead end with a link back to `/`. Checked on screen that the
   switcher's menu holds Rename and View code and nothing else.
10. **`CodeToShare`.** The Code-with-copy block was the same five lines in the
    create flow and the View code dialog, and this dialog would have been the
    third. `code-dialog.tsx` already argues that there is exactly one
    presentation of six characters in the product; three copies of it was the
    way to stop that being true.

### What the rehearsal showed

Fixture: `g05 leaver` (Ada and Bea) holding `old dinner` two days ago with both
on it, `next climb` in five days with both on it, and `ada alone` in six days
with Ada alone; Ada's Availability covering all three. `g05 keeper` (Ada alone)
holding four Slots and no Hangouts.

- **The menu.** `/`'s row overflow reads Rename then Leave, and Leave's
  computed colour is `oklch(0.58 0.22 27)` against Rename's
  `oklch(0.145 0 0)` — `data-variant="destructive"` reaching the row. The
  switcher's dots, inside the cal, reads Rename and View code.
- **The dialog**, verbatim: *"Leave g05 leaver?"* / *"Leaving takes you off 2
  hangouts here that have not happened yet:"* / `next climb`,
  `Mon 21 Sep · 04:00 – 06:00` / `ada alone`, `Tue 22 Sep · 04:00 – 06:00`,
  *"…and cancels it — you are the only one on it, and there is no undo."* /
  the past-and-availability sentence / the Code `GZ5AAA` with its Copy button /
  `Stay` and `Leave this cal`. `old dinner` is **not** in it. One request went
  out, the embed, scoped `cal_id=eq.<the cal>&ends_at=gt.<now>`.
- **Leaving.** The dialog closed, the row left the list in place, and the
  address bar did not move off `/`. In psql afterwards: `old dinner` holds Ada
  as a **plain Participant** with `left_at` null; `next climb` holds Ada with
  `left_at` set and Bea untouched; `ada alone` **is gone** — the auto-cancel,
  fired by the Left; Ada's Availability in `g05 leaver` went from 12 rows to 0
  and her four rows in `g05 keeper` are exactly where they were; the only
  Membership left in the cal is Bea's.
- **Rejoining by Code.** `GZ5AAA` typed into `/`'s Join dialog made a fresh
  Membership (a new `joined_at`) and routed in. Left was still set on
  `next climb` and Ada held no Availability — Left is sticky across a departure
  and a return, which is the whole of decision §1 in planning ticket 10 and the
  path nobody would have tested.
- **Rejoin on the Hangout.** The detail read *"One friend left this hangout."*
  and offered `Rejoin`. Pressing it cleared `left_at` and wrote exactly the
  four Slots covering 02:00–04:00 UTC — the whole range, because after
  rejoining the cal she held nothing there. No new code was needed for any of
  it, which is what planning ticket 10 §7 predicted.
- **The empty case.** `g05 keeper`: *"You are not on any hangout here that has
  not happened yet."* followed by the past sentence and the Code. It opens
  rather than refusing to, because those two are the parts that matter most to
  somebody who is on nothing.
- **The read failing.** With the `hangout` read forced to 403 in the page, the
  dialog opened saying *"We could not read the plans in this cal, so this
  cannot name what leaving takes you off"*, kept the Code and kept Leave
  enabled.
- **The write failing.** With the `membership` DELETE forced to 403, the dialog
  stayed open, showed *"Could not leave just now. Nothing has changed — try
  again in a moment."* and the row stayed on the list.
- **At 375x812**, with nine future plans in the cal: the dialog caps at 741px
  tall inside an 812px viewport, the middle region scrolls (774 over 579) and
  the footer's bottom edge sits at 761. No horizontal scroll. Eight of the nine
  carried the auto-cancel line, which is right — Ada was alone on eight of them.

### The bounded extra, done

`AppShell` calls `useCals()` once and puts it in `CalsContext`, beside the zone
it already computes the same way; `CalSwitcher` and `useElsewhere` read it
through `useSharedCals`. `/` is unchanged and still calls `useCals` directly,
because it is the only reader there and a context with one consumer is a longer
way of writing a variable. `useSharedCals` throws rather than falling back to a
fresh instance, for the reason the fallback is tempting: a silent second
instance is the bug this replaced.

Verified by behaviour rather than by reading the call sites. With `bea night`'s
detail open in `g09 alpha`, its clash block read *"Hangout in g09 gamma"*;
renaming that cal from the switcher, without navigating, turned the same line
into *"Hangout in g09 gamma renamed"*. On main that string keeps the old name
until the next navigation, which is exactly what slice 03 wrote down. (Renamed
back afterwards, since that cal is slice 09's fixture.)

### Checks

```
$ npx tsc -b
(clean)

$ yarn test
ℹ tests 371
ℹ pass 371
ℹ fail 0

$ yarn lint
✖ 9 problems (9 errors, 0 warnings)
```

Ten of those 371 are new: eight in `src/cal/leaving.test.ts` and two appended
to `src/cal/cal-menu.test.ts`.

### Worth knowing for whoever is next

- **`/`'s dots opens on a synthetic `.click()` and did not open on the
  harness's own click** in this session, which is the opposite of what slice 03
  found. The pane was running hidden throughout, so the page composites no
  frames and screenshots time out; every measurement here is
  `getBoundingClientRect` and `getComputedStyle` rather than a picture. Slice
  03's note that the *switcher's* nested dots refuses synthetic events did not
  reproduce either — it opened both menus for this session. Drive it whichever
  way answers, and measure the layout box rather than the painted one.
- **The `g05 leaver` / `g05 keeper` fixture is still on the rehearsal stack**,
  with Ada rejoined and back on `next climb`. Left rather than deleted, because
  other sessions were using the stack at the same time. `cal` has no delete
  grant, so the two cals cannot be removed anyway (`08` §5).
- **The dialog is the fourth reader of `hangout`** and the second one outside
  the shell's store. If a fifth arrives, the embed in `use-leaving.ts` and the
  two column lists in `use-hangouts.ts` are three places that have to agree
  about what a Hangout row is.

### Acceptance criteria

- [x] Leave is reachable from the row's overflow on `/` and not from the shell
      dropdown
- [x] The dialog names every future Hangout you will be marked Left on, states
      that past ones keep you, and shows the Code
- [x] Leaving marks you Left on future Hangouts in that cal and leaves past ones
      holding your name
- [x] Your Availability in that cal is gone and your Availability elsewhere is
      untouched
- [x] Leaving routes you to `/` and the cal is no longer in your list
      — the cal leaves the list in place, and there is no route to change
      because the control is on `/` already (decision 9)
- [x] Rejoining by Code works, and Rejoin on a Hangout writes the covering
      Availability
- [x] A Hangout whose last Participant leaves is auto-cancelled if it has not
      happened yet — already true, with no new SQL (decision 1)
- [x] `npx tsc -b` is clean, `yarn test` passes, lint unchanged at nine

### Left for after the cutover

Nothing. Every criterion was driven against a migrated local stack rather than
described, and none of them needed the cutover. The live migration is still
slice 01's: `08` to `13` are unrun against the live project, so nothing on this
branch can work there until a human runs them.
