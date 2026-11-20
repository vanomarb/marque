import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SAMPLE_QUOTES, SAMPLE_STATS, sampleQuotesMarkup, sampleStatsMarkup } from './samples.ts'

test('the quotes are short founder lines: a first name, a role and a kind of business, never a surname, company or photo', () => {
  assert.ok(SAMPLE_QUOTES.length >= 3 && SAMPLE_QUOTES.length <= 5)
  for (const q of SAMPLE_QUOTES) {
    assert.match(q.firstName, /^[A-Z][a-zá-ú]+$/, `${q.id}: one first name`)
    assert.match(q.business, /^[a-z]/, `${q.id}: a kind of business, not a company name`)
    assert.ok(q.quote.length <= 140, `${q.id}: short`)
    assert.doesNotMatch(q.quote, /—|!|amazing|incredible|game.?changer|seamless/i, `${q.id}: plain words`)
  }
  assert.ok(SAMPLE_STATS.length >= 3 && SAMPLE_STATS.length <= 4)
})

test('the quotes sound like founders talking, not lines written to prove each promise', () => {
  for (const q of SAMPLE_QUOTES) {
    for (const sentence of q.quote.split(/(?<=\.) /)) assert.ok(sentence.split(' ').length >= 5, `${q.id}: no clipped closer like "${sentence}"`)
  }
  assert.match(SAMPLE_QUOTES.find((q) => q.id === 'handover')!.quote, /a short guide/, 'the handover guide as Services describes it')
})

test('each figure and each quote is plain markup, with no wrapper around a single item', () => {
  const html = sampleStatsMarkup() + sampleQuotesMarkup(SAMPLE_QUOTES.map((q) => q.id))
  assert.doesNotMatch(html, /<(?:dd|figcaption) class="[^"]*\bflex\b/)
  assert.doesNotMatch(html, /<(?:dd|figcaption)[^>]*><span/)
})

test('every rendered stat comes from the module', () => {
  const html = sampleStatsMarkup()
  const rendered = [...html.matchAll(/data-sample="([a-z-]+)"/g)].map((m) => m[1])
  assert.deepEqual(rendered, SAMPLE_STATS.map((s) => s.id))
  for (const stat of SAMPLE_STATS) {
    const item = html.match(new RegExp(`<div [^>]*data-sample="${stat.id}"[\\s\\S]*?</div>`))?.[0] ?? ''
    assert.ok(item.includes(stat.value) && item.includes(stat.label), `${stat.id}: value and label`)
  }
})

test('every rendered quote comes from the module, only the ones asked for, with no photo of a person', () => {
  const ids = SAMPLE_QUOTES.slice(0, 2).map((q) => q.id)
  const html = sampleQuotesMarkup(ids)
  assert.deepEqual([...html.matchAll(/data-sample="([a-z-]+)"/g)].map((m) => m[1]), ids)
  for (const id of ids) {
    const q = SAMPLE_QUOTES.find((x) => x.id === id)!
    const item = html.match(new RegExp(`<li [^>]*data-sample="${id}"[\\s\\S]*?</li>`))?.[0] ?? ''
    assert.ok(item.includes(q.quote) && item.includes(`${q.firstName}, ${q.role}, ${q.business}`), `${id}: quote and who said it`)
  }
  assert.doesNotMatch(html, /<img|avatar/i)
  assert.throws(() => sampleQuotesMarkup(['nobody']), /nobody/, 'an unknown quote fails the build')
})
