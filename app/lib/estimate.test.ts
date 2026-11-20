import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DAYS, DEFAULT_SOCIAL, DEFAULT_WEBSITE, FIRST_PROJECT, FIRST_PROJECT_LABEL, PLANS, LATE_CREDIT, LATE_TEXT, MANAGED_LABEL, NO_TIMELINE, PAGES, PRICE, SERVICES, SOCIAL, briefText, briefTitle, estimate, firstProjectPrice, formatDays, fromStored, isSelection, sameSelection, savingsText, type Selection, type ServiceId } from './estimate.ts'

/** Regular prices: the first-project discount is tested on its own below. */
const none: Selection = { identity: false, website: null, social: null, ads: false, shoots: 0, print: 0, firstProject: false }

test('identity alone', () => {
  assert.deepEqual(estimate({ ...none, identity: true }).oneTime, 390); assert.deepEqual(estimate({ ...none, identity: true }).days, [1, 3])
})
test('extra pages cost more', () => { assert.equal(estimate({ ...none, website: { pages: 8, managed: false } }).oneTime, 810) })
test('social scales with platforms and posts', () => {
  assert.equal(estimate({ ...none, social: { platforms: 3, posts: 20 } }).monthly, 610)
  assert.equal(estimate({ ...none, social: { platforms: 1, posts: 12 } }).monthly, 290)
})
test('a full launch', () => {
  const e = estimate({ identity: true, website: { pages: 6, managed: true }, social: { platforms: 2, posts: 12 }, ads: true, shoots: 1, print: 0, firstProject: false })
  assert.equal(e.oneTime, 1370); assert.equal(e.monthly, 39 + 390 + 250); assert.deepEqual(e.days, [1, 3])
})
test('monthly-only work has no build timeline', () => { assert.equal(estimate({ ...none, ads: true }).days, null) })
test('the brief names services and totals', () => {
  const text = briefText({ ...none, identity: true, ads: true })
  assert.ok(text.includes('Brand identity')); assert.ok(text.includes('$390')); assert.ok(text.includes('$250'))
})

test('nothing picked costs nothing and has no timeline', () => {
  assert.deepEqual(estimate(none), { oneTime: 0, oneTimeRegular: 0, monthly: 0, discount: 0, days: null, lines: [] })
  assert.deepEqual(estimate({ ...none, firstProject: true }), { oneTime: 0, oneTimeRegular: 0, monthly: 0, discount: 0, days: null, lines: [] }, 'no discount on nothing')
})

test('the prices are the owner’s, in whole dollars', () => {
  assert.deepEqual(PRICE, { identity: 390, website: 690, managed: 39, ads: 250, shoot: 290, piece: 90 })
  assert.deepEqual(PAGES, { included: 6, max: 12, extra: 60 })
  assert.deepEqual(SOCIAL, { base: 390, perPlatform: 100, posts: { 12: 0, 20: 120, 30: 250 } })
  for (const n of [...Object.values(PRICE), PAGES.extra, SOCIAL.base, SOCIAL.perPlatform, ...Object.values(SOCIAL.posts)]) assert.ok(Number.isInteger(n) && n >= 0, String(n))
})

test('a website under six pages is still the six-page price, and pages stop at twelve', () => {
  assert.equal(estimate({ ...none, website: { pages: 3, managed: false } }).oneTime, 690)
  assert.equal(estimate({ ...none, website: { pages: 12, managed: false } }).oneTime, 1050)
  assert.equal(estimate({ ...none, website: { pages: 40, managed: false } }).oneTime, 1050)
})

test('a managed website adds $39 a month; a handed-over one adds nothing monthly and says so', () => {
  const managed = estimate({ ...none, website: { pages: 6, managed: true } })
  assert.equal(managed.oneTime, 690)
  assert.equal(managed.monthly, 39)
  assert.deepEqual(managed.lines[1], { id: 'managed', label: MANAGED_LABEL, amount: 39, kind: 'monthly' })
  assert.equal(MANAGED_LABEL, 'Managed hosting (subdomain or your domain, backups, updates)')
  const handed = estimate({ ...none, website: { pages: 6, managed: false } })
  assert.equal(handed.oneTime, 690)
  assert.equal(handed.monthly, 0)
  assert.deepEqual(handed.lines, [{ id: 'website', label: 'Website, 6 pages, code handed over', amount: 690, kind: 'one-time' }])
  assert.deepEqual(managed.days, handed.days, 'the choice does not change the build time')
})

