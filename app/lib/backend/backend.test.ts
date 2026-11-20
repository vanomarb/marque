import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Selection } from '../estimate.ts'
import { MAX_BRIEFS, type AuthBackend, type Backend, type BriefsBackend, type ContactBackend, type NewsletterBackend } from './types.ts'
import { ACCOUNT_KEY, createLocalAuth, readSession } from './local-auth.ts'
import { BRIEFS_KEY, claimBriefs, createLocalBriefs } from './local-briefs.ts'
import { createLocalContact } from './local-contact.ts'
import { createLocalNewsletter } from './local-newsletter.ts'
import { createLocalBackend } from './index.ts'
import type { KeyValueStore } from './storage.ts'

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

/** Briefs saved at the times given, oldest first, by `owner` (signed out when null). */
function briefsAt(store: KeyValueStore | null, times: string[], owner: string | null = null) {
  let i = 0
  return createLocalBriefs(store, { now: () => new Date(times[Math.min(i++, times.length - 1)]), owner: async () => owner })
}

const stored = (store: ReturnType<typeof memoryStore>) => JSON.parse(store.data.get(BRIEFS_KEY) ?? '[]') as { id: string; owner?: string | null }[]

test('the backend is four interfaces, one per concern', () => {
  const backend: Backend = createLocalBackend(null)
  const parts: [AuthBackend, BriefsBackend, ContactBackend, NewsletterBackend] = [backend.auth, backend.briefs, backend.contact, backend.newsletter]
  assert.equal(parts.length, 4)
})

test('the keys are the ones the Privacy and Cookie pages list, and only the local adapters know them', () => {
  assert.equal(ACCOUNT_KEY, 'marque.account')
  assert.equal(BRIEFS_KEY, 'marque.briefs')
})

test('email sign-in: a valid address gets a code, shown as a preview until emails are sent', async () => {
  const auth = createLocalAuth(memoryStore(), { code: () => '4821' })
  assert.deepEqual(await auth.startEmailSignIn('ana@example'), { status: 'invalid', field: 'email', message: 'Enter an email address, like name@example.com.' })
  assert.deepEqual(await auth.startEmailSignIn('  '), { status: 'invalid', field: 'email', message: 'Enter your email address.' })
  assert.deepEqual(await auth.startEmailSignIn('ana@example.com', '  '), { status: 'invalid', field: 'firstName', message: 'Enter your first name so we can file your briefs under it.' })
  assert.deepEqual(await auth.startEmailSignIn(' ana@example.com '), { status: 'sent', email: 'ana@example.com', preview: '4821' })
})

test('email sign-in: only the code just sent signs in, and the session is kept on this device', async () => {
  const store = memoryStore()
  const auth = createLocalAuth(store, { code: () => '4821' })
  assert.deepEqual(await auth.verifyCode('ana@example.com', '4821'), { status: 'expired' }, 'no code was asked for')
  await auth.startEmailSignIn('ana@example.com', 'Ana Reyes')
  assert.deepEqual(await auth.verifyCode('ana@example.com', '1234'), { status: 'wrong-code' })
  assert.deepEqual(await auth.verifyCode('ben@example.com', '4821'), { status: 'expired' }, 'a code belongs to its address')
  const session = { firstName: 'Ana Reyes', email: 'ana@example.com' }
  assert.deepEqual(await auth.verifyCode('ana@example.com', ' 48 21 '), { status: 'signed-in', session, remembered: true })
  assert.deepEqual(await auth.currentSession(), session)
  assert.deepEqual(JSON.parse(store.data.get(ACCOUNT_KEY)!), session)
  assert.deepEqual(await auth.verifyCode('ana@example.com', '4821'), { status: 'expired' }, 'a code works once')
  await auth.signOut()
  assert.equal(await auth.currentSession(), null)
  assert.equal(store.data.has(ACCOUNT_KEY), false)
})

