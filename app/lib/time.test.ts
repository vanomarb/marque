import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatLongDate, localDate } from './time.ts'

test('a saved brief is dated on the visitor’s own calendar', () => {
  const at = new Date(Date.UTC(2026, 10, 18, 23, 30))
  assert.equal(localDate(at, 'Asia/Manila'), '2026-11-19')
  assert.equal(localDate(at, 'Europe/London'), '2026-11-18')
  assert.equal(localDate(at, 'America/Los_Angeles'), '2026-11-18')
})

test('a saved date reads the way people write it', () => {
  assert.equal(formatLongDate('2026-11-19'), '19 November 2026')
})
