import { CODE_LENGTH, CODE_PATTERN, normaliseCode, pasteCode } from '@/cal/code'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'

/**
 * Six boxes, for the six characters.
 *
 * ## Why six boxes and not a formatted input
 *
 * The worry going in was that segmented boxes read as a *verification* code,
 * which carries an expectation of urgency and expiry a permanent join Code does
 * not have. Prototype 05 built the plain formatted input beside it so the
 * comparison was real, and the boxes won anyway: six boxes say *six characters,
 * exactly* better than any placeholder does, and the Code is only ever met in a
 * context — somebody sent it to you just now — where the verification feeling
 * is roughly true.
 *
 * ## Four of `input-otp`'s defaults are wrong here, and all four are one prop
 *
 * - **`pattern`** is compiled with no flags and tested against the raw value
 *   *before* `onChange` runs, so a pattern that admits only upper case drops
 *   every lower-case keystroke with no event and nothing on screen. Ours admits
 *   both cases and is wider than the server's alphabet on purpose. See
 *   `CODE_PATTERN`.
 * - **`pasteTransformer`** runs before that test, and is also what strips the
 *   dashes and spaces a Code arrives with when somebody typed it into a chat
 *   message by hand. Supplying it also switches the component's own paste path
 *   on off iOS, where it is otherwise skipped.
 * - **`inputMode`** defaults to `numeric`, which is a number pad for a Code
 *   made mostly of letters.
 * - **`autoComplete`** defaults to `one-time-code`, which invites an SMS
 *   autofill that will never arrive for a Code pasted out of a group chat.
 *
 * `onChange` uppercases what was typed; the pattern is what lets the character
 * through in the first place, and the two are separate steps because the test
 * happens first.
 *
 * ## The label
 *
 * The component sets `aria-placeholder` and nothing else, and its slots are
 * painted text over one real `<input>` — so the label has to come from here and
 * the slots are `aria-hidden` in `input-otp.tsx`. Without both, a screen reader
 * meets the Code twice.
 */
export const CodeField = ({
  id,
  inputRef,
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
}: {
  id: string
  /**
   * The one real `<input>` under the six painted slots. The Join dialog holds
   * it so it can put the caret back after a failed attempt, which is the moment
   * the field is emptied and nothing else would.
   */
  inputRef?: React.Ref<HTMLInputElement>
  value: string
  /** Already uppercased. */
  onChange: (next: string) => void
  /** Fires once six characters are in, typed or pasted. */
  onComplete: (code: string) => void
  disabled?: boolean
  /** The last attempt failed, so the boxes carry it. */
  invalid?: boolean
}) => (
  <InputOTP
    id={id}
    ref={inputRef}
    maxLength={CODE_LENGTH}
    value={value}
    onChange={(next) => onChange(normaliseCode(next))}
    onComplete={onComplete}
    pattern={CODE_PATTERN}
    pasteTransformer={pasteCode}
    inputMode="text"
    autoComplete="off"
    disabled={disabled}
    aria-label="Join code, six characters"
    aria-invalid={invalid || undefined}
    containerClassName="gap-0"
  >
    <InputOTPGroup>
      {/*
        `aria-invalid` twice, for two different readers. On `InputOTP` it is
        forwarded to the one real `<input>`, which is what assistive tech reads.
        On each slot it is a styling hook — the registry's own class list is
        `aria-invalid:border-destructive` per slot, and the group's
        `has-aria-invalid:` cannot see the input, which sits beside the group
        rather than inside it.
      */}
      {Array.from({ length: CODE_LENGTH }, (_, index) => (
        <InputOTPSlot
          key={index}
          index={index}
          aria-invalid={invalid || undefined}
          className="size-11 text-sm font-medium"
        />
      ))}
    </InputOTPGroup>
  </InputOTP>
)
