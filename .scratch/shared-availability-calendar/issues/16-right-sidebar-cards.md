# 16 — The right sidebar: Candidate and Hangout cards

Type: prototype
Status: resolved
Blocked by: —

## Question

Ticket 09 settled *what is in* the right sidebar and *in what order*; ticket 08
settled what a Hangout can do. What a card **looks like** is still open, and it
is a "react to something concrete" question rather than an argument.

Build the sidebar with real data and resolve:

1. **Candidate card anatomy.** Date, time range, duration, and the blobatars of
   the Friends in it — in what hierarchy? The count is the primary sort key, so
   it should probably be the most legible thing on the card; blobatars carry it
   implicitly but stop scanning well past four or five.
2. **The glow and the multi-colour border.** A border built from every
   participant's colour, at 3–6 colours, without it reading as a rainbow
   novelty. Ticket 15 killed the mesh gradient for exactly this reason, so treat
   its findings as evidence. Plus the `"everyone"` label's placement.
3. **Hover affordances.** Ticket 01 puts a **tick** (confirm) and a **3-dots**
   menu on hover. Ticket 10 will confirm there is no hover on touch, so both
   need a non-hover route.
4. **The manual time-edit popover** behind the 3-dots: changing day and time
   range, then confirming as a force-write. Ticket 08 requires this dialog to
   **name the Friends whose calendars it will write to**. That is a lot for a
   popover — decide whether it is a popover at all.
5. **The pinned Hangout card**, above the divider: participants' blobatars,
   title, the 3-dots with cancel and edit-times, and the hard-delete warning
   dialog ticket 08 requires (which must name every affected Hangout).
6. **The three empty states** from ticket 09, and how the divider behaves when
   one region is empty.

Deliberately *not* this ticket: the shell and the sidebar toggles (ticket 12),
the mobile layout (still fog), and the algorithm itself (ticket 09, resolved).

## Answer

Prototype: `src/prototypes/right-sidebar/` — three anatomies on `?variant=A|B|C`,
everything else a control. **Open `src/prototypes/right-sidebar/preview.html`**;
it needs no build and every control is a URL param. Findings, with the
comparisons and the rejected options, in
[`prototypes/16-right-sidebar.md`](../prototypes/16-right-sidebar.md).

Recommended anatomy is **variant A**. B and C each won one argument and both
contributions are folded in below.

### The Candidate card

```
┌─────────┬───────────────────────────────────────────┐
│         │  Sat · 20:00 – 23:00            ✓   ⋯     │
│    6    │  3h                                       │
│everyone │  ◍ ◍ ◍ ◍ ◍ ◍                              │
└─────────┴───────────────────────────────────────────┘
  56px rail          two-line body, blobatars third
```

| Element | Treatment | Why |
| --- | --- | --- |
| **Count** | numeral, 20px semibold, tabular, in a 56px left rail | it is the primary sort key; a right-aligned numeral column is what makes the list scannable |
| **Rail label** | `free`, or **`everyone`** at a full house | see the override below — the word replaces the *label*, never the numeral |
| **Date + time** | one line, 13px medium: `Sat · 20:00 – 23:00`; cross-midnight appends the day (`22:00 – 01:00 sat`) | no day headers exist, so every card states its own date |
| **Duration** | second line, 11px muted, tabular | subordinate: duration is the *last* sort key |
| **Blobatars** | a plain row at 22px, all of them, never an overlapped stack | it answers presence ("am I in this?"), not count; a `+2` hides people on exactly the cards that matter most |
| **Border** | **left stripe**, hard-stop segments in `oklch(L_theme, C_theme, hue)`, one per Friend — 3px, 5px when glowing, plus a soft shadow | see below |
| **Glow** | the coloured stripe **is** the glow. A non-glowing Candidate has a plain `border-border` card and no hue on it at all | reserving colour for `2n > groupSize` is what makes the top of the list findable |
| **Affordances** | tick + 3-dots, top-right, revealed on `:hover` **and** `:focus-within` | never hover-only, on any pointer |

### The pinned Hangout card

Same skeleton, deliberately a different object: muted fill, solid
`foreground/25` border, a pin glyph in the rail, and **no hue anywhere** — colour
in this sidebar means "this many Friends are free", and a Hangout is not an
offer. Title is the headline and time the second line (the inverse of a
Candidate). `edited` as a small muted **word** after the title (an icon reads as
a button). `now` in destructive colour while it is happening. `Join` as a real
button, not a menu item, for non-Participants. 3-dots: `Change the time…`,
`Leave`/`Join`, separator, destructive `Cancel this hangout…`.

