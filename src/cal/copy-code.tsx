import { spellOut } from '@/cal/code'
import { Button } from '@/components/ui/button'
import { useEffect, useRef, useState } from 'react'
import { CheckIcon, CopyIcon, TriangleAlertIcon } from 'lucide-react'

/** How long the tick stays before the button goes back to offering the copy. */
const TICK_MS = 1400

/**
 * The Code's copy button.
 *
 * ## Why the Code needs a button at all
 *
 * Select-and-copy was never on offer. A list row that navigates swallows any
 * attempt to drag-select the text inside it, so on the list this is the only
 * way to get the six characters out; in the create dialog it is the one moment
 * the Code is unmissable and asking a Friend to retype it there would be a
 * joke. Prototype 05 put the same control in both places.
 *
 * ## The label spells the Code out
 *
 * `H3DKW9` with no spaces is read as a word by most screen readers, and a Code
 * is six things to write down rather than a word. `spellOut` is what makes the
 * label useful to somebody who cannot see the row.
 *
 * ## The clipboard can say no
 *
 * `writeText` rejects in an insecure context and wherever the permission is
 * refused, and a button that silently does nothing is worse than one that says
 * it failed — the Code is on screen either way, so a Friend who is told can
 * still copy it by hand.
 */
export const CopyCode = ({ code, label }: { code: string; label?: string }) => {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The list row and the create dialog both unmount while the tick is up — the
  // dialog on its own close, the row on a navigation — so the timer has to be
  // cancellable rather than left to fire into a gone component.
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  const settle = (next: 'copied' | 'failed') => {
    setState(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), TICK_MS)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      settle('copied')
    } catch (thrown) {
      console.error('Could not write the code to the clipboard:', thrown)
      settle('failed')
    }
  }

  const Icon = state === 'copied' ? CheckIcon : state === 'failed' ? TriangleAlertIcon : CopyIcon

  return (
    <Button
      variant="ghost"
      size={label ? 'sm' : 'icon-xs'}
      aria-label={`Copy the code ${spellOut(code)}`}
      onClick={() => void copy()}
    >
      <Icon data-icon="inline-start" />
      {label ? (state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label) : null}
      {/*
        The icon alone says nothing to a screen reader, and the button's own
        label cannot change to report the result without also changing what the
        control claims to do. So the outcome goes in a live region beside it.
      */}
      <span role="status" aria-live="polite" className="sr-only">
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Could not copy the code' : ''}
      </span>
    </Button>
  )
}
