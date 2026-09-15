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
