import { useSession } from '@/auth/use-session'
import { Blobatar } from '@/components/ui/blobatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { FriendBlob } from '@/identity/friend-blob'
import { identityOf } from '@/identity/friend-row'
import { ChangePasswordDialog, CustomiseDialog, ProfileDialog } from '@/identity/profile-dialogs'
import { cn } from '@/lib/utils'
import { MiniCalendar } from '@/shell/mini-calendar'
import { ShellTrigger } from '@/shell/shell'
import { useAppShell } from '@/shell/shell-context'
import type { CalendarViewState } from '@/shell/use-calendar-view'
import { ViewSelector } from '@/shell/view-selector'
import { useState } from 'react'
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  KeyRoundIcon,
  LogOutIcon,
  PaletteIcon,
  UserIcon,
} from 'lucide-react'

/**
 * The bar spans the centre and right columns (variant C), so the cluster sits
 * in the window's corner rather than the calendar's, and does not move when the
 * right pane toggles.
 *
 * The bar spanning the right pane visually implies the Candidate list responds
 * to date navigation. **It does not** — Candidates are computed from now
 * forward and ignore where the calendar is pointed (ticket 09). That cost was
 * weighed and accepted when variant C was chosen over the alternatives.
 */
export const TopBar = ({
  calendar,
  saving,
}: {
  calendar: CalendarViewState
  /** Some write has been outstanding for 400ms. See `SavingChip`. */
  saving: boolean
}) => {
  const { isSheet } = useAppShell()
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
      {isSheet ? (
        <PhoneBar calendar={calendar} saving={saving} />
      ) : (
        <>
          <RangeLabel label={calendar.label} />
          {saving ? <SavingChip /> : null}
          <TopCluster calendar={calendar} />
        </>
      )}
    </header>
  )
}

/**
 * The phone's bar, and it is **a different bar rather than the same one
 * narrowed** (ticket 17).
 *
 *     ┌──────────────────────────────────────────────┐
 *     │ ▤     September 2026 ⌄          Today   ◍     │
 *     └──────────────────────────────────────────────┘
 *
 * Ticket 12 decision 6 made the narrow behaviour **CSS only** — no width
 * measuring, no JS breakpoint — by evicting two controls: below 768px "Today"
 * and the view select left the bar, Today became tapping the date label and the
 * view select moved into the blobatar menu. That was the right call for a bar
 * with nowhere else to put things. Ticket 17 gives the phone somewhere else, so
 * three of those decisions are reversed here deliberately rather than quietly:
 *
 *   - **Today comes back as a control**, on the right where the ticket puts it,
 *     and the date label stops being a button. The dotted underline went with
 *     it: an underlined label that no longer does anything is a control that
 *     does not work.
 *   - **The view select moves into the left drawer**, not the blobatar menu —
 *     see `ViewSelector`. Nothing about the calendar is under *account* any more.
 *   - **A chevron appears**, opening the date navigator. Nothing in the bar had
 *     one before because nothing in the bar jumped to an arbitrary date; on
 *     desktop the mini calendar in the left pane does that, and on a phone that
 *     pane is a drawer you would have to open first.
 *
 * **And `‹ ›` leave.** The ticket names three groups and the prototype measured
 * that a fourth does not fit at 375px — the first thing a full cluster eats is
 * the date label, which is the one thing on the bar you cannot do without. The
 * cost is real and worth stating: until issue 13's horizontal swipe lands,
 * moving a week on a phone is *open the navigator, tap a day* rather than one
 * press. The navigator is a full month with its own arrows, so nothing is
 * unreachable — it is two taps instead of one, for one slice.
 *
 * The right pane's trigger is absent for a different reason: the pane is the
 * bottom drawer now, already on screen, with its own grab handle. See
 * `ShellTrigger`.
 */
const PhoneBar = ({ calendar, saving }: { calendar: CalendarViewState; saving: boolean }) => (
  <>
    <ShellTrigger side="left" />
    <DateNavigator calendar={calendar} />
    {saving ? <SavingChip /> : null}
    <Button variant="ghost" size="sm" className="shrink-0" onClick={calendar.goToday}>
      Today
    </Button>
    <FriendMenu />
  </>
)

