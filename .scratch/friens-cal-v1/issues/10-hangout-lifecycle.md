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
