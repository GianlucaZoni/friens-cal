# Map: friens-cal v1 — shared availability calendar

Label: `wayfinder:map`

## Destination

A build-ready spec and issue set for `friens-cal` v1 — a shared availability
calendar for one fixed group of friends — complete enough to hand to
`/to-issues` and have an agent build without inventing anything. The map is done
when no decision a builder would otherwise guess at is still open.

Planning only. Nothing here ships production code; prototypes are throwaway.

## Notes

- **Domain**: `CONTEXT.md` at the repo root. Use its terms exactly — Friend,
  Availability, Candidate, Hangout, Participant, Hidden, Join, Left. Candidate
  and Hangout are *not* interchangeable.
- **Decisions**: `docs/adr/0001` (Supabase), `docs/adr/0002` (cross-Friend
  availability writes).
- **Skills**: every session calls `grilling` and `domain-modeling`. Prototype
  tickets also call `prototype`; research tickets call `research`. UI tickets
  call `shadcn`.
- **Stack given**: Vite + React 19 SPA, Base UI via shadcn `base-lyra` style,
  Tailwind v4, MobX-State-Tree available, `lucide` icons. Supabase for data and
  auth. Blobatar from `https://blobatar.dev/r/avatar.json`.
- **Prototypes live on the branch `prototype/wayfinder-v1`**, not on `main`.
  Tickets 05, 06, 10, 12, 14, 16 and 18 name them as `src/prototypes/<name>/`;
  those paths resolve on that branch. Read one with
  `git show prototype/wayfinder-v1:<path>`.
- **Layout given** (from the original brief, never captured by ticket 01, whose
  grill covered scope only — recorded here so it stops being unattributable):
  the shadcn **left-sidebar layout, open by default**; **`cmd+b` toggles the
  left** sidebar and **`cmd+shift+b` the right**; calendar in the middle; the
  left sidebar holds a date picker above the Friend roster (blobatar + name,
  eye icon on hover); the top right holds the current Friend's blobatar menu, a
  month/week select, a **Today** button, and prev / next arrows.
- **The human is new to Supabase.** Any session touching it explains the core
  concepts as it goes rather than assuming them.
- **Blobatar is seed-driven**: props are `name` (the seed), `palette`,
  `expression`, `animate`. There is no free-form face editor — "customise your
  blobatar" means choosing palette and expression.

## Decisions so far

- [01 — Destination and v1 scope](issues/01-destination-and-scope.md): the full
  charting grill. Availability is binary and merging; Hangouts are in scope and
  created only by confirming a Candidate; Supabase with email+password on an
  allowlist; one group; UTC stored, one fixed group timezone rendered; realtime;
  mobile fully in scope including touch drawing.

- [02 — How Supabase does allowlisted signup, password reset, and privileged writes](issues/02-supabase-auth-and-rls-research.md):
  the `before-user-created` Auth Hook as a Postgres function is the only
  enforceable allowlist gate; `public.profiles` + trigger is still the profile
  pattern; `security definer` RPCs need `search_path = ''` and explicit
  grant/revoke; Realtime honours RLS except on DELETE. **Blocker found**: the
  default mail service cannot deliver to non-team addresses (→ ticket 13).
- [03 — What the base-lyra / Base UI shadcn distribution actually ships](issues/03-shadcn-base-lyra-inventory-research.md):
  sidebar exists but two sidebars share one provider's state (→ ticket 12);
  `cmd+b` is hardcoded; calendar wraps `react-day-picker`; Blobatar's `avatar`
  dependency resolves to Base UI with no Radix clash. **Correction**: a Friend's
  colour is `hue`+`tone`, not a named palette (→ ticket 11).

- [13 — Email delivery: custom SMTP, or no email at all](issues/13-email-delivery.md):
  no email in v1. Confirm Email disabled (safe only because the signup hook
  gates the allowlist), no password-reset flow — forgotten passwords are reset
  from the Supabase dashboard. Reverses ticket 01's "password reset ships in
  v1"; keeps ADR-0001's single-vendor argument intact.

- [05 — Prototype: the composite availability rendering](issues/05-composite-availability-rendering-prototype.md):
  segmentation is a boundary sweep into `{start, end, friendIds[]}` runs;
  stacked CSS radial-gradients on one element; hover targets the segment, panel
  beside the day column. **Three of ticket 01's promises failed**: the mesh
  dies at 6–8 Friends, "faint" needs per-theme tuning, and your own solid block
  hides the composite (→ ticket 15). Month view needs its own language
  (→ ticket 14).

- [06 — Prototype: drawing, resizing and duplicating Availability](issues/06-drag-interaction-prototype.md):
  merging feedback is live mid-drag; click-no-move makes a 30-minute block
  (4px threshold); Escape aborts; ⇧click multi-selects, no marquee; column-locked
  drags with over-drag to cross midnight. **Deleting the middle of a range is
  confirmed unacceptable** — recommends an erase drag starting *inside* a block;
  awaiting the human. ⌥+drag works but is undiscoverable, so it stays an
  accelerator behind a menu control.

