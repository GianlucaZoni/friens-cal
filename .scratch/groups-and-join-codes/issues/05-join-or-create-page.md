# 05 — Prototype: the join-or-create page, and the Code's three dialogs

Type: prototype
Status: resolved

## Question

Build the signed-in entry surface at `/` rough and throwaway, so there is
something to react to. Ticket 01 settled the structure; what it cannot settle on
paper is how it feels.

The brief, as given:

- A page with **"Join with a code:"** and **"Create a new friens cal"**.
- If the Friend has joined cals before, a **list** of them: name on the left in
  `foreground`, Code on the right in `muted-foreground`.
- **Create** opens a dialog for the name, then a *second* dialog showing the
  Code to share.
- **Join** opens a dialog to type a Code, entered through shadcn **Input OTP**
  (six characters, uppercase, alphabet minus `0 O 1 I L U`).

What the prototype is actually for:

1. **The empty state.** A brand-new Friend arrives here with no list at all,
   straight from `/setup`. Two actions and nothing else. Does that read as a
   front door or as a dead end?

2. **Two dialogs in a row on create.** Name, then Code. Is the second dialog
   right, or does the Code belong *on* the page once the cal exists, with the
   first dialog simply closing into it? A modal whose only content is a string
   to copy is a pattern worth looking at before committing to it.

3. **The Code in the list.** Six uppercase characters in `muted-foreground`,
   right-aligned. Is it tappable to copy? Does it need a copy affordance at all,
   or is select-and-copy enough?

4. **Input OTP with letters.** Six segmented boxes read as a verification code,
   which carries an expectation of urgency and expiry that a permanent join code
   does not have. Try it against a plain input with formatting and see which one
   lies less. Pasting a lower-case code must work.

5. **Failure.** A Code that matches nothing. A Code for a cal you are already
   in. Both need copy, and the second is not an error.

Ticket 03 may find Input OTP does not fit `base-lyra`; if it has not reported
yet, prototype with whatever is at hand and note the assumption.

Prototypes live on a `prototype/` branch, not on `main`. Link it here.

## From ticket 03, which is now resolved

[03](03-input-otp-research.md) confirms Input OTP fits, so prototype with it
rather than around it. Four defaults are wrong for a join Code and all four are
one prop each:

- **`pattern` must admit both cases**, e.g.
  `^[2-9A-HJKMNP-TV-Za-hjkmnp-tv-z]+$`. It compiles with no flags and is tested
  against the raw value *before* `onChange` fires, so uppercasing in the handler
  cannot rescue a lower-case keystroke — the character never arrives. Ticket 01
  said pasting a lower-case code must work, and this is the line that decides it.
- **`pasteTransformer`** runs before the pattern test and also strips dashes and
  spaces the pattern would otherwise reject in silence.
- **`inputMode="text"`** — it defaults to `numeric`, a number pad for a code
  made of letters.
- **`autoComplete="off"`** — it defaults to `one-time-code`, which invites an
  SMS autofill that will never arrive for a code pasted from a group chat.

Two things to raise with the human while prototyping, not to decide alone:

- The CLI writes `import { cn } from "cn"` and installs a `cn` package, where
  the other 27 files in `src/components/ui/` import from `@/lib/utils`. Ticket
  03 confirmed this is the registry item rather than a CLI bug to wait out.
- Accessibility is thin: `aria-placeholder` is the only ARIA attribute and the
  slot divs are not `aria-hidden`, so the six characters sit in the
  accessibility tree on top of the input's own value. Worth hearing with a
  screen reader before this ships.

## From ticket 11, which is now resolved

- **Joining is immediate.** No preview of the cal's name or size before
  committing — [11](11-joining-by-code-needs-a-second-rpc.md) ruled that out as
  an enumeration oracle. Six characters, then straight to `/g/:id`.
- **A bad Code raises**, so the dialog must **catch and replace** the Postgres
  and PostgREST error text with one sentence of its own, exactly as the signup
  screen already does. §5 of this ticket asked for that copy; it is now required
  rather than optional.
- **A Code for a cal you are already in is not an error** and needs no distinct
  state: the call is idempotent and returns the Group, so the dialog routes
  there as if it had been picked from the list. §5's second failure case
  dissolves.

## Answer

