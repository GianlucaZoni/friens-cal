# 11 — How a Friend's colour is chosen and kept distinct

Type: grilling
Status: resolved
Blocked by: —

## Settled before grilling

**Colour collisions between Friends are acceptable.** Item 1 below is decided:
no quantised swatches, no rejection of nearby hues, no auto-assignment that
would change a Friend's colour as the group grows. Hue stays continuous and free,
and two Friends may end up looking similar — the blobatar shape disambiguates.
This also removes the "colour changes as the group grows" hazard entirely.

The rest of the ticket stands, and item 4 (expression tinting) gets *more*
important, not less: with collisions allowed, an avatar whose colour disagrees
with its own blocks is the only remaining way the grid becomes unreadable.

## Narrowed by ticket 15

The grid no longer renders per-Friend colour at all — it is a single-hue
heatmap in the *viewer's* colour. So a Friend's colour now only has to work in
**three** places: their blobatar, the Candidate glow border (built from all
participants' avatar colours), and their row in the left sidebar. Item 5
(contrast) shrinks accordingly: it is no longer a grid-legibility problem, and
the trade-off against avatar↔block identity mostly evaporates because there are
no coloured blocks left to disagree with.

Items 2, 3, 4 and 6 stand as written.

## Question

Ticket 03 established that a Friend's identity colour is a pure function of two
stored numbers — **`hue` (0–360) and `tone` (0–1)** — read back through
Blobatar's exported `palette(hue, enforce, tone)`. That replaces the "pick a
palette" wording in ticket 01 and opens questions that decision assumed away.

1. ~~**Collisions.**~~ **Decided — collisions are fine.** Hue is continuous, so nothing stops two Friends landing 4°
   apart and rendering as the same colour. Ticket 01 promises the grid needs no
   legend, which only holds if Friends are visually distinct. Options: quantise
   to N well-separated hues and let Friends pick from a swatch grid; keep
   continuous hue but reject/nudge a choice too close to an existing Friend;
   assign hue automatically by evenly dividing the circle among members; or
   accept collisions and lean on the blobatar shape to disambiguate. Note that
   auto-assignment means a Friend's colour **changes as the group grows**.
2. **Where the choice happens.** Setup step 2 is blobatar customisation — is hue
   picked there directly (a hue wheel), or implied by picking a rendered avatar
   from a set of options?
3. **`tone`.** Does a Friend choose it at all, or is it fixed group-wide so that
   only hue distinguishes people? A free `tone` makes two Friends at the same
   hue *more* confusable, not less.
4. **The expression problem.** The tinting expressions (`mad`, `love`, `shy`,
   `sick`) move the *rendered avatar* colours away from `palette(hue, …)`. So a
   Friend's avatar and their availability blocks would disagree — which breaks
   the "recognise them without a legend" premise. Do we (a) exclude the tinting
   expressions, (b) derive block colour from the *tinted* result instead, or
   (c) accept the divergence?
5. **Contrast. — CONFIRMED A REAL PROBLEM by ticket 05**, not a hypothetical:
   Blobatar's pale neutral tone is invisible in light theme and ink is invisible
   in dark. Any fix (clamping lightness/chroma per theme, restricting the
   choosable tones) costs the avatar↔block colour identity. Coordinate with
   ticket 15 item 3 — do not decide this twice.
   Some hues at some tones will be illegible against the grid, or
   invisible in the faint mesh gradient of ticket 05, or fail contrast against
   the sidebar background in both light and dark themes. Is the choice
   constrained, or corrected at render time?
6. **What is actually stored** on the Friend row: `hue` and `tone` alone, or
   also a resolved hex, so the grid does not depend on Blobatar's internals?

Feeds ticket 05 (the mesh gradient composes these colours) and the setup flow
still in fog.

## Answer

<!-- the colour model, and how distinctness is guaranteed -->

## Answer

### What is stored

Four values on the Friend row, all inputs, **no resolved hex**:

| Column | Value |
| --- | --- |
| `blobatar_seed` | text — controls **shape only** (see below) |
| `hue` | 0–360, continuous and free |
| `tone` | one of blobatar's six authored swatches |
| `expression` | one of **ten** (see below) |

A stored hex could not adapt to theme — and there are two derived colours per
Friend per theme, so one column would be wrong in three cases out of four. It
would also go stale silently if blobatar's authored constants moved on upgrade.

### The colour model: the avatar and the UI are computed separately

The blobatar renders from all four values, through blobatar's own
`palette(hue, true, tone)`.

**Every non-avatar use of a Friend's colour is computed by us instead:**

    oklch(L_theme, C_theme, hue)

Two constants per theme; only `hue` varies between Friends. This covers the
three places a colour still appears after ticket 15 — the **grid heatmap base**
(which is the *viewer's* own colour), the **Candidate glow border**, and the
**sidebar row**.

Two consequences, both the reason for choosing it:

- **Uniform perceived contrast across all 360° and both themes, by
  construction.** There is nothing to clamp, no render-time correction to tune,
  and **no tone has to be forbidden** — so the customisation step keeps all six,
  including the two ticket 05 proved unusable as block fills.
- **We stop depending on library internals for a contrast guarantee.** Ticket
  05's prototyped `oklch(clamp(L), max(C, …))` fix would have been load-bearing;
  here it is not needed at all.

**Accepted divergence:** an `ink` blob yields a mid-chroma heatmap. Avatar and UI
colour differ in lightness while sharing hue, so they still read as the same
person. The identity premise this used to threaten ("recognise your friends
without a legend") was already retired by ticket 15 — hue carries recognition
now, and lightness never did.

### Expressions: ten, not fourteen

Excluded: **`mad`, `love`, `shy`, `sick`** — the four that tint the palette.
Available: `idle`, `happy`, `sad`, `surprised`, `wink`, `sleepy`, `smug`,
`unsure`, `scared`, `thinking`.

The research reached this independently ("do not set a tinting expression on the
identity avatar"). The decisive argument is not the divergence itself but its
route: under the alternative, **changing your face silently recolours your entire
grid**, which is a startling outcome for a control that looks like picking an
emoji. Colour stays a property of a person, not of their mood.

### The seed controls shape alone

Because `hue` and `tone` are stored **explicitly** rather than left for blobatar
to derive from the seed (`opts.hue ?? t.num("hue", 0, 360)`), the seed is left
governing only the non-colour traits.

- **Reroll** lives in the customisation step and gives a new shape, leaving
  colour exactly where it was set.
- **Step 1's randomise must materialise** the seed's hue and tone into columns
  rather than leaving them null, or the next reroll would move the colour.

Shape matters here rather than merely decorating: the settled collision decision
leans explicitly on *"the blobatar shape disambiguates"*. Rerolling is compatible
with that — disambiguation needs shapes to be **different**, not **permanent**.

Named cost: a reroll changes how you look to everyone else with no notification,
since ticket 01 ruled those out of scope.

### Choosing it

Step 2 is **one live-preview blobatar with direct controls beside it**: a hue
slider, tone as a six-swatch segmented control, expression from the ten, and
reroll. Not a grid of pre-rendered options to pick from — whatever N options
were rendered would become the hues the group actually has, which is
quantisation by the back door and contradicts the settled continuous hue.

**The initial hue at signup is biased away from hues already taken.** This is a
**default, not a constraint**: it never moves an existing Friend's colour (the
thing the collision decision actually forbids), it is overridable by dragging
the slider one pixel, and nothing stops a Friend landing on someone else's hue
deliberately.

### Contrast

- **UI colour** — solved by construction, above.
- **The blob itself** — every blobatar renders with a **subtle ring in the
  theme's border colour**, so a `pale neutral` blob on a light sidebar or an
  `ink` blob on a dark one still has a defined edge. Uniform, theme-safe, one
  token; it does not special-case the two known-bad tones.

### Changing your colour later

**Freely**, from the profile dropdown, propagating over Realtime like any other
row. Nothing is *stored* in a Friend's colour, so nothing can become
inconsistent.

Changing your hue **recolours your entire grid**, because the heatmap renders in
the viewer's own colour. This is **intended, not tolerated** — the human's words:
*"it's the fun aspect of it."*

### Handed to other tickets

- **Ticket 16** — the glow border is built from **UI colours** (`oklch(L, C,
  hue)`), not from avatar `head` colours. At 3–6 colours they will be
  iso-lightness and iso-chroma, which should make the border materially easier
  to tune than the mesh gradient ticket 05 killed.
- **Ticket 15's heatmap** base colour is the viewer's UI colour, so the opacity
  ramp is tuned against a *fixed* lightness and chroma — one ramp per theme,
  not one per Friend.

## Amendment — the six tone swatches are addressed off by one

Found by the ticket 18 prototype and verified against the installed
`blobatar@2.7.0` (`node_modules/blobatar/src/color.ts:392`):

```ts
const toneAt = (v: number) =>
  TONES.find(([edge]) => v < edge)?.[1] ?? TONES[0]![1];
```

The numbers in the `TONES` table are **band upper edges, not swatch values**.
So `0.2` yields *pale neutral* (not pastel), `0.62` yields *deep* (not mid), and
**`1.0` falls off the `find` entirely and wraps to *pastel*** — the opposite end
of the scale from *ink*.

This ticket's own contrast paragraph refers to "an `ink` blob on a dark one".
The value that actually produces ink is **`0.93`**, not `1.0`.

**Store band interiors:**

| Swatch | Store |
| --- | --- |
| pastel | `0.10` |
| pale neutral | `0.28` |
| mid | `0.49` |
| deep | `0.71` |
| bright | `0.86` |
| ink | `0.96` |

The six-swatch segmented control writes these six values and nothing else.

Also verified by that prototype, and both hold: **reroll changes shape and never
colour** (four seeds at a fixed hue and tone render byte-identical fills, while
the same four seeds with no explicit hue/tone give four unrelated colours), and
**exactly the four named poses carry a tint** — this ticket's exclusion list is
correct and complete.

## Amendment — "uniform contrast by construction" is approximate

Measured by the ticket 16 prototype with a live sRGB gamut check, not argued:
**sRGB cannot hold a constant chroma around the hue circle.** At
`oklch(0.62 0.15 h)`, hue 200 renders at C ≈ 0.105 — about **30% duller** than
hue 25 — because the browser gamut-maps silently and says nothing.

So the scheme is right but the constant must be *computed*, not chosen by eye:

    C_theme = min over all h of maxChroma(L_theme, h)

which lands near **0.105 in light** and **0.128 in dark**. Picking a larger
value does not fail loudly; it just makes some Friends quietly duller than
others, which is the exact failure this scheme was chosen to prevent.
