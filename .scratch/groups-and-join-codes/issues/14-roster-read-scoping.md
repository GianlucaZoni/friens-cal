# 14 — The roster reads every Friend in the product

Type: grilling
Status: resolved

## Question

Split out of [ticket 12](12-realtime-scoped-per-group.md) §7, which found it
while answering a Realtime question and deliberately did not settle it.

**`use-roster.ts:123` is `from('friend').select('*')` with no filter**, and
[ticket 04](04-group-schema-and-migration.md) kept `friend` at `using (true)` on
purpose, so the policy will not scope it either. With one implicit Group that
was correct and invisible. With many cals the sidebar lists **every Friend in
the product**, including people you share no cal with.

Ticket 04's decision is not in question and should not be reopened. It is right:
co-member scoping would render a Friend who left as a **nameless, faceless
Participant** on the past Hangouts they keep, and identity is global by
`CONTEXT.md`. What ticket 04 did was move the scoping burden out of the policy
and into every query that reads `friend`. This is the query that has it, and
nothing else picked it up.

**The subscription is not part of this.** Ticket 12 settled that it stays
table-wide, `event: '*'`, on `postgres_changes`, because a hue change should
reach every screen. Do not "fix" it to match whatever this ticket decides about
the read, or the past-Hangout case ticket 04 protected breaks.

To settle:

1. **Where the scoping happens.** A read through `membership`
   (`select friend(*) from membership where cal_id = ...`) is the obvious shape
   and makes the roster a per-cal query like everything else. Does it embed, or
   does it read `membership` and then `friend` by id?

2. **Who the roster is *for*.** The sidebar's Friends are the people whose
   Availability the grid counts, which is the cal's Members. But the same
   component renders Participants of past Hangouts, who may have left
   ([ticket 10](10-leaving-a-group.md): Left, not dropped). So the set the
   sidebar needs and the set the Hangout cards need are **not the same set**, and
   a per-cal roster read has to leave the second one reachable.

3. **What the table-wide subscription does to a scoped store.** If the read is
   cal-scoped and the subscription is not, a `friend` insert for a stranger folds
   a row into a store the read would never have returned. Harmless today (an
   unrendered row), but it is the same class of bug ticket 12 found on
   `availability`, and it should be named rather than left to be rediscovered.

4. **Whether anything else reads `friend` unscoped.** `use-roster` is the one
   ticket 12 found. It did not go looking for others.

## Answer

**The read is not what gets scoped. The sets it feeds are.**
`from('friend').select('*')` stays exactly as it is, and a second read of
`membership` for the current cal supplies the ids that filter it. Two findings
outrank the four questions, and the second one reverses this ticket's own
framing of the damage.

### The glossary had already decided it, and the code has been contradicting it

`CONTEXT.md`'s **Candidate** reads *"a run of Slots in which two or more
non-Hidden **Members** all have Availability"*. Not Friends. Members. Ticket 01
wrote that word when it made Availability per Group, and nothing carried it into
the query. So this ticket is narrower than its title: it is not choosing a scope,
it is bringing one query into line with a definition that has been sitting in the
glossary since the effort began.

### The damage is the denominator, not the leak

The ticket frames this as a disclosure problem, and that framing is half-wrong by
the glossary's own words: **Friend** says *"there is no concept of a stranger"*,
and ticket 04 made `friend` `using (true)` on purpose. Nobody's identity is
hidden from anybody in this product by design.

What the roster set actually controls is arithmetic:

- `heat.ts`'s ramp is **normalised over the whole set** — *"one Friend free at
  the bottom of the ramp and all of them at the top, whatever all of them
  currently is"*. Every account in the product sits in that denominator, so
  every wash on every grid slides toward the bottom of the range as the product
  grows. The heatmap gets quietly less legible with each signup, in every cal.
- `use-candidates.ts:94` computes `groupSize` from `roster.friends`, and
  `emptyReason(visibleIds.length, …)` counts the same set.
- `silent()` runs over `rosterIds`, so **every stranger in the product appears on
  your sidebar wearing a muted "has not drawn anything" dot** — the mark v1
  invented so that an inactive Friend does not read as a busy one, applied to
  people who were never asked.

That is a correctness defect in the grid the product exists to draw, and it is
what justifies the change. The privacy improvement is real and is a side effect.

### 1. Where the scoping happens

**Not in the read.** Three shapes were weighed: a second read of `friend` by
Participant id; one product-wide read feeding two different sets; and scoping the
read and accepting what falls out. The third is disqualified by a mechanism the
ticket did not have.

**`facesOf` silently drops ids it does not know.** `hangout.ts:188` is a
`flatMap` returning `[]` for a miss. So a Members-only read does **not**
reproduce the nameless, faceless Participant ticket 04 refused — it produces an
*absent* one, with the face row on a past Hangout silently one short and nothing
on screen saying so. That is strictly worse than the outcome ticket 04 rejected,
and it arrives without an error.

**`namesById` is the second casualty, and it is the one that would have been
missed.** `right-pane.tsx:85` builds the provenance-name map from
`roster.friends` too. `hangout-detail.tsx:322`'s `nameFor` documents its
fallback as *"a genuine race — an id whose Friend the roster has not read yet —
rather than for a departed Friend, whose column is set to null by the foreign
key"*. Leaving a **cal** does not delete the `friend` row, so under a scoped read
that comment stops being true and the line prints *"someone else"* for a live,
named, present Friend. The comment would have gone on asserting the opposite.

