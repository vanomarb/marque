import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LAUNCH_SET, selectionFromSearch } from './start-link.ts'
import { DEFAULT_SOCIAL, estimate, isSelection } from './estimate.ts'
import type { Brief } from './account.ts'

/** What every link starts from: nothing picked, with the first-project discount on, as the builder starts. */
const none = { identity: false, website: null, social: null, ads: false, shoots: 0, print: 0, firstProject: true }
const saved: Brief[] = [{ id: 'b1', savedAt: '2026-11-18T02:00:00.000Z', selection: { ...none, ads: true, print: 2, firstProject: false } }]

test('the launch set is brand identity and a six-page website, managed after launch, at the first-project price', () => {
  assert.deepEqual(LAUNCH_SET, { ...none, identity: true, website: { pages: 6, managed: true } })
  assert.equal(estimate(LAUNCH_SET).oneTime, 918)
  assert.equal(estimate(LAUNCH_SET).oneTime + estimate(LAUNCH_SET).discount, 1080, 'the regular price')
  assert.equal(estimate(LAUNCH_SET).monthly, 39)
  assert.deepEqual(estimate(LAUNCH_SET).days, [1, 3])
  assert.deepEqual(selectionFromSearch('?set=launch', []), LAUNCH_SET)
})

test('a service page link starts the builder with that service picked', () => {
  assert.deepEqual(selectionFromSearch('?add=identity', []), { ...none, identity: true })
  assert.deepEqual(selectionFromSearch('?add=website', []), { ...none, website: { pages: 6, managed: true } })
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

test('every link builds a selection the brief store accepts', () => {
  for (const search of ['?set=launch', '?add=identity', '?add=website', '?add=social', '?add=ads', '?add=photo', '?add=print']) {
    const picked = selectionFromSearch(search, [])
    assert.ok(picked && isSelection(picked), search)
  }
})

test('adding social media from a link starts at the advertised one-platform price', () => {
  const picked = selectionFromSearch('?add=social', [])!
  assert.deepEqual(picked.social, DEFAULT_SOCIAL)
  assert.equal(estimate(picked).monthly, 290)
})
