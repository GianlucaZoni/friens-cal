import type { SlotAnswer } from '@/availability/slot-answer'
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
import { FriendBlob } from '@/identity/friend-blob'
import { format } from 'date-fns'
import { CopyIcon, EraserIcon, PlusIcon } from 'lucide-react'

/**
 * What a click on the grid opens.
 *
 * A bare click reads; only a drag writes (ticket 10, reversing ticket 06's
 * click-to-create on both platforms).
 *
 * ## This is the only answer to "who"
 *
 * Ticket 15 removed per-Friend colour from the grid outright: the wash is one
 * hue — the viewer's — and opacity carries *how many*. So the grid answers how
 * many and this panel answers who, and it is **load-bearing rather than a
 * nicety**. It is also the only place a Friend's face appears alongside the
 * calendar.
 *
 * **Blobatar and name, both.** Colour alone cannot identify anybody here: hue
 * collisions between Friends are permitted (ticket 11 settled it — hue stays
 * continuous and free, and the blobatar shape disambiguates), and prototype 05
 * measured the failure it produces: two Friends at h262 and h268 in a composite
 * "do not read as two similar colours, they read as *one* Friend". A coloured
 * dot per Friend would reproduce exactly that here. So the shape carries the
 * identity and the name settles it.
 *
 * ## The three actions
 *
 * **Duplicate** is an acceptance criterion rather than a convenience: ⌥+drag is
 * the accelerator, and ticket 01's corrections require the discoverable route to
 * be a visible control — undiscoverable-by-construction was the one thing ticket
 * 06's prototype could not fix about ⌥+drag, and it cannot exist at all on
 * touch. `Erase block` is the same bargain for erasing.
 */
export const SlotPopover = ({
  day,
  slot,
  end,
  box,
  held,
  answer,
  onClose,
  onDraw,
  onErase,
  onDuplicate,
}: {
  day: Date
  slot: Slot
  /** The wall clock this Slot ends at — `24:00` where that is midnight. */
  end: string
  /**
   * Where the Slot sits in its column, so the popover points at it.
   *
   * A style rather than two numbers, because the grid's row height is a custom
   * property now (`--slot`, 20px with a mouse and 44px under a finger) and the
   * anchor is positioned in `calc` against it. Nothing here needs to know which
   * of the two is in force.
   */
  box: { top: string; height: string }
  /** Whether the viewer already holds this Slot. */
  held: boolean
  answer: SlotAnswer
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
      style={box}
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

      <FreeHere answer={answer} />

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

/**
 * The answer: how many, then who, then over what span.
 *
 * **The count is written out as a numeral** rather than left to the wash.
 * Prototype 05's third contradiction: opacity is a comparative channel — it says
 * "more here than there" and cannot be read as a number — and "the count needs
 * to be legible independently of the colours". This is where it becomes legible.
 *
 * The span is the **segment's**, so the sentence is complete: these Friends,
 * from here to here. A viewer who clicked 20:00 and reads `2 free · 20:00–22:00`
 * knows the answer holds for four Slots without clicking any of the other three.
 *
 * Nobody free is stated rather than left blank: silence is not a claim of being
 * busy (CONTEXT.md), and an empty panel would read as a rendering fault.
 *
 * "Nobody **else**", because `free` includes the viewer — so an empty answer
 * implies the viewer is not free either, and the header has already said so.
 * "Nobody has marked this" underneath "You haven't marked this" says one fact
 * twice and reads as a stutter.
 */
const FreeHere = ({ answer }: { answer: SlotAnswer }) => {
  const { free, span } = answer

  if (free.length === 0) {
    return <p className="text-[11px] text-muted-foreground">Nobody else has either.</p>
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-[11px] tabular-nums text-muted-foreground">
        {free.length} free
        {span === null ? null : ` · ${span.from}–${span.to}`}
      </p>
      <ul className="flex flex-col gap-0.5">
        {free.map((friend) => (
          <li key={friend.id} className="flex items-center gap-2">
            {/*
              No `title` on the blobatar: the name is written beside it, and a
              titled blobatar would make a screen reader read the Friend twice.
              Without one it is `alt=""` and skipped, which is right for a
              picture that is already labelled.
            */}
            <FriendBlob identity={friend.identity} size="xs" />
            <span className="min-w-0 flex-1 truncate text-[13px]">{friend.name}</span>
            {friend.isSelf && (
              <span className="shrink-0 text-[10px] text-muted-foreground">you</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
