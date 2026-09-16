/**
 * The zone every grid, card and time string in the product is drawn in — the
 * **viewer's own**, read off the device.
 *
 * A cal has no clock of its own (`CONTEXT.md`, **Group**). There is no such
 * thing as what a cal means by Saturday: there is only what each Friend means
 * by it, and the overlap between them is what a Candidate is. So nothing here
 * takes a cal, and there is nothing to translate into.
 *
 * ## The zone is read, not stored
 *
 * `deviceTimeZone` is asked of the browser rather than held in any state, so
 * there is nothing to invalidate and no setting to keep in step. What that buys
 * is bounded, and the bound is worth stating: a screen picks up a changed
 * device zone the next time something recomputes, which for the grid is the
 * half-hour tick of the app's clock or the next navigation, not the instant a
 * phone crosses a border. Nothing goes *wrong* in between, because Slots are
 * instants and only the labels are behind.
 *
 * `friend.time_zone` is a **mirror** of the same value, written when a session
 * resolves and read only by *other people* — the roster's offset and the frame
 * suppression below. The grid never reads it (planning ticket 08 §4).
 *
 * ## Two idioms, deliberately
 *
 * The roster says `8h ahead` and a card says `GMT+2`, and collapsing them would
 * make the roster say `GMT+9` and force the arithmetic on the reader. They
 * answer different questions: *why is Bea never free in my evening*, and *whose
 * clock is this string in*.
 *
 * **No `@/` imports, deliberately.** These are the claims worth a test, and
 * `zone.test.ts` runs under plain Node (`yarn test`), which cannot resolve the
 * alias — the same split `slots.ts`, `view.ts` and `roster.ts` already make.
 */
import { tzOffset } from '@date-fns/tz'

/**
 * The viewer's zone, and the frame a time string names — or null, which is
 * every cal whose Friends all read the same clock.
 *
 * The frame travels *with* the zone rather than being recomputed at each card,
 * so the suppression rule is applied once, where the roster is, and every
 * string that carries a frame carries the same one.
 */
export type ViewerZone = {
  timeZone: string
  /** `GMT+2`, or null when nothing on screen needs to say whose clock it is. */
  frame: string | null
}

/** Whatever the browser says it is. Asked again on every render. */
export const deviceTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone

/**
 * The device's zone with nothing naming it.
 *
 * For the two places that render a time outside the tree the provider covers:
 * the toasts `useAvailability` and `useHangouts` raise. A toast is gone in four
 * seconds and nobody screenshots one, so it carries no frame (planning ticket
 * 08 §6) — which is also what the context default hands to anything mounted
 * above the provider.
 */
export const deviceZone = (): ViewerZone => ({ timeZone: deviceTimeZone(), frame: null })

/**
 * How far this zone is from UTC right now, spelled the one way that does not
 * depend on the reader's locale.
 *
 * `Intl`'s `timeZoneName: 'short'` is locale-**inverted**: under `en-GB` Rome
 * renders `CEST` and New York `GMT-4`, under `en-US` Rome renders `GMT+2` and
 * New York `EDT`. Two Friends in the same room with different browser locales
 * would read different markers off the same string. `shortOffset` is uniform,
 * and this computes the same answer without a formatter — `zone.test.ts` holds
 * the two against each other in both locales.
 *
 * The city spelling (`20:00 – 23:00 Rome`) reads better and was rejected: it
 * breaks on `America/Argentina/Buenos_Aires`, it carries a political liability
 * on the ids that disagree with the current name of the place, and it cannot
 * tell summer from winter.
 */
export const zoneFrame = (timeZone: string, at: number): string => {
  const minutes = tzOffset(timeZone, new Date(at))
  return minutes === 0 ? 'GMT' : `GMT${signedOffset(minutes)}`
}

