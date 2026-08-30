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
