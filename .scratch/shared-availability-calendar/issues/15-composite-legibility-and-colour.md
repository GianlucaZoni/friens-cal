# 15 — The composite at scale: colour, contrast, and your own blocks

Type: grilling
Status: resolved
Blocked by: —

## Question

Ticket 05 built the composite and found three ways ticket 01's promises do not
hold. Each is a trade-off only the human can make, because each costs something
that was explicitly asked for.

1. **The mesh gradient dies at 6–8 Friends.** Eight translucent gradients
   average into mud, and *adding a Friend removes information* — the exact
   opposite of what the view is for. Near-identical hues (now permitted, ticket
   11) read as one Friend, so the block **under-reports the count**. Only
   variant **D** — a neutral density ramp with a thin colour spine — still reads
   at 8. Taking D means the block's *fill* stops carrying identity and starts
   carrying **count**, with identity demoted to a 5px stripe. That is a real
   loss against "recognise your friends without a legend", and it may be the
   right price. Decide: keep the mesh and cap the useful group size, adopt D,
   or switch technique by Friend count (mesh at ≤4, D above).
2. **"Faint" is two designs.** The alpha that whispers on white shouts on
   near-black. Does the composite get **per-theme tuning** (two sets of alpha
   and lightness values), or does one of the two themes simply lose?
3. **Colour is not guaranteed legible.** hue+tone is a free choice (ticket 11),
   but Blobatar's pale neutral tone is invisible in light and ink is invisible
   in dark. Clamping lightness and chroma per theme fixes the grid **and breaks
   the avatar↔block colour identity** — the friend's face and their blocks would
   no longer be the same colour, which is the whole reason the identity was tied
   together. Options: clamp and accept the divergence; restrict the tones a
   Friend may choose; render blocks from a *derived* legible colour and accept
   that it is a cousin of the avatar's, not a twin.
4. **Your own solid block hides the composite underneath it.** Ticket 01 put
   your Availability solid on top — which covers precisely the information you
   are looking for, since the times you are free are the times you care who else
   is. Options: outline-only for your own blocks; your own as a thin edge marker
   with the composite intact; split the cell; or invert it — composite on top,
   your own shown as a border.

Feeds ticket 14 (month view) and any later ticket that renders a Friend's
colour.

## Answer

<!-- the four decisions, and what each costs -->

## Answer

**The composite is replaced by a single-hue heatmap.**

- The grid column renders as a **heatmap in one colour — the viewer's own** —
  where **opacity is proportional to the number of visible Friends free in that
  slot**. No mesh gradient, no per-Friend tinting, no density-ramp-plus-spine.
- **The viewer's own Availability is marked with a border and a ring**, not a
  solid fill, so it no longer occludes the density underneath it.

This resolves all four items:

1. **Scale** — solved by construction. Opacity is monotonic in the count, so
   adding a Friend always *adds* information. Near-identical hues cannot
   under-report the count, because hue no longer carries the count.
2. **"Faint" per theme** — one opacity ramp still needs tuning twice (light and
   dark), but it is now a single ramp of a single hue rather than a compositing
   problem. Implementation detail, not a design decision.
3. **Contrast** — mostly dissolves. Only *one* colour appears in the grid, so
   only the viewer's own colour must be legible in both themes. Per-Friend
   contrast clamping is no longer needed for the grid. → narrows ticket 11.
4. **Own-block occlusion** — solved. Border and ring sit at the edge of the
   cell; the density stays visible through the middle.

### Consequence to name

**Per-Friend colour no longer appears in the grid at all.** Ticket 01's
"recognise your friends without a legend" is dead as written: the grid answers
*how many*, and **who** is answered only by hovering (the blobatar panel from
ticket 05). Friend colour still matters for the blobatar itself and for the
Candidate glow border, which is built from all participants' avatar colours.
