/**
 * PROTOTYPE — ticket 18. THROWAWAY.
 *
 * The controls ticket 11 specified, plus the two things the registry did not
 * ship (a password field) and the chrome the prototype needs to be judged.
 */
import { useId, useMemo, useState } from 'react'
import { DicesIcon, EyeIcon, EyeOffIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Blobatar } from '@/components/ui/blobatar'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import {
  EXPRESSIONS,
  TONE_SWATCHES,
  avatarColours,
  expressionFor,
  type ExpressionKey,
  type Identity,
  uiColour,
} from './identity'

/* ------------------------------------------------------------------ *
 * The blob
 * ------------------------------------------------------------------ */

/**
 * Ticket 11: "every blobatar renders with a subtle ring in the theme's border
 * colour, so a `pale neutral` blob on a light background and an `ink` blob on a
 * dark one still have a defined edge."
 *
 * FINDING: the base-lyra `Avatar` already does exactly this. Its root carries
 *
 *     after:absolute after:inset-0 after:rounded-full after:border
 *     after:border-border after:mix-blend-darken dark:after:mix-blend-lighten
 *
 * — a `--border` ring that darkens over a pale blob in light theme and lightens
 * over an ink blob in dark theme. `Blobatar` wraps `Avatar`, so this is free and
 * there is nothing to build. Nothing here adds a second ring.
 *
 * `animate` is deliberately absent on the small sizes: a static blobatar is one
 * `<img>`, an animated one is inline SVG (~a dozen nodes). Ticket 03's research
 * says keep lists static and reserve `animate` for the setup/profile header.
 */
