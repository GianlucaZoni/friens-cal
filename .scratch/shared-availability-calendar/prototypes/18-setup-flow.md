# 18 — Setup flow and profile editing (prototype findings)

Prototype run 2026-08-30. Throwaway code, deliberately.

Prototype: `src/prototypes/setup-flow/` — no Supabase, no auth, no persistence.
Every submit is a stub that moves local state. Default export in `index.tsx`;
the route is not wired (another agent owns `AppRoutes.tsx`):

```tsx
import SetupFlowPrototype from '@/prototypes/setup-flow'
<Route path="/prototypes/setup-flow" element={<SetupFlowPrototype />} />
```

Five **screens**, not five variants — `?screen=signin|signup|step1|step2|profile`,
floating bottom bar, ← / →. Ticket 11 already decided what step 2 *contains* and
ticket 13 already deleted the screens that are gone, so there was no layout fork
worth building three ways. What *is* open is copy, so the two screens carrying a
copy decision cycle their drafts in place with `?copy=A|B|C` (or <kbd>c</kbd>).
`?theme=light|dark` (or <kbd>t</kbd>) because both themes had to be judged.

**`src/prototypes/setup-flow/preview.html`** is the standalone twin — open it
directly, no build step, no dev server, works offline. It is **generated**:

```sh
node src/prototypes/setup-flow/build-preview.mjs   # template → preview.html
```

Unlike the previous two prototypes' standalone files, this one is not a
hand-drawn imitation. `build-preview.mjs` inlines the **real `blobatar@2.7.0`
bundles** out of `node_modules` (both `dist/index.js` and `dist/expression.js`
are self-contained, no imports), so every blob on the page is drawn by the
library from real `hue` / `tone` / `expression` values. That was the point: this
ticket had to *check* ticket 11's claims, and a fake blob checks nothing.

Both the React version and the standalone were run. React typechecks clean
(`npx tsc -p tsconfig.app.json --noEmit` reports zero errors in
`src/prototypes/setup-flow/`); the standalone was driven in a browser through
all five screens in both themes.

---

## The headline: ticket 11's reroll claim **holds**

Ticket 11 reasoned it from blobatar's `opts.hue ?? t.num("hue", 0, 360)` — if
`hue` and `tone` are passed explicitly, the seed never reaches the colour path,
so a new seed moves shape alone. It had never been executed. It is now, twice.

**Against the library directly.** Four seeds, one fixed `hue: 210, tone: 0.62`,
diffing the rendered SVG's `fill` attributes against its geometry:

| seed | fills | geometry identical to previous |
| --- | --- | --- |
| `seed-alpha` | `#0097aa`, `#051214` | — |
| `seed-bravo` | `#0097aa`, `#051214` | no |
| `seed-charlie` | `#0097aa`, `#051214` | no |
| `zzz-9` | `#0097aa`, `#051214` | no |

Colour byte-identical across all four; shape different every time. The control —
the same four seeds with **no** explicit `hue`/`tone` — gives `#e39342`,
`#00c0bf`, `#c3dedd`, `#ad61c7`: wildly different, which is exactly the failure
step 1's materialisation exists to prevent.

**In the page.** Step 2's stored-values panel keeps the pre-reroll `head` hex and
renders a badge that reads *"head unchanged by reroll"* — and flips to a
destructive *"HEAD MOVED — bug"* if it ever stops being true. It has not.

So the decision stands, and the reason step 1 must **materialise** rather than
leave nulls is now demonstrated rather than argued: with nulls, the control row
above is what a Friend gets on their first reroll.

Ticket 11's other library claim also holds. Of the fourteen poses, **exactly the
four named** — `mad`, `love`, `shy`, `sick` — carry a `.tint` and move the
rendered fills. The other ten render byte-identical fills to `idle`. The
exclusion list is correct and complete.

---

## LOUD: the six tone swatches are addressed off by one

This contradicts `research/base-lyra-component-inventory.md` §5a, and through it
ticket 11's own wording. **It is a landmine for whoever builds this.**

The research quotes blobatar's `TONES` table with its comments:

```ts
const TONES: [number, { l: number; c: number }][] = [
  [0.2,  { l: 0.86, c: 0.085 }], // pastel
  [0.36, { l: 0.9,  c: 0.028 }], // pale neutral
  [0.62, { l: 0.73, c: 0.135 }], // mid
  [0.8,  { l: 0.62, c: 0.165 }], // deep
  [0.93, { l: 0.87, c: 0.16  }], // bright
  [1.0,  { l: 0.34, c: 0.035 }], // ink
];
```

and ticket 11 stores `tone` as "one of blobatar's six authored swatches", which
reads as *use those six numbers*. But four lines further down the same file:

```ts
const toneAt = (v: number) => TONES.find(([edge]) => v < edge)?.[1] ?? TONES[0]![1];
```

Strictly-less-than against the **upper edge**. Those numbers are band boundaries,
not swatch values. Measured, `palette(210, true, v).head`:

