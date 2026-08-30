# 05 — Prototype: the composite availability rendering

Type: prototype
Status: resolved
Blocked by: —

## Question

The single most visually specific decision on the map, and the one that cannot
be judged in prose. Build a throwaway prototype of the calendar grid rendering
so the human can react to pixels.

What it must show, per ticket 01:

- The viewer's own Availability **solid, on top**.
- Every other visible Friend's Availability **below, as a heatmap**, where each
  block carries a **faint mesh gradient composed from the colours of the Friends
  free in that slot**.
- **Hovering a slot reveals the blobatars** of the Friends in it.

What the prototype has to answer:

1. **Segmentation.** Where does one block end and the next begin when the *set*
   of free Friends changes mid-range? Marco is free 18:00–22:00 and Sara
   20:00–23:00 — is that one block that changes gradient at 20:00, or three
   blocks (Marco, both, Sara)? This is the crux, and it decides the data shape
   the renderer consumes.
2. **Legibility under load.** Does the mesh gradient still read at 2 Friends? At
   8? Does it stay distinguishable from the viewer's own solid blocks, and from
   a Hangout's glowing border?
3. **Technique.** CSS gradients, layered elements, SVG, or canvas — and does it
   survive the grid being scrolled and re-rendered.
4. **Month view.** The same composite in a month cell, where a day is one small
   box rather than a tall column. Does the approach degrade gracefully or does
   month view need its own treatment?
5. **Hover target.** What exactly is hovered — a 30-minute slot, or a rendered
   block that may span hours? And where do the blobatars appear without
   covering the thing you are inspecting.

Fake data is fine; no Supabase, no auth, no drag. Throwaway.

## Answer

<!-- link the prototype, record what was chosen and what was rejected on sight -->

## Answer

Prototype: `src/prototypes/composite-rendering/` (variants switch via
`?variant=A|B|C|D`, the bottom bar, or ←/→). Findings:
[`prototypes/05-composite-rendering.md`](../prototypes/05-composite-rendering.md).

**Caveat**: `node_modules` is not installed, so the React route was never
executed. The pixels were verified with a zero-dependency HTML twin
(`pixels-standalone.html`) using the same colour maths, in both themes at 2, 4
and 8 Friends. Visual conclusions are sound; integration is unverified.

1. **Segmentation — three blocks, not one.** The renderer consumes
   `{start, end, friendIds[]}` segments from a **boundary sweep**, grouped into
   runs for the outline: hard internal boundaries inside one rounded
   silhouette. Cross-fading a single run fails outright — the fade needs ~11px
   per side and a 30-minute segment is only 24px tall, so any sub-hour change of
   the Friend set is entirely smear. A run also has no single answer set to
   hover.
2. **Legibility — the mesh gradient does not survive.** Good at 2, marginal at
   4, **dead at 6–8**: eight translucent gradients average into olive mud in
   light and murky brown-green in dark, so *adding a Friend removes
   information*. The deliberate near-collision (h262/h268) reads as **one**
   Friend, so the block under-reports the count. Only variant **D** (neutral
   density ramp + a 5px colour spine) still reads at 8. → ticket 15.
3. **Technique** — stacked CSS `radial-gradient` layers in a single
   `background-image` on one element, positions from a deterministic hash. It is
   a static style string, so scrolling and re-render are free and it cannot
   desync from layout. Stripes rejected on sight (reads as a broken image);
   blurred layers + `mix-blend-mode` rejected for ~300 compositing layers per
   busy week and a blend mode that must flip per theme (rejected on looks and
   layer count, not a measured profile). SVG and canvas rejected by argument,
   not built.
4. **Month view — does not degrade gracefully.** In a 78×72px cell the segment
   barcode reads as corrupted-thumbnail noise and a whole-cell composite says
   nothing. The candidates are **non-composites**: a row of blobatar dots, or a
   peak-concurrency numeral over a density wash. → ticket 14.
5. **Hover — the segment, not the slot.** Once segmentation is settled,
   block == answer set, so the panel stays stable while the answer does; the
   slot layer only existed to prop up the rejected variant and flickers. The
   panel is fixed, anchored beside the day column, flipping at the viewport
   edge, never over the block — you are comparing vertically. **No touch
   equivalent exists**, which is a hole against ticket 01's mobile scope.

### Contradicts settled decisions

- **"Faint" is two designs, not one.** The alpha that whispers on white shouts
  on near-black. → ticket 15.
- **hue+tone does not guarantee a usable block colour.** Blobatar's pale neutral
  tone is invisible in light, ink is invisible in dark. This is a *contrast*
  problem, not a collision problem — and clamping lightness/chroma per theme to
  fix it costs the exact avatar↔block colour identity ticket 01 asked for.
  → tickets 11 and 15.
- **Your own solid block hides the composite underneath it** — it covers exactly
  what you wanted to see. Unresolved. → ticket 15.

## Caveat found later — this prototype tested the wrong tones

Tickets 14 and 18 independently found that blobatar's `TONES` numbers are band
**upper edges** (`find(([edge]) => v < edge) ?? TONES[0]`). This prototype stored
raw table numbers, so it rendered *pale neutral* where it meant pastel and
*pastel* where it meant ink — **silently disarming the two contrast landmines it
was built to demonstrate**.

Its contrast conclusions should be treated as unverified. This costs less than
it sounds: ticket 15 removed per-Friend colour from the grid, and ticket 11
computes UI colour independently of blobatar's tones, so nothing downstream now
depends on those measurements.