test('ticking Website starts at the six pages the base price covers, managed', () => {
  assert.deepEqual(DEFAULT_WEBSITE, { pages: 6, managed: true })
})

test('the most social work is four platforms and thirty posts', () => {
  assert.equal(estimate({ ...none, social: { platforms: 4, posts: 30 } }).monthly, 390 + 200 + 250)
  assert.equal(estimate({ ...none, social: { platforms: 2, posts: 30 } }).monthly, 640)
  assert.equal(estimate({ ...none, social: { platforms: 2, posts: 20 } }).monthly, 510)
})

test('shoots and print pieces are counted, within their limits', () => {
  assert.equal(estimate({ ...none, shoots: 2 }).oneTime, 580)
  assert.equal(estimate({ ...none, shoots: 9 }).oneTime, 1160)
  assert.equal(estimate({ ...none, print: 3 }).oneTime, 270)
  assert.equal(estimate({ ...none, print: 25 }).oneTime, 900)
  assert.equal(estimate({ ...none, shoots: -2, print: 1.6 }).oneTime, 90)
})

test('every one-time service, alone or together, is ready in 1 to 3 days; day 3 is the promise', () => {
  assert.deepEqual(DAYS, [1, 3])
  for (const s of [{ ...none, identity: true }, { ...none, website: { pages: 12, managed: false } }, { ...none, identity: true, website: { pages: 6, managed: true } }, { ...none, print: 1 }, { ...none, shoots: 1, print: 2 }, { ...none, identity: true, website: { pages: 6, managed: true }, shoots: 4, print: 10 }, { ...none, identity: true, shoots: 1, ads: true }]) {
    assert.deepEqual(estimate(s).days, [1, 3], JSON.stringify(s))
  }
  assert.equal(formatDays(DAYS), '1 to 3 days')
})

test('a late delivery takes $5 off for every day after day 3, never more than the price of that service', () => {
  assert.deepEqual(LATE_CREDIT, { perDay: 5 })
  assert.equal(LATE_TEXT, 'Ready by day 3, or $5 off for each day late, up to the price of that service.')
})

test('a first project takes 15% off the one-time work, in whole dollars, and never the monthly work', () => {
  assert.deepEqual(FIRST_PROJECT, { percent: 15 })
  const launch = estimate({ ...none, identity: true, website: { pages: 6, managed: true }, social: { platforms: 1, posts: 12 }, firstProject: true })
  assert.equal(launch.oneTime, 917)
  assert.equal(launch.discount, 163)
  assert.equal(launch.monthly, 39 + 290, 'monthly work at the regular price')
  assert.equal(launch.oneTimeRegular, 1080)
  assert.deepEqual(launch.lines.map((l) => [l.id, l.amount, l.regular]), [['identity', 331, 390], ['website', 586, 690], ['managed', 39, undefined], ['social', 290, undefined]], 'each one-time line carries its regular price; monthly lines none')
  assert.equal(FIRST_PROJECT_LABEL, 'First project, 15% off')
  assert.equal(savingsText(163), 'You save $163 on your first project')
  const monthlyOnly = estimate({ ...none, ads: true, firstProject: true })
  assert.equal(monthlyOnly.discount, 0)
  assert.ok(monthlyOnly.lines.every((l) => l.regular === undefined), 'no first-project price without one-time work')
  assert.ok(estimate({ ...none, identity: true }).lines.every((l) => l.regular === undefined), 'unticked, regular prices only')
})

test('each one-time service saves 15%, rounded up to the dollar in the client’s favour', () => {
  const figures: [string, Selection, number, number][] = [
    ['Brand identity', { ...none, identity: true }, 390, 331],
    ['Website, 6 pages', { ...none, website: { pages: 6, managed: false } }, 690, 586],
    ['Website, 12 pages', { ...none, website: { pages: 12, managed: false } }, 1050, 892],
    ['Photo and video, one shoot', { ...none, shoots: 1 }, 290, 246],
    ['Print design, one piece', { ...none, print: 1 }, 90, 76],
  ]
  for (const [name, selection, regular, first] of figures) {
    assert.equal(firstProjectPrice(regular), first, name)
    const e = estimate({ ...selection, firstProject: true })
    assert.deepEqual([e.oneTimeRegular, e.discount, e.oneTime], [regular, regular - first, first], name)
  }
  const plans = Object.fromEntries(PLANS.map((plan) => [plan.id, estimate(plan.selection)]))
  assert.deepEqual([plans.launch.oneTimeRegular, plans.launch.discount, plans.launch.oneTime], [1080, 163, 917], 'Launch plan: identity plus a six-page site')
  assert.deepEqual([plans.website.oneTimeRegular, plans.website.discount, plans.website.oneTime], [690, 104, 586], 'Website plan')
  assert.equal(plans.grow.monthly, 540, 'Grow: monthly, never discounted')
  assert.equal(firstProjectPrice(1000), 850, 'an exact 15% has nothing to round')
})