/**
 * A UTC offset in minutes, spelled: `+2`, `-5`, `+5:45`.
 *
 * Also what the week gutter writes beside the two 02:00 rows of an autumn
 * Sunday (`slotsOfDay`), which is why it lives here rather than in either
 * caller. `GMT+2` on a card and `+2` in the gutter are the same number in the
 * same notation, and one of them growing a `:30` case without the other is a
 * bug nobody would think to look for.
 */
export const signedOffset = (minutes: number): string => {
  const { hours, rest } = split(minutes)
  const sign = minutes < 0 ? '-' : '+'
  return rest === 0 ? `${sign}${hours}` : `${sign}${hours}:${pad(rest)}`
}

/**
 * What the roster writes beside a Friend — `8h ahead`, `3h30m behind` — or
 * null, which is every Friend whose clock reads the same as yours.
 *
 * Relative rather than absolute, because the question it answers is *why is Bea
 * never free in my evening*.
 *
 * **Asked of an instant**, because the answer is not a property of the two
 * zones: Rome and New York are six hours apart for most of the year and five
 * for the ten autumn days the EU has moved its clocks and the US has not.
 *
 * Null for a Friend with no zone as well: the column is written on sign-in, so
 * a Friend who has not signed in since it existed has nothing to compare, and
 * guessing would put a number on the row that is not a fact about anybody.
 */
export const offsetLabel = (viewer: string, other: string | null, at: number): string | null => {
  const minutes = offsetBetween(viewer, other, at)
  if (minutes === 0) return null

  const { hours, rest } = split(minutes)
  const distance = hours === 0 ? `${rest}m` : rest === 0 ? `${hours}h` : `${hours}h${rest}m`
  return `${distance} ${minutes < 0 ? 'behind' : 'ahead'}`
}

/**
 * Does this cal actually span zones?
 *
 * The suppression rule behind the frame: a time string names its zone **only**
 * when at least one other Member reads a different clock from the viewer's, so
 * every cal in existence today shows no frame anywhere. The feature is
 * invisible until it is needed, which is the only version of it that does not
 * tax the common case.
 *
 * Measured as *a different clock*, not a different IANA id. A cal split between
 * Rome and Berlin has two ids and one clock, and a frame on those strings would
 * be answering a question nobody in it can ask — the roster would be showing no
 * offsets at the same time. The two have to agree about whether there is
 * anything to say, and this is what makes them agree.
 */
export const spansZones = (
  viewer: string,
  others: readonly (string | null)[],
  at: number
): boolean => others.some((other) => offsetBetween(viewer, other, at) !== 0)

/**
 * How far ahead of the viewer another zone's clock reads, in minutes — zero for
 * a Friend on the same clock, and zero for one with no zone at all.
 *
 * The one piece of arithmetic under both the label and the predicate, so they
 * cannot come to different conclusions about whether there is anything to say.
 */
const offsetBetween = (viewer: string, other: string | null, at: number): number =>
  other === null ? 0 : tzOffset(other, new Date(at)) - tzOffset(viewer, new Date(at))

/**
 * The whole of what a screen needs: the zone it is drawn in, and the frame its
 * time strings name.
 *
 * The suppression rule is applied **here and once**, rather than at each of the
 * seven components that render a `whenOf` string, so they cannot drift apart
 * about whether this cal spans zones. `others` is every *other* Member's
 * mirrored zone; your own is left out, because a mirror can be a round trip
 * behind the device it mirrors and you are never ahead of yourself.
 *
 * Note which offset the frame carries: **the viewer's own**. `GMT+2` on a card
 * says what clock this card is in, not what clock the Friend abroad is in.
 */
export const viewerZoneAmong = (
  timeZone: string,
  others: readonly (string | null)[],
  at: number
): ViewerZone => ({
  timeZone,
  frame: spansZones(timeZone, others, at) ? zoneFrame(timeZone, at) : null,
})

const split = (minutes: number): { hours: number; rest: number } => ({
  hours: Math.floor(Math.abs(minutes) / 60),
  rest: Math.abs(minutes) % 60,
})

const pad = (value: number): string => String(value).padStart(2, '0')
