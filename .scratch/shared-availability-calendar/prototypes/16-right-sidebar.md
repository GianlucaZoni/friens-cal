# 16 — The right sidebar: Candidate and Hangout cards (prototype findings)

Prototype: `src/prototypes/right-sidebar/` — throwaway, synthetic data, no
Supabase, no persistence. Default export in `index.tsx`; the route is **not**
wired (another agent owns `AppRoutes.tsx`):

```tsx
import RightSidebarPrototype from '@/prototypes/right-sidebar'
<Route path="/prototypes/right-sidebar" element={<RightSidebarPrototype />} />
```

**The thing that was actually looked at is `src/prototypes/right-sidebar/preview.html`**
— a zero-dependency twin with the identical pipeline, colour maths, card
anatomies, border techniques and dialogs. Open it directly, or serve the folder.
Every control is a URL param, so any configuration is a link:

```
preview.html?variant=A&technique=stripe&theme=dark&dataset=long&touch=1&retime=popover&open=cancel
```

Three card anatomies on `?variant=A|B|C`, ← / → to switch. Everything else is a
control, deliberately — border technique, theme, sidebar width (280/320/360),
dataset, touch mode, and popover-vs-dialog for the force-write — because those
want comparing *within* a variant, not across them.

- **A — count rail.** Count as a numeral in a dedicated left rail; date/time the
  headline; blobatars a demoted third row. Default border: full ring.
- **B — avatar-led.** Blobatars at 28px as the headline, count written out
  ("5 of 6 free"), time second. Default border: top ribbon.
- **C — dense rows.** No card chrome. One line, overlapped blobatar stack capped
  at 4 + "+N", numeral in a right column. ~44px a row against A/B's ~76px.
  Default border: left stripe.

**The list is not hardcoded.** `data.ts` implements ticket 09's pipeline —
horizon clip, hidden filter, Hangout blanking, sweep, extend, prune, sort. So
the order, the glow rule, the empty states and the clip-to-now on screen are the
real ones. The default dataset yields 19 Candidates and 3 pinned Hangouts over a
group of 6, including a six-colour full house, a cross-midnight Candidate, a
Candidate clipped to the current slot, a Candidate that exists only because a
Hangout ends at 20:30, and a superset/subset pair. `?dataset=long` gives 38.

Blobatars in the standalone are stand-ins (seeded blob + eyes) in blobatar's
*mid* tone, deliberately a different lightness from the UI colour — which is
what ticket 11's model actually produces. The React version uses the real
`Blobatar`. Colour is judgeable in both; shape is only judgeable in React.

**Verification status**: the standalone was driven in a browser in both themes,
all three variants, all three border techniques, all five datasets, both retime
surfaces and both dialogs. The React version type-checks clean (`npx tsc
--noEmit`, exit 0) but was **not executed** — the route is not wired and
`AppRoutes.tsx` belongs to another agent. Expect one or two dumb bugs there.

---

## Q2 first — the glow and the multi-colour border

### Iso-lightness does change the outcome. Ticket 15's verdict does not carry over.

Ticket 15 killed the mesh gradient at 6–8 Friends and this ticket was told to
treat that as evidence. It does not transfer, and the reason is specific rather
than hopeful:

| | ticket 15's mesh | this border |
| --- | --- | --- |
| Lightness | free per Friend (blobatar tones) | one constant per theme |
| Chroma | free per Friend | one constant per theme |
| Edges | soft, cross-faded | hard stops |
| Area | the whole block | a 3–5px strip |

The mesh failed because *lightness varied*: a `deep` blob next to a `pale
neutral` one made hotspots and holes, and the eye read texture instead of
identity. Under `oklch(L_theme, C_theme, hue)` every segment has the same
lightness and the same chroma, so the border reads as **one tonal band that
changes hue along its length**. At six colours it does not read as a rainbow
novelty. It reads as a colour ladder.

### The left stripe wins. The top ribbon loses badly.

All three were built and looked at at 2, 3, 4, 5 and 6 colours in both themes.

- **Stripe (left edge, 3px / 5px when glowing) — recommended.** Calm at every
  count. Six colours in a 55px-tall strip are ~9px each, which is enough to see
  a ladder and not enough to shout. It sits on the card's leading edge where a
  status marker belongs, it costs no layout, and it looks identical in intent at
  2 colours and at 6 — so the treatment does not change character as the group
  grows.
- **Ring (SVG stroke, perimeter-even) — acceptable, second.** Legible in dark,
  diffuse in light. Its glow halo is the most literal reading of "glow" and the
  prettiest, but the segments wrap corners, so no arc is a shape you can hold,
  and the card ends up outlined in something decorative.
