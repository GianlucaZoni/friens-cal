import { TriangleAlertIcon } from 'lucide-react'

/**
 * A failed write, said in one sentence.
 *
 * Its own file because both the setup route and the profile dialogs show it,
 * and a component reaching into a *page* module for it would put the import
 * arrow the wrong way round — pages compose features, not the reverse.
 */
export const SaveError = ({ message }: { message: string }) => (
  <div
    role="alert"
    className="flex gap-2 border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
  >
    <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
    <span>{message}</span>
  </div>
)