### The border, at 3–6 colours

Ticket 15's mesh died because **lightness varied**. Under ticket 11's model it
cannot: every segment is iso-lightness and iso-chroma, hard-edged, and 3–5px
wide, so six colours read as one tonal band changing hue along its length — a
ladder, not a rainbow. Of the three techniques built, the **left stripe** wins
(calm and identical in character at 2 and at 6); the **ring** is second (best in
dark, diffuse in light, segments wrap corners); the **top ribbon** is rejected
outright — at 5–6 colours it is a pride flag, and 4 and 6 colours look like the
same object.

### The force-write editor is a **Dialog**, not a Popover

Both were built with an identical body. The popover fits — and is still wrong:
it occludes the grid you are consulting, outside-click discards a day and a time
range on the one action that writes other people's data, ticket 08 §7's
collision rejection has nowhere to appear, and the consequence has to be stated
*before* the controls, which needs a header slot a popover has not got. The
dialog opens with "This writes availability for everyone below, whether or not
they said they were free", and carries ticket 08 §11's sentence — *"Marco, Sara,
Bea and Nadia will be marked free Today 3 Sep, 21:00–23:00"* — immediately above
the confirm button. Names, never a count.

### Empty states and the divider

Ticket 09's three states, its copy verbatim, evaluated in its order. **The
divider exists only when both regions do**: no pinned Hangouts → no rule and no
heading, Candidates start at the top; no Candidates → rule, then the empty
message beneath it. Neither region gets a heading — the pin glyph and the card
treatment carry the distinction, and two headings is more chrome than a 320px
column supports.

### Overrides and corrections to earlier tickets

1. **Ticket 09's `"everyone"` placement is wrong.** It says the word goes *"in
   place of the count"*. Built that way it stacks as "every / one" in the rail,
   and — the real cost — it removes the numeral from precisely the cards at the
   head of the column the reader scans. **Keep the numeral, replace the label:**
   `6` over `everyone`. Ticket 09's actual decision (a word rather than more
   glow) is right and untouched; only its placement changes.
2. **Ticket 11's "uniform contrast by construction" is approximate.** Measured
   in the prototype's live gamut check: at `oklch(0.62 0.15 h)` hue 200 renders
   at C ≈ 0.105 — **30% duller** than hue 25 — because sRGB cannot hold constant
   chroma around the hue circle and the browser gamut-maps silently. Fix belongs
   to ticket 11 and is one line: pick `C_theme` as the *minimum* of
   `maxChroma(L_theme, h)` over 0–360 (≈ 0.105 at L 0.62, ≈ 0.128 at L 0.75)
   instead of by eye.
3. **This ticket mis-cites ticket 08 in its own item 5.** "The hard-delete
   warning must name every affected Hangout" is ticket 08 §10, which is about a
   *different* dialog — the strict-drop confirmation when you erase Availability
   covering two Hangouts. That belongs to the grid (tickets 06/07), not here.
   Cancelling from a Hangout card affects **exactly one Hangout, always**; built
   singular, naming the Hangout, its time and every Participant.

### Needs the human

1. **The `"everyone"` override.** Correction 1 above contradicts a resolved
   ticket. Take the numeral-plus-label form, or keep ticket 09 literal and
   accept the hole in the numeral column?
2. **The chroma constant.** Correction 2 is a change to ticket 11's resolved
   model. Adopt `C_theme = min maxChroma(L_theme, h)` — which costs some
   saturation at every hue to make all hues equal — or accept that some Friends'
   colours are duller than others? The prototype's diag panel has live L/C
   sliders for deciding this by eye.
3. **The plural drop dialog.** Correction 3 leaves ticket 08 §10's
   "names every affected Hangout" without a home. Does it get specified into a
   grid ticket, or was the sidebar the intended surface after all?
4. **Empty state 1 versus the pinned region.** Hiding five Friends shows *"Show
   more friends to see when you can meet"* directly under three pinned Hangout
   cards displaying those same five Friends' blobatars. Both behaviours are
   settled and correct; together they look broken. Options: reword the empty
   state when Hangouts are pinned; mute the blobatars of Hidden Friends on
   Hangout cards; or accept it.
