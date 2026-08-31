import { FriendBlob } from '@/identity/friend-blob'
import { friendColour } from '@/identity/ui-colour'
import { cn } from '@/lib/utils'
import type { RosterFriend, RosterState } from '@/roster/use-roster'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  ShellMenuButton,
} from '@/shell/shell'
import { times } from 'lodash-es'
import { EyeIcon, EyeOffIcon, UserRoundIcon } from 'lucide-react'

/**
 * The Group, each row a switch on whether that Friend is in the query.
 *
 * **Hiding is a query tool, not a preference** (CONTEXT.md): it says who the
 * viewer is currently trying to meet, so it filters the grid *and* drives
 * Candidate computation. It is ephemeral — see `useRoster`.
 *
 * The **silence dot** is here as of issue 07. Ticket 01 asked for it — "a muted
 * dot beside Friends with zero Availability in the current view, so an inactive
 * Friend does not read as a busy one" — and issue 07's acceptance criteria do
 * not mention it. The ticket wins: the spec says so where they disagree, and the
 * decision is load-bearing rather than decorative now that the grid is a *count*
 * over everyone. A Friend contributing nothing to the wash is either free
 * nowhere or has not said anything, and CONTEXT.md is explicit that those are
 * different things the tool cannot otherwise tell apart.
 */
export const FriendRoster = ({
  roster,
  silent,
  animate,
}: {
  roster: RosterState
  /**
   * Ids of the Friends holding no Availability anywhere in the current view.
   *
   * Passed in rather than computed here: the answer needs every Friend's rows,
   * which live in the Availability store, and the sidebar has no business
   * reaching for them. `AppShell` holds both.
   */
  silent: ReadonlySet<string>
  /** Blobatars animate while the cursor is over the sidebar (ticket 12 d9). */
  animate: boolean
}) => {
  const { friends, visible, hidden, toggleHidden, status } = roster

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="justify-between">
        Friends
        {/*
          Only while something is Hidden. A permanent "6/6" is a tally nobody
          asked for; the same span while a Friend is out reads as what it is —
          a filter is on, and it is also driving the Candidate list in the other
          pane, where nothing else would say so.
        */}
        {hidden.size > 0 && (
          <span
            className="text-[10px] tabular-nums"
            title={`${visible.length} of ${friends.length} shown`}
          >
            {visible.length}/{friends.length}
          </span>
        )}
      </SidebarGroupLabel>

      <SidebarMenu>
        {status === 'loading' ? (
          <RosterSkeleton />
        ) : (
          friends.map((friend) => (
            <RosterRow
              key={friend.id}
              friend={friend}
              hidden={hidden.has(friend.id)}
              silent={silent.has(friend.id)}
              animate={animate}
              onToggle={() => toggleHidden(friend.id)}
            />
          ))
        )}
      </SidebarMenu>

      {/*
        Your own row is still here — it comes from the session, not from this
        query (`mergeSelf`) — so this is a partial roster and says so, rather
        than an empty pane. Nothing retries: a reload is the retry, and the
        roster is not a write path where a stale read costs anything.
      */}
      {status === 'error' && (
        <p className="px-2 pt-1 text-[11px] text-muted-foreground">
          Could not load the other Friends.
        </p>
      )}
    </SidebarGroup>
  )
}

/** Three, because the real group is small and a wall of bars is worse than a gap. */
const SKELETON_ROWS = 3

const RosterSkeleton = () => (
  <>
    {times(SKELETON_ROWS, (index) => (
      <SidebarMenuItem key={index}>
        <SidebarMenuSkeleton showIcon />
      </SidebarMenuItem>
    ))}
  </>
)

/**
 * One Friend. **The whole row is the toggle**, and the eye is a picture of what
 * it does rather than a second control that does the same thing — two focusable
 * buttons with one behaviour is one too many for anyone reading the row through
 * a screen reader, which is why this is not the prototype's
 * `SidebarMenuAction`.
 *
 * The label states the *action*, and there is deliberately no `aria-pressed`
 * beside it: a control that flips its own name **and** reports itself pressed
 * says the same thing twice and disagrees with itself doing it ("Show Ada",
 * pressed). Hidden is legible from "Show" — the same shape as Mute/Unmute.
 *
 * The eye appears on hover on desktop and is permanently visible below the
 * sheet breakpoint, where there is no hover to appear on (ticket 12 decision 8).
 * It also stays visible while the Friend is Hidden, at every width: a Hidden
 * Friend has to be legible as Hidden without pointing at them.
 */
