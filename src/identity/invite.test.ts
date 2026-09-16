/**
 * The three claims the invite dialog cannot get wrong quietly.
 *
 * Normalisation has a constraint on the other side of the wire that refuses
 * anything else, and the error it raises names a constraint rather than a
 * mistake. The sentence is the half of the invite the product does not send, so
 * a Code missing from it is somebody staring at a join page. The predicate is a
 * foreign key: getting it wrong is a `23503` a Friend cannot read.
 *
 *     node --experimental-strip-types --test src/identity/invite.test.ts
 */
import { canInvite, looksLikeAnAddress, normaliseAddress, pasteableInvite } from './invite.ts'
import assert from 'node:assert/strict'
import test from 'node:test'

const ORIGIN = 'https://friens-cal.vercel.app'

/* ------------------------------------------------------------------ *
 * normaliseAddress — the same rule as `check (email = lower(btrim(email)))`
 * ------------------------------------------------------------------ */

test('normaliseAddress lowercases and trims, which is what the constraint checks', () => {
  assert.equal(normaliseAddress('  Rob@GMAIL.com '), 'rob@gmail.com')
  assert.equal(normaliseAddress('rob@gmail.com'), 'rob@gmail.com')
})

test('normaliseAddress takes tabs and newlines too, which btrim would leave', () => {
  // Wider than Postgres, and safe in that direction only: whatever this returns
  // has no leading or trailing space left for `btrim` to find, so the
  // constraint holds. A client that trimmed LESS than Postgres would ship
  // addresses the table refuses.
  assert.equal(normaliseAddress('\t rob@gmail.com\n'), 'rob@gmail.com')
})

test('normaliseAddress leaves the inside of an address alone', () => {
  // It is not a sanitiser. A space in the middle is a typo that survives to the
  // confirm step, where somebody can see it.
  assert.equal(normaliseAddress(' rob smith@gmail.com '), 'rob smith@gmail.com')
  assert.equal(normaliseAddress(''), '')
})

/* ------------------------------------------------------------------ *
 * looksLikeAnAddress — only enough to keep the button honest
 * ------------------------------------------------------------------ */

test('looksLikeAnAddress accepts an ordinary address, before and after normalising', () => {
  assert.equal(looksLikeAnAddress('rob@gmail.com'), true)
  assert.equal(looksLikeAnAddress('  ROB@GMAIL.COM '), true)
  assert.equal(looksLikeAnAddress('rob+cal@mail.example.co.uk'), true)
})

test('looksLikeAnAddress refuses the shapes that are obviously not one', () => {
  for (const nope of [
    '',
    '   ',
    'rob',
    '@gmail.com',
    'rob@',
    'rob@@gmail.com',
    'rob smith@x.com',
  ]) {
    assert.equal(looksLikeAnAddress(nope), false, nope)
  }
})

test('looksLikeAnAddress does not try to be RFC 5322', () => {
  // A dotless domain is legal and unusual, and the only cost of letting it
  // through is a confirm step showing it back. The screen this guards is a
  // button, not the table.
  assert.equal(looksLikeAnAddress('rob@localhost'), true)
})

/* ------------------------------------------------------------------ *
 * pasteableInvite — the half of the invite the product does not send
 * ------------------------------------------------------------------ */

const CAL = { name: 'spiritually unemployed', code: 'K4M7PQ' }

test('pasteableInvite carries where it came from, who sent it, and the Code', () => {
  assert.equal(
    pasteableInvite({ origin: ORIGIN, inviterName: 'Kim', cal: CAL }),
    'Kim invited you to friens cal: https://friens-cal.vercel.app. Sign up with this email address, then enter the code K4M7PQ to join spiritually unemployed.'
  )
})

test('pasteableInvite drops the Code when there is no cal on screen', () => {
  // An Invite admits somebody to the product, not to a cal, and the
  // join-or-create page has no cal to name.
  assert.equal(
    pasteableInvite({ origin: ORIGIN, inviterName: 'Kim', cal: null }),
    'Kim invited you to friens cal: https://friens-cal.vercel.app. Sign up with this email address.'
  )
})

test('pasteableInvite still names the product when the inviter has no name yet', () => {
  for (const name of [null, '', '   ']) {
    assert.equal(
      pasteableInvite({ origin: ORIGIN, inviterName: name, cal: CAL }),
      'You are invited to friens cal: https://friens-cal.vercel.app. Sign up with this email address, then enter the code K4M7PQ to join spiritually unemployed.'
    )
  }
})

test('pasteableInvite uses the origin it is handed, so a preview deploy sends its own', () => {
  const sentence = pasteableInvite({
    origin: 'https://friens-cal-git-branch.vercel.app',
    inviterName: 'Kim',
    cal: CAL,
  })
  assert.ok(sentence.includes('https://friens-cal-git-branch.vercel.app'))
  assert.ok(!sentence.includes('friens-cal.vercel.app.'))
})

test('pasteableInvite is one line with no double spaces, because it gets pasted', () => {
  const sentence = pasteableInvite({ origin: ORIGIN, inviterName: 'Kim', cal: CAL })
  assert.ok(!sentence.includes('\n'))
  assert.ok(!sentence.includes('  '))
  assert.equal(sentence, sentence.trim())
})

/* ------------------------------------------------------------------ *
 * canInvite — a foreign key, not a finished profile
 * ------------------------------------------------------------------ */

test('canInvite waits for the Friend row and nothing else', () => {
  // `invited_by` references `friend(id)`, so the write is a `23503` until the
  // row lands. It is deliberately NOT `identityOf(friend) === null`: an
  // unfinished profile can still vouch for somebody.
  assert.equal(canInvite(null), false)
  assert.equal(canInvite({ id: '1b0c7ae3-1851-4e6a-b150-e62f9a2650e7' }), true)
})