test('signing in with email alone keeps no name', async () => {
  const auth = createLocalAuth(memoryStore(), { code: () => '1000' })
  await auth.startEmailSignIn('ana@example.com')
  const result = await auth.verifyCode('ana@example.com', '1000')
  assert.deepEqual(result, { status: 'signed-in', session: { firstName: null, email: 'ana@example.com' }, remembered: true })
})

test('with storage blocked, sign-in lasts until the page is left, and says so', async () => {
  const auth = createLocalAuth(blockedStore, { code: () => '1000' })
  assert.equal(await auth.currentSession(), null)
  await auth.startEmailSignIn('ana@example.com')
  assert.deepEqual(await auth.verifyCode('ana@example.com', '1000'), { status: 'signed-in', session: { firstName: null, email: 'ana@example.com' }, remembered: false })
  assert.deepEqual(await auth.currentSession(), { firstName: null, email: 'ana@example.com' }, 'held in memory')
  await auth.signOut()
  assert.equal(await auth.currentSession(), null)
})

test('Google sign-in is not connected yet, and says so instead of failing', async () => {
  assert.deepEqual(await createLocalAuth(memoryStore()).startGoogleSignIn(), { status: 'not-connected' })
})

test('a stored session is read with the same rules as the header’s first-paint script, and the old contact shape reads as signed out', () => {
  const store = memoryStore()
  const set = (value: unknown) => store.data.set(ACCOUNT_KEY, JSON.stringify(value))
  set({ firstName: '  Ana  Maria ', email: ' ana@example.com ' })
  assert.deepEqual(readSession(store), { firstName: 'Ana  Maria', email: 'ana@example.com' })
  set({ email: 'ana@example.com' })
  assert.deepEqual(readSession(store), { firstName: null, email: 'ana@example.com' }, 'a missing name is no name')
  for (const bad of [{ firstName: '', email: 'ana@example.com' }, { firstName: 'Ana', contact: { kind: 'email', value: 'ana@example.com' } }, { firstName: 'Ana', contact: { kind: 'mobile', value: '09171234567' } }, { firstName: 'A'.repeat(41), email: 'ana@example.com' }, { email: 7 }, 'Ana', [], null]) {
    set(bad)
    assert.equal(readSession(store), null, JSON.stringify(bad))
  }
  store.data.set(ACCOUNT_KEY, '{not json')
  assert.equal(readSession(store), null)
})

test('briefs come back newest first, and can be removed', async () => {
  const store = memoryStore()
  const briefs = briefsAt(store, ['2026-11-18T02:00:00Z', '2026-11-19T02:00:00Z'])
  const first = await briefs.save(launch)
  const second = await briefs.save({ ...launch, ads: true })
  assert.ok(first.status === 'saved' && second.status === 'saved')
  assert.notEqual(first.brief.id, second.brief.id)
  assert.deepEqual((await briefs.list()).map((b) => b.id), [second.brief.id, first.brief.id])
  assert.equal((await briefs.list())[1].savedAt, '2026-11-18T02:00:00.000Z')
  assert.deepEqual((await briefs.list())[1].selection, launch)
  assert.deepEqual(await briefs.remove(second.brief.id), { status: 'removed' })
  assert.deepEqual((await briefs.list()).map((b) => b.id), [first.brief.id])
})

test('removing a brief that is already gone says so, and changes nothing', async () => {
  const store = memoryStore()
  const briefs = briefsAt(store, ['2026-11-18T02:00:00Z'])
  const saved = await briefs.save(launch)
  assert.ok(saved.status === 'saved')
  const before = store.data.get(BRIEFS_KEY)
  assert.deepEqual(await briefs.remove('nope'), { status: 'not-found' })
  assert.equal(store.data.get(BRIEFS_KEY), before)
  await briefs.remove(saved.brief.id)
  assert.deepEqual(await briefs.remove(saved.brief.id), { status: 'not-found' }, 'a second press')
})

