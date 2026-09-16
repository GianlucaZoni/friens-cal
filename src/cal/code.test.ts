/**
 * The Code as a string, asserted against the three things that decide whether a
 * Friend can type one in: the pattern `input-otp` compiles, the transformer it
 * runs on paste, and the normalisation `join_cal` performs server-side.
 *
 *     yarn test
 *
 * The pattern assertions compile it the way the component does —
 * `new RegExp(CODE_PATTERN)`, no flags — because that is the whole of the
 * finding: a pattern that admits only upper case eats every lower-case
 * keystroke before `onChange` ever sees it.
 */
import {
  CODE_LENGTH,
  CODE_PATTERN,
  JOIN_BAD_CODE,
  JOIN_UNAVAILABLE,
  isCompleteCode,
  joinErrorMessage,
  normaliseCode,
  pasteCode,
  spellOut,
} from './code.ts'
import assert from 'node:assert/strict'
import test from 'node:test'

/** Compiled exactly as `input-otp` compiles it. No `i`, no anything. */
const pattern = new RegExp(CODE_PATTERN)

/* ================================================================== *
 * The pattern, which is tested before `onChange` and therefore decides
 * which keystrokes arrive at all
 * ================================================================== */

test('the pattern admits lower case, which is what makes lower-case typing work', () => {
  for (const char of 'abcdefghijklmnopqrstuvwxyz') assert.ok(pattern.test(char), char)
})

test('the pattern admits upper case and digits', () => {
  for (const char of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') assert.ok(pattern.test(char), char)
})

test('the pattern admits a partial code, because it is tested on every keystroke', () => {
  assert.ok(pattern.test('h'))
  assert.ok(pattern.test('h3d'))
  assert.ok(pattern.test('h3dkw9'))
})

test('the pattern admits the empty string, so the last backspace is not refused', () => {
  assert.ok(pattern.test(''))
})

test('the pattern is wider than the server alphabet on purpose', () => {
  // `0 O 1 I L U` are not in the thirty characters `private.new_cal_code()`
  // mints, so no Code contains them. The field accepts them anyway: refusing a
  // keystroke silently is worse than letting the RPC say no.
  for (const char of '0O1ILU') assert.ok(pattern.test(char), char)
})

test('the pattern refuses what a Code can never contain', () => {
  for (const char of '- _ . / @ é'.split(' ')) assert.ok(!pattern.test(char), char)
})

/* ================================================================== *
 * Paste
 * ================================================================== */

test('a pasted code is uppercased', () => {
  assert.equal(pasteCode('h3dkw9'), 'H3DKW9')
})

test('a pasted code loses the dashes and spaces the pattern would refuse', () => {
  assert.equal(pasteCode('h3d-kw9'), 'H3DKW9')
  assert.equal(pasteCode(' H3D KW9 '), 'H3DKW9')
})

test('pasting a whole sentence keeps its first six letters, not the code inside it', () => {
  // Recorded rather than fixed. Finding the Code in a sentence means guessing
  // which six characters are it, and guessing wrong fills the field with
  // something the Friend did not paste and cannot see they did not paste.
  // Six boxes that fill with the wrong six are a worse failure than six boxes
  // that fill with the first six.
  assert.equal(pasteCode('code: H3DKW9!'), 'CODEH3')
})

test('a pasted code is cut to six, so a chat message does not overflow the field', () => {
  assert.equal(pasteCode('H3DKW9XYZ'), 'H3DKW9')
  assert.equal(pasteCode('H3DKW9').length, CODE_LENGTH)
})

test('a paste with nothing in it leaves nothing behind', () => {
  assert.equal(pasteCode('---'), '')
  assert.equal(pasteCode(''), '')
})

/* ================================================================== *
 * Normalisation, which mirrors `upper(btrim(code))` in `join_cal`
 * ================================================================== */

test('normalising is the server’s upper(btrim(...)), and nothing more', () => {
  assert.equal(normaliseCode(' h3dkw9 '), 'H3DKW9')
  assert.equal(normaliseCode('H3DKW9'), 'H3DKW9')
})

test('normalising does not strip the inner characters btrim leaves alone', () => {
  // The field cannot produce this, but the function must not pretend to a
  // cleverness the server does not have: a Code with a space in the middle is a
  // Code that does not exist, and the RPC is what says so.
  assert.equal(normaliseCode('h3d kw9'), 'H3D KW9')
})

test('a code is complete at six characters and not before', () => {
  assert.ok(!isCompleteCode('H3DKW'))
  assert.ok(isCompleteCode('H3DKW9'))
})

/* ================================================================== *
 * Reading it out, for the copy button's label
 * ================================================================== */

test('spelling a code out separates the characters a screen reader would run together', () => {
  assert.equal(spellOut('H3DKW9'), 'H 3 D K W 9')
})

/* ================================================================== *
 * The one sentence over whatever Postgres said
 * ================================================================== */

test('a code matching nothing is the one failure worth naming', () => {
  // `join_cal` raises with errcode `no_data_found`, which PostgREST hands back
  // as SQLSTATE P0002.
  assert.equal(joinErrorMessage({ code: 'P0002', message: 'no cal with that code' }), JOIN_BAD_CODE)
})

test('every other failure is the vaguer sentence, because it is the truer one', () => {
  assert.equal(joinErrorMessage({ code: '42501', message: 'permission denied' }), JOIN_UNAVAILABLE)
  assert.equal(joinErrorMessage({ code: null, message: 'Failed to fetch' }), JOIN_UNAVAILABLE)
  assert.equal(joinErrorMessage(null), JOIN_UNAVAILABLE)
})

test('the bad-code sentence says how many characters to check', () => {
  assert.match(JOIN_BAD_CODE, /six/)
})
