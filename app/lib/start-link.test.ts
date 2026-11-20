import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickSearch, selectionFromSearch } from './start-link.ts'
import { DEFAULT_SOCIAL, PLANS, estimate, isSelection, type Selection } from './estimate.ts'
import type { Brief } from './account.ts'

/** What every link starts from: nothing picked, with the first-project discount on, as the builder starts. */
const none: Selection = { identity: false, website: null, social: null, ads: false, shoots: 0, print: 0, firstProject: true }
const saved: Brief[] = [{ id: 'b1', savedAt: '2026-11-18T02:00:00.000Z', selection: { ...none, ads: true, print: 2, firstProject: false } }]

test('the Launch plan link is brand identity and a six-page website, managed after launch, at the first-project price', () => {
  const launch = selectionFromSearch('?set=launch', [])!
  assert.deepEqual(launch, { ...none, identity: true, website: { pages: 6, managed: true } })
  assert.deepEqual(launch, PLANS.find((plan) => plan.id === 'launch')!.selection)
  assert.deepEqual([estimate(launch).oneTimeRegular, estimate(launch).oneTime, estimate(launch).monthly], [1080, 917, 39])
  assert.deepEqual(estimate(launch).days, [1, 3])
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
  for (const search of ['', '?', '?set=everything', '?add=teleport', '?add=', '?brief=', '?pick=', '?utm=x']) assert.equal(selectionFromSearch(search, saved), null, search)
})

test('every link builds a selection the brief store accepts', () => {
  for (const search of ['?set=launch', '?add=identity', '?add=website', '?add=social', '?add=ads', '?add=photo', '?add=print', '?pick=i.w12h.s4x30.a.p4.r10.f']) {
    const picked = selectionFromSearch(search, [])
    assert.ok(picked && isSelection(picked), search)
  }
})

test('adding social media from a link starts at the advertised one-platform price', () => {
  const picked = selectionFromSearch('?add=social', [])!
  assert.deepEqual(picked.social, DEFAULT_SOCIAL)
  assert.equal(estimate(picked).monthly, 290)
})

test('the builder’s selection fits in a short query, and reads back exactly', () => {
  assert.equal(pickSearch({ ...none, identity: true, website: { pages: 6, managed: true } }), '?pick=i.w6.f')
  assert.equal(pickSearch({ identity: true, website: { pages: 8, managed: false }, social: { platforms: 2, posts: 20 }, ads: true, shoots: 2, print: 3, firstProject: false }), '?pick=i.w8h.s2x20.a.p2.r3')
  assert.equal(pickSearch(none), '', 'nothing picked, nothing to keep')
  const selections: Selection[] = [{ identity: true, website: { pages: 12, managed: true }, social: { platforms: 4, posts: 30 }, ads: true, shoots: 4, print: 10, firstProject: true }]
  for (let pages = 1; pages <= 12; pages += 1) selections.push({ ...none, website: { pages, managed: pages % 2 === 0 } })
  for (const posts of [12, 20, 30] as const) selections.push({ ...none, social: { platforms: 3, posts }, firstProject: false })
  for (let n = 1; n <= 4; n += 1) selections.push({ ...none, shoots: n, print: n * 2 })
  for (const s of selections) assert.deepEqual(selectionFromSearch(pickSearch(s), []), s, pickSearch(s))
})

test('a pick that isn’t one the builder could make opens an empty builder', () => {
  for (const pick of ['w0', 'w13', 'w6x', 'w6hh', 'p0', 'p5', 'r0', 'r11', 's0x12', 's5x12', 's1x15', 'i.i', 'i..a', 'I', 'x', 'w06', 'f']) {
    assert.equal(selectionFromSearch(`?pick=${pick}`, []), null, pick)
  }
})
