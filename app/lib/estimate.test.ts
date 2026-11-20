import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SOCIAL, SERVICES, briefText, briefTitle, estimate, formatWeeks, isSelection, sameSelection, type Selection, type ServiceId } from './estimate.ts'

const none = { identity: false, website: null, social: null, ads: false, shoots: 0, print: 0 }

test('identity alone', () => {
  assert.deepEqual(estimate({ ...none, identity: true }).oneTime, 45000); assert.deepEqual(estimate({ ...none, identity: true }).weeks, [4, 6])
})
test('extra pages cost more', () => { assert.equal(estimate({ ...none, website: { pages: 8 } }).oneTime, 72000) })
test('social scales with platforms and posts', () => {
  assert.equal(estimate({ ...none, social: { platforms: 3, posts: 20 } }).monthly, 43000)
  assert.equal(estimate({ ...none, social: { platforms: 1, posts: 12 } }).monthly, 17000)
})
test('a full launch', () => {
  const e = estimate({ identity: true, website: { pages: 6 }, social: { platforms: 2, posts: 12 }, ads: true, shoots: 1, print: 0 })
  assert.equal(e.oneTime, 123000); assert.equal(e.monthly, 40000); assert.deepEqual(e.weeks, [7, 11])
})
test('monthly-only work has no build timeline', () => { assert.equal(estimate({ ...none, ads: true }).weeks, null) })
test('the brief names services and totals', () => {
  const text = briefText({ ...none, identity: true, ads: true })
  assert.ok(text.includes('Brand identity')); assert.ok(text.includes('₱45,000')); assert.ok(text.includes('₱15,000'))
})

test('nothing picked costs nothing and has no timeline', () => {
  assert.deepEqual(estimate(none), { oneTime: 0, monthly: 0, weeks: null, lines: [] })
})

test('a website under six pages is still the six-page price, and pages stop at twelve', () => {
  assert.equal(estimate({ ...none, website: { pages: 3 } }).oneTime, 60000)
  assert.equal(estimate({ ...none, website: { pages: 12 } }).oneTime, 96000)
  assert.equal(estimate({ ...none, website: { pages: 40 } }).oneTime, 96000)
})

test('the most social work is four platforms and thirty posts', () => {
  assert.equal(estimate({ ...none, social: { platforms: 4, posts: 30 } }).monthly, 25000 + 16000 + 22000)
  assert.equal(estimate({ ...none, social: { platforms: 2, posts: 30 } }).monthly, 47000)
})

test('shoots and print pieces are counted, within their limits', () => {
  assert.equal(estimate({ ...none, shoots: 2 }).oneTime, 36000)
  assert.equal(estimate({ ...none, shoots: 9 }).oneTime, 72000)
  assert.equal(estimate({ ...none, print: 3 }).oneTime, 24000)
  assert.equal(estimate({ ...none, print: 25 }).oneTime, 80000)
  assert.equal(estimate({ ...none, shoots: -2, print: 1.6 }).oneTime, 8000)
})

test('shoots or print alone take one to two weeks; next to build work they fit inside its timeline', () => {
  assert.deepEqual(estimate({ ...none, print: 1 }).weeks, [1, 2])
  assert.deepEqual(estimate({ ...none, shoots: 1, print: 2 }).weeks, [1, 2])
  assert.deepEqual(estimate({ ...none, website: { pages: 6 }, print: 2 }).weeks, [4, 8])
  assert.deepEqual(estimate({ ...none, identity: true, shoots: 1, ads: true }).weeks, [4, 6])
})

test('each line says what it is, what it costs and whether it is one-time or monthly', () => {
  const { lines } = estimate({ identity: true, website: { pages: 8 }, social: { platforms: 3, posts: 20 }, ads: true, shoots: 2, print: 1 })
  assert.deepEqual(lines, [
    { id: 'identity', label: 'Brand identity', amount: 45000, kind: 'one-time' },
    { id: 'website', label: 'Website, 8 pages', amount: 72000, kind: 'one-time' },
    { id: 'photo', label: 'Photo and video, 2 shoots', amount: 36000, kind: 'one-time' },
    { id: 'print', label: 'Menu, signage and print, 1 piece', amount: 8000, kind: 'one-time' },
    { id: 'social', label: 'Social media, 3 platforms, 20 posts a month', amount: 43000, kind: 'monthly' },
    { id: 'ads', label: 'Ads management (ad spend billed separately)', amount: 15000, kind: 'monthly' },
  ])
})

test('the brief reads as a message: each line, then the totals and the timeline', () => {
  const text = briefText({ ...none, identity: true, website: { pages: 6 } })
  assert.match(text, /^Project brief from the Marque builder/)
  assert.ok(text.includes('Brand identity: ₱45,000, one-time'))
  assert.ok(text.includes('Website, 6 pages: ₱60,000, one-time'))
  assert.ok(text.includes('One-time total: ₱105,000'))
  assert.ok(text.includes('Monthly total: ₱0'))
  assert.ok(text.includes('Timeline: 7 to 11 weeks'))
  assert.ok(briefText({ ...none, ads: true }).includes('Timeline: monthly work, no build timeline'))
  assert.equal(briefText(none), 'Project brief from the Marque builder\n\nNo services picked yet.')
})

test('a monthly-only brief leaves out the one-time total, and a one-time brief still shows both totals', () => {
  const monthly = briefText({ ...none, ads: true })
  assert.doesNotMatch(monthly, /One-time total/)
  assert.ok(monthly.includes('Monthly total: ₱15,000'))
  assert.ok(briefText({ ...none, social: { ...DEFAULT_SOCIAL } }).includes('Monthly total: ₱17,000'))
  assert.ok(briefText({ ...none, identity: true, ads: true }).includes('One-time total: ₱45,000'))
})

