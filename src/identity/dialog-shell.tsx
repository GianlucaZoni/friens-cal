import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * The frame every dialog behind the blobatar menu wears: a title, a sentence
 * under it, and whatever the caller puts below.
 *
 * `open` is hard-coded because the caller mounts these on open and unmounts
 * them on close. The dialog's own dismissals (Escape, the backdrop, the close
 * button) all arrive through `onOpenChange`, and every one of them means the
 * same thing here. Mounting on open is also what makes each dialog's draft
 * start from the row as it is now, with no effect to reset it.
 *
 * Its own file rather than a local helper in `profile-dialogs.tsx`, where it
 * used to live, because the invite dialog is a fourth caller and a second copy
 * of this would be a second copy of the paragraph above.
 */
export const DialogShell = ({
  title,
  description,
  wide,
  onClose,
  children,
}: {
  title: string
  description: React.ReactNode
  wide?: boolean
  onClose: () => void
  children: React.ReactNode
}) => (
  <Dialog
    open
    onOpenChange={(open) => {
      if (!open) onClose()
    }}
  >
    <DialogContent className={wide ? 'sm:max-w-2xl' : undefined}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      {children}
    </DialogContent>
  </Dialog>
)