/**
 * The centre of the phone's bar: the label, and the chevron that opens a
 * **date navigator** — *"not month view"*, which is what the ticket's own
 * acceptance criterion is careful to say.
 *
 * **It is `MiniCalendar`, the same component the left pane holds on desktop**,
 * rather than a third date surface. That component is the only control in the
 * app that jumps the calendar to an arbitrary date, and it carries a comment
 * about the browsed-month-versus-anchor split being *a derivation, not an
 * effect* — a second implementation of that would be a second place to get it
 * wrong. What it gains here is `onPicked`, so the popover closes on the press
 * that moved the anchor; on desktop the pane it lives in does not close, so
 * there was nothing to tell.
 *
 * A `Popover` rather than a `Sheet`, and it is not a sheet-slot question: the
 * slot governs the two **panes** (`shell-context.ts`), and this is a control's
 * own popup, exactly like the blobatar menu beside it.
 */
const DateNavigator = ({ calendar }: { calendar: CalendarViewState }) => {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              RANGE_LABEL_CLASS,
              'flex items-center justify-center gap-1 rounded-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring'
            )}
          />
        }
      >
        <span className="truncate">{calendar.label}</span>
        <ChevronDownIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="sr-only">— go to a date</span>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-auto p-1">
        <MiniCalendar calendar={calendar} onPicked={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}

/**
 * The only thing an outstanding write is allowed to say.
 *
 * Ticket 19 paints optimistically with **no pending treatment**, and after
 * ~400ms shows something "in a channel the grid does not own" — because ticket
 * 15 spent opacity on *how many Friends are free*, so a faded block would read
 * as fewer people rather than as unsaved. This is that channel: outside the
 * grid, in the bar, and gone again the moment the round trip lands.
 *
 * `shrink-0` so it never squeezes the range label, which is the one thing on the
 * bar you cannot do without.
 */
const SavingChip = () => (
  <span
    role="status"
    aria-live="polite"
    className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground"
  >
    Saving…
  </span>
)

const RANGE_LABEL_CLASS = 'mx-1 flex-1 truncate text-left text-sm font-medium tabular-nums'

/**
 * The date label, on desktop: text, and only text.
 *
 * It used to be the Today button below the breakpoint — ticket 12 decision 6
 * evicted Today from the narrow bar and this was where it went, because the
 * cluster did not fit at 375px and the label is the one thing on the bar you
 * cannot do without. **Ticket 17 gives Today its own control back** (see
 * `PhoneBar`), so there is nothing left for the narrow branch to do and the
 * dotted underline went with it: an underlined label that no longer responds to
 * a tap is worse than a plain one.
 */
const RangeLabel = ({ label }: { label: string }) => (
  <span className={RANGE_LABEL_CLASS}>{label}</span>
)

/**
 * `‹ · Today · ›` │ `Week / Month` │ pane triggers │ blobatar.
 *
 * The arrangement is fixed. What varies is the narrow behaviour, and it is CSS
 * only — no width measuring, no JS breakpoints — so the same markup works
 * inside a sheet:
 *
 *   ≥ 1024   the full cluster, "Today" and "Week"/"Month" written out
 *   768–1024 "Today" keeps its word; Week/Month become W / M
 *   < 768    "Today" and the view select leave the bar. Today becomes tapping
 *            the label; the view select moves into the blobatar menu.
 *
 * Both pane triggers stay at every width, because below 768 there is no
 * keyboard and the shortcuts cannot be the only way in.
 */
const TopCluster = ({ calendar }: { calendar: CalendarViewState }) => {
  const { view, setView, goPrevious, goNext, goToday } = calendar

  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon-sm" aria-label="Previous" onClick={goPrevious}>
          <ChevronLeftIcon />
        </Button>
        <Button variant="ghost" size="sm" onClick={goToday}>
          Today
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Next" onClick={goNext}>
          <ChevronRightIcon />
        </Button>
      </div>

      <Separator orientation="vertical" className="mx-1 h-5" />

      {/*
        Four options as of issue 12, abbreviated to `D / 3D / W / M` below `lg`
        — the same eviction ticket 12 measured, one step earlier because there
        are twice as many of them. The drawer renders the identical control with
        the words written out; see `ViewSelector`.
      */}
      <ViewSelector view={view} onView={setView} abbreviate />

      <Separator orientation="vertical" className="mx-1 h-5" />
      <ShellTrigger side="left" />
      <ShellTrigger side="right" />

      <Separator orientation="vertical" className="mx-1 h-5" />
      <FriendMenu />
    </div>
  )
}