- **Top ribbon — reject.** At 5–6 colours a full-width horizontal band of equal
  colour blocks reads as a pride flag or a Google bar. It is also the only
  technique where 4 colours and 6 colours look like the same object, so it
  carries no count at all.

Implementation note worth keeping: the ring is **not** a conic gradient. A conic
distributes by *angle*, and on a 300×55 card equal angles are wildly unequal
lengths — the side segments collapse to hairlines. It is one `<rect>` per colour
with `pathLength="100"`, which makes `stroke-dasharray` a percentage of the
perimeter, so segments are even at any card size with no measurement. The stripe
and ribbon are plain hard-stop `linear-gradient`s.

### Colour appears only on glowing cards.

Try `?colourEveryCard=1`. With a muted stripe on every card the difference
between glowing and not collapses to a width change, and the list loses its
scan. With colour reserved for `2n > groupSize`, the top of the list is coloured
and the tail is not — one glance tells you where the good options stop. In the
default dataset that is 6 of 19 cards.

So: **the multi-colour border *is* the glow**. There is no "border, plus a
glow"; a non-glowing Candidate has a plain `border-border` card and no hue
anywhere on it.

### Measured, and it contradicts ticket 11: iso-chroma is not renderable.

The standalone carries a live sRGB gamut check (bottom-left panel, with L and C
sliders). Ticket 11's claim is "uniform perceived contrast across all 360° and
both themes, **by construction**". That holds only if `oklch(L C h)` is
*renderable* at every hue, and sRGB's gamut is lumpy:

| Theme | Asked | Hue that clips | Actually rendered |
| --- | --- | --- | --- |
| light | `oklch(0.62 0.15 h)` | Teo, h85 | C = 0.127 (−15%) |
| light | `oklch(0.62 0.15 h)` | Bea, h200 | C = 0.105 (**−30%**) |
| dark | `oklch(0.75 0.145 h)` | Luca, h265 | C = 0.128 (−12%) |
| dark | `oklch(0.75 0.145 h)` | Bea, h200 | C = 0.128 (−12%) |

The browser gamut-maps silently, so nothing looks broken — but a Friend at hue
200 gets a visibly duller colour than a Friend at hue 25, in a model whose whole
selling point is that they cannot. **The fix is one line and it belongs to ticket
11, not here**: choose `C_theme` as the *minimum* of `maxChroma(L_theme, h)`
over the hue circle, rather than a number picked by eye. At L 0.62 that is
≈ 0.105; at L 0.75 it is ≈ 0.128. The two constants then genuinely deliver what
the model promises. The sliders in the diag panel are there so the human can
watch the "clipped" flags clear.

Ticket 11's *conclusion* survives — this is still far better than clamping per
render, and it still removes ticket 05's render-time correction. Only the word
"by construction" needs a footnote.

### The `"everyone"` label: ticket 09's literal wording was built and it is wrong.

Ticket 09 says the full house gets *"an 'everyone' label **in place of the
count**"*. Built exactly that way, in a 56px rail, "everyone" does not fit on
one line and stacks as "every / one". Worse — and this is the real cost — the
numeral column is **the** thing the rail exists for: the count is the primary
sort key, so a reader runs their eye down a column of right-aligned numerals to
find where the list stops being interesting. Removing the numeral from exactly
the two cards at the top of that column puts a hole at the head of the scan.

**Recommendation: keep the numeral, replace the label.** The rail reads

```
   6            5            4
everyone       free         free
```

The word still appears, the alignment survives, and the emphasis lands on the
word rather than on a wrapped fragment. Variant C does the same thing
differently — numeral in its column, `"3h · everyone"` on the second line — and
that also reads well, so the principle generalises: **the word is an annotation,
never a substitute for the count.**

This does not touch ticket 09's actual decision (a word rather than more glow —
which is right; stacked glow was never going to be tunable). It contradicts only
its placement. Flagged in the Answer for the human.

---

## Q1 — Candidate card anatomy

**A wins.** Details in the ticket's Answer; the comparative reasons:

- **B (avatar-led) loses the scan.** "5 of 6 free" as a sentence is pleasant to
  read and useless to skim — you have to parse each card instead of running down
  a column. It is also the tallest, so it shows the fewest Candidates. Its one
  genuine win is the full-house case: "Everyone's free" as a headline is better
  copy than anything A or C can do, which is where A's `6 / everyone` rail came
  from.
- **C (dense rows) is the density win and the fragility risk.** 19 Candidates
  fit in roughly one screen against A's seven. But at 320px the row could not
  hold date + full time range + stack + count + two controls: the time truncated
  to "Sat 20:00 – …" until the count column was cut from 52px to 18px (which is
  itself only possible because "everyone" moved off that column). And in touch
  mode, where the affordances are permanent, it truncates again — see Q3. C is
  one word of Italian away from breaking.
