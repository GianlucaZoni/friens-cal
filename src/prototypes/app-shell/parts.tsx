/**
 * PROTOTYPE — ticket 12. THROWAWAY.
 *
 * The furniture the three shell variants arrange. Everything here is stubbed to
 * the depth the SHELL needs and no further: ticket 16 owns the Candidate and
 * Hangout cards, ticket 14 owns month view, ticket 05/15 own the grid.
 */
import * as React from 'react'
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  EyeOffIcon,
  MoonIcon,
  MoreHorizontalIcon,
  PaletteIcon,
  SunIcon,
  UserIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Blobatar } from '@/components/ui/blobatar'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  CANDIDATES,
  FRIENDS,
  ME,
  PINNED_HANGOUTS,
  byId,
  friendColor,
  type CardStub,
} from './data'
import {
  ShellMenuButton,
  ShellTrigger,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuItem,
  useAppShell,
} from './shell'

/* ------------------------------------------------------------------ */
/* Item 6 — the top-right cluster                                      */
/* ------------------------------------------------------------------ */

export type View = 'week' | 'month'

/**
 * Blobatar menu, view select, Today, prev/next.
 *
 * Arrangement is fixed (it is in the reference screenshot); what this
 * prototype decides is the NARROW behaviour, and it does it with CSS only —
 * no width measuring, no JS breakpoints, so it also works inside a sheet.
 *
 *   ≥ lg   full cluster, "Today" written out, Week/Month written out
 *   md–lg  "Today" keeps its word, Week/Month become W/M initials
 *   < md   prev/next and the blobatar survive; Today collapses into the date
 *          label (tap the title to go to today) and the view select moves into
 *          the blobatar menu. Below the sheet breakpoint there IS no keyboard,
 *          so the two pane triggers must be visible here — they are.
 */
export function TopCluster({
  view,
  onView,
  label,
  dark,
  onDark,
  showPaneTriggers = false,
}: {
  view: View
  onView: (v: View) => void
  label: string
  dark: boolean
  onDark: (v: boolean) => void
  /** Variants B and C park the pane triggers in the bar rather than the panes. */
  showPaneTriggers?: boolean
}) {
  return (
    <div className="flex items-center gap-1">
      {/* prev / today / next */}
      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon-sm" aria-label="Previous">
          <ChevronLeftIcon />
        </Button>
        <Button variant="ghost" size="sm" className="hidden md:inline-flex">
          Today
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Next">
          <ChevronRightIcon />
        </Button>
      </div>

      <Separator orientation="vertical" className="mx-1 hidden h-5 md:block" />

      {/* view select */}
      <ToggleGroup
        className="hidden md:flex"
        variant="outline"
        size="sm"
        spacing={0}
        value={[view]}
        onValueChange={(next) => {
          if (next[0]) onView(next[0] as View)
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

      {showPaneTriggers && (
        <>
          <Separator orientation="vertical" className="mx-1 h-5" />
          <ShellTrigger side="left" />
          <ShellTrigger side="right" />
        </>
      )}

      <Separator orientation="vertical" className="mx-1 h-5" />

      {/* the current Friend */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-full ring-offset-1 outline-hidden hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`${ME.name} — account`}
            />
          }
        >
          <Blobatar
            className="size-7"
            name={ME.name}
            blobatar={{ hue: ME.hue, tone: ME.tone, title: ME.name }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>{ME.name}</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem>
              <UserIcon /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem>
              <PaletteIcon /> Customise blobatar
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {/* Narrow only: the view select and Today live here instead. */}
          <div className="md:hidden">
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => onView('week')}>
                {view === 'week' ? <CheckIcon /> : <span className="size-4" />} Week
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onView('month')}>
                {view === 'month' ? <CheckIcon /> : <span className="size-4" />} Month
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onDark(!dark)}>
            {dark ? <SunIcon /> : <MoonIcon />} {dark ? 'Light' : 'Dark'} theme
            <span className="ml-auto text-[10px] text-muted-foreground">prototype only</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <span className="sr-only">{label}</span>
    </div>
  )
}