test('saving the same selection as the newest brief adds no copy and says it is already saved', async () => {
  const briefs = briefsAt(memoryStore(), ['2026-11-18T02:00:00Z', '2026-11-18T03:00:00Z', '2026-11-18T04:00:00Z', '2026-11-18T05:00:00Z'])
  const first = await briefs.save(launch)
  const again = await briefs.save({ ...launch, website: { pages: 6, managed: true } })
  assert.ok(first.status === 'saved')
  assert.deepEqual(again, { status: 'already-saved', brief: first.brief })
  assert.equal((await briefs.list()).length, 1)
  // Only the newest brief is compared, so going back to the first selection saves it again.
  await briefs.save({ ...launch, ads: true })
  assert.equal((await briefs.save(launch)).status, 'saved')
  assert.equal((await briefs.list()).length, 3)
})

test('only the newest briefs are kept, and a save at the cap says how many old ones were dropped', async () => {
  const times = Array.from({ length: MAX_BRIEFS + 3 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}T02:00:00Z`)
  const briefs = briefsAt(memoryStore(), times)
  const dropped = []
  for (let i = 0; i < times.length; i += 1) {
    const result = await briefs.save({ ...launch, print: i % 10, shoots: i % 4 })
    dropped.push(result.status === 'saved' ? result.dropped : -1)
  }
  const kept = await briefs.list()
  assert.equal(MAX_BRIEFS, 12)
  assert.equal(kept.length, MAX_BRIEFS)
  assert.equal(kept[0].savedAt.slice(0, 10), `2026-11-${MAX_BRIEFS + 3}`)
  assert.deepEqual(dropped, [...Array(MAX_BRIEFS).fill(0), 1, 1, 1])
})

test('a list never runs past MAX_BRIEFS, even when storage holds more', async () => {
  const store = memoryStore()
  const many = Array.from({ length: 20 }, (_, i) => ({ id: `b${i}`, savedAt: `2026-11-${String(i + 1).padStart(2, '0')}T02:00:00.000Z`, selection: launch }))
  store.data.set(BRIEFS_KEY, JSON.stringify(many))
  const list = await createLocalBriefs(store).list()
  assert.equal(list.length, MAX_BRIEFS)
  assert.equal(list[0].id, 'b19', 'the newest')
})

test('briefs saved before the managed choice and the discount still load, at the prices they were saved with', async () => {
  const store = memoryStore()
  const old = { id: 'old', savedAt: '2026-11-01T02:00:00.000Z', selection: { identity: true, website: { pages: 7 }, social: null, ads: false, shoots: 0, print: 0 } }
  store.data.set(BRIEFS_KEY, JSON.stringify([old, { ...old, id: 'odd', selection: { ...old.selection, website: { pages: 7, managed: 'yes' } } }, { id: 'bad', savedAt: 'never', selection: launch }, 'nonsense']))
  const briefs = createLocalBriefs(store)
  const list = await briefs.list()
  assert.deepEqual(list.map((b) => b.id), ['old'], 'damaged records are dropped, not shown')
  assert.deepEqual(list[0].selection.website, { pages: 7, managed: false })
  assert.equal(list[0].selection.firstProject, false)
  assert.equal((await briefs.save({ ...list[0].selection })).status, 'already-saved', 'compared with managed and the discount')
  store.data.set(BRIEFS_KEY, 'nope')
  assert.deepEqual(await briefs.list(), [])
})

test('a brief dated outside the years a date line can show, or with an owner that is not an address, is dropped', async () => {
  const store = memoryStore()
  const good = { id: 'good', savedAt: '2026-11-01T02:00:00.000Z', selection: launch }
  const bad = [
    { ...good, id: 'year-99', savedAt: '0099-06-01T00:00:00Z' },
    { ...good, id: 'before-1970', savedAt: '1969-12-31T00:00:00Z' },
    { ...good, id: 'year-10000', savedAt: '+010000-01-01T00:00:00Z' },
    { ...good, id: 'no-time', savedAt: '2026-11-01' },
    { ...good, id: 'owner-number', owner: 7 },
  ]
  store.data.set(BRIEFS_KEY, JSON.stringify([good, ...bad]))
  assert.deepEqual((await createLocalBriefs(store).list()).map((b) => b.id), ['good'])
})

test('with storage blocked or missing, briefs never throw: nothing listed, saved or removed', async () => {
  for (const store of [blockedStore, null]) {
    const briefs = createLocalBriefs(store)
    assert.deepEqual(await briefs.list(), [])
    assert.deepEqual(await briefs.save(launch), { status: 'not-saved' })
    assert.deepEqual(await briefs.remove('any'), { status: 'not-found' }, 'nothing kept, so nothing to find')
  }
  const store = memoryStore()
  const briefs = createLocalBriefs(store)
  const saved = await briefs.save(launch)
  assert.ok(saved.status === 'saved')
  const readOnly = createLocalBriefs({ ...store, setItem: () => { throw new Error('quota') } })
  assert.deepEqual(await readOnly.remove(saved.brief.id), { status: 'not-removed' }, 'the browser kept the old list')
  assert.equal((await briefs.list()).length, 1, 'still there')
})

test('each brief is kept under the address that saved it; a person sees their own and those saved signed out', async () => {
  const store = memoryStore()
  const ana = briefsAt(store, ['2026-11-18T02:00:00Z'], 'Ana@Example.com')
  const ben = briefsAt(store, ['2026-11-18T03:00:00Z'], 'ben@example.com')
  const nobody = briefsAt(store, ['2026-11-18T04:00:00Z'])
  const anas = await ana.save(launch)
  const bens = await ben.save({ ...launch, ads: true })
  const loose = await nobody.save({ ...launch, print: 2 })
  assert.ok(anas.status === 'saved' && bens.status === 'saved' && loose.status === 'saved')
  assert.deepEqual(stored(store).map((b) => [b.id, b.owner]), [[loose.brief.id, null], [bens.brief.id, 'ben@example.com'], [anas.brief.id, 'ana@example.com']], 'kept under the address, in small letters')
  assert.deepEqual((await ana.list()).map((b) => b.id), [loose.brief.id, anas.brief.id])
  assert.deepEqual((await ben.list()).map((b) => b.id), [loose.brief.id, bens.brief.id])
  assert.deepEqual((await nobody.list()).map((b) => b.id), [loose.brief.id], 'signed out, only briefs saved signed out')
  assert.deepEqual(await ben.remove(anas.brief.id), { status: 'not-found' }, 'nobody removes another person’s brief')
  assert.equal(stored(store).length, 3)
})

test('the cap and the already-saved check count only the briefs a person can see', async () => {
  const store = memoryStore()
  const times = Array.from({ length: MAX_BRIEFS + 1 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}T02:00:00Z`)
  const ben = briefsAt(store, ['2026-10-01T02:00:00Z'], 'ben@example.com')
  await ben.save(launch)
  const ana = briefsAt(store, times, 'ana@example.com')
  assert.equal((await ana.save(launch)).status, 'saved', 'Ben’s newest brief is not Ana’s')
  for (let i = 1; i < MAX_BRIEFS; i += 1) await ana.save({ ...launch, print: i % 10, shoots: i % 4 })
  const last = await ana.save({ ...launch, ads: true })
  assert.ok(last.status === 'saved')
  assert.equal(last.dropped, 1)
  assert.equal((await ana.list()).length, MAX_BRIEFS)
  assert.equal((await ben.list()).length, 1, 'Ben’s brief stays')
})

