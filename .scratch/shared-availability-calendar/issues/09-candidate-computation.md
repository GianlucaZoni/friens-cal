# 09 — Computing and ranking Candidates

Type: grilling
Status: resolved
Blocked by: —

## Question

Specify the algorithm behind the right sidebar precisely enough to implement
without inventing anything.

Settled: computed over **non-Hidden Friends only**, **from today forward**,
**decoupled from the calendar view**, **minimum 30 minutes**, **no cap**, ranked
by **most Friends first, then chronologically**; full-house Candidates glow with
a border built from all participants' avatar colours; ranges already covered by
a confirmed Hangout are excluded; Hangouts pin above the list until their day.

To resolve:

1. **Segmentation.** Availability ranges start and end at arbitrary points, so
   overlap regions have to be cut somewhere. Marco 18:00–22:00, Sara 20:00–23:00,
   Luca 21:00–21:30 — how many Candidates is that, and what are their bounds?
   Maximal intervals per distinct Friend-set, or something coarser? Does the
   30-minute minimum apply to each *segment* or to the overall overlap?
2. **Sub-Candidates.** Is "all three free 21:00–21:30" a *different* Candidate
   from "Marco and Sara free 20:00–23:00", or does the bigger one absorb it?
   Showing both is honest but doubles the list; showing only maximal-by-count
   hides longer options with fewer people.
3. **Two-Friend minimum.** Is a Candidate with **one** Friend free meaningless
   (yes — suggest excluding), and what happens when only one Friend is visible?
4. **Partial Hangout exclusion.** A Hangout covers 20:00–22:00 of a 18:00–23:00
   overlap. Is the whole Candidate excluded, or is it cut into 18:00–20:00 and
   22:00–23:00 — and do those survive the 30-minute minimum?
5. **The unbounded list.** No cap, scanning from today forward, over all
   Availability that exists. How long does that get in realistic use, is it
   grouped by day or week, and is a header/date separator needed to make it
   readable? What does it look like with zero Candidates?
6. **Recompute cost.** Every Availability change and every eye toggle
   invalidates the whole list. Where does the computation run — client-side over
   already-loaded Availability, or a database query? Client-side is simpler and
   makes eye toggles instant; it also means loading all future Availability up
   front. Decide deliberately.
7. **Today's partial day.** A Candidate starting an hour ago and running into
   this evening — does it show, does it get clipped to now, or is it dropped?
8. **Ordering ties.** Two Candidates with the same Friend count at the same
   time. And does *duration* enter the ranking at all — a 4-hour overlap of 3
   Friends currently ranks below a 30-minute overlap of 4.

## Answer

<!-- the algorithm, stated precisely enough to implement -->

## Answer

The whole thing is one pipeline over a **single continuous timeline of 30-minute
slots**. Every decision below is either a pre-filter on that timeline or a rule
applied to its output — nothing needs post-hoc interval surgery.

### Inputs

| Name | What it is |
| --- | --- |
| `slots` | Availability slot rows `(friend_id, slot_start)` |
| `visible` | Friends not currently Hidden. **The viewer is in this set and is hideable like anyone else** |
| `hangouts` | Confirmed Hangouts with `ends_at > now` |
| `groupSize` | Count of **all** Friends in the group, Hidden included |

### The pipeline

1. **Horizon.** `now_slot` = start of the 30-minute slot containing now.
   Discard every slot before it. A Candidate that started this afternoon and
   runs into the evening therefore appears *clipped to the current slot* rather
   than claiming a time that has passed. Past Availability loaded for the grid
   is excluded here by date, not by a separate store.

2. **Filter to visible.** Drop Hidden Friends' slots.

3. **Blank the Hangouts.** Drop every slot whose `slot_start` falls inside any
   confirmed Hangout's `[starts_at, ends_at)`. This applies to **every Friend,
   not only the Participants** — ticket 08's exclusion constraint forbids a
   second Hangout at that time, so a Candidate there is one the database would
   refuse to confirm.

4. **Sweep.** Group the surviving slots by `slot_start` into `friendIds`, walk
   in time order, and start a new **atomic run** whenever the Friend-set changes
   or a slot is missing. Yields `{start, end, friendIds}`.

   The sweep runs over one continuous timeline and **does not break at
   midnight** — a Candidate may legitimately span two days.

5. **Extend.** For every run `R` where `|S(R)| >= 2`, extend backward and
   forward across adjacent runs for as long as every Friend in `S(R)` is still
   present. Dedupe on `(start, end, friends)`.

6. **Prune dominated.** Drop Candidate `C` if some other `D` has
   `D.friends ⊇ C.friends` **and** `[C.start, C.end) ⊆ [D.start, D.end)`.

7. **Sort.** `friends.length` descending → `start` ascending → duration
   descending → sorted Friend-id list. **Count strictly dominates duration**: a
   30-minute window with four Friends outranks a four-hour window with three,
   permanently. The last two keys are not cosmetic — without them a Realtime
   update visibly reshuffles tied cards.

8. **Identity.** `start | end | sorted friend ids`. Candidates are not stored;
   this is the render key and the hover key.

Steps 5 and 6 are the answer to *what counts as one Candidate*. A sub-Candidate
is **not absorbed** — it is its own card — but only when it is genuinely not
dominated.

### Worked example

Marco 18:00–22:00, Sara 20:00–23:00, Luca 21:00–21:30.

