import { CopyCode } from '@/cal/copy-code'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { DialogShell } from '@/identity/dialog-shell'
import type { Cal } from '@/lib/database.types'

/**
 * A cal's Code, from the switcher.
 *
 * The same block the create flow's second dialog shows, deliberately: one
 * presentation of six characters in the product, so the thing a Friend was told
 * to send looks the same wherever they come back to it. A Code is an address
 * rather than a secret (CONTEXT.md), so there is nothing to warn about and
 * nothing to reveal.
 *
 * This exists because the switcher is inside a cal and `/` is the only other
 * place the Code is written down. On `/` it is already on the row with a copy
 * button beside it, which is why View code is not on that menu.
 */
export const CalCodeDialog = ({ cal, onClose }: { cal: Cal; onClose: () => void }) => (
  <DialogShell
    title={`The code for ${cal.name}`}
    onClose={onClose}
    description="Send it to whoever should be in this cal. It never changes and it is not a secret."
  >
    <div className="flex items-center justify-between gap-2 border border-border p-3">
      <span className="font-mono text-sm tracking-[0.3em]">{cal.code}</span>
      <CopyCode code={cal.code} label="Copy" />
    </div>

    <DialogFooter>
      <Button variant="outline" onClick={onClose}>
        Done
      </Button>
    </DialogFooter>
  </DialogShell>
)
