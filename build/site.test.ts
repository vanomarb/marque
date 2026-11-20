import { test } from 'node:test'
import assert from 'node:assert/strict'
import { read } from '../tests/harness.ts'
import { BASE, LOCAL_SITE_URL, checkSiteUrl, leftoverPlaceholders } from './site.ts'

test('the local address passes the build check and ends in the base path; .env.example shows it and .env stays out of git', () => {
  assert.equal(checkSiteUrl(LOCAL_SITE_URL), LOCAL_SITE_URL)
  assert.equal(new URL(LOCAL_SITE_URL).pathname, BASE)
  assert.ok(read('.env.example').split('\n').includes(`VITE_SITE_URL=${LOCAL_SITE_URL}`), '.env.example names VITE_SITE_URL')
  assert.match(read('.gitignore'), /^\.env$/m, '.env is ignored')
})

test('the build stops, saying what to fix, when VITE_SITE_URL is missing or not the site’s address', () => {
  assert.throws(() => checkSiteUrl(undefined), /VITE_SITE_URL is not set\. Set VITE_SITE_URL in \.env/)
  assert.throws(() => checkSiteUrl('  '), /is not set/)
  assert.throws(() => checkSiteUrl('example.com/marque/'), /is not a URL/)
  for (const wrong of ['ftp://example.com/marque/', 'https://example.com/', 'https://example.com/marque', 'https://example.com/marque/?x=1', 'https://example.com/other/']) {
    assert.throws(() => checkSiteUrl(wrong), new RegExp(`must be an http\\(s\\) address ending in ${BASE.replaceAll('/', '\\/')}`), wrong)
  }
})

test('placeholders left in a built page are found; percentages are not placeholders', () => {
  assert.deepEqual(leftoverPlaceholders('<link href="%VITE_SITE_URL%work/"><a href="%BASE_URL%">x</a> %VITE_SITE_URL%'), ['%VITE_SITE_URL%', '%BASE_URL%'])
  assert.deepEqual(leftoverPlaceholders('<div style="width:100%;height:calc(50% + 1em)">50% off</div>'), [])
})
