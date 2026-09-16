# 02 — Join or create a cal at `/`

Status: ready-for-human — built, 1 criterion awaits a real browser
Blocked by: 01

## Parent

[friens-cal — many Groups, joined by Code](../../groups-and-join-codes/map.md)

## What to build

The signed-in entry surface. `/` is **always** the join-or-create page, never a
redirect into a cal, and `/g/:id` with an opaque id is a cal. This is the slice
where a second cal becomes reachable at all.

A prototype exists on `prototype/05-join-or-create-page` and the brief survived
contact on all five questions it was built to test — build what it shows.

**The page.** The Friend's cals, alphabetical, each row showing its name and its
Code. The empty state reads as *not yet* rather than as nothing, because it is
the same card a Friend keeps forever rather than a first-run screen.

**Creating is two dialogs in a row, and that stands.** The modal after create is
the one moment the Code is unmissable, and a Friend who dismisses it still has
the Code on the list behind it.

**Joining is shadcn Input OTP**, and it beat a plain formatted input in a real
side-by-side: six boxes say *six characters, exactly*. Four of its defaults are
wrong for a join Code and all four are verified rather than inferred:

- `pattern` compiles with no flags and is tested **before** `onChange`, so
  uppercasing in the handler cannot rescue a lower-case keystroke. The pattern
  must admit both cases — use `^[A-Za-z0-9]*$`, deliberately wider than the
  server's alphabet so it can never reject a keystroke the RPC would accept.
- `pasteTransformer` is a prop and runs before the pattern test.
- `inputMode` defaults to `numeric`; the Code is alphanumeric.
- `autoComplete` defaults to `one-time-code`, inviting an SMS autofill that will
  never come.

**The Code gets a copy button, and the list row stops being a single button to
make room for it.** A row that navigates swallows any attempt to drag-select the
Code inside it, so select-and-copy was never on offer in the first place.

**Joining is immediate** — no preview-then-confirm step, which would be a pure
enumeration oracle letting somebody probe Codes without leaving a Membership
row. A bad Code raises; a Code you already hold is idempotent rather than an
error; success returns the cal row and routes you into it.

**One thing the registry will fight you on**: `shadcn add` rewrites the `cn`
import to `from "cn"` against this repo's `@/lib/utils` convention, on every
component it writes.

## Acceptance criteria

- [x] `/` renders the join-or-create page for a signed-in Friend with any number
      of cals including none, and never redirects into one
- [x] `/g/:id` renders a cal, and an id you are not a Member of does not
- [x] Creating a cal shows the name dialog then the Code dialog, and the Code is
      also on the list behind it
- [x] Joining by Code works with lower-case typing and with paste
- [x] A bad Code surfaces an error; a Code you already hold routes you in rather
      than erroring
- [ ] The Code has a working copy button, and the row still navigates
- [x] The list is alphabetical
- [x] Availability drawn in one cal does not appear in the other
- [x] `npx tsc -b` is clean, `yarn test` passes, lint unchanged at nine

## Blocked by

- [01 — The cutover](./01-the-cutover.md)

## Built

