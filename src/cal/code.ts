/**
 * The Code as a string: what a field may accept, what a paste becomes, and the
 * one sentence each failed write to `cal` is allowed to say.
 *
 * **No imports, deliberately.** These are the claims worth a test, and a test
 * file here runs under plain Node (`yarn test`), which cannot resolve the `@/`
 * alias — the same split `roster.ts` and `identity.ts` already make. The
 * component that passes these to `input-otp` is `code-field.tsx`, next door.
 *
 * CONTEXT.md: a Code is six characters, uppercase, and an address rather than a
 * secret. It never changes, every Member sees it, and every Member is expected
 * to share it.
 */

/** Six. `join_cal` resolves nothing shorter and the field holds nothing longer. */
export const CODE_LENGTH = 6

/**
 * What the field will let a Friend type, and it is **wider than the alphabet a
 * Code is minted from**, on purpose.
 *
 * `private.new_cal_code()` uses thirty characters: `2-9` and `A-Z` without
 * `0 O 1 I L U`. This admits all of A-Z, a-z and 0-9, which is fifty-two more
 * than it needs to. The reason is where the pattern is tested rather than what
 * it matches: `input-otp` compiles it with `new RegExp(pattern)` and **no
 * flags**, and tests it against the raw value *before* it calls `onChange`. A
 * keystroke that fails is dropped with no event, no message and nothing on
 * screen. So the two failure modes are not symmetric:
 *
 * - too wide, and a Friend types a Code that cannot exist and the RPC says so
 *   in one sentence;
 * - too narrow, and the keyboard goes dead under their fingers with no
 *   explanation at all.
 *
 * Admitting both cases is not a nicety either: it is the only thing that makes
 * lower-case typing work, because uppercasing inside `onChange` runs after the
 * test that already threw the character away. `join_cal` does
 * `upper(btrim(code))`, so the server is where the two alphabets meet.
 *
 * `*` rather than `+` so the empty string passes and the last backspace is not
 * refused.
 */
export const CODE_PATTERN = '^[A-Za-z0-9]*$'

/**
 * A pasted string, made into something the field can hold.
 *
 * `input-otp` runs this **before** the pattern test, and only on the paste
 * path, which is also why supplying it matters off iOS: without a
 * `pasteTransformer` the component's own paste handler returns early and the
 * paste falls through to the native change event instead.
 *
 * It throws away the dashes and spaces a Code arrives with when somebody has
 * typed it into a chat message by hand, because the pattern would otherwise
 * refuse them in silence, and it cuts to six so a longer paste fills the field
 * rather than being dropped whole.
 */
export const pasteCode = (pasted: string): string =>
  pasted
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LENGTH)

/**
 * The Code as `join_cal` will read it — `upper(btrim(code))`, and nothing more.
 *
 * Deliberately not cleverer than the server: a Code with a space in the middle
 * is a Code that does not exist, and the RPC is what says so. Anything this
 * function fixed that the server would not is a Code the client and the server
 * disagree about.
 */
export const normaliseCode = (raw: string): string => raw.trim().toUpperCase()

/** Whether there is a whole Code to send. */
export const isCompleteCode = (value: string): boolean => value.length === CODE_LENGTH

/**
 * `H3DKW9` as `H 3 D K W 9`, for the copy button's label.
 *
 * Six characters with no spaces are read as a word by most screen readers, and
 * a Code is not a word — it is six things to write down one at a time.
 */
export const spellOut = (code: string): string => code.split('').join(' ')

/** The Code matched nothing. One sentence, over whatever Postgres said. */
export const JOIN_BAD_CODE = 'That code does not match any friens cal. Check the six characters.'

/** Everything else: the network, a grant, a deploy half done. */
export const JOIN_UNAVAILABLE = 'Could not join just now. Try again in a moment.'

/** Creating failed, which has only the one shape worth showing. */
export const CREATE_UNAVAILABLE = 'Could not make that cal just now. Try again in a moment.'

/**
 * Renaming failed. Beside the others rather than beside `renameTo`, so every
 * sentence a cal write can say is in one file and none of them can drift into a
 * different voice.
 *
 * One shape again, and here that is a claim rather than laziness: the only
 * refusals reachable are the network, the grant, and a Friend renaming a cal
 * they have just left in another tab. The draft was checked before it was sent.
 */
export const RENAME_UNAVAILABLE = 'Could not rename it just now. Try again in a moment.'

/**
 * Leaving failed, and the second half of the sentence is what earns its keep.
 *
 * Leaving is **one statement** and everything else is consequence inside its
 * transaction: the Left markers, the auto-cancels and the Availability cascade
 * all hang off that one row going. So either all of it happened or none of it
 * did, and somebody who has just read a dialog naming three plans needs to be
 * told which — otherwise they assume the worst about the half they cannot see.
 */
export const LEAVE_UNAVAILABLE =
  'Could not leave just now. Nothing has changed. Try again in a moment.'

/**
 * What the Join dialog shows, whatever came back.
 *
 * The same shape as `signInErrorMessage`: name the one failure a Friend can do
 * something about, and be vague about the rest rather than pasting a Postgres
 * message into a dialog. There is **no enumeration leak to close here** — the
 * signup screen's catch-all exists for that reason and this one does not need
 * it, because guessing a Code right *joins* you and puts you in a roster five
 * friends look at. So the bad-code case can say so plainly.
 *
 * `P0002` is the SQLSTATE for `no_data_found`, which is what `join_cal` raises
 * with when the Code resolves to nothing; PostgREST passes the code through.
 */
export const joinErrorMessage = (
  /** A `PostgrestError`, structurally — the code is the only field read. */
  error: { code?: string | null; message?: string } | null
): string => (error?.code === 'P0002' ? JOIN_BAD_CODE : JOIN_UNAVAILABLE)
