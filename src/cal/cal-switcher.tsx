import type { CalActing } from '@/cal/cal-action-dialogs'
import { CalActionDialogs } from '@/cal/cal-action-dialogs'
import { CalOverflow } from '@/cal/cal-overflow'
import { calPath, withCal } from '@/cal/cals'
import { CreateCalDialogs } from '@/cal/create-dialogs'
import { JoinDialog } from '@/cal/join-dialog'
import { useCals } from '@/cal/use-cals'
import { useCurrentCal } from '@/cal/use-current-cal'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Cal } from '@/lib/database.types'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { CheckIcon, ChevronDownIcon, PlusIcon, TicketIcon } from 'lucide-react'

/**
 * Which cal you are in, and the way into any of the others.
 *
 * It lives in the left pane's `h-12` header beside the wordmark, so it is a
 * drawer control on a phone and a column control on a desktop with no second
 * implementation. **The phone's bar carries no cal name**: ticket 17 measured
 * that a fourth control group does not fit at 375px, and with the drawer shut
 * the question *which cal am I in* is answered by the Friends on the grid. That
 * cost was weighed in groups ticket 06 and accepted.
 *
 * ## The menu is bottom-weighted, and pinned to the trigger
 *
 * The cals first, alphabetically, then the two doors. Unusual on purpose: with
 * one cal the menu is a single row and two actions, and with eight the actions
 * have moved down past a list, which is the case the inversion was chosen for.
 *
 * `DropdownMenuContent` carries `w-(--anchor-width)`, so the popup is exactly
 * the trigger's width and long names truncate in the list as they do in the
 * header. Growing to fit was considered and refused: a menu that changes width
 * with its contents makes the eight-cal case jump out over the grid, the header
 * shows the full name once you have picked, and on a phone the trigger is
 * already most of the drawer.
 *
 * ## It routes, and the shell remounts itself
 *
 * Picking a cal is a `navigate` to its `/g/:id` and nothing else.
 * `CurrentCalProvider` renders its loading branch on every id change, which
 * unmounts this whole shell and takes the open drawer with it, so there is no
 * "close the sheet" to write here and nothing for this component to know about
 * the shell it is in.
 *
 * ## The two doors are ticket 02's dialogs, not new ones
 *
 * `JoinDialog` and `CreateCalDialogs` are the same components `/` renders. The
 * duplication groups ticket 06 asked about is the **list**, and it is fine: `/`
 * shows the Codes inline and this shows them one level down, because a switcher
 * is read at a glance and a six-character Code in every row is not.
 */
export const CalSwitcher = () => {
  const { cal: current } = useCurrentCal()
  const { cals, status, create, join, rename } = useCals()
  const navigate = useNavigate()

  const [acting, setActing] = useState<CalActing | null>(null)
  const [joining, setJoining] = useState(false)
  const [creating, setCreating] = useState(false)

  const open = (cal: Cal) => void navigate(calPath(cal.id))

  /*
   * The cal on screen is on the list whether or not the list has landed. The
   * provider has already read it, so folding it in means the menu opens with
   * the right row ticked in the first frame rather than with an empty popup,
   * and `withCal` replaces rather than duplicates once the read arrives.
   */
  const rows = useMemo(() => withCal(cals, current), [cals, current])

  return (
    <>
      <div className="flex min-w-0 flex-1">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" className="h-8 w-full justify-between gap-1 px-2" />}
          >
            {/*
              `min-w-0` is the load-bearing half of the truncation, not
              `truncate`: a flex child's default `min-width` is `auto`, so on its
              own `truncate` leaves the name at its intrinsic width and pushes
              the chevron out of the pane instead of clipping the text.
            */}
            <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">
              {current.name}
            </span>
            <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start">
            <DropdownMenuGroup>
              {rows.map((cal) => (
                <DropdownMenuItem
                  key={cal.id}
                  // `pr-1`, so the dots sits where a trailing control belongs
                  // rather than two paddings in from the edge.
                  className="pr-1"
                  aria-current={cal.id === current.id ? 'true' : undefined}
                  onClick={() => open(cal)}
                >
                  {/* `invisible` rather than absent: the names line up. */}
                  <CheckIcon className={cal.id === current.id ? '' : 'invisible'} />
                  <span className="min-w-0 flex-1 truncate">{cal.name}</span>
                  <CalOverflow
                    cal={cal}
                    surface="switcher"
                    onAction={(action) => setActing({ action, cal })}
                  />
                </DropdownMenuItem>
              ))}

              {/*
                The list is one row until the read lands, and that row is the cal
                you are standing in. Saying so is cheap and the alternative is a
                Friend with five cals reading a menu that shows one.
              */}
              {status === 'ready' ? null : (
                <DropdownMenuLabel>
                  {status === 'loading' ? 'Loading…' : 'We cannot reach your other cals.'}
                </DropdownMenuLabel>
              )}
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={() => setJoining(true)}>
              <TicketIcon />
              Join another via code
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setCreating(true)}>
              <PlusIcon />
              Create a new friens cal
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/*
        All three outside the menu. A dialog nested in a `DropdownMenuItem`
        unmounts with the menu on the click that opened it, and here two menus
        close at once.
      */}
      <CalActionDialogs acting={acting} rename={rename} onClose={() => setActing(null)} />
      <JoinDialog open={joining} onOpenChange={setJoining} join={join} onJoined={open} />
      <CreateCalDialogs
        open={creating}
        onOpenChange={setCreating}
        create={create}
        onOpenCal={open}
      />
    </>
  )
}