Atomic runs: `18–20 {M}` · `20–21 {M,S}` · `21:00–21:30 {M,S,L}` ·
`21:30–22 {M,S}` · `22–23 {S}`.

- `20–21 {M,S}` extends to **20:00–22:00**
- `21:30–22 {M,S}` extends to **20:00–22:00** — deduped away
- `21:00–21:30 {M,S,L}` cannot extend
- The two single-Friend runs never qualify

**Two Candidates**: *Marco + Sara, 20:00–22:00* and *all three, 21:00–21:30*.
Which is what a person would say out loud. Note that no `{M,S}` card is invented
in the case where all three are free the whole time, because `{M,S}` never
appears as a run's Friend-set.

### The glow

    2 * friends.length > groupSize

Five Friends → 3 glows. Six → 4. `groupSize` counts the **whole group,
Hidden included**, which is the point: hiding can only ever *suppress* a glow,
never manufacture one. Hide three of five and nothing can reach 3.

This **overrides ticket 01's "every non-Hidden Friend"**.

The border is built from the colours of whoever is actually in the Candidate. A
true full house — `friends.length === groupSize` — gets the same glow plus an
**"everyone" label** in place of the count. A word, not more visual intensity:
stacking glow on glow is hard to tune and easy to miss.

Known degenerate case: in a **three-person group the threshold is 2**, which is
the minimum Candidate size, so every Candidate glows. It self-corrects when a
fourth Friend joins.

### The 30-minute minimum is structurally dead

Ticket 07 made Availability slot rows on a 30-minute grid and ticket 08 snapped
Hangouts to the same grid, so every interval this pipeline can emit is a whole
number of slots. Clipping to the *slot* rather than to the exact minute (step 1)
closes the one remaining hole. The rule survives in the spec as an assertion,
never as a filter that removes anything.

### List, grouping, empty states

**Flat list, no day headers.** The sort is count-then-time, so the list is not
chronological — Thursday, Tuesday, Thursday again — and headers are impossible
without abandoning the ranking ticket 01 settled. Every card states its own date
and time.

Three empty states, evaluated in order:

1. **Fewer than two Friends visible** → *"Show more friends to see when you can
   meet"*, with a show-all action. This also answers the single-visible-Friend
   case: no Candidate can exist, and the reason is the filter, not the data.
2. **No visible Friend has any Availability from now forward** → *"Nobody's free
   yet — draw your availability"*.
3. **Availability exists but nothing overlaps** → *"No overlaps yet — nobody's
   free at the same time"*.

### Pinned Hangouts

Confirmed Hangouts sit in their own region above the Candidates, chronological,
unaffected by hiding. A Hangout is pinned while `ends_at > now` and **unpins
when it ends**.

This **overrides ticket 01's "until the day of the Hangout"**, which read
literally would remove a Saturday Hangout from the sidebar at midnight on
Saturday — the moment it matters most.

### Candidates you are not in

**All Candidates among visible Friends appear, whether or not the viewer is in
them.** Ticket 08's Join is meaningless if you cannot see what you are not in;
and under the alternative, a Friend who has not drawn anything yet opens the app
to an empty sidebar and concludes it is broken. Whether you are in a Candidate
is already legible from the blobatars on the card.

### Where it runs, and what makes it re-run

Client-side, over already-loaded Availability (settled in ticket 07). Fetching:

- **Forward: unbounded.** One query for `slot_start >= today`, one Realtime
  subscription. Five Friends drawing a few evenings a week is a few hundred rows
  a year.
- **Backward: on demand.** Past ranges are fetched as the user navigates into
  them, into the same store, and excluded from step 1 by date. One store, one
  rule: *today forward feeds the sidebar*.

Recompute triggers: any Availability change (local or Realtime) · any eye
toggle · any Hangout insert/update/delete · **a timer aligned to the :00 and :30
slot boundaries** · tab focus.

That timer is not optional. Step 1 makes the list **time-dependent with no data
change at all** — a tab left open overnight would otherwise show yesterday's
Candidates. Aligning to slot boundaries means every tick can actually change
something, and there are 48 a day; focus-recompute covers the sleeping laptop.

## Amendment — where the "everyone" label goes

This ticket said a full house shows an "everyone" label **in place of the
count**. The ticket 16 prototype shows that is wrong in two ways: the word wraps
as "every / one" in a 56px count rail, and — worse — removing the numeral takes
it off precisely the cards that sit at the head of the column readers scan.

**Keep the numeral, replace the label**: `6` over `everyone` rather than
`everyone` alone. The decision this ticket actually made — *a word rather than
more glow* — is untouched and stands.

## Undeclared dependency, found by ticket 14

Step 3 of the pipeline blanks a Hangout's slots for everyone. In the **week**
view that is invisible, because the Hangout is drawn in the same cells it
blanked. In the **month** view it is not: a day whose whole group was free
20:00–23:00, with a Hangout confirmed on exactly that window, renders with
**peak concurrency 0 — the emptiest cell of the month** — over what is actually
its best day.

Blanking is still correct; the month cell must carry a **mandatory Hangout
marker** so the cell is never read as empty. See ticket 14.

## The "everyone" amendment is superseded

The amendment above (keep the numeral, replace the label) assumed a card with a
count numeral. Ticket 16 settled on a card that **has no numeral at all** — the
count is read off the blobatars, which wrap rather than stacking.

So: **`everyone` is carried by the pill alone**, and there is no numeral column
for it to punch a hole in. The original concern — a word replacing the count on
exactly the cards readers scan first — does not arise, because no card shows a
count.
