/**
 * PROTOTYPE — ticket 18. THROWAWAY.
 *
 * The two pieces of copy that are NOT the prototype's to pick. Both are drafted
 * three ways and cycled from the floating bar with `?copy=A|B|C` so the human
 * reads them in situ rather than in a list.
 *
 * These are not variants of a *design*. The screens are identical; only the
 * words move.
 */

/* ------------------------------------------------------------------ *
 * 1. Where a "forgot password?" link would be, and cannot be
 * ------------------------------------------------------------------ */

/**
 * Ticket 13 deleted the reset flow outright. There is no `/auth/v1/recover`
 * call to make, no email that could be delivered if there were, and no reset
 * screen. A friend who forgets their password asks in the group chat and it is
 * reset from the Supabase dashboard.
 *
 * The screen therefore has a hole exactly where every sign-in form in the world
 * puts a link. Three honest ways to fill it:
 */
export const FORGOT_COPY = {
  A: {
    name: 'Say it up front',
    /** Always visible, under the password field, in muted text. */
    placement: 'inline' as const,
    heading: null,
    body: 'Forgotten it? There is no reset email — ask in the group chat and someone will reset it for you.',
    note: 'Loudest. Nobody hunts for a link that is not there, but every sign-in also reads a sentence about failure.',
  },
  B: {
    name: 'Link-shaped, honest inside',
    /** A real link, in the real place, that opens a small explanation. */
    placement: 'disclosure' as const,
    heading: 'Forgotten your password?',
    body: 'There is no reset link. Say so in the group chat — whoever set this up resets it from the Supabase dashboard, and you sign in with the new one.',
    note: 'Keeps the familiar shape and the familiar position. Costs one click to learn the bad news, and the click looks like it might send an email.',
  },
  C: {
    name: 'Only when it matters',
    /** Nothing at rest. The sentence appears under a failed sign-in. */
    placement: 'on-failure' as const,
    heading: null,
    body: 'That did not work. If you have forgotten your password, ask in the group chat — there is no reset email, so someone resets it for you.',
    note: 'Cleanest screen. But a Friend who has already given up before typing never sees it, and "no reset email" is exactly what they needed before the third attempt.',
  },
} as const

export type ForgotCopyKey = keyof typeof FORGOT_COPY

/* ------------------------------------------------------------------ *
 * 2. The signup rejection
 * ------------------------------------------------------------------ */

/**
 * **This copy lives in SQL, not in React.** The `before-user-created` hook
 * returns `{ error: { http_code, message } }` and Supabase hands that `message`
 * straight to the client. So whatever is chosen here has to be pasted into
 * `public.hook_restrict_signup_to_allowlist`, and the screen just renders what
 * came back.
 *
 * CONTRADICTION worth naming: the draft hook in
 * `research/supabase-auth-and-rls.md` §1.4 ships
 *
 *     'That email is not on the list. Ask whoever set this up to add you.'
 *
 * which is precisely the leak this ticket forbids. Choosing here means editing
 * that SQL, not only this file.
 */
export const REJECT_COPY = {
  A: {
    name: 'One message for every failure',
    message: 'We could not create an account with those details.',
    secondary:
      'Everyone here was added by hand. If you think you should be in, ask in the group chat.',
    note: 'Leaks nothing, because it is the same sentence for a bad password, a taken address and an address nobody added. Cost: a Friend who typo-ed their own email gets no hint that they typo-ed it.',
  },
  B: {
    name: 'Name the gate, not the address',
    message: 'Signing up here is invite-only.',
    secondary:
      'Accounts are created for addresses that were added by hand. If yours should be one of them, say so in the group chat.',
    note: 'Explains the rule without evaluating the address. Reads well to a friend; still tells a stranger only that a list exists, which they can already infer from the empty signup page.',
  },
  C: {
    name: 'Point at the chat and stop',
    message: 'That did not work.',
    secondary: 'Ask in the group chat and someone will sort it out.',
    note: 'Shortest and least revealing. Also the least useful — it gives a Friend with a fat-fingered password nothing to act on, and every failure becomes a message to a human.',
  },
} as const

export type RejectCopyKey = keyof typeof REJECT_COPY

/**
 * A leak this copy cannot close on its own, and the human should know before
 * picking: with Confirm Email disabled (ticket 13), signing up with an address
 * that ALREADY has an account returns Supabase's own `User already registered`,
 * not the hook's message. Supabase's enumeration protection is a property of
 * the confirmation email we deleted. So "is this address on the list" stays
 * inferable by anyone who tries an address twice, whatever the hook says.
 *
 * Closing it means a generic catch in the client that replaces *every* signup
 * error with the chosen message — which is what draft A already implies and the
 * other two do not.
 */
export const ENUMERATION_CAVEAT =
  'With Confirm Email off, an already-registered address returns Supabase’s own "User already registered" instead of the hook message. Only draft A’s catch-all closes that.'