/** The date range title. Tapping it is the narrow-width "Today". */
export function BarTitle({ label, className }: { label: string; className?: string }) {
  return (
    <button
      type="button"
      className={cn(
        'truncate text-left text-sm font-medium tabular-nums outline-hidden hover:underline md:pointer-events-none md:no-underline',
        className
      )}
      title="Go to today"
    >
      {label}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Left pane — date picker + Friend roster                             */
/* ------------------------------------------------------------------ */

export function LeftPane({ withHeader }: { withHeader?: React.ReactNode }) {
  const [month, setMonth] = React.useState<Date | undefined>(new Date(2026, 8, 1))
  const [hidden, setHidden] = React.useState<Set<string>>(new Set())

  const toggleHidden = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <>
      {withHeader ? <SidebarHeader className="h-12 justify-center border-b px-3">{withHeader}</SidebarHeader> : null}
      <SidebarContent>
        <div className="border-b p-1">
          <Calendar
            mode="single"
            selected={month}
            onSelect={setMonth}
            className="w-full bg-transparent p-1 [--cell-size:--spacing(8)]"
          />
        </div>
        <SidebarGroup>
          <SidebarGroupLabel className="justify-between">
            Friends
            <span className="text-[10px] tabular-nums">
              {FRIENDS.length - hidden.size}/{FRIENDS.length}
            </span>
          </SidebarGroupLabel>
          <SidebarMenu>
            {FRIENDS.map((f) => {
              const isHidden = hidden.has(f.id)
              return (
                <SidebarMenuItem key={f.id}>
                  <ShellMenuButton
                    className={cn('h-10 gap-2.5', isHidden && 'opacity-45')}
                    onClick={() => toggleHidden(f.id)}
                  >
                    <span
                      aria-hidden
                      className="h-5 w-0.5 shrink-0 rounded-full"
                      style={{ background: friendColor(f.hue) }}
                    />
                    <Blobatar
                      className="size-6"
                      name={f.name}
                      blobatar={{ hue: f.hue, tone: f.tone }}
                    />
                    <span className="flex-1 truncate text-[13px]">{f.name}</span>
                    {f.silent && (
                      <span
                        aria-label="No availability in view"
                        title="No availability in view"
                        className="size-1.5 shrink-0 rounded-full bg-muted-foreground/50"
                      />
                    )}
                  </ShellMenuButton>
                  {/* Eye on hover. Below the sheet breakpoint there is no hover,
                      so it is always visible there — ticket 17 item 3. */}
                  <SidebarMenuAction
                    showOnHover
                    className="top-2.5"
                    aria-label={isHidden ? `Show ${f.name}` : `Hide ${f.name}`}
                    onClick={() => toggleHidden(f.id)}
                  >
                    {isHidden ? <EyeOffIcon /> : <EyeIcon />}
                  </SidebarMenuAction>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Right pane — pinned Hangouts above a flat list of Candidates        */
/* ------------------------------------------------------------------ */

function CardShell({ card, kind }: { card: CardStub; kind: 'hangout' | 'candidate' }) {
  return (
    <div
      className={cn(
        'group/card relative flex flex-col gap-1.5 rounded-md border bg-card p-2.5 text-card-foreground',
        kind === 'hangout' && 'border-foreground/25',
        card.everyone && 'ring-1 ring-foreground/20'
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">{card.when}</span>
        {card.everyone && (
          <span className="rounded-sm bg-foreground px-1 text-[9px] font-semibold tracking-wide text-background uppercase">
            everyone
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium tabular-nums">{card.range}</span>
        <div className="flex -space-x-1.5">
          {card.friendIds.slice(0, 5).map((id) => {
            const f = byId(id)
            return (
              <Blobatar
                key={id}
                className="size-5 ring-1 ring-card"
                name={f.name}
                blobatar={{ hue: f.hue, tone: f.tone }}
              />
            )
          })}
        </div>
      </div>
      {card.title && <span className="truncate text-[11px] text-muted-foreground">{card.title}</span>}
      <div className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-hover/card:opacity-100">
        <Button variant="ghost" size="icon-sm" aria-label="More">
          <MoreHorizontalIcon />
        </Button>
      </div>
      <span className="sr-only">
        {kind === 'hangout' ? 'Hangout' : 'Candidate'} — {card.friendIds.length} Friends
      </span>
    </div>
  )
}

export function RightPane({ withHeader }: { withHeader?: React.ReactNode }) {
  return (
    <>
      {withHeader ? <SidebarHeader className="h-12 justify-center border-b px-3">{withHeader}</SidebarHeader> : null}
      <SidebarContent>
        {/* STUB. Ticket 16 owns the card anatomy; the shell only owns the fact
            that pinned Hangouts sit above a flat list of Candidates, that the
            region scrolls on its own, and that the divider is sticky. */}
        <div className="flex flex-col gap-1.5 border-b bg-sidebar p-2">
          <span className="px-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            Pinned Hangouts
          </span>
          {PINNED_HANGOUTS.map((h) => (
            <CardShell key={h.id} card={h} kind="hangout" />
          ))}
        </div>
        <div className="flex flex-col gap-1.5 p-2">
          <span className="px-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            Candidates
          </span>
          {CANDIDATES.map((c) => (
            <CardShell key={c.id} card={c} kind="candidate" />
          ))}
        </div>
      </SidebarContent>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Centre — a grid placeholder with real density                       */
/* ------------------------------------------------------------------ */

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function GridStub({ view }: { view: View }) {
  const { isSheet } = useAppShell()
  if (view === 'month') {
    return (
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-5 border-t border-l">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="border-r border-b p-1 text-[10px] text-muted-foreground">
            {i + 1 <= 30 ? i + 1 : ''}
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 border-b pl-10">
        {DAYS.map((d) => (
          <div
            key={d}
            className="flex-1 border-l py-1.5 text-center text-[11px] font-medium text-muted-foreground"
          >
            {isSheet ? d[0] : d}
          </div>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 overflow-auto">
        <div className="w-10 shrink-0">
          {Array.from({ length: 24 }).map((_, h) => (
            <div key={h} className="h-10 pr-1 text-right text-[9px] text-muted-foreground/70 tabular-nums">
              {String(h).padStart(2, '0')}
            </div>
          ))}
        </div>
        <div className="flex flex-1">
          {DAYS.map((d) => (
            <div key={d} className="flex-1 border-l">
              {Array.from({ length: 24 }).map((_, h) => (
                <div key={h} className="h-10 border-b border-border/40" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
