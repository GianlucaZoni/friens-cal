# 11 — Month view

Status: ready-for-agent
Blocked by: 07

## Parent

[friens-cal v1 map](../../shared-availability-calendar/map.md)

## What to build

The second calendar view. **Month is not a shrunken week** — the week composite
was prototyped at month-cell size and reads as a corrupted thumbnail. Month has
its own visual language.

At ~78×72px per cell:

| Channel | Carries |
| --- | --- |
| **Wash** in the viewer's hue, opacity ∝ **peak concurrency** | how good is this day |
| **Avatars**, overflow **wrapping**, never `+N` | who |
| **Ring** on your own Availability | am I in it |
| **Hangout marker chip** (mandatory) | something is booked |
| **Today pill**, selected-day treatment | where am I |

**No numeral.** Peak in the wash is what makes the avatars sufficient: two days
with identical avatar rows can have peak 1 and peak 9, and the wash separates
them.

**Contiguous days of your own Availability merge into one rounded rectangle** —
which is also what a click-drag across several days produces, so the gesture and
its result look like the same object.

**Drawing in month view means 00:00–24:00 for the dragged day.**

**The Hangout chip is mandatory, not decorative.** The Candidate pipeline blanks
a Hangout's slots, so a day whose whole group was free 20:00–23:00 with a
Hangout on exactly that window renders **peak 0 — the emptiest cell of the
month** — over its own best day. The chip is what stops the cell lying.

Own-Availability marking must **not** use the cell edge: it is already spoken
for four times (grid rule, today, selected, Hangout glow) and the Hangout border
wins. The today pill keeps the date numeral, so the two never contend.

Clicking a cell opens the information popover. Ticket 05's hover panel does not
transfer — it is three month columns wide with no safe direction.

Prototype: `src/prototypes/month-cell/`.

## Acceptance criteria

- [ ] Month grid at realistic cell size, both themes
- [ ] Wash opacity is **peak concurrency**, not coverage
- [ ] Avatars wrap; no `+N`; verified at 3, 5 and 8 Friends
- [ ] Avatars never render below a ~12px floor — below it, shape stops
      disambiguating and two near hues read as one Friend
- [ ] Your own Availability rings, and contiguous days merge into one rectangle
- [ ] Today pill and selected-day treatment, neither contending with the ring
- [ ] A day fully covered by a Hangout shows the chip and is not readable as empty
- [ ] Drag in month view writes 00:00–24:00 for each dragged day
- [ ] Click opens the information popover
- [ ] `npx tsc -p tsconfig.app.json --noEmit` is clean

## Blocked by

- [07 — Everyone's Availability as a heatmap](./07-heatmap.md)