test('shoots and print pieces save per unit, so a line is always the units times the price every listing shows', () => {
  for (let shoots = 1; shoots <= 4; shoots += 1) {
    const e = estimate({ ...none, shoots, firstProject: true })
    assert.deepEqual([e.oneTimeRegular, e.discount, e.oneTime], [shoots * 290, shoots * 44, shoots * 246], `${shoots} shoots`)
  }
  for (let print = 1; print <= 10; print += 1) {
    const e = estimate({ ...none, print, firstProject: true })
    assert.deepEqual([e.oneTimeRegular, e.discount, e.oneTime], [print * 90, print * 14, print * 76], `${print} pieces`)
  }
  for (let pages = 6; pages <= 12; pages += 1) {
    assert.equal(estimate({ ...none, website: { pages, managed: false }, firstProject: true }).oneTime, 586 + (pages - 6) * 51, `${pages} pages: each page past six saves $9`)
  }
})

test('a service has one first-project price, alone or in any mix, and the totals are the sums of the lines', () => {
  const alone = singleServiceSelections().filter(([, s]) => estimate(s).oneTimeRegular > 0)
  const priceAlone = (s: Selection) => estimate({ ...s, firstProject: true }).lines.find((l) => l.kind === 'one-time')!
  for (const [id, s] of alone) {
    for (const [otherId, other] of alone) {
      if (otherId === id) continue
      const mix: Selection = { ...s, ...Object.fromEntries(Object.entries(other).filter(([key, value]) => value && key !== 'firstProject')), firstProject: true }
      const e = estimate(mix)
      const line = e.lines.find((l) => l.id === id)!
      assert.equal(line.amount, priceAlone(s).amount, `${id} with ${otherId}: the price it has alone`)
      const oneTime = e.lines.filter((l) => l.kind === 'one-time')
      assert.equal(e.oneTime, oneTime.reduce((total, l) => total + l.amount, 0), `${id} with ${otherId}: the total is the sum of the lines`)
      assert.equal(e.discount, oneTime.reduce((total, l) => total + l.regular! - l.amount, 0), `${id} with ${otherId}: You save is the sum of the savings`)
    }
  }
})

test('the plans are real mixes, priced by the estimate: Launch, Website and Grow', () => {
  const priced = Object.fromEntries(PLANS.map((plan) => {
    const e = estimate(plan.selection)
    return [plan.id, [e.oneTimeRegular, e.oneTime, e.monthly]]
  }))
  assert.deepEqual(priced, { launch: [1080, 917, 39], website: [690, 586, 39], grow: [0, 0, 540] })
  assert.ok(PLANS.every((plan) => plan.selection.firstProject), 'they open with the first-project box ticked')
})

test('each line says what it is, what it costs and whether it is one-time or monthly', () => {
  const { lines } = estimate({ identity: true, website: { pages: 8, managed: true }, social: { platforms: 3, posts: 20 }, ads: true, shoots: 2, print: 1, firstProject: true })
  assert.deepEqual(lines, [
    { id: 'identity', label: 'Brand identity', amount: 331, regular: 390, kind: 'one-time' },
    { id: 'website', label: 'Website, 8 pages', amount: 688, regular: 810, kind: 'one-time' },
    { id: 'managed', label: 'Managed hosting (subdomain or your domain, backups, updates)', amount: 39, kind: 'monthly' },
    { id: 'photo', label: 'Photo and video, 2 shoots', amount: 492, regular: 580, kind: 'one-time' },
    { id: 'print', label: 'Menu, signage and print, 1 piece', amount: 76, regular: 90, kind: 'one-time' },
    { id: 'social', label: 'Social media, 3 platforms, 20 posts a month', amount: 610, kind: 'monthly' },
    { id: 'ads', label: 'Ads management', note: 'ad spend billed separately', amount: 250, kind: 'monthly' },
  ])
})

