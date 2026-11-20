import { test } from 'node:test'
import assert from 'node:assert/strict'
import { includePartials } from './partials.ts'

const partials = { head: '<script type="module" src="/main.ts"></script>', header: '<header><a data-page="home" href="%BASE_URL%">Home</a></header>', footer: '<footer></footer>' }
const page = (head: string, body: string) => `<!doctype html><html lang="en"><head><title>Page</title>${head}</head><body>${body}</body></html>`
const build = (html: string) => includePartials(html, partials, '/marque/')

test('the markers are replaced: the head scripts, the header with its current page, the sample stats and the quotes asked for', () => {
  const html = build(page('<!-- include:head -->', '<!-- include:header current="home" --><!-- samples:stats --><!-- samples:quotes ids="credit,receipt" --><!-- include:footer -->'))
  assert.match(html, /<head><title>Page<\/title><script type="module" src="\/main.ts"><\/script><\/head>/)
  assert.match(html, /data-page="home" aria-current="page" href="\/marque\/"/)
  assert.match(html, /<div data-samples="stats">/)
  assert.deepEqual([...html.matchAll(/<li data-sample="([a-z-]+)"/g)].map((m) => m[1]), ['credit', 'receipt'])
  assert.doesNotMatch(html, /<!--/)
})

test('a marker the build cannot read stops it, instead of staying in the page as an invisible comment', () => {
  for (const marker of ['<!-- samples:quotes ids="credit, receipt" -->', '<!-- samples:Stats -->', '<!--samples:stats-->', '<!-- samples:quotes ids="" -->', '<!-- include:headr -->', '<!-- include:heads -->', '<!-- include:footer current="Terms" -->']) {
    assert.throws(() => build(page('', marker)), /marker/, marker)
  }
})

test('quotes need ids, so a marker can never render an empty list', () => {
  assert.throws(() => build(page('', '<!-- samples:quotes -->')), /ids/)
})

test('sample content never goes in the head: not the title, not a meta tag, not schema', () => {
  assert.throws(() => build(page('<meta name="description" content="x" /><!-- samples:stats -->', '')), /<head>/)
  assert.throws(() => build('<html><head><title><!-- samples:quotes ids="credit" --></title></head><body></body></html>'), /<head>/)
})
