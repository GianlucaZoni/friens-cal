# 02 — Join or create a cal at `/`

Status: claimed
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

- [ ] `/` renders the join-or-create page for a signed-in Friend with any number
      of cals including none, and never redirects into one
- [ ] `/g/:id` renders a cal, and an id you are not a Member of does not
- [ ] Creating a cal shows the name dialog then the Code dialog, and the Code is
      also on the list behind it
- [ ] Joining by Code works with lower-case typing and with paste
- [ ] A bad Code surfaces an error; a Code you already hold routes you in rather
      than erroring
- [ ] The Code has a working copy button, and the row still navigates
- [ ] The list is alphabetical
- [ ] Availability drawn in one cal does not appear in the other
- [ ] `npx tsc -b` is clean, `yarn test` passes, lint unchanged at nine

## Blocked by

- [01 — The cutover](./01-the-cutover.md)
