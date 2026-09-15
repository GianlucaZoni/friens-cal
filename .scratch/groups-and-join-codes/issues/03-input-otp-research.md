# 03 — Does `base-lyra` ship Input OTP, and what does it pull in?

Type: research
Status: resolved

## Question

Ticket 01 chose shadcn **Input OTP** for entering a Code. It is not installed
(`package.json` has no `input-otp`), and `src/components/ui/` does not have it.

This project's shadcn style is `base-lyra` — a **Base UI** distribution, not
Radix. v1's ticket 03 inventoried it and found real surprises (two sidebars
sharing one provider's state; `cmd+b` hardcoded), so "shadcn has that component"
is not an answer here.

Find out:

1. Does the `base-lyra` registry ship `input-otp`? If so, what does
   `npx shadcn add input-otp` actually write, and what does it depend on?
2. Upstream shadcn's `input-otp` wraps the standalone `input-otp` package by
   Guilherme Rodz, which is not Radix-based. If `base-lyra` does not ship it,
   does the upstream component drop in unchanged, or does it assume Radix
   context or shadcn's `Input` styling that `base-lyra` shapes differently?
3. Does it clash with `@base-ui/react@^1.2.0`? v1's ticket 03 had to check
   exactly this for Blobatar's `avatar` dependency.
4. Six characters, uppercase, alphabet minus `0 O 1 I L U` (ticket 01). Does the
   component support a restricted pattern, forced uppercase, and paste of a
   lower-case code? `REGEXP_ONLY_DIGITS_AND_CHARS` is shipped — is a custom
   pattern supported, and is transformation on paste a prop or a wrapper?
5. Accessibility and mobile: what keyboard does it request on iOS, and does it
   announce sensibly to a screen reader?

If it does not fit, say what the nearest thing that does fit is — a plain
`Input` with formatting is an acceptable fallback and the human should be told
the trade rather than have it silently swapped.

Capture findings on a throwaway `research/input-otp` branch and link it here.

## Answer

Full findings, with sources:
`.scratch/groups-and-join-codes/research/input-otp.md`.
Evidence branch `research/input-otp`, commit `3c8f87e`, holds the raw output of
`npx shadcn add input-otp` against this project.

**Input OTP fits. Keep it.** Ticket 01's choice stands. Nothing needs swapping.

1. **`base-lyra` ships it.** `npx shadcn add input-otp` writes one file,
   `src/components/ui/input-otp.tsx`, and installs `input-otp@^1.5.0` plus
   `cn@^0.3.0`. No CSS, no other components. `animate-caret-blink` already
   resolves through `tw-animate-css`. It does not move the nine-error lint gate.

   One thing to fix by hand: the file imports `cn` from the npm package `cn`,
   where the other 27 files in `src/components/ui/` import from `@/lib/utils`.
   Repoint it and `yarn remove cn`. Both shadcn 3.8.4 and 4.21.0 write the same
   line, so waiting for a CLI fix will not help.

2. **Radix never enters into it.** `base-lyra`'s version imports only the
   `input-otp` package and `lucide-react`. It does not use this project's
   `Input` component or its classes; it draws its own slot divs from theme
   tokens. So there is no context to be missing and no styling to reconcile.

3. **No clash with `@base-ui/react@1.2.0`.** `input-otp` has zero runtime
   dependencies and peers only on React. Typecheck passes and it renders under
   React 19.2 with Base UI installed.

4. **The alphabet works, but only with three interacting props.** `pattern`
   compiles with `new RegExp(pattern)` and no flags, and it is tested against
   the raw value *before* `onChange` runs, so uppercasing in `onChange` cannot
   rescue a lower-case keystroke. The pattern must accept both cases and the
   uppercasing is separate:

   - `pattern="^[2-9A-HJKMNP-TV-Za-hjkmnp-tv-z]+$"` (30 chars, 729,000,000
     codes; verified the six banned characters fail and partial prefixes pass)
   - `onChange={(v) => setCode(v.toUpperCase())}` for typing
   - `pasteTransformer={(p) => p.toUpperCase().replace(/[^2-9A-HJKMNP-TV-Z]/g, '')}`
     for pasting, which also strips dashes and spaces that the pattern would
     otherwise reject in silence

   `pasteTransformer` is a prop, not a wrapper, and it runs before the pattern
   test. Note that supplying it also switches the custom paste path on off iOS,
   where it is otherwise skipped. `REGEXP_ONLY_DIGITS_AND_CHARS` is only
   `^[a-zA-Z0-9]+$` and admits `0 O 1 I L U`, so it is no use here.

5. **Two defaults are wrong for a join code.** `inputMode` defaults to
   `"numeric"`, which gives iOS a number pad for an alphanumeric code: pass
   `inputMode="text"`. `autoComplete` defaults to `"one-time-code"`, which
   invites an SMS autofill that will never come: pass `autoComplete="off"`.

   Accessibility is thin. The only ARIA attribute set is `aria-placeholder`, so
   it needs a real `Field` + `FieldLabel`. The slot divs are not `aria-hidden`,
   so the six characters sit in the accessibility tree as loose text on top of
   the input's own value. Add `aria-hidden` to `InputOTPSlot` when you install
   it.

### The thing worth knowing for later

Base UI has had its own **OTP Field** since 1.4.0, and its API is a better fit:
a real `<input>` per character, a required `aria-label` of "Character X of Y" on
each, and `normalizeValue`, a transform hook whose own documented example is
uppercasing an alphanumeric code. One prop where we are using three.

It is not the recommendation today. This project has `@base-ui/react@1.2.0`
locked, which predates it, so adopting it means a bump that every other
`base-lyra` component rides on, and `base-lyra` does not wrap it, so the styling
would be hand-rolled. Revisit when Base UI gets bumped for some other reason.
