# 05 — Composite Availability rendering (prototype findings)

Prototype: `src/prototypes/composite-rendering/` — throwaway, fake data, no
Supabase, no drag, no persistence. Default export in `index.tsx`; route is not
wired (another agent owns `AppRoutes.tsx`):

```tsx
import CompositeRenderingPrototype from '@/prototypes/composite-rendering'
<Route path="/prototypes/composite-rendering" element={<CompositeRenderingPrototype />} />
```

Four variants on one route, `?variant=A|B|C|D`, floating bottom bar, ← / →.
Controls: visible Friends 2/4/6/8, fill technique mesh/stripes/blur, week/month,
light/dark, "clamp L/C", "show you".

`node_modules` was not installed in this worktree and I was told not to install,
so the React app was never executed. Everything below was judged from
**`src/prototypes/composite-rendering/pixels-standalone.html`** — a zero-dependency
HTML page in the same folder that reproduces the *identical* colour maths, mesh
gradients, segmentation and month cells in plain JS, rendered in a browser at
real size in both themes at 2 / 4 / 8 Friends. Open it directly (`file://`) if
you want the pixels without an `npm install`. The React version type-checks
clean but is **unverified at runtime** — expect one or two dumb bugs.

## Blobatar

Not installed, not installable here. `StubBlob` is a flat circle in the Friend's
hue+tone with two dots for eyes, same footprint. Colour is judgeable, shape is
not.

---

## Q1 — Segmentation. Answer: **segment (A), and the data shape should be segments.**

The probe at the top of the page renders the ticket's own case (Marco 18:00–22:00,
Sara 20:00–23:00, plus whoever else is visible) four ways side by side.

- **A — segmented**: one block per maximal interval where the *set* is constant.
  Three blocks in the two-Friend case. Every boundary is a visible edge.
- **B — continuous**: one block per maximal run of "somebody is free", the
  gradient cross-fading where the set changes.

B loses. Two concrete reasons, both visible in the probe:

1. **The cross-fade eats short segments.** The fade needs ~11px each side to not
   look like a hard edge; a 30-minute segment is 24px tall. Any segment under an
   hour is *entirely* fade, so the moment Sara joins is smeared across 22 minutes
   of wall clock and you cannot say when it happened. At 4+ Friends most segments
   are short, and B degrades into a vertical smear of everyone's colours — pretty,
   and information-free.
2. **B has nothing to hover.** A run is 18:00–23:00 and holds three different
   sets, so the block cannot answer "who is free *here*"; B needs a separate
   30-minute slot hit layer on top (it has one — that is why its hover reads
   "hovered a 30-min SLOT"). A's block *is* the answer set, which makes hover,
   click-to-select, keyboard focus and the Candidate list all agree on the same
   object.

So: the renderer consumes **segments** — `{ start, end, friendIds[] }`, produced
by a boundary sweep over the visible Friends' Availability (`segmentsFor` in
`data.ts`, ~15 lines). Runs are still worth computing (`runsFor`) but only as a
*grouping*: A currently leaves a 2px gap between adjacent segments, which reads
as three separate offers rather than one continuous window. Recommended shape is
**segments inside runs**: hard internal boundaries, one rounded outline and one
drop shadow per run. That is the thing to build, and neither pure A nor pure B
is it — steal A's segmentation and B's outer silhouette.

## Q2 — Legibility under load. Answer: **reads at 2, marginal at 4, dead at 6–8.**

- **2 Friends**: works, and looks good. Two hues in a soft mesh, obvious who.
- **4 Friends**: still parseable, but only because the colours were chosen far
  apart. The deliberate collision pair (Giulia h262 / Luca h268) is already
  indistinguishable — they read as one Friend. That is the accepted cost of
  ticket 01's "collisions are acceptable", and it is worse than it sounds: it is
  not "two Friends look similar", it is "the block looks like it contains one
  Friend when it contains two". The count is unreadable, not just the identity.