test('the brief reads as a message: each line, then the totals and the timeline', () => {
  const text = briefText({ ...none, identity: true, website: { pages: 6, managed: true } })
  assert.match(text, /^Project brief from the Marque builder/)
  assert.ok(text.includes('Brand identity: $390, one-time'))
  assert.ok(text.includes('Website, 6 pages: $690, one-time'))
  assert.ok(text.includes('Managed hosting (subdomain or your domain, backups, updates): $39, a month'))
  assert.ok(text.includes('One-time total: $1,080'))
  assert.ok(text.includes('Monthly total: $39'))
  assert.ok(text.includes('Timeline: 1 to 3 days'))
  assert.ok(text.includes(LATE_TEXT), 'the late-day credit')
  assert.ok(text.includes('The website’s days start once the text and photos are in.'))
  const first = briefText({ ...none, identity: true, website: { pages: 6, managed: true }, firstProject: true })
  assert.ok(first.includes('Brand identity: $331, one-time (regular price $390)'))
  assert.ok(first.includes('Website, 6 pages: $586, one-time (regular price $690)'))
  assert.ok(first.includes('First project, 15% off. You save $163 on your first project'), 'the offer and the savings, in the words the receipt uses')
  assert.ok(first.includes('One-time total: $917 (regular price $1,080)'))
  assert.ok(briefText({ ...none, ads: true }).includes('Ads management (ad spend billed separately): $250, a month'), 'the brief keeps the ad spend note')
  assert.doesNotMatch(briefText({ ...none, ads: true }), /Ready by day/, 'no late-day credit on monthly work')
  const handed = briefText({ ...none, identity: true, website: { pages: 6, managed: false } })
  assert.ok(handed.includes('Website, 6 pages, code handed over: $690, one-time'))
  assert.ok(handed.includes('Monthly total: $0'))
  assert.doesNotMatch(handed, /Managed hosting/)
  assert.ok(briefText({ ...none, ads: true }).includes(`Timeline: ${NO_TIMELINE}`))
  assert.equal(briefText(none), 'Project brief from the Marque builder\n\nNo services picked yet.')
})

test('a monthly-only brief leaves out the one-time total, and a one-time brief still shows both totals', () => {
  const monthly = briefText({ ...none, ads: true })
  assert.doesNotMatch(monthly, /One-time total/)
  assert.ok(monthly.includes('Monthly total: $250'))
  assert.ok(briefText({ ...none, social: { ...DEFAULT_SOCIAL } }).includes('Monthly total: $290'))
  assert.ok(briefText({ ...none, identity: true, ads: true }).includes('One-time total: $390'))
})

test('the service list carries the spec’s starting prices, and social starts at its one-platform price', () => {
  const from = Object.fromEntries(SERVICES.map((s) => [s.id, s.from]))
  assert.deepEqual(from, { identity: 390, website: 690, social: 290, ads: 250, photo: 290, print: 90 })
  assert.equal(estimate({ ...none, social: { platforms: 2, posts: 12 } }).monthly, 390)
})

function singleServiceSelections(): [ServiceId, Selection][] {
  const out: [ServiceId, Selection][] = [['identity', { ...none, identity: true }], ['ads', { ...none, ads: true }]]
  for (let pages = 1; pages <= 12; pages += 1) for (const managed of [true, false]) out.push(['website', { ...none, website: { pages, managed } }])
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
  const good: Selection = { identity: true, website: { pages: 7, managed: true }, social: { platforms: 2, posts: 20 }, ads: false, shoots: 1, print: 0, firstProject: true }
  assert.ok(isSelection(good))
  assert.ok(isSelection(none))
  assert.ok(isSelection({ ...good, website: { pages: 7, managed: false } }))
  for (const bad of [null, 'x', {}, { ...none, website: { pages: 'six' } }, { ...none, website: { pages: 6, managed: 'yes' } }, { ...none, website: { pages: 13, managed: true } }, { ...none, social: { platforms: 5, posts: 12 } }, { ...none, social: { platforms: 2, posts: 15 } }, { ...none, social: { platforms: 2, posts: '12' } }, { ...none, social: { platforms: 0, posts: 12 } }, { ...none, shoots: 'a' }, { ...none, identity: 'yes' }, { ...none, firstProject: 'yes' }]) {
    assert.equal(isSelection(bad), false, JSON.stringify(bad))
  }
})

