import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatLongDate, manilaTime } from './time.ts'

test('manilaTime converts from UTC', () => {
  assert.deepEqual(manilaTime(new Date(Date.UTC(2026, 10, 18, 16, 30))), { isoDate: '2026-11-19' })
})

test('a saved date reads the way people write it, on the Cebu calendar', () => {
  assert.equal(formatLongDate('2026-11-19'), '19 November 2026')
  // 23:30 UTC on 18 November is already the 19th in Cebu.
  assert.equal(formatLongDate(manilaTime(new Date(Date.UTC(2026, 10, 18, 23, 30))).isoDate), '19 November 2026')
})
