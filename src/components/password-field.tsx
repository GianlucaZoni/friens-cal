import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { useState } from 'react'
import { EyeIcon, EyeOffIcon } from 'lucide-react'

/**
 * blobatar's registry lists a `password-field` item, but it was never installed
 * and this is the shadcn-sanctioned shape for a button inside an input anyway
 * (ticket 18). Adding the registry item later is a swap, not a rewrite.
 */
export const PasswordField = ({
  id,
  label,
  value,
  onChange,
  autoComplete,
  description,
  disabled,
  invalid,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
  description?: React.ReactNode
  disabled?: boolean
  /**
   * Marks the control, and with it the whole `InputGroup` — the wrapper's ring
   * is driven by `has-[[data-slot][aria-invalid=true]]`, so this is what turns
   * the border red rather than anything on the field itself.
   */
  invalid?: boolean
}) => {
  const [shown, setShown] = useState(false)

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={id}
          type={shown ? 'text' : 'password'}
          value={value}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            type="button"
            size="icon-xs"
            aria-label={shown ? 'Hide password' : 'Show password'}
            onClick={() => setShown((s) => !s)}
          >
            {shown ? <EyeOffIcon /> : <EyeIcon />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  )
}