export const Blob = ({
  identity,
  className,
  size = 'md',
  animate = false,
  title,
}: {
  identity: Identity
  className?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  animate?: boolean
  title?: string
}) => {
  const px = { xs: 'size-6', sm: 'size-8', md: 'size-10', lg: 'size-16', xl: 'size-32' }[size]
  return (
    <Blobatar
      className={cn(px, className)}
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
}

/* ------------------------------------------------------------------ *
 * Hue — continuous and free, biased only at signup
 * ------------------------------------------------------------------ */

export const HueSlider = ({
  hue,
  onChange,
  taken,
  theme,
}: {
  hue: number
  onChange: (hue: number) => void
  taken: { hue: number; display_name: string }[]
  theme: 'light' | 'dark'
}) => {
  const id = useId()
  return (
    <Field>
      <FieldLabel htmlFor={id}>Hue</FieldLabel>
      <div className="flex flex-col gap-1.5">
        {/* The wheel, flattened. Continuous — there is nothing to snap to. */}
        <div
          className="relative h-3 w-full rounded-full border border-border"
          style={{
            background: `linear-gradient(to right, ${Array.from(
              { length: 13 },
              (_, i) => `${uiColour(i * 30, theme)} ${(i / 12) * 100}%`,
            ).join(', ')})`,
          }}
        >
          {/*
            Taken hues are SHOWN, never enforced. Ticket 11 settled that
            collisions are acceptable and that the bias is a default the slider
            overrides in one pixel — so these are labels, not walls.
          */}
          {taken.map((t) => (
            <span
              key={t.display_name}
              title={`${t.display_name} is at ${t.hue}°`}
              className="absolute -top-1 h-5 w-0.5 rounded-full bg-foreground/70"
              style={{ left: `calc(${(t.hue / 360) * 100}% - 1px)` }}
            />
          ))}
        </div>
        <Slider
          id={id}
          min={0}
          max={359}
          step={1}
          value={hue}
          onValueChange={(v) => onChange(typeof v === 'number' ? v : (v[0] ?? 0))}
        />
      </div>
      <FieldDescription>
        {hue}° — continuous and free. Landing on someone else&apos;s hue is allowed; the shape is what
        tells you apart.
      </FieldDescription>
    </Field>
  )
}

/* ------------------------------------------------------------------ *
 * Tone — the six authored swatches, as a segmented control
 * ------------------------------------------------------------------ */

export const ToneSwatches = ({
  hue,
  tone,
  onChange,
}: {
  hue: number
  tone: number
  onChange: (tone: number) => void
}) => (
  <Field>
    <FieldLabel>Tone</FieldLabel>
    <ToggleGroup
      variant="outline"
      spacing={0}
      value={[String(tone)]}
      onValueChange={(v) => {
        const next = Array.isArray(v) ? v[0] : v
        if (next != null) onChange(Number(next))
      }}
      className="w-full"
    >
      {TONE_SWATCHES.map((swatch) => (
        <ToggleGroupItem
          key={swatch.key}
          value={String(swatch.value)}
          aria-label={swatch.label}
          className="flex h-auto flex-1 flex-col items-center gap-1 px-1 py-1.5"
        >
          <span
            className="size-5 rounded-full border border-border"
            style={{ background: avatarColours({ hue, tone: swatch.value }).head }}
          />
          <span className="text-[10px] leading-none">{swatch.label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
    <FieldDescription>
      All six stay choosable. Ticket 15 took per-Friend colour off the grid, so no tone has to be
      forbidden for legibility any more.
    </FieldDescription>
  </Field>
)

/* ------------------------------------------------------------------ *
 * Expression — ten of the fourteen
 * ------------------------------------------------------------------ */

export const ExpressionPicker = ({
  identity,
  onChange,
}: {
  identity: Identity
  onChange: (expression: ExpressionKey) => void
}) => (
  <Field>
    <FieldLabel>Expression</FieldLabel>
    <div className="grid grid-cols-5 gap-1">
      {EXPRESSIONS.map((e) => (
        <button
          key={e.key}
          type="button"
          aria-pressed={identity.expression === e.key}
          onClick={() => onChange(e.key)}
          className={cn(
            'flex flex-col items-center gap-1 rounded-none border border-transparent px-1 py-1.5 transition-colors',
            'hover:bg-muted focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none',
            identity.expression === e.key && 'border-border bg-muted',
          )}
        >
          <Blob identity={{ ...identity, expression: e.key }} size="md" />
          <span className="text-[10px] leading-none text-muted-foreground">{e.label}</span>
        </button>
      ))}
    </div>
    <FieldDescription>
      Ten, not fourteen. <code>mad</code>, <code>love</code>, <code>shy</code> and{' '}
      <code>sick</code> tint the palette — picking a face would silently recolour your whole grid.
    </FieldDescription>
  </Field>
)

/* ------------------------------------------------------------------ *
 * Reroll — shape only
 * ------------------------------------------------------------------ */

export const RerollButton = ({ onReroll }: { onReroll: () => void }) => (
  <Button variant="outline" size="sm" onClick={onReroll}>
    <DicesIcon data-icon="inline-start" />
    Reroll shape
  </Button>
)

/* ------------------------------------------------------------------ *
 * Password — the registry item that did not land
 * ------------------------------------------------------------------ */

/**
 * FINDING: `password-field` is on blobatar's registry
 * (`https://blobatar.dev/r/password-field.json`, `registryDependencies:
 * ["input"]`) but it was **never installed** — `src/components/ui/` has no
 * `password-field.tsx` and `shadcn info` does not list it.
 *
 * So this is `InputGroup` + `InputGroupAddon` + `InputGroupButton`, which is
 * the shadcn-sanctioned shape for a button inside an input anyway. Adding the
 * registry item later is a swap, not a rewrite.
 */
export const PasswordField = ({
  id,
  label,
  value,
  onChange,
  autoComplete,
  description,
  invalid,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
  description?: React.ReactNode
  invalid?: boolean
}) => {
  const [shown, setShown] = useState(false)
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={id}
          type={shown ? 'text' : 'password'}
          value={value}
          autoComplete={autoComplete}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
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

/* ------------------------------------------------------------------ *
 * Prototype-only chrome: what is actually in the columns
 * ------------------------------------------------------------------ */

/**
 * Not part of the design. It is here so the human can see that step 1 really
 * does materialise hue and tone, and that reroll really does leave `head`
 * untouched.
 */
export const StoredRow = ({
  identity,
  theme,
  previousHead,
}: {
  identity: Identity
  theme: 'light' | 'dark'
  previousHead?: string
}) => {
  const colours = useMemo(() => avatarColours(identity), [identity])
  const ui = uiColour(identity.hue, theme)
  const unchanged = previousHead != null && previousHead === colours.head

  return (
    <div className="flex flex-col gap-2 border border-dashed border-border p-3 text-[11px]">
      <div className="flex items-center gap-2">
        <Badge variant="secondary">stored on the Friend row</Badge>
        {previousHead != null ? (
          <Badge variant={unchanged ? 'secondary' : 'destructive'}>
            {unchanged ? 'head unchanged by reroll' : 'HEAD MOVED — bug'}
          </Badge>
        ) : null}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono">
        <dt className="text-muted-foreground">blobatar_seed</dt>
        <dd>{identity.blobatar_seed}</dd>
        <dt className="text-muted-foreground">hue</dt>
        <dd>{identity.hue}</dd>
        <dt className="text-muted-foreground">tone</dt>
        <dd>{identity.tone}</dd>
        <dt className="text-muted-foreground">expression</dt>
        <dd>{identity.expression}</dd>
      </dl>
      <div className="flex flex-wrap items-center gap-3 pt-1 text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span
            className="size-3 rounded-full border border-border"
            style={{ background: colours.head }}
          />
          <span className="font-mono">avatar head {colours.head}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-full border border-border" style={{ background: ui }} />
          <span className="font-mono">UI colour {ui}</span>
        </span>
      </div>
      <p className="text-muted-foreground">
        Derived, never stored. The avatar comes from blobatar&apos;s{' '}
        <code>palette(hue, true, tone)</code>; everything else is{' '}
        <code>oklch(L_theme C_theme hue)</code>.
      </p>
    </div>
  )
}
