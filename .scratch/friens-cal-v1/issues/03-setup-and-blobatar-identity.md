# 03 — Setup flow and blobatar identity

Status: ready-for-human
Blocked by: 01

## Parent

[friens-cal v1 map](../../shared-availability-calendar/map.md)

## What to build

A new Friend picks a display name and a blobatar, and that blobatar becomes
their identity everywhere in the app. This is the most design-sensitive slice in
the build, which is why it wants human eyes before it merges.

**Two steps.** Step 1: display name plus a **randomised** blobatar. Step 2:
customisation — one live-preview blobatar with direct controls beside it. Both
steps show the avatar.

**The colour model is the load-bearing part** (ticket 11). The blobatar renders
through blobatar's own `palette(hue, true, tone)`. **Every other use of a
Friend's colour is computed by us:**

```
oklch(L_theme, C_theme, hue)          // two constants per theme, only hue varies
C_theme = min over all h of maxChroma(L_theme, h)   // ≈0.105 light, ≈0.128 dark
```

`C_theme` must be **computed, not eyeballed**: sRGB cannot hold constant chroma
around the hue circle, so a hand-picked `0.15` renders hue 200 about 30% duller
than hue 25 and the browser gamut-maps in silence.

**`tone` is a six-value enum, and its table numbers are band upper edges.**
blobatar resolves it with `TONES.find(([edge]) => v < edge) ?? TONES[0]`, so
`0.62` yields *deep* not *mid*, and `1.0` wraps around to *pastel* not *ink*.
Store **band interiors only**:

```
pastel 0.10 · pale neutral 0.28 · mid 0.49 · deep 0.71 · bright 0.86 · ink 0.96
```

**Ten expressions**, not fourteen: `idle happy sad surprised wink sleepy smug
unsure scared thinking`. The four tinting poses (`mad love shy sick`) are
excluded, because otherwise changing your face silently recolours your grid.
The React prop is typed `Expression`, an **object** — import the pose from
`blobatar/expression`. Passing the HTTP string form is a type error two
prototypes hit independently.

Because hue and tone are stored **explicitly**, the seed governs shape alone —
so **reroll changes shape and never colour**. Step 1 must therefore *materialise*
the seed's hue and tone into stored values, or the first reroll would move them.

Prototype: `src/prototypes/setup-flow/`.

## Acceptance criteria

- [ ] Step 1 takes a display name and shows a randomised blobatar, writing
      explicit `hue` and `tone` (never null)
- [ ] Step 1's initial hue is biased away from hues already taken — a **default**,
      freely overridable, never a constraint
- [ ] Step 2: live preview, hue slider (continuous), six tone swatches storing
      band interiors, ten expressions, reroll
- [ ] Reroll changes shape and leaves colour untouched — asserted by a test
- [ ] `C_theme` is computed from the sRGB gamut, not hard-coded by eye
- [ ] Every blobatar renders with a subtle ring in the theme's border colour, so
      `pale neutral` on light and `ink` on dark still have a defined edge
- [ ] Animation: `always` for the customisation preview and the top-right avatar
- [ ] Profile dropdown reopens customisation and holds **change password**
      (`updateUser`, which needs no email) and sign out
- [ ] Changing hue recolours the viewer's own grid — this is intended
- [ ] Light and dark themes both verified
- [ ] `npx tsc -p tsconfig.app.json --noEmit` is clean

## Blocked by

- [01 — Sign in, and your Friend row exists](./01-sign-in-and-friend-row.md)

## Comments

**Built on `feat/03-setup-and-blobatar-identity` (692c83f). Not merged — HITL.**

### The two constants, settled

`C_theme` is computed at startup from the sRGB gamut, never written down:

| Theme | `L_theme` (chosen) | `C_theme` (computed) |
| --- | --- | --- |
| light | 0.62 | **0.10540** |
| dark | 0.75 | **0.12750** |