- [15 — The composite at scale: colour, contrast, and your own blocks](issues/15-composite-legibility-and-colour.md):
  the composite is replaced by a **single-hue heatmap in the viewer's colour,
  opacity proportional to how many visible Friends are free**, with the viewer's
  own Availability marked by a border and ring rather than a solid fill.
  Per-Friend colour leaves the grid entirely; *who* is answered only on hover.

- [07 — The data model and its policies](issues/07-data-model-and-schema.md):
  **Availability is slot rows** (`friend_id`, `slot_start`, unique together) —
  merging stops existing, overlap is a `group by`, concurrent writes are safe,
  and the ADR-0002 RPC becomes structurally insert-only. A Hangout is a
  **range** snapped to the 30-minute grid. `left_at` gives the three Participant
  states; the **strict** drop rule lives in a statement-level trigger, fronted by
  a confirmation dialog. `timestamptz` throughout, with the grid built from the
  time zone so DST days render 46 and 50 rows. The client loads all
  Availability from today forward and computes Candidates locally.

- [08 — The Hangout lifecycle, end to end](issues/08-hangout-lifecycle.md): the
  full state machine. **Retime is unrestricted** (so it can write another day's
  availability for every Participant, and can never drop anyone);
  **cancellation is a hard delete** behind a warning; **overlapping Hangouts are
  forbidden** via an exclusion constraint, which also resolves confirm races by
  converting the loser into a Join; empty Hangouts auto-cancel from the trigger;
  past Hangouts freeze; Left is sticky with a manual route back via the 3-dots
  menu.

- [09 — Computing and ranking Candidates](issues/09-candidate-computation.md):
  one pipeline over a continuous slot timeline — clip to the current slot, drop
  Hidden Friends, **blank out Hangout slots for everyone**, sweep into atomic
  runs, extend each run's Friend-set maximally, prune dominated, then sort by
  count (never duration). Sub-Candidates are separate cards. The **glow becomes
  `2 × friends > group size`** and pinned Hangouts unpin when they *end* — both
  override ticket 01. The 30-minute minimum turns out to be structurally
  unreachable. A **slot-boundary timer** is required, because clipping makes the
  list stale with no data change.

