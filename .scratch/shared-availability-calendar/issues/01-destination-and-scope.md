# 01 — Destination and v1 scope

Type: grilling
Status: resolved
Blocked by: —

## Question

What is `friens-cal` v1, and what is deliberately not in it?

## Answer

Charting grill, 2026-08-29. Every decision below is settled unless a later
ticket reopens it explicitly.

### Destination and stack

- The map produces a **spec + issue set**, not a running app. Build happens
  after, from the tickets.
- **Supabase** for database, auth and realtime; the app stays a static Vite SPA.
  See ADR-0001. The human is new to Supabase and wants concepts explained.
- **One Group**, implicit, never named or switched. Multi-group is a future
  effort.

### Identity and access

- Membership is a **hand-curated allowlist**. No open signup.
- Auth is **email + password**, not magic link. Entry is a public signup form
  gated by the allowlist — an email not on the list is told so. **Password reset
  ships in v1** (Supabase's own flow).
- First login is a **two-step setup**: step 1 display name, step 2 blobatar
  customisation. Both steps show the avatar; step 1 shows a randomized one that
  step 2 customises.
- A Friend's **block colour derives from their blobatar palette** — one identity
  choice drives both, so no legend is needed to read the grid.

### Availability

- **Binary** — drawn or not. No maybe. Adjacent/overlapping ranges by the same
  Friend **merge**.
- **30-minute snap** in week view.
- Editing: drag empty grid to create; drag a block's top/bottom edge to resize;
  click to select, delete to remove. **Alt+drag duplicates** a block and drops
  it freely (any day, any time). A Friend may only duplicate **their own**
  Availability.
- **Month view draws 00:00–24:00** for the dragged day, merging with whatever is
  already there. "All day" is not a separate concept — it is just a range that
  covers the day.
- Stored **UTC**, rendered in **one fixed group timezone** (Europe/Rome).
- **Past dates are drawable** and nothing is ever auto-deleted.
- **Silence is marked**: a muted dot beside Friends with zero Availability in
  the current view, so an inactive Friend does not read as a busy one.

### Rendering

- The viewer's own Availability renders **solid, on top**. Other Friends'
  renders **below as a heatmap**, each block carrying a **faint mesh gradient**
  built from the colours of the Friends free in that slot. **Hovering a slot
  reveals the blobatars** of those Friends.
- **Hide/show is ephemeral view state** — not persisted at all, not even to
  `localStorage`. Losing it on reload is fine.
- Hiding is a **query tool**: it filters the grid *and* drives Candidate
  ranking. It never hides Hangouts — a Hangout shows in full, with the Hidden
  Friend's blob.

### Candidates

- Computed over **non-Hidden Friends only**, from **today forward**,
  independently of what the calendar view is showing. Navigating the calendar
  does **not** change the list.
- **Minimum 30 minutes.** **No cap** — show all.
- Ranked by **most overlapping Friends first, then chronologically**.
- A Candidate where **every non-Hidden Friend** is free gets a **glow and a
  border built from all the participants' avatar colours**.
- Time ranges already covered by a confirmed Hangout are **excluded** from
  Candidates. Confirmed Hangouts instead **pin to the top of the right sidebar**
  and stay there **until the day of the Hangout**.

### Hangouts

- Created **only** by confirming a Candidate from the right sidebar. Hovering a
  Candidate reveals a **tick** (confirm) and a **3-dots** menu; the menu allows
  manually changing the day and time range, then confirming — a **force-write**
  that writes the Hangout at the chosen time.
- **Force-writing extends the Availability of the Friends already on the
  Hangout** to cover the new time. This is the only cross-Friend write in the
  product, and it goes through one narrow `security definer` RPC that may only
  ever *extend*. Extensions are **not reverted** on cancel or retime. See
  ADR-0002.
- A confirmed Hangout **shows on everyone's calendar** — participants' blobs in
  the cell, glowing border. Hovering reveals a **3-dots** menu with **cancel**
  and **edit times**.
- **Anyone may confirm, edit or cancel** any Hangout. Flat trust.
- Participants are **stored and seeded at confirmation**, and move one way on
  their own: **removing Availability that covered the Hangout drops you; adding
  Availability never adds you.**
- **Join** is explicit, and **also writes the Availability** to cover the
  Hangout. A Friend whose Availability covers a Hangout they are not on sees a
  **"Join?"** affordance on it.
- **Leaving is sticky** (`Left` outranks Availability forever) and **does not
  change the Availability** underneath.
- A Hangout carries an **optional title**. Nothing else.

### Platform

- **Mobile is fully in scope**, including drawing by touch (long-press-then-drag
  or another gesture, to be designed). The mobile **layout** needs its own
  discussion — see the map's fog.

## Corrections

Research resolved after this ticket closed has invalidated two lines above.
The corrections, not the originals, are what v1 builds to.

- **"Block colour derives from blobatar palette" is wrong as written.**
  Blobatar's `palette` prop is not a named palette a Friend picks — it is
  `Partial<Record<"bg"|"head"|"eye", string>>`, i.e. per-key hex *overrides*.
  What actually varies per Friend is **`hue` (0–360) and `tone` (0–1)**, and the
  colours are readable via the exported `palette(hue, enforce, tone)`. The
  decision survives in spirit (one identity choice drives avatar and blocks);
  the mechanism is hue+tone stored on the Friend row. Two new problems come with
  it — continuous hue means **collisions between Friends are possible**, and the
  four tinting expressions (`mad`/`love`/`shy`/`sick`) **move the rendered
  avatar colours off the stored palette**. See ticket 03 and ticket 11.
- **"Password reset ships in v1 (Supabase's own flow)" is not achievable as
  assumed.** Supabase's default mail service refuses delivery to anyone who is
  not a project team member and caps sending at 2 messages/hour project-wide —
  so most of the group could never receive a reset or confirmation email.
  Custom SMTP is required, or email confirmation must be dropped. See ticket 13.

- **"Faint mesh gradient" does not survive at group size.** Ticket 05 found it
  reads well at 2 Friends, marginally at 4, and turns to mud at 6–8 — adding a
  Friend *removes* information. Also: "faint" is two designs, since the alpha
  that whispers on white shouts on near-black. See ticket 15.
- **"Own Availability solid, on top" occludes what it is on top of.** Your own
  solid block covers exactly the composite you were trying to read. Unresolved;
  see ticket 15.
- **Month view cannot use the week view's composite.** At month-cell size it
  reads as a corrupted thumbnail. Month view needs its own visual language; see
  ticket 14.
- **Hovering to reveal blobatars has no touch equivalent**, which is a hole
  against this ticket's "mobile is fully in scope". See tickets 10 and 14.
- **The composite rendering is replaced by a single-hue heatmap.** The grid
  renders in **one colour — the viewer's own** — with **opacity proportional to
  the number of visible Friends free in that slot**. The viewer's own
  Availability is marked with a **border and ring**, not a solid fill. Per-Friend
  colour is therefore **absent from the grid**; *who* is answered only on hover.
  See ticket 15.
- **An erase drag is added**, and it is **toggleable from the left sidebar**. A
  drag starting inside a block subtracts that span. Merging is unchanged.
- **A "Drawing mode:" tab bar** is added with two options: **Linear** (default)
  and **Multi-day**. **Linear is the prototype's *linear time* geometry** — the
  drag is one continuous run through the week, so Tuesday 23:00 → Wednesday
  01:00 is a single unbroken Availability. **Multi-day** is the prototype's
  *rectangle* geometry — dragging across day columns paints the same hours on
  every day crossed. **There is no column lock.**
  - This **overrides ticket 06's recommendation**, which was column-locked;
    the human chose linear time after the trade-off was put to them. The known
    hazard stands: a stray sideways movement can extend a range across a whole
    day. It needs a **mitigation, not a re-argument** — hysteresis at the column
    boundary, so the pointer must travel meaningfully into the next day before
    the range follows.
  - It also **removes a problem**: ticket 06's cross-midnight answer was
    over-dragging the bottom edge, which it judged undiscoverable and bad to
    use. Linear time makes crossing midnight an ordinary drag.
- **⌥+drag duplication stays**, as an accelerator only; the discoverable path is
  a control on the selected block or the 3-dots menu.
- **No undo/redo and no reset.** The prototype's 50-deep undo stack is not part
  of v1.
- **The glow rule changed.** "A Candidate where every non-Hidden Friend is free
  glows" is replaced by `2 * friends_in_candidate > group_size`, with
  `group_size` counting the whole group, Hidden included. A true full house
  additionally carries an **"everyone" label**. See ticket 09.
- **Pinned Hangouts unpin when the Hangout *ends*, not on the day it falls.**
  "Until the day of the Hangout" would clear a Saturday Hangout from the sidebar
  at midnight on Saturday. See ticket 09.
- **The 30-minute Candidate minimum never fires.** Slot rows (ticket 07) and
  grid-snapped Hangouts (ticket 08) make a shorter Candidate inexpressible. It
  survives as an assertion, not a filter.
- **The hysteresis mitigation, as recorded above, does not work.** Ticket 10
  measured it: hysteresis taken **from the column boundary** protects you only
  if your finger happened to land mid-column — the same 30px drift is rejected
  when the anchor is central and accepted when it is 94% across. **Anchor-
  relative** hysteresis is predictable and does work, but **no setting rescues
  47px columns**, because the budget cannot exceed a column width. At 110px
  (3-day) a 40–50px budget rejects drift while still allowing a deliberate
  crossing.
- **"One sideways twitch produces a 30-hour range" was overstated** (ticket 06,
  repeated here). The draft recomputes anchor→pointer on every move, so a
  transient excursion that returns self-corrects. **Only where the finger lifts
  commits.** The hazard is real but it is a *release-position* hazard, not a
  mid-drag one.
- **A bare click no longer creates Availability.** Ticket 06 made a click with no
  movement produce a 30-minute block; ticket 10 replaces that on both platforms —
  **click (desktop) and tap (touch) open the slot popover**, and creating needs a
  deliberate drag or long-press-drag. The 4px threshold survives as the
  drag/click discriminator. This also largely dissolves the risk of "no undo".