test('the service list carries the spec’s starting prices, and social starts at its one-platform price', () => {
  const from = Object.fromEntries(SERVICES.map((s) => [s.id, s.from]))
  assert.deepEqual(from, { identity: 45000, website: 60000, social: 17000, ads: 15000, photo: 18000, print: 8000 })
  assert.equal(estimate({ ...none, social: { platforms: 2, posts: 12 } }).monthly, 25000)
})

function singleServiceSelections(): [ServiceId, Selection][] {
  const out: [ServiceId, Selection][] = [['identity', { ...none, identity: true }], ['ads', { ...none, ads: true }]]
  for (let pages = 1; pages <= 12; pages += 1) out.push(['website', { ...none, website: { pages } }])
  for (const platforms of [1, 2, 3, 4] as const) for (const posts of [12, 20, 30] as const) out.push(['social', { ...none, social: { platforms, posts } }])
  for (let shoots = 1; shoots <= 4; shoots += 1) out.push(['photo', { ...none, shoots }])
  for (let print = 1; print <= 10; print += 1) out.push(['print', { ...none, print }])
  return out
}

test('no estimate undercuts the “from” price the site lists for that service, and each “from” is a real minimum', () => {
  const selections = singleServiceSelections()
  for (const service of SERVICES) {
    const totals = selections.filter(([id]) => id === service.id).map(([, s]) => estimate(s).oneTime + estimate(s).monthly)
    assert.ok(totals.length > 0, `${service.id}: has selections`)
    for (const total of totals) assert.ok(total >= service.from, `${service.id}: ${total} is not below from ${service.from}`)
    assert.equal(Math.min(...totals), service.from, `${service.id}: the cheapest option is the listed from price`)
  }
})

test('a stored selection is checked before it is trusted', () => {
  const good: Selection = { identity: true, website: { pages: 7 }, social: { platforms: 2, posts: 20 }, ads: false, shoots: 1, print: 0 }
  assert.ok(isSelection(good))
  assert.ok(isSelection(none))
  for (const bad of [null, 'x', {}, { ...none, website: { pages: 'six' } }, { ...none, social: { platforms: 5, posts: 12 } }, { ...none, social: { platforms: 2, posts: 15 } }, { ...none, shoots: 'a' }, { ...none, identity: 'yes' }]) {
    assert.equal(isSelection(bad), false, JSON.stringify(bad))
  }
})

test('a saved brief gets a short title from what it includes', () => {
  assert.equal(briefTitle({ ...none, identity: true, website: { pages: 6 } }), 'Brand identity and website')
  assert.equal(briefTitle({ ...none, identity: true, website: { pages: 8 }, ads: true }), 'Brand identity, website and ads')
  assert.equal(briefTitle({ ...none, social: { platforms: 2, posts: 12 }, shoots: 1, print: 2 }), 'Photo and video, print and social media')
  assert.equal(briefTitle({ ...none, print: 1 }), 'Print')
  assert.equal(briefTitle(none), 'Empty brief')
})

test('every line of the estimate carries the id of the service it prices, so the sheet never matches on a label', () => {
  const all: Selection = { identity: true, website: { pages: 8 }, social: { platforms: 3, posts: 20 }, ads: true, shoots: 2, print: 3 }
  assert.deepEqual(estimate(all).lines.map((l) => l.id).sort(), ['ads', 'identity', 'photo', 'print', 'social', 'website'])
  for (const [id, selection] of singleServiceSelections()) assert.deepEqual(estimate(selection).lines.map((l) => l.id), [id])
})

test('the default social package is the one the site advertises: one platform, twelve posts, from the listed price', () => {
  assert.deepEqual(DEFAULT_SOCIAL, { platforms: 1, posts: 12 })
  assert.equal(estimate({ ...none, social: DEFAULT_SOCIAL }).monthly, SERVICES.find((s) => s.id === 'social')!.from)
})

test('each service’s listed time is the timeline the builder gives it alone, so the words and the numbers cannot drift', () => {
  const alone: Record<ServiceId, Selection> = {
    identity: { ...none, identity: true },
    website: { ...none, website: { pages: 6 } },
    social: { ...none, social: { ...DEFAULT_SOCIAL } },
    ads: { ...none, ads: true },
    photo: { ...none, shoots: 1 },
    print: { ...none, print: 1 },
  }
  for (const service of SERVICES) {
    const weeks = estimate(alone[service.id]).weeks
    assert.equal(service.time, weeks ? formatWeeks(weeks) : 'Month to month', service.id)
  }
  assert.deepEqual(SERVICES.map((s) => s.time), ['4 to 6 weeks', '4 to 8 weeks', 'Month to month', 'Month to month', '1 to 2 weeks', '1 to 2 weeks'])
  assert.ok(SERVICES.find((s) => s.id === 'social')!.includes.endsWith('2 platforms ₱25,000'), 'the two-platform price comes from the same table')
})

test('two selections are the same when they would price the same brief', () => {
  assert.ok(sameSelection({ ...none, identity: true, website: { pages: 6 } }, { ...none, website: { pages: 6 }, identity: true }))
  assert.ok(!sameSelection({ ...none, website: { pages: 6 } }, { ...none, website: { pages: 7 } }))
  assert.ok(!sameSelection({ ...none, social: { platforms: 1, posts: 12 } }, { ...none, social: { platforms: 1, posts: 20 } }))
  assert.ok(!sameSelection(none, { ...none, ads: true }))
})