| you pass | you get | the table calls it |
| --- | --- | --- |
| `0.20` | `#c3dde2` **pale neutral** | pastel |
| `0.36` | `#00bcd3` **mid** | pale neutral |
| `0.62` | `#0097aa` **deep** | mid |
| `0.80` | `#66e9ff` **bright** | deep |
| `0.93` | `#213d42` **ink** | bright |
| `1.00` | `#8ce1f0` **pastel** ← wraps | ink |

Every one is the next swatch along, and `1.0` — the value anyone would type for
"the last one" — falls off the `find` and hits the `?? TONES[0]` fallback,
silently returning the **first** swatch. All six swatches are reachable; only
the addressing was wrong.

**Consequence for ticket 11's own contrast paragraph:** it justifies the ring
with "an `ink` blob on a dark one". The value that yields ink is `0.93`, not
`1.0`. A builder who stores `1.0` for ink ships a pastel blob and never sees the
case the ring was specified for.

**Recommendation — store band interiors, never edges:**

| swatch | store | band |
| --- | --- | --- |
| pastel | `0.10` | `[0.00, 0.20)` |
| pale neutral | `0.28` | `[0.20, 0.36)` |
| mid | `0.49` | `[0.36, 0.62)` |
| deep | `0.71` | `[0.62, 0.80)` |
| bright | `0.86` | `[0.80, 0.93)` |
| ink | `0.96` | `[0.93, 1.00)` |

These are what `identity.ts` uses, with the band lookup reproduced as
`toneKeyFor` / `snapTone` so a raw trait tone (which is a uniform 0–1) can be
snapped to the swatch it actually renders as. Ticket 07 should add a check
constraint on these six values rather than on `0..1`.

---

## The ring is already built, and it does less than ticket 11 thinks

Ticket 11 asks for "a subtle ring in the theme's border colour" on every
blobatar. **Nothing needs building.** The base-lyra `Avatar` root already ships:

```
after:absolute after:inset-0 after:rounded-full after:border after:border-border
after:mix-blend-darken dark:after:mix-blend-lighten
```

`Blobatar` wraps `Avatar`, so every blob in the app gets it for free, in the
theme's `--border`, blend-mode-switched per theme. One token, no special-casing
of the two known-bad tones — exactly the shape ticket 11 specified. The
standalone preview replicates it in plain CSS so the two agree.

The ring is **needed**. WCAG ratios of `palette(h, true, tone).head` against the
theme surfaces, across hues 30 / 210 / 300:

| tone | vs `#ffffff` | vs `#0a0a0a` |
| --- | --- | --- |
| pastel | 1.48 – 1.57 | 12.6 – 13.3 |
| pale neutral | **1.42 – 1.45** | 13.6 – 13.9 |
| mid | 2.30 – 2.53 | 7.8 – 8.6 |
| deep | 3.50 – 3.93 | 5.0 – 5.7 |
| bright | 1.43 – 1.52 | 13.1 – 13.8 |
| ink | 11.6 – 12.0 | **1.65 – 1.71** |

Three tones sit at ~1.5:1 on a light surface and ink sits at ~1.7:1 on a dark
one. Ticket 05 was right, and ticket 11 was right to keep all six only because
the ring exists.

**But the ring is a disc frame, not a silhouette outline.** It traces the
`Avatar`'s circle, not the blob's own contour, and where it crosses the blob's
edge `mix-blend-darken` resolves to the blob. So it reliably answers *"where is
the avatar"* and does **not** answer *"what shape is the blob"*. That matters
more than it sounds: the settled collision decision leans on *"the blobatar
shape disambiguates"*, and a pale-neutral blob at 24px in a sidebar row is a
faint smudge inside a crisp circle. Judged in the browser at real size it is
readable at 32px and up, and marginal at the 24px used in dense rows. Not a
blocker; a thing ticket 12/15 should look at once real rows exist.

Two smaller library facts, confirmed and worth keeping:

- Ink flips its `eye` to near-white (`#ecf8fa`) because `head.l < 0.5`. Anything
  drawing text in `eye` gets the polarity for free.
- The library *already* runs `ensureContrast(head, DARK_SURFACE, 1.5)` — the ink
  swatch is authored at `l 0.34` rather than `0.17` specifically so it does not
  vanish on a dark page. Our ring is the second line of defence, not the first.

---

## `password-field` never landed

Ticket 18 asked to check. It did not: `src/components/ui/` has no
`password-field.tsx`, and `shadcn info` does not list it among the 26 installed
components. The registry item exists
(`https://blobatar.dev/r/password-field.json`, `registryDependencies: ["input"]`).

The prototype builds one from `InputGroup` + `InputGroupAddon` +
`InputGroupButton`, which is the shadcn-sanctioned shape for a button inside an
input anyway. Adding the registry item later is a swap, not a rewrite. **No
reason to install it** unless it turns out to do something ours does not —
worth one `npx shadcn view` before deciding, which this ticket was not allowed
to run.