- **8 Friends**: mud. Overlaying eight translucent radial gradients in OKLCh
  averages to a desaturated olive/teal wash in light and a murky brown-green in
  dark. Nothing is recoverable — not identity, not even how many. Adding a
  Friend *reduces* apparent information. This is the finding: **the mesh
  gradient is a 2–4 Friend idea being asked to do a 9 Friend job.**

Which is why variant **D (density ramp + colour spine)** exists: the block body
carries only a neutral opacity ramp keyed to the *count*, and hue moves to a 5px
spine of ticks on the left edge plus hover. It is the only variant still
readable at 8 in both themes, and "where are the most people free" — the actual
question — is answerable at a glance. It is also duller. Worth putting in front
of the human as the honest fallback.

Distinctness from the viewer's own solid block: fine, and for a bad reason. The
solid block is so much heavier than any composite that it **obliterates what is
under it**, which is exactly the moment you care ("who else is free while I am?").
The prototype leaves a 14px rail on the right so the composite shows through —
it is not enough; you see a sliver. Unresolved sub-question, flagged below.

Distinctness from a Hangout: yes, comfortably. The conic multi-colour border +
glow (Q2 reference strip) is a different visual *class* from a soft fill, and it
survives being next to an 8-Friend mud block.

## Q3 — Technique. Answer: **stacked CSS radial gradients in one `background-image`.**

Three techniques are togglable in the prototype:

- **mesh (chosen)** — N `radial-gradient(130% 85% at x% y%, colour/0.42, colour/0)`
  layers plus one low-alpha `linear-gradient` base, all in a single
  `background-image` on one element. Positions come from a deterministic hash of
  (block seed, friend id), so they never move between renders. One DOM node per
  block, no canvas, no refs, no measurement, nothing to invalidate on scroll —
  it is a static string in `style`, so scrolling and re-rendering are free and
  it cannot desync from layout. React `key` stability is the only requirement.
- **stripes** — hard-stop `linear-gradient` bands, one per Friend. Rejected on
  sight: reads as a broken image or a progress bar, and at 8 Friends the bands
  are 12px wide diagonals of noise. Its one virtue is that the count is
  literally countable.
- **blur** — one absolutely-positioned blurred div per Friend with
  `mix-blend-mode: multiply/screen`. Closest to a real mesh gradient, and the
  worst behaved: N extra DOM nodes and N compositing layers *per block* (roughly
  300+ blurred layers for a busy week at 8 Friends), the blur bleeds past the
  block so `overflow:hidden` is mandatory, and the blend mode has to flip with
  the theme, which means it is not one visual but two. Rejected — but note this
  was rejected on looks and layer count, **not on a measured profile**, because I
  could not run the app.

SVG and canvas were not built. Both were rejected on argument: they buy a real
mesh (`feTurbulence` / `feImage` displacement, or a canvas gradient mesh) at the
cost of one more retained-mode tree to keep in sync with a grid that scrolls,
resizes, and re-renders on every Availability edit — and the CSS version already
looked good enough at the Friend counts where *any* mesh looks good. If the
human wants a genuinely organic mesh rather than blobs, that is an SVG job and a
separate ticket.

## Q4 — Month view. Answer: **it does not degrade, it needs its own treatment.**

A month cell is ~78×72px for a whole day. Four treatments are in the prototype:

- **A in month** (segments scaled into the cell) — a 6-stripe barcode. Legible as
  "busy" but the time axis is unreadable at that scale and the stripes read as
  UI noise, like a corrupted thumbnail.
- **B in month** (one whole-cell composite of everyone free that day + a 6px
  time strip at the bottom) — prettiest, and says almost nothing: it throws the
  time structure away, and the strip that puts it back is too small to see.
- **C in month** (a row of blobatar dots for who is free that day) — **the
  clear winner, and it is not a composite at all.** At month scale, identity is
  the only thing that fits, and discrete dots beat any gradient.
- **D in month** (neutral density wash + peak-concurrency numeral + spine strip)
  — the winner if the month view's job is "where should I look", not "who".

