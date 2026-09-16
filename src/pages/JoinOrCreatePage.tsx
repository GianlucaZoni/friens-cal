import { calPath } from '@/cal/cals'
import { CopyCode } from '@/cal/copy-code'
import { CreateCalDialogs } from '@/cal/create-dialogs'
import { JoinDialog } from '@/cal/join-dialog'
import type { CalsState } from '@/cal/use-cals'
import { useCals } from '@/cal/use-cals'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { Cal } from '@/lib/database.types'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { TriangleAlertIcon } from 'lucide-react'

/**
 * `/` — the signed-in front door, and it is **never a redirect into a cal**.
 *
 * Bouncing a Friend with one cal straight to it would make this page
 * unreachable, and this page is the only place the Codes are, the only place a
 * second cal can be joined, and the only complete list (groups ticket 01). A
 * Friend with one cal sees one row and two doors; a Friend with none sees the
 * same card with one sentence where the row would be.
 *
 * ## The empty state is *not yet*, not a first-run screen
 *
 * That is the whole reason it is the same card rather than a different layout.
 * A brand-new Friend arrives here straight from `/setup` with nothing in the
 * list, and the worry was that two buttons and no list would read as a dead
 * end. Seeing it settled it: because the card is the same object they will see
 * forever, the empty version reads as *not yet* rather than as *nothing here*.
 *
 * ## The row is not one button
 *
 * A button cannot contain a button, and a row that navigates swallows any
 * attempt to drag-select the Code inside it — so select-and-copy was never on
 * offer and the Code needs a control of its own. The name and Code are one
 * target that opens the cal; the copy button is a second, beside it rather than
 * inside it. Nothing propagates from one to the other because nothing contains
 * the other, which is why there is no `stopPropagation` here to go stale.
 */
export const JoinOrCreatePage = () => {
  const { cals, status, create, join } = useCals()
  const navigate = useNavigate()
  const [joining, setJoining] = useState(false)
  const [creating, setCreating] = useState(false)

  const open = (cal: Cal) => void navigate(calPath(cal.id))

  return (
    <main className="flex min-h-screen items-start justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col gap-1 text-center">
          <h1 className="text-sm font-semibold tracking-tight">friens cal</h1>
          <p className="text-xs text-muted-foreground">Pick a cal, or get into one.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Your friens cals</CardTitle>
            {/*
              Gated on `status`, not on `cals.length`. The list is empty while
              the read is in flight and empty again when it fails, and "You are
              not in one yet." is the one sentence on this card that decision 05
              spent real argument on — saying it to a Friend who has five cals,
              or directly above an alert explaining that we could not read them,
              is the way to make it mean nothing.
            */}
            <CardDescription>
              {status === 'ready' && cals.length === 0
                ? 'You are not in one yet.'
                : 'The code next to each one is what you send to add somebody.'}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <CalList cals={cals} status={status} />
          </CardContent>

          {/*
            Both doors stay on screen whatever the list holds. Creating is the
            filled button because it is the one that needs no help from anybody
            else; joining needs a Code somebody has to send you first.
          */}
          <CardFooter className="justify-between gap-2">
            <Button variant="outline" onClick={() => setJoining(true)}>
              Join with a code
            </Button>
            <Button onClick={() => setCreating(true)}>Create a new friens cal</Button>
          </CardFooter>
        </Card>
      </div>

      <JoinDialog open={joining} onOpenChange={setJoining} join={join} onJoined={open} />
      <CreateCalDialogs
        open={creating}
        onOpenChange={setCreating}
        create={create}
        onOpenCal={open}
      />
    </main>
  )
}

/** The list, or the one sentence standing in for it. */
const CalList = ({ cals, status }: { cals: Cal[]; status: CalsState['status'] }) => {
  if (status === 'loading') {
    return (
      <p role="status" aria-live="polite" className="p-4 text-center text-xs text-muted-foreground">
        Loading…
      </p>
    )
  }

  if (status === 'error') {
    return (
      <div
        role="alert"
        className="flex gap-2 border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
      >
        <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
        <span>
          We cannot reach your cals. Reload, and if it keeps happening say so in the group chat. You
          can still join one with a code.
        </span>
      </div>
    )
  }

  if (cals.length === 0) {
    return (
      <p className="border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
        Nothing here yet. Somebody sends you a code, or you start one.
      </p>
    )
  }

  return (
    <ul className="flex flex-col">
      {cals.map((cal) => (
        <li key={cal.id} className="flex items-center gap-1 border-b border-border last:border-b-0">
          <Link
            to={calPath(cal.id)}
            className="flex min-w-0 flex-1 items-center justify-between gap-3 py-2.5 text-left text-xs outline-hidden hover:bg-muted focus-visible:ring-1 focus-visible:ring-ring"
          >
            <span className="truncate">{cal.name}</span>
            <span className="shrink-0 font-mono text-muted-foreground">{cal.code}</span>
          </Link>
          <CopyCode code={cal.code} />
          {/*
            Ticket 05's overflow menu (Leave, Rename) goes here, as a third
            sibling. Not built, and deliberately not stubbed: an empty slot of
            fixed width would be a hole in the row until it lands.
          */}
        </li>
      ))}
    </ul>
  )
}