**Variant A, on all five questions, with one part of C folded into it.** Branch
`prototype/05-join-or-create`, commits `9b0c9df` (the three variants) and
`810251f` (A with the fold applied). Run it at
`/prototype/join-or-create?variant=A`; the route is outside both gates and every
byte of data is stubbed, so nothing there touches Supabase.

Three variants were built so the questions had something to disagree about:
**A** the brief taken literally, **B** two doors with no dialogs at all and the
Code revealed in place, **C** one stack of rows where joining and creating
expand inline and entry is a plain formatted input rather than the six boxes.
The human read all three and took A whole.

### The five questions, settled

1. **The empty state reads as a front door.** The same card, the list swapped
   for one sentence, both actions still under the rule at the bottom. The worry
   that two buttons and nothing else would read as a dead end did not survive
   seeing it: the card is the same object a Friend will see forever, so the
   empty version reads as *not yet*, rather than as *nothing here*.

2. **Two dialogs in a row on create, confirmed.** Name, then the Code. B's
   in-place reveal and C's new-row-in-the-list were the two alternatives and
   both lost. The modal whose only content is a string to copy earns its place
   because it is the one moment the Code has to be *unmissable*: everywhere else
   it is a quiet muted column, and a Friend who dismisses the second dialog
   without reading it still has the Code on the list behind it.

3. **The Code gets a copy button, and this is the one place A needed fixing.**
   Asked directly, the human chose C's trailing copy control over plain text and
   over a click-the-Code-to-copy split target. **A's row therefore stops being a
   single button.** A button cannot contain a button, and a row that navigates
   swallows any attempt to drag-select the Code inside it, so select-and-copy
   was never actually available in A as briefed. The row is now a flex row: name
   and Code are one target that opens the cal, the copy button is a second,
   and it flips to a tick for 1.4s. Its `aria-label` spells the Code out
   character by character.

4. **Input OTP, in a dialog, and it does not lie.** The worry was that six
   segmented boxes carry an expectation of urgency and expiry that a permanent
   join Code does not have. Against C's plain formatted input, which was built
   precisely so the comparison was real, the boxes won anyway. Six boxes say
   *six characters, exactly* better than a placeholder does, and the Code is
   only ever met in a context (somebody sent it to you just now) where the
   verification-code feeling is roughly true.

5. **One sentence, and no second failure state.** A bad Code raises and the
   dialog replaces the Postgres text with
   *"That code does not match any friens cal. Check the six characters."*
   A Code for a cal you are already in is idempotent per ticket 11 and routes
   there like any other row, so §5's second case stayed dissolved.

### What the prototype turned from research into fact

Ticket 03's four `input-otp` corrections were applied and driven with a real
keyboard, and two of them are now confirmed rather than inferred:

- **Typing `h3dkw9` in lower case produces `H3DKW9` and joins.** The two-case
  `pattern` is what makes that work. Without it the keystrokes never arrive and
  no amount of uppercasing in `onChange` can rescue them.
- **`aria-hidden` on the slot divs cleans the accessibility tree.** It now reads
  as one textbox labelled "Join code, six characters" rather than six loose
  characters sitting on top of the input's own value.

`inputMode="text"` and `autoComplete="off"` are set and are not observable from
a desktop browser. They stay as ticket 03 argued them.

### Three notes the build needs

- **The `cn` import will come back.** `src/components/ui/input-otp.tsx` is
  repointed at `@/lib/utils` and the `cn` package is dropped, but the registry
  item writes `import { cn } from "cn"` every time, in both shadcn 3.8.4 and
  4.21.0. Anyone re-running `shadcn add input-otp` reintroduces it. This wants a
  line in the build issue, not a silent patch.
- **The screen-reader pass is still owed.** The tree is clean; how it sounds was
  not checked, and ticket 03 asked for that before this ships.
- **The list has no ordering rule yet.** The prototype used insertion order
  because three rows made it moot. Ticket 06 renders the same list a second
  time, so it settles the order for both.

### Why B and C lost, kept because it is the reasoning

**B** gave up the list to make the two actions equal, which is true on the first
day and false by the third cal: stacked on a phone the two doors stop being two
doors and become a long scroll, and the chip strip breaks somewhere around six.
**C** read best of the three on a phone and its inline expansion is the
lightest, but it makes entering a Code feel like editing a row rather than going
somewhere, and its member count is data the page would otherwise never ask for.
The copy button is the part of it worth keeping, and it was kept.
