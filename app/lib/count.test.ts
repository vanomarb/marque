import { test } from 'node:test'
import assert from 'node:assert/strict'
import { countFrom, countStep } from './count.ts'

test('the first figure is set at once, not counted up from the $0 in the page', () => {
  assert.equal(countFrom('$0', undefined, 105_000), 105_000)
})

test('a change while a count is running carries on from the figure on screen, not from the last target', () => {
  // Counting between two totals, the visitor sees $78,300 when they change the brief mid-count.
  assert.equal(countFrom('$78,300', 105_000, 45_000), 78_300)
  // At rest the figure on screen is the last target.
  assert.equal(countFrom('$45,000', 45_000, 60_000), 45_000)
  // Text that isn't a dollar figure falls back to the last target.
  assert.equal(countFrom('', 45_000, 60_000), 45_000)
  assert.equal(countFrom(null, 45_000, 60_000), 45_000)
})

test('each step eases out, lands on whole hundreds, and ends exactly on the new figure', () => {
  assert.equal(countStep(45_000, 105_000, 0), 45_000)
  assert.equal(countStep(45_000, 105_000, 1), 105_000)
  assert.equal(countStep(45_000, 105_000, 1.4), 105_000)
  const mid = countStep(45_000, 105_000, 0.5)
  assert.equal(mid % 100, 0)
  assert.ok(mid > 75_000 && mid < 105_000, `eases out: past halfway at half time (${mid})`)
  assert.ok(countStep(105_000, 45_000, 0.5) < 75_000, 'and the same going down')
  assert.equal(countStep(17_000, 17_050, 1), 17_050, 'an exact end even off the hundred')
})