const RosterRow = ({
  friend,
  hidden,
  silent,
  animate,
  onToggle,
}: {
  friend: RosterFriend
  hidden: boolean
  /** No Availability anywhere in the current view. */
  silent: boolean
  animate: boolean
  onToggle: () => void
}) => {
  const Eye = hidden ? EyeOffIcon : EyeIcon
  // One string for the tooltip and the accessible name. Two that differ is one
  // control answering "what is this?" two ways.
  const action = `${hidden ? 'Show' : 'Hide'} ${friend.name}${friend.isSelf ? ' (you)' : ''}`

  return (
    <SidebarMenuItem>
      <ShellMenuButton
        className="h-10 gap-2.5 px-2"
        // Explicit, rather than left to the row's contents: the eye and the
        // "you" tag are not part of anybody's name.
        aria-label={action}
        title={action}
        onClick={onToggle}
      >
        {/* Dimming the contents rather than the button, so the eye keeps its
            contrast on a Hidden row. */}
        <span
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2.5 transition-opacity',
            hidden && 'opacity-45'
          )}
        >
          {friend.identity === null ? (
            <NotSetUpYet />
          ) : (
            <>
              {/*
                The rail is `oklch(var(--friend-l) var(--friend-c) hue)` — the
                computed UI colour, one of the three places a per-Friend colour
                survives (ticket 11). Never blobatar's `head`: that carries the
                *tone's* lightness, which is free per Friend, and the whole
                point of the model is that lightness is not.
              */}
              <span
                aria-hidden
                className="h-5 w-0.5 shrink-0 rounded-full"
                style={{ background: friendColour(friend.identity.hue) }}
              />
              <FriendBlob identity={friend.identity} size="sm" animate={animate} />
            </>
          )}
          <span className="min-w-0 flex-1 truncate text-[13px]">{friend.name}</span>
          {silent && <SilenceDot name={friend.name} />}
          {friend.isSelf && <span className="shrink-0 text-[10px] text-muted-foreground">you</span>}
        </span>
        <Eye
          className={cn(
            'shrink-0 text-muted-foreground transition-opacity',
            'md:opacity-0 md:group-hover/menu-button:opacity-100 md:group-focus-visible/menu-button:opacity-100',
            hidden && 'md:opacity-100'
          )}
        />
      </ShellMenuButton>
    </SidebarMenuItem>
  )
}

/**
 * A Friend whose account exists and whose setup does not — the row is created
 * blank the moment they sign up (issue 01), and there is one in the real project
 * right now.
 *
 * They keep their place in the roster, because they are in the Group, and they
 * stay hideable, because every row behaving the same way is worth more than a
 * control that would be inert on exactly these rows. What they do not get is a
 * colour: no rail, and a neutral placeholder rather than a blobatar, because
 * blobatar derives a hue from the seed and that hue would be indistinguishable
 * from one they had chosen.
 */
const NotSetUpYet = () => (
  <>
    <span aria-hidden className="w-0.5 shrink-0" />
    <span
      aria-hidden
      title="Has not finished setting up"
      className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground"
    >
      <UserRoundIcon />
    </span>
  </>
)

/**
 * A Friend who has said nothing about the week on screen.
 *
 * **Muted, and never coloured** (ticket 01 says "a muted dot"). Their own colour
 * would read as a mark *of* them — as if they had contributed something — and
 * this dot exists to say the opposite. It is also the reason it is a dot rather
 * than dimming the row: the row is already dimmed when the Friend is Hidden, and
 * Hidden and silent are different facts that can both be true at once.
 *
 * Screen-reader text rather than only a `title`, because this is information and
 * not an affordance — and appended to the row's own label by being inside the
 * button, so it is read as part of the Friend rather than as a second control.
 */
const SilenceDot = ({ name }: { name: string }) => (
  <span className="flex shrink-0 items-center" title={`${name} has no Availability in this view`}>
    <span aria-hidden className="size-1.5 rounded-full bg-muted-foreground/40" />
    <span className="sr-only">— nothing marked in this view</span>
  </span>
)