- **A survives every case tested** — 280/320/360, hover and touch, six colours,
  cross-midnight labels ("22:00 – 01:00 sat"), and "Tomorrow" / "Tue 15 Sep"
  date forms — because the two-line body absorbs pressure that C's one line
  cannot.

Blobatars: **a plain row, not an overlapped stack, up to the group size.** The
ticket worried they stop scanning past four or five. True — but at 6 they are
still fine as a *presence* check ("am I in this? is Luca in this?"), which is
all they are asked to do once the numeral carries the count. The overlapped
stack (C) is more compact and strictly worse at that job: it hides two of six
behind a "+2" precisely on the cards that matter most.

---

## Q3 — Hover affordances, and the non-hover route

Ticket 01 puts a tick and a 3-dots on hover; ticket 10 will confirm there is no
hover on touch. `?touch=1` renders the non-hover route.

Findings:

1. **Nothing may be hover-only, on any pointer.** The prototype reveals on
   `:hover` *and* `:focus-within`, so the keyboard route exists in both modes.
   That is not a touch concession, it is the accessibility floor.
2. **A persistent "Confirm" button on every card is wrong.** In touch mode the
   sidebar becomes a wall of identical buttons that out-weigh the count and the
   time, and in variant C it is what re-breaks the row.
3. **Recommendation: on coarse pointers the card body *is* the confirm target.**
   Tapping a Candidate card opens the confirm sheet (which already has to exist
   for the collision and force-write cases); only the 3-dots stays permanently
   visible, at reduced opacity. The tick stays a hover-reveal on fine pointers,
   where it is a genuine accelerator. This gives touch a bigger target than a
   26px icon button, and keeps one control on the card instead of two.
4. `@media (hover: none)` is the gate, not a viewport width — a touchscreen
   laptop at 1400px needs the touch route.

---

## Q4 — The force-write editor: **not a popover.** A dialog.

Both were built with the *identical* body (month calendar, start/end steppers,
duration readout, the ticket 08 §11 "will be marked free" sentence, and the
collision warning) and switched with `?retime=popover|dialog`, so the comparison
is about the surface and nothing else.

The popover is not too small — at 320×275 it holds the content. It is **wrong
for four reasons that size does not fix**:

1. **It occludes the grid.** Anchored to the sidebar's left edge, it lands on
   top of the calendar — the exact surface you consult to choose a new time.
2. **Outside-click dismisses it, silently.** This is the one action in the
   product that writes to other people's data (ADR-0002, ticket 08 §2). A stray
   click discarding a day and a time range you set is unacceptable here in a way
   it would not be for a filter popover.
3. **There is nowhere for the collision error.** Ticket 08 §7 requires a
   force-write onto an existing Hangout's time to be *rejected and surfaced in
   the editor*. That is another 40px appearing under the user's hand, in a
   floating surface with no room and no scroll.
4. **The consequence needs stating before the controls, not after.** The dialog
   opens with "This writes availability for everyone below, whether or not they
   said they were free." A popover has no header slot for that, and putting it
   at the bottom means it is read after the decision.

So: **shadcn `Dialog`, modal, with a `DialogDescription` stating the
consequence, and the named-Friends sentence directly above the confirm button.**
The 3-dots item is `Confirm at another time…` / `Change the time…` — the ellipsis
carries that a modal follows.

Sentence form as built: *"Marco, Sara, Bea and Nadia will be marked free Today 3
Sep, 21:00–23:00."* Names, never a count, per ticket 08 §11. Six names wrap to
two lines at dialog width; with longer names, three. That is acceptable and the
dialog has room for it — the popover did not.

---

## Q5 — The pinned Hangout card

Built in all three anatomies. Settled by looking:

- Pinned Hangouts read as **a different kind of object**, not a highlighted
  Candidate: muted `bg-muted/40` fill, a solid `foreground/25` border, a pin
  glyph where the Candidate's count rail is, and **no hue anywhere**. Colour in
  this sidebar means "this many Friends are free", and a Hangout is not an
  offer. Giving Hangouts a coloured border too would spend the one signal the
  list has.
- **Title is the headline**, time the second line — the inverse of a Candidate,
  because a Hangout has a name and that is how people refer to it.
- **"edited"** is a small muted word after the title (ticket 08 §1's permanent
  retime mark). A `PencilLine` icon was tried first in React and reads as an
  edit *button*; the word does not.