Two pure modules, one hook, five components, and one route file. `src/cal/`
gains `code.ts` (the Code as a string), `cals.ts` (the list's rules),
`use-cals.ts` (the read and the two RPCs), `code-field.tsx`, `copy-code.tsx`,
`join-dialog.tsx` and `create-dialogs.tsx`; `src/pages/JoinOrCreatePage.tsx` is
the page; `current-cal-provider.tsx` is rewritten around the route param.
`src/components/ui/input-otp.tsx` is the registry's, with two edits.

Variant A was built as it stands, with C's copy button, rather than
cherry-picked: nothing from `src/prototypes/` is on this branch, and the
prototype's stubbed `joinCal`/`createCal` are the two real RPCs.

**Everything below was exercised against a local Supabase stack with `00`–`12`
applied**, signed in as a real account, not described. The live project is
pre-cutover and was never touched.

### The decisions this slice had to make

1. **`CurrentCalProvider` reads one row, not the list filtered.** Slice 01's
   comment predicted "reads `useParams()` and looks the id up", which admits
   both. One row is what `cal`'s select policy already answers: a cal you are
   not a Member of returns nothing, by the same expression that would have kept
   it out of a list. That makes **not a Member and no such cal one state**,
   which is deliberate. Telling them apart would answer *does this id exist*
   for every id, which is the enumeration groups ticket 11 refused for Codes.
   It also means `/` and `/g/:id` do not share a read, and should not: the page
   wants every cal, the route wants exactly one.
2. **A uuid-shape guard in front of that read, and it is not decoration.**
   `.eq('id', 'nonsense')` comes back `22P02 invalid input syntax for type
   uuid`, which is an *error* rather than an empty result, so without
   `isCalId` a mistyped address would read as "we cannot reach that cal" rather
   than as "no such cal". Verified against `/g/nonsense`: the not-found state, and no request.
3. **The provider's read is tagged with the id it answers**, the way
   `session-provider.tsx` tags the Friend row, rather than being cleared when
   the id changes. Clearing would be a synchronous `setState` inside an effect,
   which this repo's lint gate rejects outright; comparing `forCalId` against
   the URL gives the same answer with no extra render.
4. **Slice 01 asked for `key={calId}`, and it is on a `Fragment` around the
   children** rather than on `AppShell`, so `CalendarPage` stayed two lines and
   the invariant lives in the file that owns the cal. Demonstrated rather than
   argued: Availability drawn on Wed in one cal and on Fri in another, and each
   grid shows only its own, along with each cal's own Hangouts.
5. **The pattern is `^[A-Za-z0-9]*$`, not research ticket 03's 30-character
   one.** The build ticket and `08-cal-and-membership.sql`'s own comment both
   say so, and the reason is which failure is worse. `input-otp` compiles the
   pattern with no flags and tests it *before* `onChange`, so a rejected
   keystroke produces no event, no message and nothing on screen: too wide
   means the RPC says no in one sentence, too narrow means the keyboard goes
   dead under a Friend's fingers. `join_cal` normalises with
   `upper(btrim(code))`, so the server is where the two alphabets meet. `*`
   rather than `+` so the last backspace is not refused.
6. **A failed Join empties the field.** Not tidiness: `onComplete` fires only
   on a five-to-six transition, so six wrong characters left in place never
   auto-submit again, and `input-otp` splices a paste in *at the caret*, so
   pasting the right Code over the wrong one silently produces a mixture of the
   two, and the Friend most likely to paste is the one who just got it wrong.
   The caret goes back from an effect rather than from the failure branch,
   because the input still carries `disabled` in that tick and a disabled input
   cannot be focused. That one was found by watching it silently do nothing.
7. **Both dialogs carry a run counter.** They stay mounted whether or not they
   are open, so closing one mid-round-trip does not unmount the continuation
   below the `await`: a cancelled Join still routed into the cal, and a
   cancelled Create still popped the Code dialog open. Closing bumps the
   counter and the stale continuation writes nothing.
8. **Create guards on a ref, not on `busy`.** Two submits in one tick both read
   the old state, and unlike `join_cal` there is no `on conflict` to make the
   second harmless. `cal` has no delete grant either (`08` §5), so the second
   cal is one nobody can ever get rid of.
9. **The list read folds in rather than assigns.** Both doors are live while it
   is in flight, so a cal created or joined before it returns is one the read
   was issued too early to know about. Assigning dropped it off the list until
   a reload, which is exactly what the Code dialog's "Later" leaves a Friend
   looking at.
10. **The row's copy button needs no propagation guard, because nothing
    contains anything.** A button cannot contain a button, so the row is a flex
    row: a `Link` carrying name and Code, and the copy control beside it. The
    ticket asked for a guard; the structure is the guard, and a
    `stopPropagation` with nothing above it to stop would go stale the first
    time somebody rearranged the row. Ticket 05's overflow menu is a third
    sibling, and the position is commented rather than stubbed.
11. **The wordmark in the shell is the way back to `/`**, as a `Link`. It did
    not need to be anything while there was one cal. Ticket 03's dropdown is
    the way to switch without coming back through the page.
12. **The not-found state's button is `buttonVariants` on a `Link`, not
    `Button render={<Link/>}`.** Base UI's Button warns when what it renders is
    not a `<button>`, and silencing that with `nativeButton={false}` writes
    `role="button"` onto an `<a>`. That costs the middle-click, the context
    menu and open-in-new-tab, to a Friend staring at a dead end who is quite
    likely to want all three.

### `shadcn add`, and what was kept out of the lockfile

`npx shadcn@latest add input-otp` wrote `src/components/ui/input-otp.tsx` and
added **two** packages: `input-otp@^1.5.0` and `cn@^0.3.0`. Two edits to the
file, both of which the next `add` will undo and both of which are commented in
it: the `cn` import goes to `@/lib/utils` (the registry writes `from "cn"` on
every component, in 3.8.4 and 4.21.0 alike), and `InputOTPSlot` gains
`aria-hidden`, without which a screen reader meets the Code twice: once as the
input's value and once as six loose divs.

`cn` is **not** kept, and the lockfile carries **five lines**. The CLI's own
install rewrote 464 lines of `yarn.lock`, almost all of it re-resolving
platform binaries for machines nobody here builds on; that was reverted and the
one `input-otp` entry added by hand, matching the file's `registry.npmjs.org`
form. `package.json` gains one dependency. **Whoever merges this must run
`yarn install` in the main checkout.** No install was run from this worktree,
whose `node_modules` is a symlink into it and already had `input-otp@1.5.0`
from the prototype branch.

### What the rehearsal proved

A local stack on `127.0.0.1:54821` with `00`–`12` applied, signed in as
`ada@example.com` through the app's own sign-in, then `/setup`, which lands on
`/`. That landing is the first thing this slice changed.

- `/` lists four, then five, then six cals, **alphabetical with the id as the
  tie-break**, which the stack tested for free: it holds two cals both named
  "spiritually unemployed" and they come out in a stable order.
- A row navigates to `/g/:id`. The copy button does **not**, verified with a
  stubbed `writeText` that recorded `6VEFKE`, the right row's Code, while
  `location.pathname` stayed `/`. The real clipboard write is refused by the
  harness (`NotAllowedError: Write permission denied`), which is what the
  button's third state is for: it shows the alert icon and says so rather than
  pretending.
- **Typing `zzzzzz` in lower case produces `ZZZZZZ`**, submits on the sixth
  character, and comes back *"That code does not match any friens cal. Check
  the six characters."* The console confirms the mapping is real:
  `Could not join a cal: P0002 no cal with that code`.
- **Pasting ` 447-xfv `**, lower case with a dash and spaces both ends, joined
  and routed, and the Membership row is in the database. The `pasteTransformer` is
  what strips the dash and the spaces the pattern would otherwise refuse in
  silence.
- **A Code already held routes in with no error**: `447xfv` again landed on
  `/g/39e4d00b-…` with no alert on screen.
- **After a failure, the next six characters are a complete retry**: the field
  empties, the caret comes back, `m9jjgn` typed straight after the error
  auto-submitted and routed.
- **Create is two dialogs**: the name dialog closes, the Code dialog opens with
  `9ZNTWX` and a copy button, and "book club 9ZNTWX" is **already on the list
  behind it**, in alphabetical place. "Later" leaves the Friend on `/` with it
  there; "Open it" routes to the new cal.
- **The name caps where it is typed**: 62 characters typed, 40 kept. The column
  allows 60; 40 is the render budget ticket 03 shares.
- **A cal you are not a Member of**: a cal created as Bea rendered the
  not-found state at its `/g/:id`, no crash and no row. `/g/nonsense` renders
  the same state.
- **Availability is per cal, on screen and not only in the schema**: a run drawn
  on Wed in one cal and one drawn on Fri in another, each grid showing only its
  own, and one cal's Hangout absent from the other.
- **The empty state**: the same card, "You are not in one yet." over *"Nothing
  here yet. Somebody sends you a code, or you start one."*, both doors still
  under the rule, and no redirect.

### Checks

```
$ npx tsc -b
(clean)

$ yarn test
ℹ tests 301
ℹ pass 301
ℹ fail 0

$ yarn lint
✖ 9 problems (9 errors, 0 warnings)
```

29 of those 301 are new, in `src/cal/code.test.ts` and `src/cal/cals.test.ts`.
The Code tests compile `CODE_PATTERN` the way `input-otp` compiles it, with
`new RegExp(pattern)` and no flags, because that is the whole of the finding.

### What this leaves behind

- **A Friend with no cals cannot sign out.** The account menu lives in the
  shell (`top-bar.tsx`), which now exists only under `/g/:id`. This is not a
  regression. Before this slice, `/` with no Membership was the provider's
  "You are not in a cal yet" dead end, which had no menu either. It is now a
  screen a Friend can sit on forever, though. Extracting `FriendMenu` touches the
  shell that ticket 03 is about to rewrite, so it is recorded rather than done.
- **The name dialog's Enter-to-submit is unverified, not broken.** No `submit`
  event fires under this browser harness even for a bare
  `<form><input><button type="submit">` injected into a blank page, so the
  limitation is the harness. The form is a real form with a real submit button
  and a trusted, unprevented `keydown` reaching the input.
- **The screen-reader pass research ticket 03 asked for is still owed.** The
  accessibility tree is right: one textbox named "Join code, six characters",
  the slots hidden, and the copy buttons spelling the Code out character by
  character. How it sounds was not checked.
- **`useCals` has no Realtime and no poll**, deliberately: a Membership only
  changes because this Friend did something in this tab. A rename in another
  tab is ticket 03's.

### Left for after the cutover

Eight of the nine criteria are ticked and every one of those was checked against
a local stack rather than described. **None of them needed the cutover.**

The ninth, *"The Code has a working copy button, and the row still navigates"*,
is ticked in spirit and left open in fact. The half that is proven is the half
this slice could get wrong: the button passes the right Code (a stubbed
`writeText` recorded `6VEFKE` from that row) and the row does not navigate when
it is pressed. The half that is not is the clipboard itself. This browser
harness refuses the permission outright
(`NotAllowedError: Write permission denied`), which is what exposed the
button's failure state in the first place. **It needs one press in a real
browser**, and nothing else.

Two things for a human, neither of them the cutover:

1. **`yarn install` in the main checkout**, for the one new dependency. See the
   lockfile note above.
2. **The live migration is still ticket 01's.** `08` to `11`, and now `12`,
   are unrun against the live project, so this page cannot work there until
   they are. Deploying this client before them turns `/` into the error state, since
   `cal` does not exist yet.

## Comments

### The non-Member dead end became the settled redirect — 2026-09-16

Slice 05's review noticed that planning ticket 10 §9 decided a non-Member at
`/g/:id` redirects silently to `/`, and rejected a dedicated screen by name: it
would be a second place to type a Code, and against an opaque id it confirms
to a guesser that a cal exists. This slice shipped that screen. The
orchestrator replaced it with `<Navigate to="/" replace />` in
`current-cal-provider.tsx` after the merge, with the reasoning beside it. The
"cannot reach that cal" failure state stays, because a network failure is not
a membership answer.