`L_theme` is the only pair a human picked — the two ticket 16 measured at, kept
so the computation is checkable against an independent measurement. It agrees to
three decimals, from a separate implementation, with the same bottleneck hue
(≈199.75°, ticket 16's "Bea, h200").

Measured in a browser, round-tripping every 5° through a real sRGB canvas:

| Constants | Worst chroma lost |
| --- | --- |
| ours, light | **1.1%** (8-bit rounding floor) |
| ours, dark | **0.7%** |
| the prototype's `0.62 / 0.15` | **27.4%**, at hue 195 |

So the prototype's placeholder is confirmed as the failure ticket 16 described,
and the computed pair does deliver uniformity.

They reach CSS as `--friend-l` / `--friend-c`, injected once at startup, so
`friendColour(hue)` is `oklch(var(--friend-l) var(--friend-c) <hue>)` and
switches theme through the cascade. Nothing asks which theme is on — there is no
theme state to ask, and ticket 18 kept a theme switch out of the profile menu.
Injected rather than hand-written into `index.css` because a `--friend-c: 0.105`
in the stylesheet would be the eyeballed constant this exists to remove.

**For issues 04 / 07 / 08:** call `friendColour(hue)` (or
`friendColourAlpha(hue, a)`) from `identity/ui-colour.ts`. Never blobatar's
`head` — that carries the tone's lightness, which is free per Friend.

### Two bugs found by running it, not reading it

1. **`blobatar/motion.css` was never imported.** Issue 02's top-right
   `animate="always"` avatar was paying for inline SVG (a dozen nodes instead of
   one `<img>`) and then sitting perfectly still. Now imported in `main.tsx`;
   the avatar reports 8 running animations.
2. **The shadcn `Slider` counts thumbs with `Array.isArray(value)`.** A scalar
   falls through to the `[min, max]` default, so the prototype's `value={hue}`
   shipped a **second, draggable thumb** parked under the first. It type-checks
   either way. Fixed by passing `[hue]`; verified one thumb.

### The test criterion: `node --test`, no new dependency

There is no test runner in this repo. Rather than install one silently or skip
the criterion, the twelve assertions run on Node's built-in runner — Node strips
the types itself, `blobatar` resolves exactly as it does in the app, and
`yarn test` is the whole setup. They live in `src/identity/identity.test.ts` and
are typechecked by a new `tsconfig.test.json`, so
`tsc -p tsconfig.app.json --noEmit` stays free of node types.

Installing vitest is a bigger decision than this issue should make alone — if
you want it, these port over unchanged: they are `assert` calls on pure
functions, no renderer and no DOM.

### Verified end to end against the real project

Walked signed-in: `/` → `RequireSetup` → step 1 → step 2 → `/`, then the
profile menu's three dialogs. The row Postgres actually holds afterwards:

```
display_name "Gianluca" · blobatar_seed blob-7jus8tsrt · hue 35 · tone 0.49 · expression smug
```

and an attempted `tone: 1.0` is rejected with `23514`, so the band-edge trap is
closed at the database as well as in the client. Reroll confirmed live: path
data moves, fills stay byte-identical. Both themes checked on state and DOM
attributes rather than pixels — the Browser pane runs hidden, so screenshots
are downscaled and Base UI popups freeze mid-transition.

### Three judgement calls to sanity-check

1. **Step 1's avatar animates.** Ticket 18 decision 3 lists only the
   customisation preview and the top-right cluster; the ticket-18 prototype
   animated step 1 too, and it is the same single-large-avatar case the library
   documents `always` for. Easy to drop.
2. **The "where this colour shows up" strip appears in the dialog as well as in
   step 2.** The prototype hid it in compact mode for space. Kept because it is
   the answer to "changing your hue recolours your grid", which matters more
   once there *is* a grid. It scrolls rather than compressing.
3. **Change password asks for the current password**, verified with
   `signInWithPassword` before `updateUser`. Ticket 18 only says `updateUser`
   needs no email. Without the check, an unlocked session can change the
   password with no challenge; with it, the flow matches the ticket's own
   phrase, "works for anyone who knows their current password". Supabase's
   "Secure password change" project setting is the other way to get this.

### One criterion is only partly satisfiable here

- [x] all others
- [~] **"Changing hue recolours the viewer's own grid"** — the mechanism ships
  and the strip previews it live, but *there is no grid yet*: it is issues 05
  and 07. Nothing is missing from this slice; the criterion completes when the
  heatmap lands and consumes `friendColour`.

### Also worth knowing

- `SessionState` gained `friendStatus: 'loading' | 'ready' | 'error'`. Issue 01
  said the difference between "not loaded" and "failed" mattered to nobody; the
  setup gate is the caller that made it matter, since it must not send a Friend
  to setup merely because their row is in flight.
- `saveFriend(patch)` joined the session, and returns what Postgres stored
  rather than the patch.
- The **"Profile…"** dialog edits the display name. The criterion only asks the
  menu to reopen customisation and hold change-password; the editor is a small
  addition. Ticket 18 has name + email as a *label*, not an editor.
- The test Friend's row is now filled in from this verification pass, so
  `/setup` will redirect to `/`. To walk the flow again:
  `update public.friend set display_name = null, blobatar_seed = null, hue = null, tone = null, expression = null where id = auth.uid();`
- Lint is unchanged at the 11 errors already on `main` (all in `components/ui/*`
  and `grid-pattern.tsx`); this branch adds none.
