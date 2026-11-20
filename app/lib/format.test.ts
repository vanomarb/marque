import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escapeHtml, parsePeso, peso } from './format.ts'

test('peso formats without decimals', () => {
  assert.equal(peso(85), '₱85')
  assert.equal(peso(1290), '₱1,290')
  assert.equal(peso(45000), '₱45,000')
})

test('text typed by a visitor is escaped before it goes into markup', () => {
  assert.equal(escapeHtml(`<b class="x">Ana & 'Co'</b>`), '&lt;b class=&quot;x&quot;&gt;Ana &amp; &#39;Co&#39;&lt;/b&gt;')
})

test('a peso figure on the page reads back as its number', () => {
  assert.equal(parsePeso('₱105,000'), 105000)
  assert.equal(parsePeso(peso(17000)), 17000)
  assert.equal(parsePeso('₱0'), 0)
  for (const text of ['', 'Not included', '₱', null, undefined]) assert.equal(parsePeso(text), null, String(text))
})
