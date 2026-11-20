import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SORT_NAMES, WORKS, isWorkSort, neighbours, sortWorks } from './works.ts'

const names = (by: Parameters<typeof sortWorks>[1]) => sortWorks(WORKS, by).map((w) => w.name)

test('the three projects launched in November 2026, Usual first', () => {
  assert.deepEqual(WORKS.map((w) => [w.id, w.launched]), [['usual', '2026-11-19'], ['bayline', '2026-11-20'], ['enamel', '2026-11-20']])
})

test('sorting by newest, oldest or name; projects from the same day keep to name order', () => {
  assert.deepEqual(names('newest'), ['Bayline', 'Enamel', 'Usual'])
  assert.deepEqual(names('oldest'), ['Usual', 'Bayline', 'Enamel'])
  assert.deepEqual(names('name'), ['Bayline', 'Enamel', 'Usual'])
  assert.deepEqual(WORKS.map((w) => w.id), ['usual', 'bayline', 'enamel'], 'the list itself is left alone')
})

test('only the three sorts are sorts', () => {
  for (const by of Object.keys(SORT_NAMES)) assert.ok(isWorkSort(by), by)
  for (const by of ['', 'random', 'toString', undefined, 3]) assert.equal(isWorkSort(by), false, String(by))
})

test('previous and next go round the list in launch order', () => {
  assert.deepEqual([neighbours('usual').previous.id, neighbours('usual').next.id], ['enamel', 'bayline'])
  assert.deepEqual([neighbours('bayline').previous.id, neighbours('bayline').next.id], ['usual', 'enamel'])
  assert.deepEqual([neighbours('enamel').previous.id, neighbours('enamel').next.id], ['bayline', 'usual'])
})
