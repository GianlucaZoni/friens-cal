import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { FriendBlob } from '@/identity/friend-blob'
import {
  EXPRESSIONS,
  TONE_SWATCHES,
  avatarPalette,
  type ExpressionKey,
  type Identity,
} from '@/identity/identity'
import { friendColour, friendColourAlpha } from '@/identity/ui-colour'
import { cn } from '@/lib/utils'
import { useId } from 'react'
import { DicesIcon } from 'lucide-react'

/** Another Friend's hue, and who to say it belongs to. */
export type TakenHue = { id: string; hue: number; display_name: string | null }

/* ------------------------------------------------------------------ *
 * Hue — continuous and free
 * ------------------------------------------------------------------ */

/**
 * A continuous slider, not a swatch grid.
 *
 * Ticket 11 rules out picking from N rendered options: whatever N were offered
 * would become the hues the Group actually has, which is quantisation by the
 * back door and contradicts the settled continuous hue.
 *
 * The taken hues are drawn on the track as **ticks, which are labels and not
 * walls**. Collisions are accepted, so nothing here rejects or nudges a choice;
 * the marks exist so the signup bias reads as a default a Friend can see and
 * override rather than as an assignment they cannot see at all.
 */
export const HueSlider = ({
  hue,
  onChange,
  taken,
}: {
  hue: number
  onChange: (hue: number) => void
  taken: readonly TakenHue[]
}) => {
  const id = useId()

  return (
    <Field>
      <FieldLabel htmlFor={id}>Hue</FieldLabel>
      <div className="flex flex-col gap-1.5">
        {/*
          The hue circle flattened, drawn in the same colour the rest of the app
          renders a Friend in — every stop is `friendColour`, so the strip is
          iso-lightness and iso-chroma and switches theme with the cascade.
          Thirteen stops rather than a smooth sweep because a linear-gradient
          interpolates its stops in sRGB, and twelve short hops through sRGB are
          close enough to the OKLCh arc to be indistinguishable at this height.
        */}
        <div
          className="relative h-3 w-full rounded-full border border-border"
          style={{
            background: `linear-gradient(to right, ${Array.from(
              { length: 13 },
              (_, i) => `${friendColour(i * 30)} ${(i / 12) * 100}%`
            ).join(', ')})`,
          }}
        >
          {taken.map((friend) => (
            <span
              key={friend.id}
              title={`${friend.display_name ?? 'A Friend'} is at ${friend.hue}°`}
              className="absolute -top-1 h-5 w-0.5 rounded-full bg-foreground/70"
              style={{ left: `calc(${(friend.hue / 360) * 100}% - 1px)` }}
            />
          ))}
        </div>
        <Slider
          id={id}
          min={0}
          max={359}
          step={1}
          // A ONE-ELEMENT ARRAY, not the bare number. Base UI accepts either,
          // but the shadcn wrapper counts thumbs with
          // `Array.isArray(value) ? value : … : [min, max]` — so a scalar falls
          // through to the two-element default and renders a SECOND thumb,
          // parked at the same place and draggable. The prototype passed a
          // scalar and shipped two stacked thumbs; it type-checks either way.
          value={[hue]}
          onValueChange={(value) => onChange(typeof value === 'number' ? value : (value[0] ?? 0))}
        />
      </div>
      <FieldDescription>
        {hue}° — continuous and free. Landing on someone else&apos;s hue is allowed; the shape is
        what tells you apart.
      </FieldDescription>
    </Field>
  )
}

/* ------------------------------------------------------------------ *
 * Tone — six swatches, at the current hue
 * ------------------------------------------------------------------ */

/**
 * The six band interiors, and nothing else, ever (see `identity.ts`).
 *
 * Each swatch is rendered at the *current* hue rather than at a fixed one, so
 * the control shows the six choices a Friend actually has rather than six
 * generic ones. All six stay available: ticket 15 took per-Friend colour off the
 * grid, so no tone has to be forbidden for legibility any more, and the ring on
 * every blobatar is what keeps pale-on-light and ink-on-dark from vanishing.
 */
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
      onValueChange={(value) => {
        // Base UI hands back an array and allows it to be empty. A blobatar
        // always has a tone, so an empty selection is not a state to enter.
        const next = Array.isArray(value) ? value[0] : value
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
            style={{ background: avatarPalette(hue, swatch.value).head }}
          />
          <span className="text-[10px] leading-none">{swatch.label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
    <FieldDescription>
      All six are yours. The tone moves your blob&apos;s lightness, never the hue everything else in
      the app is drawn in.
    </FieldDescription>
  </Field>
)

/* ------------------------------------------------------------------ *
 * Expression — ten of the fourteen
 * ------------------------------------------------------------------ */

/**
 * Each pose is rendered as **your own blob** wearing it, not as a generic face.
 * Ten static `<img>`s, and the difference between picking an abstraction and
 * picking your own expression.
 */
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
      {EXPRESSIONS.map((expression) => (
        <button
          key={expression.key}
          type="button"
          aria-pressed={identity.expression === expression.key}
          onClick={() => onChange(expression.key)}
          className={cn(
            'flex flex-col items-center gap-1 border border-transparent px-1 py-1.5 transition-colors',
            'hover:bg-muted focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none',
            identity.expression === expression.key && 'border-border bg-muted'
          )}
        >
          <FriendBlob identity={{ ...identity, expression: expression.key }} size="md" />
          <span className="text-[10px] leading-none text-muted-foreground">{expression.label}</span>
        </button>
      ))}
    </div>
    <FieldDescription>
      Ten, not fourteen. The four that are missing tint the blob, so picking a face would have
      quietly recoloured your whole grid.
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
 * Where the colour shows up
 * ------------------------------------------------------------------ */

/**
 * The three places a Friend's colour appears outside their blobatar, drawn live
 * beside the slider.
 *
 * It is here because "changing your hue recolours your entire grid" is
 * **intended, not tolerated** — the human's words: *"it's the fun aspect of
 * it."* A Friend dragging the slider should see that while they drag rather
 * than find it out afterwards. Every swatch below is `friendColour(hue)`, the
 * same call the sidebar (issue 04), heatmap (issue 07) and Candidate glow
 * (issue 08) will make.
 */
export const WhereItShows = ({
  identity,
  displayName,
}: {
  identity: Identity
  displayName: string
}) => (
  <div className="flex w-full flex-col gap-2 text-[11px]">
    <p className="font-medium">Where this colour shows up</p>

    <div className="flex items-center gap-2 border border-border px-2 py-1.5">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: friendColour(identity.hue) }}
      />
      <FriendBlob identity={identity} size="xs" />
      <span className="truncate">{displayName || 'You'}</span>
      <span className="ml-auto text-muted-foreground">sidebar row</span>
    </div>

    <div
      className="border px-2 py-1.5"
      style={{
        borderColor: friendColour(identity.hue),
        boxShadow: `0 0 0 2px ${friendColourAlpha(identity.hue, 0.25)}`,
      }}
    >
      <span className="text-muted-foreground">Candidate glow</span>
    </div>

    <div className="flex flex-col gap-px">
      {[0.2, 0.45, 0.7, 1].map((opacity) => (
        <div
          key={opacity}
          className="h-3 border border-border/50"
          style={{ background: friendColourAlpha(identity.hue, opacity) }}
        />
      ))}
      <span className="pt-0.5 text-muted-foreground">grid heatmap, in your colour</span>
    </div>
  </div>
)