So the answer to the ticket's question is: the composite does **not** carry to
month view. Month wants dots (C) or a number (D). Ticket 01 says nothing about
month rendering beyond drawing 00:00–24:00 — that gap is real and should become
its own ticket.

## Q5 — Hover target. Answer: **the segment, not the slot — once Q1 is answered.**

Both models are in the prototype: A and C hover *rendered blocks*, B and D hover
*30-minute slots* via a transparent hit layer.

The slot layer is objectively worse to use: the panel re-renders on every 24px
of pointer travel through one continuous block whose answer never changes, and
the panel flickers as you cross a boundary. It only exists because B's blocks
cannot answer the question. With A's segmentation, block == answer set, so the
hover target is the block and the panel is stable for exactly as long as the
answer is.

Placement: the panel is `position: fixed`, anchored to the **side** of the day
column (right of the hovered block, flipping left near the viewport edge),
vertically aligned to the block's top and clamped to the viewport. Never above
or below, never overlapping — you are comparing the block to its neighbours in
time, so covering the column vertically is exactly wrong. Blobatars stack
vertically at 20px with the Friend's name; at 8 Friends the panel is ~280px tall,
which is fine beside a column and would be intolerable on top of one.

Not tested: touch. There is no hover on mobile and this whole mechanism has no
mobile equivalent. Ticket 01 has mobile fully in scope. That is a hole.

---

## Things that contradict or complicate settled decisions

1. **"Faint mesh gradient" is not one design, it is two.** The same alpha that
   reads as a whisper on white reads as a solid colour on near-black. In the
   prototype the light theme needs *more* alpha to be visible and the dark theme
   needs *less* to stay faint. Any spec that says "faint" has to say faint per
   theme, or the renderer needs a per-theme alpha multiplier.
2. **hue+tone does not guarantee a usable block colour** (ticket 01 Corrections,
   ticket 03). Tone is what a Friend picks for their *avatar*, and two of
   blobatar's six authored tones are unusable as block fills:
   - `pale neutral` (l .90, c .028) is invisible on a light calendar — Elena in
     the fake data. In light theme at 8 Friends she contributes nothing at all.
   - `ink` (l .34, c .035) is invisible on a dark calendar — Teo. In dark he is a
     hole in the grid.
   This is not a collision problem, it is a *contrast* problem, and it is not
   covered by "collisions are acceptable". The `clamp L/C` toggle in the
   prototype shows the fix: derive the block colour as `oklch(clamp(L), max(C,
   0.09), hue)` per theme rather than using the avatar's L/C directly. It costs
   the exact one-to-one identity between avatar and block that ticket 01 wanted —
   the block becomes "the Friend's hue", not "the Friend's colour". Recommend
   taking that trade; the alternative is Friends who are invisible on the grid.
3. **Colour collisions are worse than "two Friends look alike".** Giulia (h262)
   and Luca (h268) in a mesh do not read as two similar colours, they read as
   *one* Friend. The block silently under-reports how many people are free,
   which is the one number the grid exists to communicate. Still not arguing for
   collision avoidance — but the count needs to be legible independently of the
   colours (D's numeral, or a count badge on multi-Friend blocks).
4. **The viewer's own solid block hides the answer.** "Solid, on top" means your
   own Availability covers the composite exactly where the composite is most
   interesting. Needs a decision that is not in ticket 01: a rail (tried, 14px,
   too thin), an outline-only treatment for your own blocks, or your own colour
   as a left border with the composite still filling the block.
5. **Month view is unspecified and the composite does not survive there.** See Q4.
6. **Mobile hover has no design.** See Q5.

## What I would build

Segments grouped into runs (A's data, B's silhouette), stacked CSS radial
gradients, per-theme alpha, block-level hover with a side-anchored panel, a
visible count on any block with 3+ Friends, and month view on dots instead of
gradients. Plus a hard look at whether the mesh should switch to D's density
ramp above ~4 visible Friends — since the group is 6-9 people, the default view
is the one where the mesh is at its worst.
