import { cn } from '@/lib/utils'
import { OTPInput, OTPInputContext } from 'input-otp'
import * as React from 'react'
import { MinusIcon } from 'lucide-react'

/**
 * `base-lyra`'s `input-otp`, as `npx shadcn@latest add input-otp` writes it,
 * with **two edits that will be undone by anyone who re-runs that command**:
 *
 * 1. The registry writes `import { cn } from "cn"` and installs the npm package
 *    `cn` to satisfy it, where the other 27 files in this directory import from
 *    `@/lib/utils`. shadcn 3.8.4 and 4.21.0 write the byte-identical line, so
 *    this is the registry item's shape rather than a CLI bug to wait out.
 * 2. `aria-hidden` on the slot, which the registry omits. The slots are painted
 *    text over one real `<input>` that already carries the value, so without it
 *    a screen reader meets the six characters twice: once as the input's value
 *    and once as six loose divs.
 *
 * Neither is cosmetic and neither is visible in a diff of the next `add`. See
 * `.scratch/groups-and-join-codes/research/input-otp.md`.
 *
 * Note for anyone configuring it: `pattern` is compiled with no flags and is
 * tested against the raw value **before** `onChange` runs, so a pattern that
 * admits only upper case eats every lower-case keystroke and no amount of
 * uppercasing in the handler can rescue it. `src/cal/code.ts` holds the props
 * this project passes and the reasons for each.
 */
function InputOTP({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<typeof OTPInput> & {
  containerClassName?: string
}) {
  return (
    <OTPInput
      data-slot="input-otp"
      containerClassName={cn(
        'cn-input-otp flex items-center has-disabled:opacity-50',
        containerClassName
      )}
      spellCheck={false}
      className={cn('disabled:cursor-not-allowed', className)}
      {...props}
    />
  )
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="input-otp-group"
      className={cn(
        'flex items-center rounded-none has-aria-invalid:border-destructive has-aria-invalid:ring-1 has-aria-invalid:ring-destructive/20 dark:has-aria-invalid:ring-destructive/40',
        className
      )}
      {...props}
    />
  )
}

function InputOTPSlot({
  index,
  className,
  ...props
}: React.ComponentProps<'div'> & {
  index: number
}) {
  const inputOTPContext = React.useContext(OTPInputContext)
  const { char, hasFakeCaret, isActive } = inputOTPContext?.slots[index] ?? {}

  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      aria-hidden
      className={cn(
        'relative flex size-8 items-center justify-center border-y border-r border-input text-xs transition-all outline-none first:rounded-none first:border-l last:rounded-none aria-invalid:border-destructive data-[active=true]:z-10 data-[active=true]:border-ring data-[active=true]:ring-1 data-[active=true]:ring-ring/50 data-[active=true]:aria-invalid:border-destructive data-[active=true]:aria-invalid:ring-destructive/20 dark:bg-input/30 dark:data-[active=true]:aria-invalid:ring-destructive/40',
        className
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-4 w-px animate-caret-blink bg-foreground duration-1000" />
        </div>
      )}
    </div>
  )
}

function InputOTPSeparator({ ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="input-otp-separator"
      className="flex items-center [&_svg:not([class*='size-'])]:size-4"
      role="separator"
      {...props}
    >
      <MinusIcon />
    </div>
  )
}

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator }
