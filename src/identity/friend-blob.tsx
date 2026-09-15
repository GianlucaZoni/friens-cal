import { Blobatar } from '@/components/ui/blobatar'
import { expressionFor, type Identity } from '@/identity/identity'
import { cn } from '@/lib/utils'

/**
 * A Friend's blobatar, drawn from their four stored values.
 *
 * The one place in the app that turns an `Identity` into a picture, which is
 * what keeps the two crossings from being made twice:
 *
 * - **`expression` is an object, not a string.** The prop is typed
 *   `Expression` and the column holds a key, so `expressionFor` sits between
 *   them. Over HTTP a pose *is* a string, which is why two prototypes shipped
 *   `Type 'string' is not assignable to type 'Expression'` independently.
 * - **`animate` is spread conditionally, not passed as a boolean.** Passing it
 *   flips `Blobatar` from an `<img>` to inline SVG and changes its prop union
 *   with it, so `animate: false` and *no* `animate` are not the same call. The
 *   spread keeps the key absent when it should be absent.
 *
 * The ring ticket 11 asks for — "a subtle ring in the theme's border colour, so
 * a pale neutral blob on light and an ink blob on dark still have a defined
 * edge" — is **already here and nothing below adds one**. base-lyra's `Avatar`
 * root ships `after:border-border after:mix-blend-darken
 * dark:after:mix-blend-lighten`, and `Blobatar` wraps `Avatar`. It is needed:
 * pastel, pale and bright measure ~1.4–1.6:1 against a light surface and ink
 * ~1.7:1 against a dark one.
 */
export const FriendBlob = ({
  identity,
  className,
  size = 'md',
  animate = false,
  title,
}: {
  identity: Identity
  className?: string
  /** `xl` is the setup and customisation preview; `sm` is a roster row. */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  /**
   * `always`, when set. Still not the default, because a static blobatar is one
   * `<img>` and an animated one is a dozen SVG nodes — but every caller that
   * passes it now passes a constant. Ticket 12 decision 9 had the roster animate
   * only while the cursor was over the sidebar; motion that arrives on hover
   * reads as the avatars *changing* rather than as them waking up, so the roster
   * animates permanently and the sidebar tracks no hover at all.
   */
  animate?: boolean
  /**
   * Labels the blobatar for a screen reader. Leave it off when the Friend's
   * name is already written beside the avatar: without a title the blobatar is
   * `alt=""` and skipped, which is right for decoration and wrong for an avatar
   * standing alone.
   */
  title?: string
}) => (
  <Blobatar
    className={cn(BLOB_SIZES[size], className)}
    name={identity.blobatar_seed}
    blobatar={{
      hue: identity.hue,
      tone: identity.tone,
      expression: expressionFor(identity.expression),
      ...(animate ? { animate: 'always' as const } : {}),
      ...(title ? { title } : {}),
    }}
  />
)

const BLOB_SIZES = {
  xs: 'size-6',
  sm: 'size-8',
  md: 'size-10',
  lg: 'size-16',
  xl: 'size-32',
} as const