test('signing in claims the briefs saved while signed out, and only those', async () => {
  const store = memoryStore()
  store.data.set(BRIEFS_KEY, JSON.stringify([
    { id: 'loose', savedAt: '2026-11-18T02:00:00.000Z', selection: launch },
    { id: 'bens', owner: 'ben@example.com', savedAt: '2026-11-17T02:00:00.000Z', selection: launch },
  ]))
  claimBriefs(store, 'Ana@example.com')
  assert.deepEqual(stored(store).map((b) => [b.id, b.owner]), [['loose', 'ana@example.com'], ['bens', 'ben@example.com']])
})

test('a visitor already signed in when the backend starts gets the unowned briefs at once, before anyone else can', async () => {
  const store = memoryStore()
  store.data.set(ACCOUNT_KEY, JSON.stringify({ firstName: 'Ana', email: 'ana@example.com' }))
  store.data.set(BRIEFS_KEY, JSON.stringify([{ id: 'loose', savedAt: '2026-11-18T02:00:00.000Z', selection: launch }]))
  createLocalBackend(store, { code: () => '1000' })
  assert.deepEqual(stored(store).map((b) => [b.id, b.owner]), [['loose', 'ana@example.com']])
  const signedOut = createLocalBackend(memoryStore())
  assert.deepEqual(await signedOut.briefs.list(), [], 'with nobody signed in there is nothing to claim')
})

