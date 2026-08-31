import { Toast as ToastPrimitive } from "@base-ui/react/toast"

/**
 * The app's one toast manager.
 *
 * Split out of `toast.tsx` on purpose. shadcn's `base-lyra` distribution keeps
 * it in the component file, but exporting a non-component from a file full of
 * components is the `react-refresh/only-export-components` error nine of the
 * vendored files already carry — and the rule's own advice is "use a new file
 * to share constants or functions between components". This is that file.
 *
 * A module-level manager rather than a hook, so a write path can raise a toast
 * without being inside the provider's tree: `useAvailability` reports a failed
 * round trip from the store, and `<Toaster />` is mounted once in the shell.
 */
export const toast = ToastPrimitive.createToastManager()
