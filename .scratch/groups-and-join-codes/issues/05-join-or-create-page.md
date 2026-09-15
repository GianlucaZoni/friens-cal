# 05 — Prototype: the join-or-create page, and the Code's three dialogs

Type: prototype
Status: open

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