test('on a shared browser, the next person to sign in doesn’t see the last person’s briefs', async () => {
  const store = memoryStore()
  const backend = createLocalBackend(store, { code: () => '1000' })
  const signIn = async (email: string) => {
    await backend.auth.startEmailSignIn(email)
    await backend.auth.verifyCode(email, '1000')
  }
  const before = await backend.briefs.save(launch)
  assert.ok(before.status === 'saved')
  await signIn('ana@example.com')
  const during = await backend.briefs.save({ ...launch, ads: true })
  assert.ok(during.status === 'saved')
  assert.deepEqual((await backend.briefs.list()).map((b) => b.id), [during.brief.id, before.brief.id], 'Ana sees what she saved before and after signing in')
  await backend.auth.signOut()
  assert.deepEqual(await backend.briefs.list(), [], 'signed out, Ana’s briefs are hidden')
  await signIn('ben@example.com')
  assert.deepEqual(await backend.briefs.list(), [], 'and Ben never sees them')
  await backend.auth.signOut()
  await signIn('ana@example.com')
  assert.equal((await backend.briefs.list()).length, 2, 'they are still Ana’s')
})

test('the contact message is checked, then reported as not sent: sending is not connected yet', async () => {
  const contact = createLocalContact()
  const message = { name: 'Ana Reyes', business: 'Kape Corner', email: 'ana@example.com', message: 'A new menu and a website before March.' }
  assert.deepEqual(await contact.send(message), { status: 'not-connected' })
  assert.deepEqual(await contact.send({ ...message, email: 'ana@example', name: '' }), { status: 'invalid', errors: { name: 'Enter your name.', email: 'Enter an email address, like name@example.com.' } })
})

test('a newsletter address is checked with the same words as every form, then reported as not kept: sign-up is not connected yet', async () => {
  const newsletter = createLocalNewsletter()
  assert.deepEqual(await newsletter.subscribe(''), { status: 'invalid', message: 'Enter your email address.' })
  assert.deepEqual(await newsletter.subscribe('ana@'), { status: 'invalid', message: 'Enter an email address, like name@example.com.' })
  assert.deepEqual(await newsletter.subscribe('ana@example.com'), { status: 'not-connected' })
})

test('the local backend hands out one adapter per concern, all on the same store', async () => {
  const store = memoryStore()
  const backend: Backend = createLocalBackend(store, { code: () => '1000' })
  assert.deepEqual(Object.keys(backend).sort(), ['auth', 'briefs', 'contact', 'newsletter'])
  await backend.auth.startEmailSignIn('ana@example.com')
  await backend.auth.verifyCode('ana@example.com', '1000')
  await backend.briefs.save(launch)
  assert.deepEqual([...store.data.keys()].sort(), [ACCOUNT_KEY, BRIEFS_KEY])
})
