/** PROTOTYPE — ticket 06, variant A. Throwaway. */
import { WeekGrid } from './week-grid'

/**
 * A — Erase drag. Merging stays exactly as ticket 01 settled it.
 *
 * The insight: with merging, blocks are never moved and never dragged from the
 * middle, so "drag starting inside a block" is an UNASSIGNED gesture. Assign it
 * to erase. Painting and erasing become symmetric — the gesture is the same,
 * the mode is decided by what is under the pointer when the drag starts.
 */
export const VariantAErase = () => (
  <WeekGrid
    variantName="A — erase by dragging inside a block"
    behaviour={{
      merging: true,
      insideBlockDrag: 'erase',
      punchOnDoubleClick: false,
      showSeams: false,
    }}
    gestureNotes={[
      'Drag EMPTY grid → create. Drag INSIDE a block → erase that span (red hatch preview).',
      'Try it on Wed 08:00–22:00: drag 12:00→14:00 inside it to cut the middle out.',
      'Drag a block’s top/bottom edge → resize. ⌥ + drag anywhere in a block → duplicate.',
    ]}
  />
)