---

## The rejection copy lives in SQL, and the drafted SQL leaks

The `before-user-created` hook returns `{ error: { http_code, message } }` and
Supabase hands that `message` to the client verbatim. So the rejection copy is a
**string inside `public.hook_restrict_signup_to_allowlist`**, not a React
constant. The screen renders what came back.

**CONTRADICTION.** The copy-pasteable hook in
`research/supabase-auth-and-rls.md` §1.4 ships exactly the leak this ticket
forbids:

```sql
'message', 'That email is not on the list. Ask whoever set this up to add you.'
```

Whichever draft the human picks has to be pasted **into that SQL**. Changing only
the React screen changes nothing.

**And copy cannot close the leak on its own.** With Confirm Email disabled
(ticket 13), an address that already has an account returns Supabase's own
`User already registered` — not the hook's message. Supabase's documented
enumeration protection is a property of the confirmation email we deleted. So
"is this address known here" stays inferable by anyone who tries an address
twice, whatever the hook says. Only a catch-all in the client that replaces
*every* signup error with one sentence closes it, and that is draft A's whole
shape — the other two drafts leave it open.

---

## Everything else the screens settled

**Sign in.** Email + password, and the space where "forgot password?" would go
carries the truth instead. Three drafts, below. The sign-in screen is otherwise
unremarkable and should be: it is four controls.

**Step 1.** Name field, one big animated blob, "Try another", and — new — a
visible row of the hues already taken with the new Friend's own starting angle
and its distance from the nearest of them. That row is what makes the bias
legible as a *default*: it says "you were started at 308°, 46° from the nearest",
and the next screen's slider moves anywhere including straight onto someone
else's hue. Without it the bias is invisible and reads as an assignment.

The stored-values panel under the card is prototype scaffolding, not design. It
exists so the human can watch `hue` and `tone` change *together with* the seed
here, and watch them **not** change on step 2's reroll.

**Step 2.** One live-preview blob, hue slider (with taken-hue ticks on the
gradient — labels, not walls), tone as a six-swatch segmented control showing
each swatch rendered at the *current* hue, ten expressions each rendered as a
real 40px blob of yours, and reroll. Not a grid of pre-rendered avatars.

Two additions worth keeping when this is folded in:

- The expression picker renders **your** blob in each pose rather than a generic
  one. It costs ten static `<img>` renders and it is the difference between
  picking an abstraction and picking your own face.
- A small "where this colour shows up" strip beside the preview — sidebar row,
  Candidate glow, heatmap ramp — because ticket 11's "changing your hue
  recolours your entire grid" is *intended, not tolerated*, and a Friend
  dragging a slider should see that before they find out.

**Profile dropdown.** Three items: identity (name + email), "How you look…",
sign out. Customisation reopens as a `Dialog` holding the same controls with the
walkthrough furniture stripped — not a route, not a settings page. Returning to
the calendar underneath is the expected end of it.

Deliberately absent, and each is a claim someone may want to argue with:

- **No "change password".** Ticket 13 deleted the *reset* flow, not
  `updateUser({ password })`, which still works for a signed-in Friend and needs
  no email. So this is a real choice, not a consequence — flagged below.
- **No theme switch.** Ticket 01 keeps view state ephemeral; light/dark is not a
  Friend column and does not belong beside things that are.
- **No "delete account".** Membership is a hand-curated allowlist. Leaving is a
  conversation.

---

## Two build notes that cost real time

- **`npx tsc --noEmit` at the repo root is a no-op.** `tsconfig.json` is a
  solution file with `"files": []` and two `references`, so bare `tsc --noEmit`
  compiles nothing and exits 0 no matter what is broken. The real check is
  `npx tsc -p tsconfig.app.json --noEmit` (or `tsc -b`). At the time of writing
  that reports three errors, none in `setup-flow/`: two unused locals in
  `drag-interaction/` and `month-cell/`, and — twice, in `month-cell/pieces.tsx`
  and `right-sidebar/pieces.tsx` — `Type 'string' is not assignable to type
  'Expression'`. That is precisely the trap
  `base-lyra-component-inventory.md` §5c warned about: over HTTP an expression is
  a string, in React it is an imported object. Two independent agents hit it.
  Worth promoting from a research footnote into the ticket that builds the
  avatar component.
- **Inlining two minified bundles into one HTML page needs IIFEs.** Both blobatar
  bundles declare one-letter top-level `var`s. As sibling classic `<script>`s
  they share a global scope, so `expression.js` silently reassigns
  `index.js`'s internals and the first render dies on `R is not a function`; a
  `const q` of mine collided with blobatar's `var q` and blanked the page
  outright. `build-preview.mjs` now wraps each bundle, and the page script, in a
  function scope. Recorded because the next standalone that inlines a real
  library will hit it too.
