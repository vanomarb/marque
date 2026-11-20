import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateContact } from './contact.ts'

test('contact fields are checked', () => {
  assert.ok(validateContact({ name: '', business: 'Usual', message: 'Hello there, a website' }).name)
  assert.deepEqual(validateContact({ name: 'Van', business: 'Usual', message: 'We need a new website' }), {})
})

test('names and businesses are 2 to 60 characters once trimmed', () => {
  const ok = { name: 'Ana Reyes', business: 'Kape Corner', message: 'A logo and a menu board, please.' }
  assert.ok(validateContact({ ...ok, name: ' A ' }).name)
  assert.ok(validateContact({ ...ok, name: 'A'.repeat(61) }).name)
  assert.equal(validateContact({ ...ok, name: `  ${'A'.repeat(60)}  ` }).name, undefined)
  assert.ok(validateContact({ ...ok, business: '   ' }).business)
  assert.ok(validateContact({ ...ok, business: 'B'.repeat(61) }).business)
})

test('a message needs at least ten characters', () => {
  const ok = { name: 'Ana', business: 'Kape Corner' }
  assert.ok(validateContact({ ...ok, message: 'Logo pls' }).message)
  assert.ok(validateContact({ ...ok, message: '          ' }).message)
  assert.equal(validateContact({ ...ok, message: 'A new logo' }).message, undefined)
})

test('every error is a sentence that says what to do', () => {
  const errors = validateContact({ name: '', business: '', message: '' })
  assert.deepEqual(Object.keys(errors).sort(), ['business', 'message', 'name'])
  for (const message of Object.values(errors)) assert.match(message ?? '', /^[A-Z].*\.$/)
})