- [11 — How a Friend's colour is chosen and kept distinct](issues/11-friend-colour-identity.md):
  the avatar and the UI split. Stored inputs only — `blobatar_seed`, `hue`,
  `tone`, `expression`, **no hex** — with the blobatar rendered by blobatar and
  every other use of a Friend's colour computed as **`oklch(L_theme, C_theme,
  hue)`**, giving uniform contrast across all hues and both themes by
  construction and removing the render-time clamp ticket 05 prototyped. The four
  **tinting expressions are excluded**; the **seed governs shape alone**, so
  reroll never moves colour. Changing your hue recolours your whole grid — and
  that is the point.

- [12 — The app shell: two independently-toggled sidebars](issues/12-app-shell-two-sidebars.md):
  **fork, not nested providers** — because two providers make *two simultaneous
  sheets representable*, and only 5 of 23 exports touch the context. Top bar
  **variant C**; `⌘B` / `⇧⌘B` kept, but the handler owned (the shipped one fires
  on `⌥⌘B`, `⌃⌘B` and synthetic `key:"b"+shift`); both panes open by default;
  month+year label only, with day numbers on week column headers. **One sheet
  slot** below 768px — which unblocked ticket 17.

- [10 — Drawing Availability by touch](issues/10-touch-drawing-gesture.md):
  **tap/click reads, long-press-drag (touch) or drag (desktop) creates** —
  reversing ticket 06's click-to-create and largely dissolving the no-undo
  hazard, since no stray tap writes. Linear and the seven-column week kept over
  a measured objection (30px release drift → a 26-hour range), with a
  day/3-day/week selector as the escape to 110px columns. **Long-press arming is
  what makes swipe-paging safe.** Real-hardware verification still outstanding.

- [14 — What a month cell shows](issues/14-month-view-rendering.md): a
  **synthesis, not one of the two candidate languages** — wash carries **peak
  concurrency**, avatars carry **who** (wrapping, never `+N`), a ring marks your
  own, contiguous days **merge into one rectangle**, and a mandatory Hangout chip
  stops ticket 09's blanking rendering a Hangout day as the emptiest cell of the
  month. **No numeral anywhere**; click opens the popover.

- [18 — Setup flow and profile editing](issues/18-setup-and-profile.md): copy
  **draft A**, chosen because **copy alone cannot close the enumeration leak** —
  Supabase returns `User already registered` regardless, and only A's
  client-side catch-all shape closes it. **Change password ships** (ticket 13
  killed *reset*, which needs email; `updateUser` does not). Blobatar animation:
  always for the top-right and customisation avatars, on sidebar hover / open
  drawer for the roster.

- [17 — The mobile layout](issues/17-mobile-layout.md): sidebar icon → left
  drawer (view selector, drawing mode, roster with always-visible eyes);
  month+year chevron → a **calendar navigator**, not the month view; Today and
  the blobatar top-right; the right sidebar becomes a **bottom drawer that
  peeks** with one labelled card — *Upcoming* (nearest unfinished Hangout) else
  *Best Candidate*. **Month view ships on mobile without avatars** — dropping
  them removes ticket 14's 12px floor instead of fighting it, since tap already
  answers *who*. Opening the left drawer collapses the bottom one to its peek.

- [16 — The right sidebar: Candidate and Hangout cards](issues/16-right-sidebar-cards.md):
  the app-shell card — no count numeral, **wrapping** blobatars, a left **stripe**
  that *is* the glow. **On touch there are no card controls at all**: a tap opens
  a detail sheet holding every action, which subsumes the 3-dots and keeps ticket
  10's "a bare tap never writes". Force-write is a **Dialog**. Sub-Candidates
  annotate their relation; the sub-glow tail collapses behind "show more" at the
  *same* threshold as the glow; the empty state rewords when Hangouts are pinned;
  `C_theme = min maxChroma(L_theme, h)`.

- [04 — Provision the Supabase project](issues/04-provision-supabase-project.md):
  project `mvvxyzqbdkkauxkltavw` (EU), `@supabase/supabase-js@2.112.4`,
  `btree_gist` installed, credentials in a gitignored `.env`. The three
  project-creation security settings were chosen to give ADR-0001's two locks
  **opposite defaults** — auto-expose **off**, auto-RLS **on** — so an
  unfinished table is inert twice over. Verified end to end, including that an
  **anonymous read is refused**. Allowlist seeding deferred to the build.

- [19 — Optimistic writes, failed round-trips, and the gap in between](issues/19-optimistic-writes.md):
  paint optimistically with **no** pending treatment — a faded block would read
  as *fewer Friends*, since ticket 15 spent opacity on the count. **One insert
  per gesture** (atomic by construction, so partial failure never arises) with
  `on conflict do nothing`, which makes **retry idempotent**: two auto-retries,
  then revert and a toast naming the lost range. Realtime echoes are no-ops
  because slots are keyed by `(friend_id, slot_start)` — filtering your own
  events would have broken your own second device. The cross-Friend force-write
  is the one thing **not** painted optimistically.

- **Amendments raised while building, not planning** (issues 09 and 10 in
  `.scratch/friens-cal-v1/`). Three resolved tickets gained appended
  amendments once flat trust was live and visible:
  [07](issues/07-data-model-and-schema.md) and
  [08](issues/08-hangout-lifecycle.md) add **provenance** to `hangout` —
  `created_by`, and `retimed_by` which *is* ticket 08 §1's "edited" mark rather
  than a boolean beside it — explicitly as a record of who acted and **not** as
  ownership: every policy stays `using (true)`, because provenance earns its
  place *because* anybody may cancel anybody's plan and nobody is notified.
  Both need `with check` or they record nothing. [16](issues/16-right-sidebar-cards.md)
  gives its detail sheet its own content, **the Hangout's name** — issue 09
  found every action ticket 16 had put in that sheet belonged to issue 10, which
  is why confirm shipped as a bare tick — plus the `"Hangout"` default and the
  name on the calendar marker. **Open for the human**: whether a *rename* counts
  as an edit (ticket 07's `Needs the human`); recommended no, since the mark
  exists to say "availability was written for you".

## Not yet specified

- **Deployment.** Where the SPA is hosted, how env vars get there.
- **"Copy last week".** The ergonomic escape hatch if redrawing every week
  turns out to be tedious in real use. Deliberately not designed now.
- **Alt+drag on a day column** to copy a whole day's Availability. A different
  gesture on a different target; revisit once the basic drag feels right.
- **Candidate list performance.** The list is uncapped and scans from today
  forward; if real use makes it long, virtualisation or a horizon may be needed.

## Out of scope

- **Recurring availability.** Recurrence rules (exceptions, "this and future",
  DST) would contaminate a model that is currently just *(friend, start, end)*.
  Alt+drag duplication covers the ergonomic need.
- **Multiple groups / circles.** v1 has exactly one implicit Group. A group
  table, membership joins, a switcher and per-group visibility are a separate
  effort if it is ever wanted.
- **Notifications outside the app.** No email or push on Hangout confirmation
  or cancellation. In-app plus realtime only; templates, a sending service,
  deliverability and unsubscribe are a large addition for a group that will
  paste the plan into their chat anyway.
- **Per-viewer timezone rendering.** Stored UTC keeps the door open, but v1
  renders one fixed group timezone. "Is Saturday 9pm his Saturday or mine" is
  where all the confusion lives.
- **A place or location field on a Hangout.** Wants a map, an address,
  validation. The group chat is right there.
- **Creating a Hangout directly on the grid.** Hangouts come only from
  confirming a Candidate; drawing one would collide with the Availability drag
  gesture on the same surface.
- **RSVP / attendance states.** Participants are in or dropped or Left. No
  maybe, no pending, no accept.