- **"now"** in destructive colour while `start <= now < end`. Cheap, and it is
  the moment the card matters most (ticket 09's reason for unpinning at `end`).
- **Join** appears as a real button, not a menu item, on Hangouts the viewer is
  not a Participant in — visible in the same hover/touch group as the 3-dots.
- 3-dots menu: `Change the time…`, `Leave` / `Join`, separator, destructive
  `Cancel this hangout…`.
- **Cancel dialog**: names the Hangout, its day and time, and every Participant,
  and says plainly that there is no undo *and* that nobody is notified — because
  ticket 08 §3 makes the absence the only signal anyone else gets.

### ⚠ Ticket 16's own text mis-cites ticket 08 here.

Item 5 of this ticket says the cancel dialog "must name every affected Hangout".
That is **ticket 08 §10**, and §10 is about a *different* dialog: the one fronting
the **strict drop rule** when you delete Availability that covers two Hangouts
("this drops you from Pizza Sat 20:00 and Climbing Sun 10:00"). That dialog is
triggered by an erase drag on the **grid**, belongs to ticket 06/07's surface,
and is not in this sidebar at all.

Cancelling from a Hangout card affects **exactly one Hangout**, always — a
plural list there would be inventing a case that cannot occur. Built as
singular. If the human wants the plural dialog specified, it needs its own home
in the grid tickets.

---

## Q6 — The three empty states, and the divider

All three are reachable as datasets (`?dataset=oneVisible|noAvailability|noOverlap`),
evaluated in ticket 09's order. Copy is ticket 09's, verbatim.

- **Divider rule as built: the divider exists only when both regions do.** Empty
  pinned region → no rule, no header, the Candidates start at the top. Empty
  Candidate region with pinned Hangouts → rule, then the empty message under it.
  Neither region gets a heading; the pin glyph and the card treatment carry the
  distinction, and a "Hangouts" / "Suggestions" pair of headings on a 320px
  column is more chrome than the two-card case can support.
- The empty message is centred with generous padding and reads as a state, not a
  card.

### ⚠ Found by building: the first empty state contradicts the pinned region.

In `?dataset=oneVisible` the sidebar says **"Show more friends to see when you
can meet"** — directly below three pinned Hangout cards showing the blobatars of
the five Friends you just hid. Both behaviours are correct and settled (hiding
never hides Hangouts, CONTEXT.md; the empty state is ticket 09's), and together
they look like a bug. Needs the human — options in the Answer.

---

## Other things the build surfaced

**Sub-Candidate pairs look like duplicates.** Ticket 09 decided a sub-Candidate
is its own card and is not absorbed. The sort then places them adjacently:

```
6  everyone   Tue · 20:00 – 20:30   30m
5  free       Tue · 19:00 – 21:30   2h 30m
```

The second is the first with Teo removed and two hours added. On screen, two
near-identical cards for the same Tuesday evening read as a glitch, and the
relationship — *this short one is inside that long one* — is invisible. The
algorithm is right; the presentation of it is not covered by any ticket. Cheap
fix available: when a Candidate is a strict subset of the one adjacent to it in
the list, annotate it ("inside 19:00 – 21:30"). Needs the human.

**The 4-friend/30-minute vs 3-friend/4-hour case is real and it looks odd.**
Ticket 09 made count strictly dominate duration, permanently. `?dataset=normal`
puts a 30-minute full house above a 2h30 five-Friend window. That is what was
decided and the prototype does not argue with it — but it is worth the human
seeing it once at the top of a real list, because it is the single most
surprising thing about the ordering.

**The long list has a dead tail.** `?dataset=long` produces 38 Candidates over a
group of 6. Roughly five screens, and everything past the first screen is
two-Friend cards that nobody will scroll to. The map already lists "Candidate
list performance" as unspecified; this adds the design half of it — the problem
shows up as *tedium* long before it shows up as *slowness*. Needs the human.

**Hangout blanking is legible, which was not guaranteed.** Ticket 09 blanks
Hangout slots for everyone, so a Candidate can appear that starts exactly when a
Hangout ends: the default dataset shows `Mon · 20:30 – 21:00 · 4 free`
immediately below the pinned `Climbing · Mon 18:30 – 20:30`. Seeing the cause
and the effect in the same column makes the rule explain itself rather than look
arbitrary.

**Sidebar width: 320px is the target; 280px works; 360px is comfortable.** A is
fine at all three. C needs 320 minimum and breaks at 280 in touch mode.

**Cross-midnight labels need the day.** A Candidate running 22:00 → 01:00 renders
`Tomorrow · 22:00 – 01:00 sat` — the trailing day is not decoration, a bare
"22:00 – 01:00" is a lie. Built into the formatter.
