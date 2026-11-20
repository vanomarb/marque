import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCOUNT_KEY,
  BRIEFS_KEY,
  MAX_BRIEFS,
  accountLabel,
  clearSession,
  codeMatches,
  demoCode,
  loadBriefs,
  loadSession,
  maskContact,
  parseContact,
  removeBrief,
  saveBrief,
  saveSession,
  validateFirstName,
  type KeyValueStore,
} from './account.ts'
import type { Selection } from './estimate.ts'

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

/** Like Safari's private mode, or blocked site data. */
const blockedStore: KeyValueStore = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
  removeItem: () => {
    throw new Error('blocked')
  },
}

const launch: Selection = { identity: true, website: { pages: 6, managed: true }, social: null, ads: false, shoots: 0, print: 0, firstProject: true }
const at = (iso: string) => new Date(iso)

test('the keys are the ones the Privacy and Cookie pages list', () => {
  assert.equal(ACCOUNT_KEY, 'marque.account')
  assert.equal(BRIEFS_KEY, 'marque.briefs')
})

test('an email address is a contact', () => {
  assert.deepEqual(parseContact(' ana.reyes@example.com '), { kind: 'email', value: 'ana.reyes@example.com' })
  assert.deepEqual(parseContact('ana@mail.example.co'), { kind: 'email', value: 'ana@mail.example.co' })
})

test('a phone number is not a contact: the studio replies by email, wherever the client is', () => {
  for (const bad of ['+1 415 555 0100', '415 555 0100', '+44 20 7946 0000', '9171234567']) assert.equal(parseContact(bad), null, bad)
})

test('an email address needs a name in every part of its domain', () => {
  for (const bad of ['x@y..zz', 'x@.y.zz', 'x@y.zz.', 'x@y.z', 'x@@y.zz', 'x y@y.zz']) assert.equal(parseContact(bad), null, bad)
})

test('anything else is not a contact', () => {
  for (const bad of ['', '   ', 'ana', 'ana@', '@example.com', 'ana@example', '0917 123 456', '0817 123 4567', '+1 415 555 0100']) {
    assert.equal(parseContact(bad), null, bad)
  }
})

test('contacts are shown masked', () => {
  assert.equal(maskContact({ kind: 'email', value: 'ana.reyes@example.com' }), 'a••••••••@example.com')
})

test('a first name is required and kept short', () => {
  assert.equal(validateFirstName('Ana'), null)
  assert.match(validateFirstName('  ') ?? '', /first name/i)
  assert.equal(validateFirstName('A'.repeat(40)), null)
  assert.match(validateFirstName('A'.repeat(41)) ?? '', /40/)
})

test('the demo code is four digits, and only the same four digits match it', () => {
  assert.equal(demoCode(() => 0), '1000')
  assert.equal(demoCode(() => 0.99999), '9999')
  assert.match(demoCode(), /^\d{4}$/)
  assert.ok(codeMatches(' 4821 ', '4821'))
  assert.ok(codeMatches('48 21', '4821'))
  assert.ok(!codeMatches('4822', '4821'))
  assert.ok(!codeMatches('', '4821'))
})

test('a session saves, loads and clears', () => {
  const store = memoryStore()
  assert.equal(loadSession(store), null)
  assert.ok(saveSession(store, { firstName: 'Ana', contact: { kind: 'email', value: 'ana@example.com' } }))
  assert.deepEqual(loadSession(store), { firstName: 'Ana', contact: { kind: 'email', value: 'ana@example.com' } })
  clearSession(store)
  assert.equal(loadSession(store), null)
})

test('signing in with email alone keeps no name, and the header calls the visitor by their email', () => {
  const store = memoryStore()
  const nameless = { firstName: null, contact: { kind: 'email' as const, value: 'ana@example.com' } }
  assert.ok(saveSession(store, nameless))
  assert.deepEqual(loadSession(store), nameless)
  assert.equal(accountLabel(nameless), 'ana@example.com')
  assert.equal(accountLabel({ firstName: 'Ana Maria', contact: nameless.contact }), 'Ana', 'a first name, first word only')
  store.data.set(ACCOUNT_KEY, JSON.stringify({ contact: nameless.contact }))
  assert.deepEqual(loadSession(store), nameless, 'a missing name is no name')
})

test('a damaged or foreign session is ignored', () => {
  const store = memoryStore()
  store.data.set(ACCOUNT_KEY, '{not json')
  assert.equal(loadSession(store), null)
  store.data.set(ACCOUNT_KEY, JSON.stringify({ firstName: '', contact: { kind: 'email', value: 'x@y.co' } }))
  assert.equal(loadSession(store), null)
  store.data.set(ACCOUNT_KEY, JSON.stringify({ firstName: 'Ana', contact: { kind: 'fax', value: '123' } }))
  assert.equal(loadSession(store), null)
})

function savedBrief(result: ReturnType<typeof saveBrief>) {
  if (result.status !== 'saved') assert.fail(`expected a saved brief, got ${result.status}`)
  return result.brief
}

