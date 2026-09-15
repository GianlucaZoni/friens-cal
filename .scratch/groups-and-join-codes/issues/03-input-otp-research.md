# 03 — Does `base-lyra` ship Input OTP, and what does it pull in?

Type: research
Status: claimed

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
