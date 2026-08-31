import type { Slot } from '@/availability/slots'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { format } from 'date-fns'
import { CopyIcon, EraserIcon, PlusIcon } from 'lucide-react'

/**
 * What a click on the grid opens — **the shell of it**.
 *
 * A bare click reads; only a drag writes (ticket 10, reversing ticket 06's
 * click-to-create on both platforms). This is the thing it opens, and it is the
 * seam this issue shares with issue 07: **who is free here** — the Friends'
 * blobatars, the Candidate marker — is issue 07's to fill in, and after ticket
 * 15 removed per-Friend colour from the grid it is the *only* answer to "who".
 * Nothing about that is built here, and nothing here is in its way.
 *
 * What this issue owns is the three actions, and one of them is an acceptance
 * criterion rather than a convenience: **Duplicate**. ⌥+drag is the
 * accelerator, and ticket 01's corrections require the discoverable route to be
 * a visible control on the block — undiscoverable-by-construction was the one
 * thing ticket 06's prototype could not fix about ⌥+drag, and it cannot exist
 * at all on touch.
 *
 * `Erase block` is the same bargain for erasing: the drag is the fast route and
 * this is the one you can find.
 */
export const SlotPopover = ({
  day,
  slot,
  end,
  top,
  height,
  held,
  onClose,
  onDraw,
  onErase,
  onDuplicate,
}: {
  day: Date
  slot: Slot
  /** The wall clock this Slot ends at — `24:00` where that is midnight. */
  end: string
  /** Where the Slot sits in its column, so the popover points at it. */
  top: number
  height: number
  /** Whether the viewer already holds this Slot. */
  held: boolean
  onClose: () => void
  onDraw: () => void
  onErase: () => void
  onDuplicate: () => void
}) => (
  <Popover
    open
    onOpenChange={(open) => {
      if (!open) onClose()
    }}
  >
    {/*
      A zero-weight anchor sitting exactly on the Slot, rather than a control.
      The trigger is what Base UI positions against, and the thing being talked
      about is half an hour of one column — so the anchor is that half hour.
      `pointer-events-none` because the grid's own handlers own every pointer
      here, and `aria-hidden` because it is a position, not a button.

      `nativeButton={false}` for the same reason, and it is not optional: Base UI
      assumes a trigger is a real `<button>` and warns in the console about the
      form and accessibility semantics a `<span>` would drop. Nothing focuses or
      presses this — the grid's own click is what opens the popover — so the
      honest answer is to tell Base UI it is not a button rather than to make it
      one nobody can reach.
    */}
    <PopoverTrigger
      nativeButton={false}
      render={<span aria-hidden />}
      className="pointer-events-none absolute inset-x-0"
      style={{ top, height }}
    />
    <PopoverContent align="center" side="right" className="w-60">
      <PopoverHeader>
        <PopoverTitle className="tabular-nums">
          {format(day, 'EEE d MMM')} · {slot.label}–{end}
        </PopoverTitle>
        <PopoverDescription>
          {held ? "You're free." : "You haven't marked this."}
        </PopoverDescription>
      </PopoverHeader>

      <div className="flex flex-wrap gap-1">
        {held ? (
          <>
            <Button variant="outline" size="sm" onClick={onErase}>
              <EraserIcon /> Erase block
            </Button>
            <Button variant="outline" size="sm" onClick={onDuplicate}>
              <CopyIcon /> Duplicate
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={onDraw}>
            <PlusIcon /> I&apos;m free
          </Button>
        )}
      </div>
    </PopoverContent>
  </Popover>
)