So: **one product-wide read, two sets.** `friend` reads as it does today and
feeds identity. `membership` reads the current cal and feeds participation. The
membership read is **ids only** — `.from('membership').select('friend_id')
.eq('cal_id', calId)` — and deliberately **not** PostgREST's embed
(`select('friend(*)')`, which walks the foreign key and returns each Friend
nested inside their membership row). The embed is the idiomatic Supabase shape
and it is wrong here: it re-fetches rows already held and hands back a second
copy that can drift from the first.

This does not fix the read the ticket is named after, and that is the point.
`using (true)` means the read was never something a policy was going to prevent,
and the browser holding every name is a cost ticket 04 already accepted. **The
ceiling is accepted and recorded**: it is a full-table read on every load, fine
at three Friends and at three hundred, wrong at a size this product will not
reach.

### 2. Who the roster is for — and the hook now owns the distinction

Two sets, and the whole bug class is *which one is this derived from*. Leaving
that to call sites means two components each reaching for the obvious array and
getting a coin flip. So the split moves into `useRoster`:

- `friends` and `visible` become **Members**, same names, new meaning. They feed
  the sidebar, its `n of m shown` counter, `rosterIds`/silence, `groupSize` and
  the heat denominator.
- **`friendsById` and `namesById` move *into* the hook**, built from the full
  set. `app-shell.tsx:133` and `right-pane.tsx:85` delete their `useMemo`s and
  read them off the roster.

No consumer ever holds the unfiltered list, so no consumer can pick the wrong
one. The hook becomes the single place that knows **identity is global and
participation is scoped**, which is precisely the decision being made.

**Both reads must land before `ready`**, and either failing is `error`. The
window where `friend` has returned and `membership` has not is a visible bug in
both directions: a member set coerced to empty flashes an empty cal, and one
treated as "no filter yet" flashes every Friend in the product — this ticket's
defect, reintroduced as a flicker. The member set is `null`-when-unknown and
never coerced, so neither state is representable.

### 3. The table-wide subscription, and the arrival it stops delivering

The concern as written dissolves: with `rows` still product-wide, a `friend`
insert or update for anybody belongs in the store, and the fold stays correct
untouched.

**A larger one takes its place.** Today a new Friend reaches your sidebar
because their `friend` INSERT arrives on that subscription. Under Members, the
act that adds somebody to your cal is a **`membership` insert**, and nothing
subscribes to `membership` — ticket 12's broadcast covers `availability`,
`hangout` and `hangout_participant`. So a Friend who joins your cal and starts
drawing is a Friend the roster never heard of, and `use-roster`'s own doc comment
names the result: *"the wash counts `visible`, so a Friend the roster has not
heard about is a Friend whose Availability arrives over Realtime and is then not
counted. The grid would under-report by one, silently, until a reload."*
Cal-scoping the set without this reintroduces, by a different road, the exact
failure v1 built a subscription to prevent.

**A third topic, `cal:<id>:members`**, broadcast, per-row
`realtime.broadcast_changes()` on `membership`, carrying `friend_id` so a join or
a leave folds locally like the other three. It rides ticket 12's
`11-realtime-per-cal.sql` and ticket 04's outage. Ticket 12 left the seat open by
name: *"`useRoster` is the third channel and is not in scope here (§7)"*, and its
one-topic-per-hook rule (supabase-js discourages two channels on one topic) makes
a third hook a third topic.

`useRoster` therefore ends up owning **two channels on two mechanisms** — the
table-wide `friend` one on `postgres_changes`, and this one — which is the
concrete shape of ticket 12's *"the product runs both mechanisms deliberately"*.

**And ticket 12's subscription turns out to be load-bearing for a reason it was
not kept for.** It was preserved so a hue change reaches every screen, and this
ticket's brief forbids touching it to protect the past-Hangout case. It does a
third job here: a brand-new account that signs up *after* your read and then
joins your cal arrives as a `friend` INSERT on that channel, and the members
broadcast then makes them a Member. Two events, two mechanisms, both required.
Had it been "fixed" to match the read, the members broadcast would announce a
Member whose name nobody has.

### 4. Everything else that reads `friend`

Gone looking, and there are exactly three. `session-provider.tsx:73` is
`.eq('id', userId)` — your own row, correct. `use-taken-hues.ts:34` is the other
unscoped one: `id, hue, display_name` for every Friend in the product holding a
hue.

**It stays product-wide, deliberately.** It runs on Setup, which happens before
you belong to any cal, so there is no cal to scope it to; and the map's Out of
scope line *"Per-Group identity, or per-Group hue"* means one colour everywhere,
so the taken-hue bias should see everywhere. The map's existing fog item, the hue
clash nudge on join, is what would revisit this, and it stays fog. §4 is closed
at three reads rather than left open.

### What this changes elsewhere

**[ADR-0004 amended](../../docs/adr/0004-broadcast-for-cal-scoped-realtime.md)**:
a fourth broadcast table and a third topic, for the same reason as the first
three plus one they do not share — `membership` is a new table that was never in
the `supabase_realtime` publication, so nothing is removed here, only chosen. Not
a new ADR: the same decision, one more subject.

**`CONTEXT.md` needed no change, and that was checked rather than assumed.**
**Member** already says *"A Friend in a Group"*, **Friend** already says *"A
Friend is one person everywhere"*, and **Candidate** already says **Members** —
which is the sentence the code is being brought into line with. "Roster" is a
code and UI word for the Members list, not a domain concept, and a glossary entry
would give one idea two names.

