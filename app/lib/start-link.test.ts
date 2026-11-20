import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LAUNCH_SET, selectionFromSearch } from './start-link.ts'
import { DEFAULT_SOCIAL, estimate } from './estimate.ts'
import type { Brief } from './account.ts'

const none = { identity: false, website: null, social: null, ads: false, shoots: 0, print: 0 }
const saved: Brief[] = [{ id: 'b1', savedAt: '2026-11-18T02:00:00.000Z', selection: { ...none, ads: true, print: 2 } }]

test('the launch set is brand identity and a six-page website', () => {
  assert.deepEqual(LAUNCH_SET, { ...none, identity: true, website: { pages: 6 } })
  assert.equal(estimate(LAUNCH_SET).oneTime, 105000)
  assert.deepEqual(estimate(LAUNCH_SET).weeks, [7, 11])
  assert.deepEqual(selectionFromSearch('?set=launch', []), LAUNCH_SET)
})

test('a service page link starts the builder with that service picked', () => {
  assert.deepEqual(selectionFromSearch('?add=identity', []), { ...none, identity: true })
  assert.deepEqual(selectionFromSearch('?add=website', []), { ...none, website: { pages: 6 } })
  assert.deepEqual(selectionFromSearch('?add=social', []), { ...none, social: { platforms: 1, posts: 12 } })
  assert.deepEqual(selectionFromSearch('?add=ads', []), { ...none, ads: true })
  assert.deepEqual(selectionFromSearch('?add=photo', []), { ...none, shoots: 1 })
  assert.deepEqual(selectionFromSearch('?add=print', []), { ...none, print: 1 })
})

test('a saved brief opens by its id', () => {
  assert.deepEqual(selectionFromSearch('?brief=b1', saved), saved[0].selection)
  assert.equal(selectionFromSearch('?brief=gone', saved), null)
})

test('anything else starts an empty builder', () => {
  for (const search of ['', '?', '?set=everything', '?add=teleport', '?add=', '?brief=', '?utm=x']) assert.equal(selectionFromSearch(search, saved), null, search)
})

test('adding social media from a link starts at the advertised one-platform price', () => {
  const picked = selectionFromSearch('?add=social', [])!
  assert.deepEqual(picked.social, DEFAULT_SOCIAL)
  assert.equal(estimate(picked).monthly, 17000)
})