/**
 * The current Friend's blobatar, and the menu behind it.
 *
 * The shell places the cluster (ticket 12); what is inside it is ticket 18's.
 * Four items in the account group: who you are, your **profile**, **how you
 * look**, and **change password** — then sign out.
 *
 * Deliberately absent, and each is a claim someone may want to argue with. No
 * theme switch: light/dark is ephemeral view state, not a Friend column, and
 * does not belong beside things that are. No "delete account": membership is a
 * hand-curated allowlist and leaving is a conversation.
 */
const FriendMenu = () => {
  const { state, signOut } = useSession()
  const [dialog, setDialog] = useState<'profile' | 'customise' | 'password' | null>(null)

  if (state.status !== 'signed-in') return null

  const { user, friend } = state
  const name = friend?.display_name || user.email || 'Friend'
  const identity = identityOf(friend)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-full ring-offset-1 outline-hidden hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`${name} — account`}
            />
          }
        >
          {identity ? (
            // Always, for this one avatar (ticket 18 decision 3). The roster's
            // animate on sidebar hover instead, and that is issue 04's.
            <FriendBlob identity={identity} className="size-7" animate title={name} />
          ) : (
            /*
            Before setup, or while the row is in flight. `RequireSetup` means a
            Friend cannot linger here, but the bar renders during that gap — so
            the seed falls back to what we have and blobatar derives colour from
            it, rather than the cluster being empty for a beat. Not `FriendBlob`,
            because there is no `Identity` to give it: an invented hue would be a
            colour nobody chose, indistinguishable from one they had.
          */
            <Blobatar
              className="size-7"
              name={friend?.blobatar_seed || name}
              blobatar={{ title: name, animate: 'always' }}
            />
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          {/*
          Every label here is Base UI's `Menu.GroupLabel` and throws outside a
          `Menu.Group`, so the menu is groups.

          **The narrow-only view select is gone from here.** Ticket 12 decision
          6 put it in this menu because the bar did not fit at 375px and there
          was nowhere else; ticket 17 gives the phone a left drawer that holds
          exactly this class of control, and a mode selector filed under
          *account* was only ever where there was nowhere else. See
          `ViewSelector`.
        */}
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span>{name}</span>
              <span className="text-[11px] font-normal text-muted-foreground">{user.email}</span>
            </DropdownMenuLabel>

            <DropdownMenuItem onClick={() => setDialog('profile')}>
              <UserIcon /> Profile
            </DropdownMenuItem>

            {/*
            "How you look" is the customise-blobatar item, under the name
            ticket 18 gave it. Disabled only in the gap before the row lands:
            there is no identity to seed the controls from, and opening them on
            an invented one would let a Friend "keep" a colour they never chose.
          */}
            <DropdownMenuItem onClick={() => setDialog('customise')} disabled={identity === null}>
              <PaletteIcon /> How you look
            </DropdownMenuItem>

            <DropdownMenuItem onClick={() => setDialog('password')}>
              <KeyRoundIcon /> Change password
            </DropdownMenuItem>

            <DropdownMenuItem onClick={() => void signOut()}>
              <LogOutIcon /> Sign out
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/*
      Mounted only while open, and outside the menu rather than inside an item.
      A dialog nested in a `DropdownMenuItem` unmounts with the menu the moment
      the item is clicked, so it would open and vanish in the same frame — and
      mounting on open is also what makes each dialog's draft start from the
      row as it is now.
    */}
      {dialog === 'profile' ? (
        <ProfileDialog
          displayName={friend?.display_name ?? ''}
          email={user.email}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog === 'customise' && identity !== null ? (
        <CustomiseDialog
          identity={identity}
          displayName={friend?.display_name ?? ''}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog === 'password' ? (
        <ChangePasswordDialog email={user.email} onClose={() => setDialog(null)} />
      ) : null}
    </>
  )
}
