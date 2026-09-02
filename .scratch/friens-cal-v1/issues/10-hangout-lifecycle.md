# 10 — The Hangout lifecycle

Status: ready-for-agent
Blocked by: 09

## Parent

[friens-cal v1 map](../../shared-availability-calendar/map.md)

## What to build

Everything that happens to a Hangout after it exists. Ticket 08 holds the full
state machine; this is its implementation.

**A Friend has three states**: not involved / Participant / **Left**. `left_at`
distinguishes them, and Left is **sticky** — the way back is manual, from the
card's menu, clearing `left_at`.

**Movement is one-way and automatic in one direction only:**

- **Join** — adding Availability that overlaps a Hangout you are not in does
  **not** auto-add you. A **"Join?"** appears on the Hangout instead. Joining
  also adds Availability for the slot.
- **Strict drop** — removing Availability that covered a Hangout **drops you**,
  from a statement-level trigger with transition tables, fronted by a
  confirmation dialog. That dialog **names every affected Hangout** and fires on
  the **grid**, on the Availability-delete path — it is not the card's cancel
  dialog, which always affects exactly one Hangout.
- **Leaving does not change your Availability.**
- A Hangout whose **last Participant** leaves or is dropped **auto-cancels**,
  from the same trigger.

**Retime is unrestricted** and can move a Hangout to another day. It can never
drop anyone: it **extends the Availability of every current Participant** to
cover the new time, through the single narrow `security definer` RPC of ADR-0002.
That RPC takes **exactly one argument — the Hangout id**; a
`(friend_id, start, end)` signature would be worse than flat trust. It needs
`search_path = ''` and explicit grant/revoke, and because Availability is slot
rows it is **structurally insert-only**: "may extend, never shorten" is a fact,
not a rule code must remember. Extensions are **never reverted**. A retimed
Hangout is permanently marked "edited". The confirmation dialog **names the
Friends whose calendars it will write to**.

**Cancel is a hard delete**, behind a warning. There is no undo and no tombstone;
the others find out by noticing an absence. This was chosen with eyes open.

**Past Hangouts freeze** — no retime, no cancel, no join.

The retime flow is a **Dialog, not a Popover**: outside-click would silently
discard edits on the one action that writes other people's data, a popover
occludes the grid being consulted, and the collision rejection needs somewhere
to land.

## Acceptance criteria

- [ ] Statement-level trigger with transition tables implements the strict drop
- [ ] The drop confirmation fires on the grid and names every affected Hangout
- [ ] Adding overlapping Availability surfaces "Join?" and does not auto-add
- [ ] Joining adds Availability for the slot
- [ ] Leaving leaves Availability untouched; Left is sticky; rejoin clears `left_at`
- [ ] Last Participant leaving auto-cancels the Hangout, from the trigger
- [ ] Retime RPC takes only the Hangout id, is `security definer` with
      `search_path = ''`, and can only insert Availability
- [ ] Retime never drops a Participant, and marks the Hangout "edited"
- [ ] Retime dialog names every Friend whose calendar it writes to
- [ ] Cancel hard-deletes behind a warning naming the single Hangout
- [ ] Past Hangouts reject retime, cancel and join
- [ ] Retime is a Dialog; the cross-Friend write is **not** painted optimistically —
      the dialog holds the pending state and reports the outcome in place
- [ ] `npx tsc -p tsconfig.app.json --noEmit` is clean

## Blocked by

- [09 — Confirm a Candidate into a Hangout](./09-confirm-a-hangout.md)

## Added after issue 09 shipped — the detail sheet, naming, and provenance

Three things issue 09 either found missing or was told to hand over. They are
**additions to the scope above, not replacements**; every acceptance criterion
already listed still stands.

### 1. The detail sheet is yours, and naming is what makes it worth building

Ticket 16's final answer routes every card action through a **detail sheet** on
touch and the same detail as a **popover** on desktop, making the hover tick an
*accelerator* rather than the only route. Issue 09 built the tick and **not** the
sheet, for a reason worth knowing before you start: every action ticket 16 put
inside it was in this ticket, so there was nothing for the sheet to carry.

Ticket 16's amendment fixes that by giving the sheet its own content — **the
name** — so it is no longer a shell around this ticket's buttons.

Issue 09's stand-in, to replace: on `@media (hover: none)` the confirm tick is
**permanently visible** on a Candidate card rather than absent. That was ticket
16's *earlier* decision, which its final answer revised, and it shipped because
the sheet that supersedes it could not be built yet. Replacing it is part of
building the sheet — do not leave both.

### 2. An unnamed Hangout is called "Hangout", and the name is on the marker

**Already built in issue 09** — `nameOf` in `src/hangouts/hangout.ts` is the one
default, and the week grid's block and the pinned card both render it. Listed
here because the sheet is what finally lets a Friend change it, and because the
default is what keeps ticket 16's *"the title is the headline"* hierarchy
unconditional. Do not reintroduce a null-title special case.

### 3. Provenance: who confirmed it, and who moved it

Ticket 07's and ticket 08's amendments add `created_by`, `retimed_by` and
`retimed_at`. **`retimed_by` non-null IS ticket 08 §1's "edited" mark** — there
is no separate boolean, so the two facts cannot contradict each other.

**This is not ownership and must not become it.** Every policy stays
`using (true)`; anyone may still retime or cancel anything (ticket 01). The
columns exist *because* of that plus no notifications: they are the only thing
that can answer "who moved this?" after the fact.

**The `with check` is the whole feature.** A column recording who did something,
which anybody may set to anybody, records nothing — so the insert policy needs
`with check (created_by = (select auth.uid()))` and the update policy
`with check (retimed_by = (select auth.uid()))`. `auth.uid()` reads the JWT
claim rather than the role, so it is still the calling Friend inside the
`security definer` retime RPC.

**Open, and it is ticket 07's `Needs the human`:** whether a *rename* also counts
as an edit. Recommended no — §1's mark exists to say "availability was written
for you", and a rename writes none. Do not guess; the answer changes the column
names.

## Added acceptance criteria

- [ ] A tap on a card (touch) and a click on a card body (desktop) both open the
      same detail — sheet and popover respectively
- [ ] The detail sets and clears a Hangout's name, and the grid marker and pinned
      card follow
- [ ] Issue 09's permanently-visible touch tick is **removed** when the sheet lands
- [ ] `created_by` is written at confirmation and `retimed_by` / `retimed_at` at
      retime, each defended by a `with check` on its own policy
- [ ] A Friend cannot write somebody else's id into either provenance column
- [ ] The detail shows `confirmed by …` and `retimed by …`, and renders correctly
      when either is null
- [ ] Provenance gates nothing: every Friend can still retime and cancel every
      Hangout, including ones they did not confirm

## Correction to §3 above — the columns are `created_by`, `edited_by`, `edited_at`

The human answered ticket 07's `Needs the human`: **a rename counts as an edit.**
So `retimed_by` / `retimed_at` above never existed. Build:

```
created_by uuid null        references friend (id) on delete set null
edited_by  uuid null        references friend (id) on delete set null
edited_at  timestamptz null
```

`edited_by` non-null is ticket 08 §1's mark, set by **both** the retime and the
rename. One `with check (edited_by = (select auth.uid()))` on the update policy
covers every update, with nothing to exempt — which is why this is the simpler
schema as well as the decided one: no RLS policy can express *"if `starts_at`
changed then the mark must be set"*, because `with check` cannot see the old row.

The added acceptance criteria above stand with the names substituted, plus:

- [ ] Renaming a Hangout sets `edited_by` / `edited_at` and shows the `edited`
      word, exactly as retiming does
