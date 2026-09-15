import { FieldGroup } from '@/components/ui/field'
import { Separator } from '@/components/ui/separator'
import {
  ExpressionPicker,
  HueSlider,
  RerollButton,
  ToneSwatches,
  WhereItShows,
  type TakenHue,
} from '@/identity/customise-controls'
import { FriendBlob } from '@/identity/friend-blob'
import { newSeed, type Identity } from '@/identity/identity'

/**
 * Customisation: **one live-preview blobatar with direct controls beside it.**
 *
 * Not a grid of pre-rendered avatars to choose from — ticket 11 is explicit
 * that whatever N options were rendered would become the hues the Group
 * actually has, which is quantisation by the back door and contradicts the
 * settled continuous hue.
 *
 * The same panel is setup's step 2 and the profile menu's dialog. Only the
 * furniture around it differs: the walkthrough has a card, a heading and a
 * "Done" that moves you on; the dialog has none of that, because ticket 18
 * settled that re-customising is a dialog over the calendar rather than a route
 * or a settings page.
 */
export const CustomisePanel = ({
  identity,
  onChange,
  displayName,
  taken,
}: {
  identity: Identity
  onChange: (next: Identity) => void
  displayName: string
  taken: readonly TakenHue[]
}) => (
  <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
    <div className="flex shrink-0 flex-col items-center gap-3">
      {/* `animate`, like the top-right cluster and the roster rows: an animated
          blobatar is inline SVG rather than one `<img>`, and this is the
          single-avatar case that most obviously pays for it (ticket 18
          decision 3). */}
      <FriendBlob
        identity={identity}
        size="xl"
        animate
        title={displayName ? `${displayName}'s blobatar` : 'Your blobatar'}
      />

      <RerollButton onReroll={() => onChange({ ...identity, blobatar_seed: newSeed() })} />

      <p className="max-w-40 text-center text-[11px] text-muted-foreground">
        Reroll changes the shape and never the colour — the seed stopped governing that the moment
        your hue and tone were written down.
      </p>

      <Separator />
      <WhereItShows identity={identity} displayName={displayName} />
    </div>

    <div className="flex min-w-0 flex-1 flex-col gap-5">
      <FieldGroup>
        <HueSlider
          hue={identity.hue}
          onChange={(hue) => onChange({ ...identity, hue })}
          taken={taken}
        />
        <ToneSwatches
          hue={identity.hue}
          tone={identity.tone}
          onChange={(tone) => onChange({ ...identity, tone })}
        />
        <ExpressionPicker
          identity={identity}
          onChange={(expression) => onChange({ ...identity, expression })}
        />
      </FieldGroup>
    </div>
  </div>
)
