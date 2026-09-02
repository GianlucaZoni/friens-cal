import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useHoverPointer } from '@/hooks/use-hover-pointer'
import type { ReactElement, ReactNode } from 'react'

/**
 * A sidebar card's detail: **a Sheet on touch, the same detail as a Popover on
 * desktop.**
 *
 * Ticket 16's final answer, in one component because it is one decision. On
 * touch there are **no controls on the card at all** and tapping it opens the
 * detail carrying every action; on desktop *"clicking a card body opens that
 * same detail as a popover, making the hover tick an accelerator rather than
 * the only route"* — the pattern ticket 01 already set for ⌥+drag.
 *
 * ## Why it is one component and not two cards
 *
 * The alternative is a touch card and a desktop card, which is two components
 * that have to agree about what a card *is*. What actually differs is the
 * surface the detail arrives on and whether an accelerator is reachable, and
 * both of those are one line each. Everything a viewer can do is in `children`,
 * once, so the platforms cannot drift apart in what they offer — which was the
 * failure ticket 16 was closing when it made the sheet the primary route rather
 * than a mobile alternative to a menu.
 *
 * ## The rules the two surfaces are chosen by
 *
 * **`(hover: none)` decides, not the width** — see `useHoverPointer`. And the
 * Sheet comes up from the **bottom**: below 768px the panes themselves are
 * left- and right-side Sheets (`shell.tsx`), so a detail arriving from the same
 * edge would read as the pane being replaced rather than as something opening
 * on top of it.
 *
 * ## A Dialog inside is fine; a Dialog inside a Popover is not
 *
 * Ticket 16's amendment: *"A sheet that contains a dialog is fine; a popover
 * that contains one is not."* The retime is a **Dialog** either way, and on
 * desktop it opens over this popover rather than inside it — which is why the
 * caller closes the detail as it opens the editor rather than nesting the two.
 */
export const CardDetail = ({
  trigger,
  title,
  description,
  open,
  onOpenChange,
  children,
}: {
  /**
   * The card body, rendered as the thing that opens this.
   *
   * An element rather than a node, because Base UI's `render` prop merges its
   * own props into it — the trigger semantics (`aria-haspopup`, the expanded
   * state) land on the card itself rather than on a wrapper around it.
   */
  trigger: ReactElement
  /** Names the object, so the surface says what it is about before its actions. */
  title: ReactNode
  description: ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) => {
  const hovers = useHoverPointer()

  if (!hovers) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger render={trigger} />
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-3 px-4 pb-4">{children}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={trigger} />
      {/*
        `side="left"` because this pane is on the right edge of the window and a
        popover to its right has nowhere to go. `align="start"` keeps its top
        edge on the card's, so a long detail grows downwards rather than
        recentring over the list.
      */}
      <PopoverContent side="left" align="start" className="w-72">
        <PopoverHeader>
          <PopoverTitle>{title}</PopoverTitle>
          <PopoverDescription>{description}</PopoverDescription>
        </PopoverHeader>
        <div className="flex flex-col gap-3">{children}</div>
      </PopoverContent>
    </Popover>
  )
}
