import { useSession } from '@/auth/use-session'
import { Blobatar } from '@/components/ui/blobatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { ShellTrigger } from '@/shell/shell'
import { useAppShell } from '@/shell/shell-context'
import type { CalendarView, CalendarViewState } from '@/shell/use-calendar-view'
import { ChevronLeftIcon, ChevronRightIcon, LogOutIcon } from 'lucide-react'

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
export const TopBar = ({ calendar }: { calendar: CalendarViewState }) => (
  <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
    <RangeLabel label={calendar.label} onToday={calendar.goToday} />
    <TopCluster calendar={calendar} />
  </header>
)

const RANGE_LABEL_CLASS = 'mx-1 flex-1 truncate text-left text-sm font-medium tabular-nums'

/**
 * The date label. Below the sheet breakpoint it is *also* the Today button:
 * the cluster does not fit at 375px, and the first thing it would eat is this
 * label, which is the one thing on the bar you cannot do without — so Today
 * gives up its own control and moves here instead.
 *
 * Two elements rather than one with `pointer-events-none`: a button that is
 * mouse-inert but still focusable is a control keyboard users can reach and
 * mouse users cannot see, and above the breakpoint there is already a Today
 * button two inches to the right.
 */
const RangeLabel = ({ label, onToday }: { label: string; onToday: () => void }) => {
  const { isSheet } = useAppShell()
  if (!isSheet) return <span className={RANGE_LABEL_CLASS}>{label}</span>
  return (
    <button
      type="button"
      onClick={onToday}
      title="Go to today"
      className={cn(RANGE_LABEL_CLASS, 'underline decoration-dotted underline-offset-4')}
    >
      {label}
    </button>
  )
}

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
        <Button variant="ghost" size="sm" className="hidden md:inline-flex" onClick={goToday}>
          Today
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Next" onClick={goNext}>
          <ChevronRightIcon />
        </Button>
      </div>

      <Separator orientation="vertical" className="mx-1 hidden h-5 md:block" />

      <ToggleGroup
        className="hidden md:flex"
        variant="outline"
        size="sm"
        spacing={0}
        value={[view]}
        onValueChange={(next) => {
          // Base UI hands back an array and allows it to be empty. A calendar is
          // always in some view, so an empty selection is not a state to enter.
          if (next[0]) setView(next[0] as CalendarView)
        }}
      >
        <ToggleGroupItem value="week" aria-label="Week view">
          <span className="hidden lg:inline">Week</span>
          <span className="lg:hidden">W</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="month" aria-label="Month view">
          <span className="hidden lg:inline">Month</span>
          <span className="lg:hidden">M</span>
        </ToggleGroupItem>
      </ToggleGroup>

      <Separator orientation="vertical" className="mx-1 h-5" />
      <ShellTrigger side="left" />
      <ShellTrigger side="right" />

      <Separator orientation="vertical" className="mx-1 h-5" />
      <FriendMenu view={view} onView={setView} />
    </div>
  )
}

/**
 * The current Friend's blobatar, and the menu behind it.
 *
 * Sign out lives here (ticket 18) and is the only entry so far. Profile,
 * blobatar customisation and change-password are issue 03's, and land in this
 * menu — the shell places the cluster, issue 03 decides what is inside it.
 */
const FriendMenu = ({
  view,
  onView,
}: {
  view: CalendarView
  onView: (view: CalendarView) => void
}) => {
  const { state, signOut } = useSession()
  if (state.status !== 'signed-in') return null

  const { user, friend } = state
  // Every identity column is blank until the setup flow runs (issue 03), so the
  // seed falls back through what we do have. It is only a seed — the blobatar
  // it draws today is not the one this Friend will keep.
  const name = friend?.display_name || user.email || 'Friend'
  const seed = friend?.blobatar_seed || name

  return (
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
        <Blobatar
          className="size-7"
          name={seed}
          blobatar={{
            // Null until issue 03 writes them; blobatar derives both from the
            // seed in the meantime rather than rendering nothing.
            hue: friend?.hue ?? undefined,
            tone: friend?.tone ?? undefined,
            title: name,
            // Always, for this one avatar (ticket 18). The roster's animate on
            // sidebar hover instead, and that is issue 04's.
            animate: 'always',
          }}
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {/*
          Every label here is Base UI's `Menu.GroupLabel` and throws outside a
          `Menu.Group` — so the menu is groups, and the narrow-only view select
          is a group of its own rather than a pair of loose items.
        */}
        <div className="md:hidden">
          <DropdownMenuGroup>
            <DropdownMenuLabel>View</DropdownMenuLabel>
            <DropdownMenuCheckboxItem checked={view === 'week'} onClick={() => onView('week')}>
              Week
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={view === 'month'} onClick={() => onView('month')}>
              Month
            </DropdownMenuCheckboxItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
        </div>

        {/* Issue 03's profile, blobatar customisation and change-password join
            this group; sign out is the shell's, because the placeholder page it
            replaced was the only way out. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span>{name}</span>
            <span className="text-[11px] font-normal text-muted-foreground">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => void signOut()}>
            <LogOutIcon /> Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
