import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escapeHtml, parseDollars, dollars, signedDollars } from './format.ts'

test('dollars format without decimals', () => {
  assert.equal(dollars(85), '$85')
  assert.equal(dollars(1290), '$1,290')
  assert.equal(dollars(45000), '$45,000')
})

test('a discount reads with a true minus sign before the dollar sign', () => {
  assert.equal(signedDollars(-162), '−$162')
  assert.equal(signedDollars(-1080), '−$1,080')
  assert.equal(signedDollars(39), '$39')
  assert.equal(signedDollars(0), '$0')
})

test('text typed by a visitor is escaped before it goes into markup', () => {
  assert.equal(escapeHtml(`<b class="x">Ana & 'Co'</b>`), '&lt;b class=&quot;x&quot;&gt;Ana &amp; &#39;Co&#39;&lt;/b&gt;')
})

test('a dollar figure on the page reads back as its number', () => {
  assert.equal(parseDollars('$105,000'), 105000)
  assert.equal(parseDollars(dollars(17000)), 17000)
  assert.equal(parseDollars('$0'), 0)
  for (const text of ['', 'Not included', '$', null, undefined]) assert.equal(parseDollars(text), null, String(text))
})
