# Input OTP in `base-lyra`

Research for `.scratch/groups-and-join-codes/issues/03-input-otp-research.md`.
Evidence branch: `research/input-otp` (commit `3c8f87e`), which holds the raw,
unedited output of `npx shadcn add input-otp` against this project.

Verified 2026-09-15 against `shadcn` CLI 3.8.4 and 4.21.0, `input-otp@1.5.0`,
`@base-ui/react@1.2.0` installed, React 19.2.

## Short version

Input OTP fits. Ticket 01 can keep it. The six-character restricted alphabet,
the forced uppercase and the lower-case paste are all reachable, but none of
them is the default, and two of the defaults are actively wrong for a join
code. The four overrides are in [what to pass](#what-to-pass).

One thing to fix by hand after installing: the CLI writes an import this
project does not use. See [the `cn` import](#the-cn-import).

## 1. Does `base-lyra` ship it, and what does it pull in

Yes. `https://ui.shadcn.com/r/styles/base-lyra/input-otp.json` returns 200.
The registry item declares:

- `dependencies: ["cn", "input-otp"]`
- no `registryDependencies`, no `cssVars`, no `css`
- one file, `registry/base-lyra/ui/input-otp.tsx`

Running `npx shadcn@latest add input-otp` created exactly one file,
`src/components/ui/input-otp.tsx`, and added two packages to `package.json`:
`input-otp@^1.5.0` and `cn@^0.3.0`. No CSS changes, no other components.

The file exports `InputOTP`, `InputOTPGroup`, `InputOTPSlot` and
`InputOTPSeparator`. `InputOTP` wraps `OTPInput`; `InputOTPSlot` reads
`OTPInputContext` for `char`, `isActive` and `hasFakeCaret`.

It uses the `animate-caret-blink` utility for the fake caret. That already
resolves here: `tw-animate-css` defines `--animate-caret-blink` and
`src/index.css` imports it at line 2. Nothing to add.

The container carries a `cn-input-otp` class. That class has no rules in
`node_modules/shadcn/dist/tailwind.css`, so it is an inert hook, not hidden
styling that could fight you.

Docs: https://ui.shadcn.com/docs/components/base/input-otp

### The `cn` import

The written file starts `import { cn } from "cn"`. Every one of the other 27
files in `src/components/ui/` uses `import { cn } from "@/lib/utils"`. The CLI
does not rewrite this one, and it installs the npm package `cn` to satisfy it.

`cn@0.3.0` is not a squat. It is shadcn's own package
(`github.com/shadcn-ui/cn`), a compiled replacement for `clsx` plus
`tailwind-merge`. It typechecks and it works. It is still a third
implementation of a function this repo already has twice over, arriving on one
file out of twenty-eight.

shadcn 3.8.4 and 4.21.0 write the byte-identical line, so this is the registry
item's own shape, not a CLI regression to wait out. Fix it on the way in:

```
# after `shadcn add input-otp`
# edit the import to @/lib/utils, then
yarn remove cn
```

The file is also prettier-dirty as the CLI writes it (double quotes, no
semicolons). Format that one file; do not run `yarn prettier` across the repo.

Adding the file does not move the lint gate. `yarn lint` reports the same nine
`react-refresh/only-export-components` errors before and after, because
`input-otp.tsx` exports only components.

## 2. Radix, Base UI, and this project's `Input`

The question does not arise, and that is the useful finding. `base-lyra`'s
`input-otp` touches neither library. It imports `OTPInput` and
`OTPInputContext` from the `input-otp` package and `MinusIcon` from
`lucide-react`, and nothing else. There is no Radix context to be missing.

It also does not use this project's `Input` component or borrow its classes.
`InputOTPSlot` draws its own bordered `div` per character from `border-input`,
`ring-ring` and `border-destructive`, which this project's theme already
defines. So `base-lyra` reshaping `Input` cannot break it.

The architecture is worth knowing before styling it: there is one real
`<input>`, positioned `absolute inset-0` with `color: transparent` and
`caret-color: transparent`, lying over the slot divs. The slots are painted
text. The caret you see is a blinking div.

## 3. Clash with `@base-ui/react@^1.2.0`

None. `input-otp@1.5.0` has zero runtime dependencies and peer-depends only on
`react` and `react-dom` at `^16.8 || ^17.0 || ^18.0 || ^19.0.0`. MIT. It cannot
collide with Base UI because it never imports it.

Checked empirically in the worktree: `yarn typecheck` passes, and the component
server-renders under React 19.2 alongside the installed `@base-ui/react@1.2.0`.

Source of truth for the metadata: `https://registry.npmjs.org/input-otp`.

## 4. Six characters, restricted alphabet, uppercase, lower-case paste

This is where the defaults are against you. Three facts from the published
source (`https://unpkg.com/input-otp@1.5.0/dist/index.mjs`, types at
`.../index.d.ts`):

**`pattern` is a string compiled with no flags.** The component does
`pattern ? (typeof pattern === "string" ? new RegExp(pattern) : pattern) : null`.
No `i` flag is added. A pattern of `^[A-Z]+$` therefore rejects every
lower-case keystroke.

**`pattern` is tested before your `onChange` runs, against the raw value.** The
change handler slices the input to `maxLength`, and if the result fails the
pattern it calls `preventDefault()` and returns without calling `onChange`.
Uppercasing inside `onChange` is too late to rescue a lower-case character: the
character never reaches you. So the pattern has to accept both cases, and the
uppercasing is a separate step.

**`pasteTransformer` runs before the pattern test, and only on the paste path.**
Signature `(pasted: string) => string`, present since 1.5.0. The paste handler
reads the clipboard, applies the transformer, splices the result into the
current value, and only then tests the pattern.

There is a trap in that handler worth knowing. Its first line is, in effect,
`if (!pasteTransformer && !isIOS) return`. Without a `pasteTransformer` the
custom paste path does not run at all off iOS; the paste falls through to the
native change event instead. Supplying a `pasteTransformer` turns the custom
path on everywhere. That is the documented purpose, but it means adding the
prop changes desktop behaviour, not just iOS behaviour.

`REGEXP_ONLY_DIGITS_AND_CHARS` is exported, and it is just `"^[a-zA-Z0-9]+$"`.
Too loose for us: it admits `0 O 1 I L U`.

### The alphabet

Ticket 01 asks for A-Z and 0-9 minus `0 O 1 I L U`. That leaves 22 letters and
8 digits, 30 characters, so 30^6 = 729,000,000 codes.

```
^[2-9A-HJKMNP-TV-Za-hjkmnp-tv-z]+$
```

Checked in node: every one of the 30 allowed characters passes in both cases,
all six banned characters fail, and a partial prefix like `ABC` passes, which
matters because the pattern is tested on every keystroke, not only on the
complete code.

Note the pattern rejects `-` and spaces. Someone pasting `abc-23f` or a code
with a trailing space gets nothing, silently. `pasteTransformer` is the place
to fix that.

## 5. Keyboard and screen reader

**`inputMode` defaults to `"numeric"`.** For an alphanumeric code that is the
wrong keyboard on iOS: a number pad with no letters. Pass `inputMode="text"`.

**`autoComplete` defaults to `"one-time-code"`.** The source reads
`autoComplete: props.autoComplete || "one-time-code"`. That is right for an
SMS verification code and wrong for a join code a friend sent you in chat; it
invites iOS to offer an SMS autofill that will never arrive. Pass
`autoComplete="off"`.

**Almost nothing is announced.** The only ARIA attribute the component sets is
`aria-placeholder`. No role, no label, no live region. It needs a real label,
so wrap it in `Field` and `FieldLabel` like the rest of this project's forms.

**The slots are not hidden from assistive tech.** `InputOTPSlot` renders a
plain `div` containing the character, with no `aria-hidden`. Server-rendering a
six-slot instance produced six slot divs and zero `aria-hidden` attributes, so
a screen reader can encounter the six characters as loose text in addition to
the input's own value. Adding `aria-hidden` to the slots is a one-word change
to the local file and worth doing, since the real `<input>` already carries the
value.

## What to pass

```tsx
<InputOTP
  maxLength={6}
  value={code}
  onChange={(v) => setCode(v.toUpperCase())}
  pattern="^[2-9A-HJKMNP-TV-Za-hjkmnp-tv-z]+$"
  pasteTransformer={(p) => p.toUpperCase().replace(/[^2-9A-HJKMNP-TV-Z]/g, '')}
  inputMode="text"
  autoComplete="off"
  onComplete={submit}
>
```

`onChange` handles typing, `pasteTransformer` handles pasting and also throws
away dashes and spaces so a code copied out of a chat message still lands.
`onComplete` fires with the value once it reaches `maxLength`, so it receives
the already-uppercased string.

## The alternative, and why not yet

Base UI has shipped its own **OTP Field** since 1.4.0 (2026-04-13), and on
paper it is the better component for this job:
https://base-ui.com/react/components/otp-field

It renders a real `<input>` per character rather than one hidden input under
painted divs, it asks for an explicit `aria-label` of the form "Character X of
Y" on each, and it has `normalizeValue`, a transform hook whose own
documentation example is uppercasing an alphanumeric code. `validationType`
takes `'numeric' | 'alpha' | 'alphanumeric' | 'none'`, and `onValueInvalid`
reports whether a rejection came from `'input-change'` or `'input-paste'`.
That is the shape of API this ticket is asking for, instead of three
interacting workarounds.

Two things stop it being the answer today. This project has
`@base-ui/react@1.2.0` locked, which predates OTP Field, so adopting it means a
version bump that every other `base-lyra` component in `src/components/ui/`
rides on. And `base-lyra` does not wrap it: the registry's only OTP item is the
`input-otp` one, so the styling would be hand-rolled rather than installed.

Worth revisiting when Base UI gets bumped for another reason. Not worth the
bump on its own.

## Sources

- Registry item: https://ui.shadcn.com/r/styles/base-lyra/input-otp.json
- shadcn docs: https://ui.shadcn.com/docs/components/base/input-otp
- `input-otp` published source and types:
  https://unpkg.com/input-otp@1.5.0/dist/index.mjs and `.../dist/index.d.ts`
- `input-otp` package metadata: https://registry.npmjs.org/input-otp
- `input-otp` repo: https://github.com/guilhermerodz/input-otp
- Base UI OTP Field: https://base-ui.com/react/components/otp-field
- Base UI versions: https://registry.npmjs.org/@base-ui/react