test('briefs saved from the builder come back newest first, and can be removed', () => {
  const store = memoryStore()
  const first = savedBrief(saveBrief(store, launch, at('2026-11-18T02:00:00Z')))
  const second = savedBrief(saveBrief(store, { ...launch, ads: true }, at('2026-11-19T02:00:00Z')))
  assert.notEqual(first.id, second.id)
  assert.deepEqual(loadBriefs(store).map((b) => b.id), [second.id, first.id])
  assert.equal(loadBriefs(store)[1].savedAt, '2026-11-18T02:00:00.000Z')
  assert.deepEqual(loadBriefs(store)[1].selection, launch)
  assert.equal(removeBrief(store, second.id), true)
  assert.deepEqual(loadBriefs(store).map((b) => b.id), [first.id])
})

test('saving the same selection as the newest brief adds no copy and says it is already saved', () => {
  const store = memoryStore()
  const first = savedBrief(saveBrief(store, launch, at('2026-11-18T02:00:00Z')))
  const again = saveBrief(store, { ...launch, website: { pages: 6, managed: true } }, at('2026-11-18T03:00:00Z'))
  assert.equal(again.status, 'already-saved')
  assert.equal(again.status === 'already-saved' && again.brief.id, first.id)
  assert.equal(loadBriefs(store).length, 1)
  // Only the newest brief is compared, so going back to the first selection saves it again.
  savedBrief(saveBrief(store, { ...launch, ads: true }, at('2026-11-18T04:00:00Z')))
  savedBrief(saveBrief(store, launch, at('2026-11-18T05:00:00Z')))
  assert.equal(loadBriefs(store).length, 3)
  // Switching the website to handed over is a different brief.
  savedBrief(saveBrief(store, { ...launch, website: { pages: 6, managed: false } }, at('2026-11-18T06:00:00Z')))
  assert.equal(loadBriefs(store).length, 4)
})

test('a brief saved before the managed choice and the discount still loads, website handed over and no discount', () => {
  const store = memoryStore()
  const old = { id: 'old', savedAt: '2026-11-01T02:00:00.000Z', selection: { identity: true, website: { pages: 7 }, social: null, ads: false, shoots: 0, print: 0 } }
  store.data.set(BRIEFS_KEY, JSON.stringify([old, { ...old, id: 'odd', selection: { ...old.selection, website: { pages: 7, managed: 'yes' } } }]))
  const briefs = loadBriefs(store)
  assert.deepEqual(briefs.map((b) => b.id), ['old'], 'a website with a managed that is not true or false is dropped')
  assert.deepEqual(briefs[0].selection.website, { pages: 7, managed: false })
  assert.equal(briefs[0].selection.firstProject, false)
  // Saving the same brief again after loading it compares managed and the discount too, so it is already saved.
  assert.equal(saveBrief(store, { ...old.selection, website: { pages: 7, managed: false }, firstProject: false }).status, 'already-saved')
  assert.equal(saveBrief(store, { ...old.selection, website: { pages: 7, managed: false }, firstProject: true }, at('2026-11-02T02:00:00Z')).status, 'saved')
})

test('only the newest briefs are kept, and a save at the cap says how many old ones went', () => {
  const store = memoryStore()
  const results = []
  for (let i = 0; i < MAX_BRIEFS + 3; i += 1) results.push(saveBrief(store, { ...launch, print: i % 10, shoots: i % 4 }, at(`2026-11-${String(i + 1).padStart(2, '0')}T02:00:00Z`)))
  const kept = loadBriefs(store)
  assert.equal(kept.length, MAX_BRIEFS)
  assert.equal(kept[0].savedAt.slice(0, 10), `2026-11-${MAX_BRIEFS + 3}`)
  assert.deepEqual(results.map((r) => (r.status === 'saved' ? r.removed : -1)), [...Array(MAX_BRIEFS).fill(0), 1, 1, 1])
})

test('removing a brief says whether the browser kept the change', () => {
  const store = memoryStore()
  const brief = savedBrief(saveBrief(store, launch, at('2026-11-18T02:00:00Z')))
  const readOnly: KeyValueStore = { ...store, setItem: () => { throw new Error('quota') } }
  assert.equal(removeBrief(readOnly, brief.id), false)
  assert.equal(loadBriefs(store).length, 1, 'still there')
  assert.equal(removeBrief(store, brief.id), true)
  assert.equal(loadBriefs(store).length, 0)
})

test('damaged brief records are dropped, not shown', () => {
  const store = memoryStore()
  const good = savedBrief(saveBrief(store, launch, at('2026-11-18T02:00:00Z')))
  const records = JSON.parse(store.data.get(BRIEFS_KEY) ?? '[]')
  store.data.set(BRIEFS_KEY, JSON.stringify([...records, { id: 'bad', savedAt: 'never', selection: launch }, { id: 'worse', savedAt: '2026-11-18T02:00:00Z', selection: { website: 'yes' } }, 'nonsense']))
  assert.deepEqual(loadBriefs(store).map((b) => b.id), [good.id])
  store.data.set(BRIEFS_KEY, 'nope')
  assert.deepEqual(loadBriefs(store), [])
})

test('with storage blocked or missing, nothing throws, nobody is signed in and nothing is saved', () => {
  for (const store of [blockedStore, null]) {
    assert.equal(loadSession(store), null)
    assert.equal(saveSession(store, { firstName: 'Ana', contact: { kind: 'email', value: 'ana@example.com' } }), false)
    assert.doesNotThrow(() => clearSession(store))
    assert.deepEqual(loadBriefs(store), [])
    assert.deepEqual(saveBrief(store, launch, at('2026-11-18T02:00:00Z')), { status: 'not-saved' })
    assert.equal(removeBrief(store, 'any'), false)
  }
})
