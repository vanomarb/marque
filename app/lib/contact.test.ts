import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONTACT_LIMITS, validateContact } from './contact.ts'

const ok = { name: 'Ana Reyes', business: 'Kape Corner', email: 'ana@example.com', message: 'A logo and a menu board, please.' }

test('contact fields are checked', () => {
  assert.ok(validateContact({ ...ok, name: '' }).name)
  assert.deepEqual(validateContact(ok), {})
})

test('names and businesses are 2 to 60 characters once trimmed', () => {
  assert.ok(validateContact({ ...ok, name: ' A ' }).name)
  assert.ok(validateContact({ ...ok, name: 'A'.repeat(61) }).name)
  assert.equal(validateContact({ ...ok, name: `  ${'A'.repeat(60)}  ` }).name, undefined)
  assert.ok(validateContact({ ...ok, business: '   ' }).business)
  assert.ok(validateContact({ ...ok, business: 'B'.repeat(61) }).business)
})

test('the reply address is an email address: the studio replies by email', () => {
  assert.equal(validateContact({ ...ok, email: '' }).email, 'Enter your email address.')
  assert.equal(validateContact({ ...ok, email: 'ana@example..com' }).email, 'Enter an email address, like name@example.com.')
  assert.equal(validateContact({ ...ok, email: '+1 415 555 0100' }).email, 'Enter an email address, like name@example.com.')
  assert.equal(validateContact({ ...ok, email: ' ana@example.com ' }).email, undefined)
})

test('a message needs at least ten characters', () => {
  assert.ok(validateContact({ ...ok, message: 'Logo pls' }).message)
  assert.ok(validateContact({ ...ok, message: '          ' }).message)
  assert.equal(validateContact({ ...ok, message: 'A new logo' }).message, undefined)
})

test('a message past the box’s own cap is refused, as the check and the box agree', () => {
  assert.equal(validateContact({ ...ok, message: 'x'.repeat(CONTACT_LIMITS.message) }).message, undefined)
  assert.match(validateContact({ ...ok, message: 'x'.repeat(CONTACT_LIMITS.message + 1) }).message ?? '', /4,000/)
})

test('every error is a sentence that says what to do', () => {
  const errors = validateContact({ name: '', business: '', email: '', message: '' })
  assert.deepEqual(Object.keys(errors).sort(), ['business', 'email', 'message', 'name'])
  for (const message of Object.values(errors)) assert.match(message ?? '', /^[A-Z].*\.$/)
})
