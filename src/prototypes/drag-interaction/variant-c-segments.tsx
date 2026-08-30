/** PROTOTYPE — ticket 06, variant C. Throwaway. */
import { WeekGrid } from './week-grid'

/**
 * C — No merging. THIS ONE REOPENS TICKET 01.
 *
 * Availability records keep their identity. They may abut and overlap; the
 * picture looks merged but the records are not. Click selects the record you
 * drew, Delete removes exactly that one and leaves a hole.
 *
 * Seams are drawn so the records are visible, and overlaps render darker.
 * Seed data deliberately contains an overlapping pair on Wed (12:00–14:00 and
 * 13:00–18:00) so the failure mode is visible: delete one and Availability
 * stays behind for no reason a user can see.
 */
export const VariantCSegments = () => (
  <WeekGrid
    variantName="C — merging OFF, segments keep their identity"
    behaviour={{
      merging: false,
      insideBlockDrag: 'select',
      punchOnDoubleClick: false,
      showSeams: true,
    }}
    gestureNotes={[
      'Nothing merges. Every drag is its own record; dashed seams show the boundaries.',
      'Wed has an OVERLAPPING pair (12:00–14:00 and 13:00–18:00). Delete one, watch the leftover.',
      'Deleting the middle is trivial here — the cost is everything else in the record list.',
    ]}
  />
)
