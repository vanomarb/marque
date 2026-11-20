import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accountLabel, codeMatches, emailProblem, maskEmail, oneTimeCode, parseEmail, safeNext, validateFirstName } from './account.ts'

test('an email address is kept as typed, without the spaces round it', () => {
  assert.equal(parseEmail(' ana.reyes@example.com '), 'ana.reyes@example.com')
  assert.equal(parseEmail('ana@mail.example.co'), 'ana@mail.example.co')
})

test('a phone number is not an email address: the studio replies by email, wherever the client is', () => {
  for (const bad of ['+1 415 555 0100', '415 555 0100', '+44 20 7946 0000', '9171234567']) assert.equal(parseEmail(bad), null, bad)
})

test('an email address needs a name in every part of its domain', () => {
  for (const bad of ['x@y..zz', 'x@.y.zz', 'x@y.zz.', 'x@y.z', 'x@@y.zz', 'x y@y.zz']) assert.equal(parseEmail(bad), null, bad)
})

test('anything else is not an email address', () => {
  for (const bad of ['', '   ', 'ana', 'ana@', '@example.com', 'ana@example', '0917 123 456', '0817 123 4567', '+1 415 555 0100']) {
    assert.equal(parseEmail(bad), null, bad)
  }
})

test('an address that isn’t one gets a message saying what to type, in the words every form uses', () => {
  assert.equal(emailProblem(''), 'Enter your email address.')
  assert.equal(emailProblem('   '), 'Enter your email address.')
  assert.equal(emailProblem('ana@example'), 'Enter an email address, like name@example.com.')
  assert.equal(emailProblem(' ana@example.com '), null)
})

test('an address is masked to its first letter and its domain, the same width however long it is', () => {
  assert.equal(maskEmail('ana.reyes@example.com'), 'a•••@example.com')
  assert.equal(maskEmail('a@example.com'), 'a•••@example.com')
  assert.equal(maskEmail('tester.with.a.really.long.address@example-studio-domain.com'), 't•••@example-studio-domain.com')
})

test('a first name is required, kept short, and the message says why it is asked', () => {
  assert.equal(validateFirstName('Ana'), null)
  assert.equal(validateFirstName('  '), 'Enter your first name so we can file your briefs under it.')
  assert.equal(validateFirstName('A'.repeat(40)), null)
  assert.match(validateFirstName('A'.repeat(41)) ?? '', /40/)
})

test('a one-time code is four digits, and only the same four digits match it', () => {
  assert.equal(oneTimeCode(() => 0), '1000')
  assert.equal(oneTimeCode(() => 0.99999), '9999')
  assert.match(oneTimeCode(), /^\d{4}$/)
  assert.ok(codeMatches(' 4821 ', '4821'))
  assert.ok(codeMatches('48 21', '4821'))
  assert.ok(!codeMatches('4822', '4821'))
  assert.ok(!codeMatches('', '4821'))
})

test('the header calls a visitor by first name, or by the part of the address before the @ when they gave none', () => {
  assert.equal(accountLabel({ firstName: 'Ana Maria', email: 'ana@example.com' }), 'Ana')
  assert.equal(accountLabel({ firstName: null, email: 'ana.reyes@example.com' }), 'ana.reyes')
})

test('after signing in, only a page on this site is a place to return to', () => {
  const origin = 'https://example.com'
  assert.equal(safeNext('?next=%2Fmarque%2Fstart%2F%3Fset%3Dlaunch', origin), '/marque/start/?set=launch')
  assert.equal(safeNext('?next=/marque/pricing/#faq', origin), '/marque/pricing/#faq')
  for (const bad of ['', '?next=', '?next=https://evil.example/marque/', '?next=//evil.example/marque/', '?next=/elsewhere/', '?next=/marque/../elsewhere/', '?next=%2Fmarque%5C..%5Cevil', '?next=javascript:alert(1)']) {
    assert.equal(safeNext(bad, origin), null, bad)
  }
})