test('a brief saved before the managed choice and the discount still loads, at the prices it was saved with', () => {
  const { firstProject: _, ...older } = none
  const old = { ...older, identity: true, website: { pages: 8 } }
  assert.ok(isSelection(old), 'a website without managed is accepted')
  const selection = fromStored(old)
  assert.deepEqual(selection.website, { pages: 8, managed: false })
  assert.equal(estimate(selection).monthly, 0)
  assert.equal(selection.firstProject, false, 'no first-project flag reads as no discount')
  assert.ok(briefText(selection).includes('Website, 8 pages, code handed over: $810, one-time'))
  assert.equal(estimate(selection).oneTime, 390 + 810)
  assert.deepEqual(fromStored({ ...none, website: { pages: 6, managed: true } }).website, { pages: 6, managed: true })
  assert.deepEqual(fromStored(none), none)
})

test('a saved brief gets a short title from what it includes', () => {
  assert.equal(briefTitle({ ...none, identity: true, website: { pages: 6, managed: true } }), 'Brand identity and website')
  assert.equal(briefTitle({ ...none, identity: true, website: { pages: 8, managed: false }, ads: true }), 'Brand identity, website and ads')
  assert.equal(briefTitle({ ...none, social: { platforms: 2, posts: 12 }, shoots: 1, print: 2 }), 'Photo and video, print and social media')
  assert.equal(briefTitle({ ...none, print: 1 }), 'Print')
  assert.equal(briefTitle(none), 'Empty brief')
})

test('every line of the estimate carries the id of what it prices, so the sheet never matches on a label', () => {
  const all: Selection = { identity: true, website: { pages: 8, managed: true }, social: { platforms: 3, posts: 20 }, ads: true, shoots: 2, print: 3, firstProject: true }
  assert.deepEqual(estimate(all).lines.map((l) => l.id).sort(), ['ads', 'identity', 'managed', 'photo', 'print', 'social', 'website'])
  for (const [id, selection] of singleServiceSelections()) {
    assert.deepEqual(estimate(selection).lines.map((l) => l.id), selection.website?.managed ? ['website', 'managed'] : [id])
  }
})

test('the default social package is the one the site advertises: one platform, twelve posts, from the listed price', () => {
  assert.deepEqual(DEFAULT_SOCIAL, { platforms: 1, posts: 12 })
  assert.equal(estimate({ ...none, social: DEFAULT_SOCIAL }).monthly, SERVICES.find((s) => s.id === 'social')!.from)
})

test('each service’s listed time is the timeline the builder gives it alone, so the words and the numbers cannot drift', () => {
  const alone: Record<ServiceId, Selection> = {
    identity: { ...none, identity: true },
    website: { ...none, website: { ...DEFAULT_WEBSITE } },
    social: { ...none, social: { ...DEFAULT_SOCIAL } },
    ads: { ...none, ads: true },
    photo: { ...none, shoots: 1 },
    print: { ...none, print: 1 },
  }
  for (const service of SERVICES) {
    const days = estimate(alone[service.id]).days
    assert.equal(service.time, days ? formatDays(days) : 'Month to month', service.id)
  }
  assert.deepEqual(SERVICES.map((s) => s.time), ['1 to 3 days', '1 to 3 days', 'Month to month', 'Month to month', '1 to 3 days', '1 to 3 days'])
  assert.ok(SERVICES.find((s) => s.id === 'social')!.includes.endsWith('2 platforms $390'), 'the two-platform price comes from the same table')
})

test('monthly-only work has one wording for its missing timeline, and ads say who pays the ad spend', () => {
  assert.equal(NO_TIMELINE, 'Monthly work, no build timeline')
  assert.equal(formatDays(null), NO_TIMELINE)
  assert.equal(SERVICES.find((s) => s.id === 'ads')!.includes, 'Set up, run and reported monthly. Ad spend is billed separately.')
})

test('two selections are the same when they would price the same brief', () => {
  assert.ok(sameSelection({ ...none, identity: true, website: { pages: 6, managed: true } }, { ...none, website: { managed: true, pages: 6 }, identity: true }))
  assert.ok(!sameSelection({ ...none, website: { pages: 6, managed: true } }, { ...none, website: { pages: 7, managed: true } }))
  assert.ok(!sameSelection({ ...none, website: { pages: 6, managed: true } }, { ...none, website: { pages: 6, managed: false } }), 'managed or handed over')
  assert.ok(!sameSelection({ ...none, social: { platforms: 1, posts: 12 } }, { ...none, social: { platforms: 1, posts: 20 } }))
  assert.ok(!sameSelection(none, { ...none, ads: true }))
  assert.ok(!sameSelection({ ...none, identity: true }, { ...none, identity: true, firstProject: true }), 'with or without the discount')
})