5. **Sub-Candidate pairs read as duplicates.** `6 · Tue 20:00–20:30` sits
   directly above `5 · Tue 19:00–21:30` — the same evening, one nested in the
   other, with nothing on screen saying so. Add a relation annotation ("inside
   19:00 – 21:30"), or leave it?
6. **The long list's dead tail.** 38 Candidates for a group of 6 in a busy
   fortnight; everything past the first screen is two-Friend cards nobody will
   reach. Cap the list, add "show more" past the glow threshold, or leave it
   uncapped as ticket 01 settled? (The map lists this under performance; the
   tedium arrives well before the slowness.)
7. **Touch affordances.** Recommendation is: on `@media (hover: none)` the card
   body becomes the confirm target and only the 3-dots stays visible, rather
   than a persistent "Confirm" button per card (which becomes a wall of buttons
   and re-breaks the dense layout). Confirm before ticket 10 builds on it.
8. **The count-beats-duration ordering, seen once for real.** A 30-minute full
   house outranks a 2h30 window with five Friends, permanently. Settled in
   ticket 09 and not reopened here — but worth one look at the top of a real
   list before it ships.

## Correction to this ticket's own item 5

Item 5 asks for a cancel dialog that "must name every affected Hangout", citing
ticket 08. **That is a miscitation, made when this ticket was written.**

Ticket 08's multi-Hangout naming is its §10 — the **strict-drop confirmation**
shown when erasing Availability that covers two or more Hangouts, which lives on
the *grid*, not in this sidebar. Cancelling from a Hangout card affects exactly
one Hangout, always. Build it singular.

## Decisions so far

**Card anatomy: the app-shell prototype's card**, not variants A/B/C — date
top-left, `everyone` pill top-right, time range bottom-left, blobatars
bottom-right. **No count numeral**: the count is read off the faces.

**The blobatars wrap; they are never an overlapped `+N` stack.** This overrides
the stub, and follows the rule set for month cells. The prototype measured that
an overlapped stack hides people on exactly the cards that matter most; with
five Friends a wrapped row is at most five faces, so the cap would never fire
anyway and cannot hide anyone as the group grows.

**Confirm / Join / 3-dots sit absolutely positioned over the right edge of the
card**, not occupying layout — so cards do not reflow on hover.

**On touch the 3-dots is permanently visible in the card's top-right corner.**

**The force-write is a Dialog, not a Popover** — the popover fits and is still
wrong: outside-click silently discards edits on the one action that writes other
people's data, it occludes the grid being consulted, ticket 08's collision
rejection has nowhere to land, and the consequence must be stated before the
controls.

**The multi-colour border is a left stripe.** Ticket 05's mesh died because
*lightness varied*; iso-lightness genuinely changes the outcome — six hard-edged
segments in a 3px strip read as a colour ladder, not a rainbow.

## Answer

### The card

The app-shell prototype's card, not variants A/B/C: **date top-left, `everyone`
pill top-right, time range bottom-left, blobatars bottom-right**. **No count
numeral** — the count is read off the faces.

**Blobatars wrap; never an overlapped `+N` stack.** The prototype measured that
a stack hides people on exactly the cards that matter most. With five Friends a
wrapped row is at most five faces, so the cap would never fire — and cannot hide
anyone as the group grows.

**The multi-colour border is a left stripe.** Ticket 05's mesh died because
*lightness varied*; iso-lightness changes the outcome — six hard-edged segments
in a 3px strip read as a colour ladder, not a rainbow. **The coloured border
*is* the glow**: non-glowing cards carry no hue at all, because colouring every
card collapses the scan.

**A sub-Candidate card annotates its relation** — `6 · Tue 20:00–20:30` carries
"inside 19:00–21:30". Ticket 09 chose deliberately not to absorb sub-Candidates;
without the annotation the pair reads as the list repeating itself.

### Controls, and the desktop/touch split

**Desktop** — hovering reveals a **tick** and a **3-dots**, absolutely
positioned over the card's right edge so nothing reflows.

**Touch** — **no controls on the card at all.** Tapping the card opens a
**detail sheet** carrying every action: Confirm for a Candidate, cancel and edit
times for a Hangout.

> This **revises** the earlier decision to show the 3-dots permanently in the
> card's top-right on touch. The detail sheet subsumes it: with every action
> inside, there is nothing for a 3-dots to open.

It is also the consistent answer. Ticket 10 settled that **a bare tap reads and
never writes**, and confirming a Candidate writes *other people's* Availability —
the most consequential write in the product. A sheet that shows the Candidate
and offers Confirm is a read that leads to a write, which is the same shape as
the grid's tap-opens-popover.

**Consequence for desktop, recorded rather than asked:** clicking a card body
opens that same detail as a popover, making the hover tick an **accelerator**
rather than the only route — the pattern ticket 01 already set for ⌥+drag.

### The force-write is a Dialog, not a Popover

The popover fits and is still wrong: outside-click silently discards edits on
the one action that writes other people's data; it occludes the grid being
consulted to pick a time; ticket 08's collision rejection has nowhere to land;
and the consequence must be stated **before** the controls, not after.

### The list

**Everything below the glow threshold collapses behind "show more."** Not a cap —
nothing is removed, and the cut line is the *same* `2 × friends > group size`
the glow already uses, so the list expands to exactly the Candidates the product
calls worth looking at. In a busy fortnight a group of six generates ~38
Candidates and the tail is two-Friend cards nobody scrolls to; the tedium
arrives long before the slowness the map files under performance.

### Empty state 1, reworded

Hiding everyone shows *"Show more friends…"* directly beneath pinned Hangout
cards displaying those same Friends' faces. **The empty state rewords when
Hangouts are pinned** — along the lines of *"nothing to suggest while friends
are hidden"*.

Muting the Hidden Friends' blobatars on Hangout cards was rejected: ticket 01
settles that hiding **never** hides Hangouts, and a Hangout shows in full with
the Hidden Friend's blob. Muting is a partial hide through the back door.

### Colour

`C_theme = min over h of maxChroma(L_theme, h)` — ≈0.105 light, ≈0.128 dark.
Everyone is slightly less saturated so that **nobody is duller than anyone
else**; unequal saturation reads as a bug, not a choice, and silently punishes
whoever picked a blue.

### One thing to look at, not decide

Ticket 09's **count-beats-duration** ordering means a 30-minute full house
permanently outranks a 2h30 window with five Friends. Settled and not reopened —
but worth one look at the top of a real list before it ships.

## Amendment — the detail sheet names the Hangout (from issue 09)

The final `## Answer` above makes the detail sheet the primary route on touch and
a popover on desktop, carrying "every action". Issue 09 found the gap in that:
**every action it listed — Confirm, Join, Leave, Change the time…, Cancel — is
issue 10's**, so there was nothing for the sheet to carry in the slice that built
the cards, and confirm shipped as a bare tick with the sheet unbuilt.

Naming gives the sheet its own reason to exist, independent of the lifecycle.

### What the sheet holds

- **The name, editable.** This is the sheet's own content, not a lifecycle
  action, and it is the thing that makes the sheet worth opening on a Hangout
  that is otherwise just a time.
- The time, which opens the force-write **Dialog** — unchanged: a Dialog, not a
  Popover, for the four reasons above. A sheet that *contains* a dialog is fine;
  a popover that contains one is not.
- The Participants, as faces with names.
- **`confirmed by <Friend>`**, and **`retimed by <Friend>`** when set — ticket
  07's and ticket 08's provenance amendments. Rendered as quiet lines, not as
  chrome: they answer a question that only comes up after something surprising.
  Both are nullable, so both lines simply do not appear when absent.
- Join / Leave, and the destructive `Cancel this hangout…` behind the **singular**
  warning dialog (see this ticket's own correction above — it names exactly one
  Hangout, always).

### An unnamed Hangout is called "Hangout"

**Not a placeholder, and not empty.** `nameOf` in `hangouts/hangout.ts` supplies
the word, so there is no such thing as a Hangout without a name, and the
hierarchy this ticket settled — **the title is the headline and the time is the
second line** — holds unconditionally.

That mattered immediately. Issue 09 first built the card to promote the *time*
to the headline when the title was null, which quietly inverted the hierarchy on
every card that slice could produce — i.e. all of them, since nothing could set
a title yet. A default that reads as the product's own vocabulary costs nothing
and removes the special case rather than handling it.

"Untitled" and an em dash were both rejected: they read as a gap the viewer
should close. So was "Name this…", which is a nudge and belongs on the control
that does the naming, inside the sheet.

### The name shows on the calendar marker

The block on the week grid carries **the name**, not a bare pin. Drawn as a pin
alone (issue 09's first version, while nothing could set a title) it was
unreadable as anything but decoration, and indistinguishable from the drag's own
dashed outlines to anybody who had not been told what it was.

The name **only** — the time is the block's own position and height, already
said by the gutter it lines up with, and a 20px row cannot afford to say the
same thing three times.

**This is a new obligation on ticket 14 / issue 11's month view.** A confirmed
Hangout shows on every Friend's calendar, and the month is a calendar. Ticket 14
settled that month cells carry no numeral and that the week grid's heatmap does
not carry over; it never had a Hangout to place, and now it does — at a cell size
where a name may not fit at all.
