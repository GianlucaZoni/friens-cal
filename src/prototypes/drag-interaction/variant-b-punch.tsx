/** PROTOTYPE — ticket 06, variant B. Throwaway. */
import { WeekGrid } from './week-grid'

/**
 * B — Punch and resize. Merging stays. Blocks are atomic: a plain drag inside
 * one does nothing, a click selects. To remove the middle you double-click to
 * punch out a single 30-minute slot, which splits the block in two, then drag
 * the two new inner edges apart to widen the hole.
 *
 * Note the reason a plain "split" is not enough: two ranges that merely abut
 * re-merge instantly, so the split has to REMOVE a slot to survive.
 */
export const VariantBPunch = () => (
  <WeekGrid
    variantName="B — punch a 30-min hole, then resize it open"
    behaviour={{
      merging: true,
      insideBlockDrag: 'select',
      punchOnDoubleClick: true,
      showSeams: false,
    }}
    gestureNotes={[
      'Double-click inside a block → punches out the 30-min slot under the pointer.',
      'On Wed 08:00–22:00: double-click at 12:00, then drag the two new inner edges apart.',
      'A plain drag inside a block does nothing here — blocks are atomic. Click selects.',
    ]}
  />
)
