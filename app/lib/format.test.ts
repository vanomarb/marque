import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escapeHtml, parseDollars, dollars, priceMarkup } from './format.ts'

test('dollars format without decimals', () => {
  assert.equal(dollars(85), '$85')
  assert.equal(dollars(1290), '$1,290')
  assert.equal(dollars(45000), '$45,000')
})

test('a discounted price strikes the regular one and names both for screen readers', () => {
  assert.equal(priceMarkup(39), '$39', 'no regular price, no strikethrough')
  assert.equal(priceMarkup(690, 690), '$690')
  assert.equal(priceMarkup(587, 690), '<s class="price-was"><span class="sr-only">Regular price </span>$690</s> <span class="price-now"><span class="sr-only">first-project price </span>$587</span>')
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
