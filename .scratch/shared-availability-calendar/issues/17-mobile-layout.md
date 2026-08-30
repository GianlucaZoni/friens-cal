# 17 — The mobile layout

Type: grilling
Status: resolved
Blocked by: 12

## Question

Ticket 01 put mobile **fully in scope, including touch drawing**, and the human
flagged the layout as needing its own discussion. Ticket 12 decides the shell
and what the sidebar component does at its `sheet` breakpoint; this ticket
decides what the application *is* on a phone.

1. **The two sidebars.** Ticket 12 notes that "two sheets is not a layout". On a
   390px screen, do the left (friends + date picker) and right (Candidates +
   pinned Hangouts) become sheets, a bottom sheet, a tab bar, or something that
   is not a sidebar at all? `cmd+b` does not exist here, so every toggle needs a
   touch affordance.

2. **The week grid at phone width.** Seven columns against 46–50 rows leaves
   roughly 50px per day column. Does week view survive as-is, does it scroll
   horizontally, or does mobile get a different default view (single day, or
   three days)? Ticket 01 settled month and week as the two views — adding a
   third for mobile only would be a real change and needs saying out loud.

3. **Hover has no touch equivalent.** Two hover affordances are load-bearing:
   ticket 05's *who is free in this slot* blobatar panel, which after ticket 15
   is the **only** way to answer "who" at all, and the eye icon on the friend
   rows. Ticket 16 covers the Candidate card's own hover; this ticket covers the
   grid and the roster.

4. **The top bar.** The cluster from ticket 12 item 6 — blobatar menu, view
   select, Today, prev/next — at 390px.

5. **Is the phone a first-class editor or a reader?** Ticket 01 says drawing
   ships on touch (the gesture itself is ticket 10). Confirm that confirming,
   retiming and cancelling Hangouts are all reachable on a phone too, or scope
   some of them to desktop deliberately rather than by omission.

Blocked by ticket 12, which decides the shell mechanism the answers here have
to live inside.

## Answer

<!-- the mobile layout, and anything scoped out of it -->

## Answer

### The layout

**Top bar** — left: the **sidebar icon** (not a hamburger), opening the left
sidebar as a drawer. Centre: **month + year** with a chevron opening a
**calendar navigator** for jumping to other dates. Right: **Today** and the
current Friend's blobatar.

**Left drawer** (the shadcn mobile sheet the shell already provides) — the
**view selector** (day / 3-day / week / month), the **drawing-mode** and erase
controls, and the **Friend roster** with always-visible eye toggles, as on
desktop.

**Bottom drawer** — the right sidebar's contents, permanently **peeking** and
draggable out to full height.

**The grid** keeps seven columns at phone width (ticket 10), with **swipe
paging** to the previous/next block of days.

### The peek

The peek shows **one labelled card**:

- **"Upcoming"** with the nearest Hangout that has not yet ended, if there is
  one. ("Nearest" is the earliest `ends_at > now` — the same set ticket 09 pins.)
- otherwise **"Best Candidate"** with the first element of the Candidate list.
- otherwise whichever of ticket 09's three empty states applies.

One real card, not a summary count: the peek is the scarcest space on the
smallest screen, and a card answers *when are we meeting* without opening
anything.

### Month view on mobile: yes, but without avatars

Month is a fourth option in the selector. **Mobile month cells carry the wash
(peak concurrency), the own-Availability ring, the today pill and the Hangout
chip — and no avatars.** *Who* is answered by tapping the cell.

This is better than the desktop-only alternative I proposed. My objection was
that a ~50×60 phone cell puts wrapped avatars below the 12px floor ticket 14
measured — the exact failure that killed the dot row. **Dropping the avatars
removes the floor rather than fighting it**, and costs nothing, because ticket
10 already made tap the universal "who is here" gesture. The desktop cell's
avatars become an affordance the larger screen can afford, not a requirement.

### One drawer at a time

**Opening the left drawer collapses the bottom drawer to its peek.** Ticket 12
settled one sheet slot below 768px precisely so two sheets cannot stack; two
draggable surfaces open at once on a 375px screen means two competing drag
targets and two focus traps. Collapsing keeps the bottom drawer visible but not
interactive.

### Items 3 and 5, answered by implication

Recorded as decided rather than asked, because every other answer presumes them
— **say so if either is wrong**:

- **The eye icon is permanently visible** on each roster row in the drawer,
  with the whole row as the toggle. Hover-reveal is desktop-only.
- **The phone is a first-class editor.** Drawing, confirming, retiming and
  cancelling all reach it — ticket 16 puts the 3-dots permanently in each card's
  top-right corner on touch, and ticket 08's two dialogs must therefore work at
  390px.
