import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { closeAll, loadPage } from '../../tests/harness.ts'
import { ACCOUNT_KEY } from '../lib/backend/local-auth.ts'
import { BRIEFS_KEY } from '../lib/backend/local-briefs.ts'
import { MAX_BRIEFS } from '../lib/backend/types.ts'
import { createLocalBackend, type Backend } from '../lib/backend/index.ts'
import { dollars } from '../lib/format.ts'
import { CONTACT_LIMITS as LIMITS } from '../lib/contact.ts'
import { FIRST_PROJECT_LABEL, PAGES, firstProjectPrice, LATE_TEXT, NO_TIMELINE, briefText, type Selection } from '../lib/estimate.ts'

after(closeAll)

const none: Selection = { identity: false, website: null, social: null, ads: false, shoots: 0, print: 0, firstProject: false }
const session = { firstName: 'Ana', email: 'ana@example.com' }

function start(path = 'start/', options: Parameters<typeof loadPage>[2] = {}) {
  const page = loadPage('start/index.html', path, options)
  assert.deepEqual(page.boot(), [], 'starts without errors')
  const totals = (name: string) => page.$$(`[data-total="${name}"]`).map((el) => el.textContent)
  const line = (id: string) => page.$(`[data-line="${id}"]`)
  /** A receipt line's [regular, first-project] prices, or its plain text when it has no discount. */
  const shown = (id: string) => {
    const amount = line(id).querySelector('[data-line-amount]')!
    const was = amount.querySelector('.price-was')
    const now = amount.querySelector('.price-now')
    return was && now ? [was.textContent!.replace('Regular price ', ''), now.textContent!.replace('first-project price ', '')] : amount.textContent
  }
  const regular = () => page.$$('[data-total-regular] [data-figure]').map((el) => el.textContent)
  const savings = () => page.$$('[data-savings-amount]').map((el) => el.textContent)
  return { page, totals, line, shown, regular, savings, status: () => page.$('[data-builder-status]').textContent }
}

test('ticking services adds up the receipt and the phone bar, each one-time line at its regular and first-project price', () => {
  const { page, totals, line, shown, regular, savings } = start()
  assert.deepEqual(totals('oneTime'), ['$0', '$0'])
  assert.equal(totals('days')[0], 'Pick a service')

  page.$<HTMLInputElement>('#pick-identity').click()
  assert.deepEqual(totals('oneTime'), ['$331', '$331'], 'sheet and bar, at the first-project price')
  assert.deepEqual(regular(), ['$390', '$390'], 'the regular total struck beside it, in the sheet and the bar')
  assert.deepEqual(savings(), ['$59'])
  assert.equal(totals('days')[0], '1 to 3 days')
  assert.ok(line('identity').hasAttribute('data-on'))
  assert.deepEqual(shown('identity'), ['$390', '$331'])

  page.$<HTMLInputElement>('#pick-website').click()
  assert.equal(totals('oneTime')[0], '$917')
  assert.deepEqual(shown('identity'), ['$390', '$331'], 'a service keeps its first-project price in any mix')
  assert.deepEqual(shown('website'), ['$690', '$586'])
  assert.equal(page.$('[data-savings]').textContent, 'First project, 15% offYou save $163 on your first project')
  assert.equal(totals('monthly')[0], '$39', 'a website starts managed')
  assert.ok(line('managed').hasAttribute('data-on'))
  assert.equal(shown('managed'), '$39 a month', 'monthly work never shows a discount')

  page.$<HTMLButtonElement>('[data-service="website"] [data-change="1"]').click()
  assert.equal(page.$('[data-count="pages"]').textContent, '7')
  assert.equal(totals('oneTime')[0], '$968')
  assert.equal(line('website').querySelector('[data-line-label]')!.textContent, 'Website, 7 pages')

  page.$<HTMLInputElement>('#pick-identity').click()
  assert.equal(totals('oneTime')[0], '$637', 'unticking takes it off again')
  assert.equal(shown('identity'), 'Not included')
})

test('“My first project with Marque” starts ticked; unticking shows regular prices everywhere, rows included', async () => {
  const { page, totals, shown, regular } = start('start/?set=launch')
  const box = page.$<HTMLInputElement>('#first-project')
  const builder = page.$('[data-builder]')
  assert.ok(box.checked, 'ticked from the start')
  assert.equal(page.$('#first-project').closest('label')!.textContent, 'My first project with Marque')
  assert.ok(builder.hasAttribute('data-first'), 'the service rows show their first-project prices')
  assert.deepEqual([totals('oneTime')[0], totals('monthly')[0]], ['$917', '$39'], 'monthly work is not discounted')
  assert.ok(page.$('[data-total="oneTime"]').classList.contains('price-now'), 'the discounted total in the savings colour')

  box.click()
  assert.deepEqual(totals('oneTime'), ['$1,080', '$1,080'])
  assert.equal(builder.hasAttribute('data-first'), false, 'the rows go back to regular prices')
  assert.deepEqual(shown('identity'), '$390')
  assert.deepEqual(shown('website'), '$690')
  assert.ok(page.$$('[data-savings]').every((el) => el.hidden), 'no savings line')
  assert.ok(page.$$('[data-total-regular]').every((el) => el.hidden), 'nothing struck')
  assert.deepEqual(regular(), ['$1,080', '$1,080'])
  assert.equal(page.$('[data-total="oneTime"]').classList.contains('price-now'), false)
  await page.wait(600)
  assert.equal(page.$('[data-estimate-announce]').textContent, 'Estimate: $1,080 one-time, $39 a month, 1 to 3 days.')
  box.click()
  await page.wait(600)
  assert.equal(page.$('[data-estimate-announce]').textContent, 'Estimate: $917 one-time, $39 a month, 1 to 3 days. You save $163 on your first project.')
})

test('the estimate states the late-day credit next to the timeline, only while something is being built', () => {
  const { page, totals } = start()
  const note = page.$('[data-late-note]')
  assert.equal(note.textContent, LATE_TEXT)
  assert.equal(note.hidden, true, 'nothing picked, nothing to be late with')
  page.$<HTMLInputElement>('#pick-ads').click()
  assert.equal(totals('days')[0], NO_TIMELINE)
  assert.equal(note.hidden, true, 'monthly work has no day 3')
  page.$<HTMLInputElement>('#pick-print').click()
  assert.equal(note.hidden, false, 'one-time work is ready by day 3')
})

test('a website is managed or handed over; changing the choice ticks Website and announces the estimate', async () => {
  const { page, totals, line } = start()
  const choice = (value: string) => page.$<HTMLInputElement>(`input[name="after-launch"][value="${value}"]`)
  const group = choice('managed').closest('fieldset')!
  assert.equal(group.querySelector('legend')!.textContent, 'After launch', 'a visible legend names the group')
  assert.equal(group.getAttribute('aria-describedby'), 'after-launch-desc')
  assert.match(page.$('#after-launch-desc').textContent ?? '', /Managed is \$39 a month/)
  assert.ok(choice('managed').checked, 'managed until the owner says otherwise')

  choice('handover').click()
  assert.ok(page.$<HTMLInputElement>('#pick-website').checked, 'choosing handed over ticks Website')
  assert.equal(totals('oneTime')[0], '$586')
  assert.equal(totals('monthly')[0], '$0', 'no monthly fee')
  assert.equal(line('website').querySelector('[data-line-label]')!.textContent, 'Website, 6 pages, code handed over')
  assert.equal(line('managed').hasAttribute('data-on'), false)
  assert.equal(line('managed').querySelector('[data-line-amount]')!.textContent, 'Not included')
  await page.wait(600)
  assert.equal(page.$('[data-estimate-announce]').textContent, 'Estimate: $586 one-time, $0 a month, 1 to 3 days. You save $104 on your first project.')

  choice('managed').click()
  assert.equal(totals('monthly')[0], '$39')
  assert.equal(line('managed').querySelector('[data-line-label]')!.textContent, 'Managed hosting (subdomain or your domain, backups, updates)')
  await page.wait(600)
  assert.equal(page.$('[data-estimate-announce]').textContent, 'Estimate: $586 one-time, $39 a month, 1 to 3 days. You save $104 on your first project.')
})

test('a handed-over website saves and opens again as handed over', async () => {
  const first = start()
  first.page.$<HTMLInputElement>('input[name="after-launch"][value="handover"]').click()
  first.page.$<HTMLButtonElement>('[data-save-brief]').click()
  await first.page.wait()
  const saved = first.page.storage(BRIEFS_KEY) as { id: string; selection: Selection }[]
  assert.deepEqual(saved[0].selection.website, { pages: 6, managed: false })
  assert.equal(saved[0].selection.firstProject, true, 'the discount is saved with the brief')

  const { page, totals } = start(`start/?brief=${saved[0].id}`, { storage: { [BRIEFS_KEY]: saved } })
  await page.wait(10)
  assert.ok(page.$<HTMLInputElement>('input[name="after-launch"][value="handover"]').checked)
  assert.equal(totals('monthly')[0], '$0')
})

test('a brief saved before the managed choice and the discount opens as it was priced: handed over, no discount', async () => {
  const { firstProject: _, ...older } = none
  const old = [{ id: 'old', savedAt: '2026-11-01T02:00:00.000Z', selection: { ...older, website: { pages: 8 } } }]
  const { page, totals } = start('start/?brief=old', { storage: { [BRIEFS_KEY]: old } })
  await page.wait(10)
  assert.ok(page.$<HTMLInputElement>('#pick-website').checked)
  assert.equal(page.$('[data-count="pages"]').textContent, '8')
  assert.ok(page.$<HTMLInputElement>('input[name="after-launch"][value="handover"]').checked)
  assert.equal(totals('oneTime')[0], '$810')
  assert.equal(totals('monthly')[0], '$0')
  assert.equal(page.$<HTMLInputElement>('#first-project').checked, false)
})

test('Social media starts at one platform and $290 a month; changing an option picks the service', () => {
  const { page, totals, line } = start()
  assert.equal(page.$<HTMLInputElement>('input[name="platforms"]:checked').value, '1')
  page.$<HTMLInputElement>('#pick-social').click()
  assert.equal(totals('monthly')[0], '$290')
  assert.equal(line('social').querySelector('[data-line-label]')!.textContent, 'Social media, 1 platform, 12 posts a month')
  assert.equal(totals('days')[0], NO_TIMELINE, 'monthly work has no build time')

  page.$<HTMLInputElement>('#pick-social').click()
  page.$<HTMLInputElement>('input[name="platforms"][value="2"]').click()
  assert.ok(page.$<HTMLInputElement>('#pick-social').checked, 'choosing two platforms ticks Social media')
  assert.equal(totals('monthly')[0], '$390')
})

test('a link from Home opens the Launch plan already picked, its totals set at once even with motion on', () => {
  const { page, totals } = start('start/?set=launch', { reducedMotion: false })
  assert.ok(page.$<HTMLInputElement>('#pick-identity').checked)
  assert.ok(page.$<HTMLInputElement>('#pick-website').checked)
  assert.equal(page.$('[data-count="pages"]').textContent, '6')
  assert.ok(page.$<HTMLInputElement>('input[name="after-launch"][value="managed"]').checked)
  assert.deepEqual(totals('oneTime'), ['$917', '$917'], 'no count up from $0 on the first render')
  assert.deepEqual(totals('monthly'), ['$39', '$39'])
  assert.equal(totals('days')[0], '1 to 3 days')
})

test('a link from Services opens social media at its advertised price', () => {
  const { page, totals } = start('start/?add=social')
  assert.ok(page.$<HTMLInputElement>('#pick-social').checked)
  assert.equal(totals('monthly')[0], '$290')
})

test('Use this brief puts the priced brief in the message box and moves to the first empty field', () => {
  const { page } = start('start/?set=launch')
  page.$<HTMLButtonElement>('[data-use-brief]').click()
  assert.equal(page.$<HTMLTextAreaElement>('#contact-message').value, briefText({ ...none, identity: true, website: { pages: 6, managed: true }, firstProject: true }))
  assert.equal(page.document.activeElement?.id, 'contact-name')
})

test('Use this brief keeps what the visitor wrote, adds the brief under it, and next time replaces only that brief', async () => {
  const { page, status } = start('start/?set=launch')
  const message = page.$<HTMLTextAreaElement>('#contact-message')
  const brief = (pages: number) => briefText({ ...none, identity: true, website: { pages, managed: true }, firstProject: true })
  page.type('#contact-name', 'Ana Reyes')
  page.type('#contact-message', 'Opening a bakery next month.')
  page.$<HTMLButtonElement>('[data-use-brief]').click()
  assert.equal(message.value, `Opening a bakery next month.\n\n${brief(6)}`)
  await page.wait()
  assert.equal(status(), 'The brief is in the message box below. Add the business name and your email address, then send it.', 'names only the empty fields')
  assert.equal(page.document.activeElement?.id, 'contact-business')

  page.$<HTMLButtonElement>('[data-service="website"] [data-change="1"]').click()
  page.$<HTMLButtonElement>('[data-use-brief]').click()
  assert.equal(message.value, `Opening a bakery next month.\n\n${brief(7)}`, 'the earlier brief swapped for the new one, the visitor’s words kept')

  page.type('#contact-message', `${message.value}\nWe open at 7.`)
  page.type('#contact-business', 'Kape Corner')
  page.type('#contact-email', 'ana@example.com')
  page.$<HTMLButtonElement>('[data-service="website"] [data-change="1"]').click()
  page.$<HTMLButtonElement>('[data-use-brief]').click()
  assert.equal(message.value, `Opening a bakery next month.\n\n${brief(8)}\nWe open at 7.`, 'words after the brief keep their place')
  await page.wait()
  assert.equal(status(), 'The brief is in the message box below, ready to send.')
  assert.equal(page.document.activeElement?.id, 'contact-message')

  const edited = message.value.replace('Brand identity:', 'Brand identity, logo first:')
  page.type('#contact-message', edited)
  page.$<HTMLButtonElement>('[data-use-brief]').click()
  assert.equal(message.value, `${edited}\n\n${brief(8)}`, 'a brief the visitor has written into is theirs: a fresh one goes under it')
})

test('Use this brief clears the “tell us about the project” problem it just answered', () => {
  const { page } = start('start/?set=launch')
  page.$<HTMLButtonElement>('[data-contact] button[type="submit"]').click()
  assert.equal(page.$('#contact-message-error').hidden, false, 'sending an empty form flags the message')
  page.$<HTMLButtonElement>('[data-use-brief]').click()
  assert.equal(page.$('#contact-message-error').hidden, true, 'the box now holds the brief, so the problem is gone')
  assert.equal(page.$('#contact-message').hasAttribute('aria-invalid'), false)
  assert.doesNotMatch(page.$('#contact-message').getAttribute('aria-describedby') ?? '', /contact-message-error/)
})

test('the builder keeps its selection in the address, so signing in from the header comes back to it', () => {
  const first = start('start/?set=launch')
  const { location, history } = first.page.window
  assert.equal(location.search, '?set=launch', 'a link in stays as it came until something changes')
  first.page.$<HTMLButtonElement>('[data-service="photo"] [data-change="1"]').click()
  assert.equal(location.search, '?pick=i.w6.p2.f')
  assert.equal(history.length, 1, 'the address is replaced, so Back still leaves the page')
  const picked = location.search
  const oneTime = first.totals('oneTime')[0]
  for (const id of ['identity', 'website', 'photo']) first.page.$<HTMLInputElement>(`#pick-${id}`).click()
  assert.equal(`${location.pathname}${location.search}`, '/marque/start/', 'nothing picked, a plain address')

  const again = start(`start/${picked}`)
  assert.equal(again.totals('oneTime')[0], oneTime)
  assert.equal(again.page.$('[data-count="shoots"]').textContent, '2')
  assert.ok(again.page.$<HTMLInputElement>('#first-project').checked)
})

test('a link to a brief this browser no longer keeps says so instead of opening an empty builder silently', async () => {
  const { page, status, totals } = start('start/?brief=gone')
  await page.wait()
  assert.equal(status(), 'That brief isn’t in your saved briefs. Sign in with the account that saved it.')
  assert.equal(totals('days')[0], 'Pick a service')
})

test('a ?pick= link the builder can’t read says so and opens empty', async () => {
  for (const pick of ['w13.f', 'p9', 'i.w']) {
    const { page, status, totals } = start(`start/?pick=${pick}`)
    await page.wait()
    assert.equal(status(), 'That link’s picks couldn’t be read, so the builder starts empty.', pick)
    assert.equal(totals('days')[0], 'Pick a service', pick)
  }
  const readable = start('start/?pick=i.f')
  await readable.page.wait()
  assert.equal(readable.status(), '', 'a readable link opens without comment')
})

test('the phone bar shows the one-time total the way every price reads: struck regular, first-project price, then the short label as a pill, on one line', () => {
  const { page } = start('start/?set=launch')
  const bar = page.$('[data-builder-bar]')
  const figures = bar.querySelector('.whitespace-nowrap')!
  const parts = [...figures.children].map((el) => (el.matches('[data-total-regular]') ? 'regular' : el.matches('[data-total="oneTime"]') ? 'total' : el.textContent))
  assert.deepEqual(parts, ['regular', 'total', 'First project'], 'the short form of the offer, after the price')
  assert.equal(bar.querySelector('p')!.textContent!.replace(/\s+/g, ' ').trim(), 'One-time Regular price $1,080 $917 First project')
  page.$<HTMLInputElement>('#first-project').click()
  assert.equal(bar.querySelector('.offer'), null, 'no boxed stamp in the bar, which already has boxes around it')
  assert.ok(bar.querySelector('[data-savings]')!.matches('.offer-pill'), 'the short label is a pill')
  assert.ok(bar.querySelector('a[href="#summary"]')!.matches('.max-sm\\:basis-full'), 'on a phone, See estimate takes its own full-width row at the bottom')
  assert.ok(figures.querySelector<HTMLElement>('[data-savings]')!.hidden && figures.querySelector<HTMLElement>('[data-total-regular]')!.hidden, 'no discount, no label and nothing struck')
})

test('the receipt shows its one-time total like its lines, struck regular first, and carries the offer stamp once', () => {
  const { page } = start('start/?set=launch')
  const summary = page.$('#summary')
  assert.deepEqual([...summary.querySelectorAll('.offer')].map((el) => el.textContent), [FIRST_PROJECT_LABEL])
  const total = summary.querySelector('[data-total="oneTime"]')!
  assert.ok(total.previousElementSibling?.matches('s.price-was[data-total-regular]'), 'the struck regular total sits before the total, inline')
  assert.equal(total.parentElement!.textContent!.replace(/\s+/g, ' ').trim(), 'Regular price $1,080 $917')
  assert.equal(page.$('#builder-title').parentElement!.querySelector('.offer')?.textContent, FIRST_PROJECT_LABEL, 'the service list carries the stamp too')
})

test('each builder row’s name is one label with its checkbox, so tapping anywhere on it ticks the service', () => {
  const { page, totals } = start()
  for (const row of page.$$('[data-service]')) assert.ok(row.querySelector('[data-pick]')!.closest('label'), `${row.dataset.service}: the checkbox sits inside the label`)
  page.$('#pick-identity').closest<HTMLElement>('label')!.click()
  assert.ok(page.$<HTMLInputElement>('#pick-identity').checked)
  assert.equal(totals('oneTime')[0], '$331')
})

test('the contact form asks for an email address a phone keyboard can type, and caps names where the check does', () => {
  const { page } = start()
  const email = page.$<HTMLInputElement>('#contact-email')
  assert.deepEqual([email.name, email.type, email.getAttribute('autocomplete')], ['email', 'email', 'email'])
  assert.ok(page.$('[data-contact] form').hasAttribute('novalidate'), 'the script checks it, so the browser’s own bubbles stay off')
  for (const [id, max] of [['contact-name', LIMITS.name], ['contact-business', LIMITS.business], ['contact-email', LIMITS.email], ['contact-message', LIMITS.message]] as const) {
    assert.equal(page.$(`#${id}`).getAttribute('maxlength'), String(max), `${id}: the box stops where the check does`)
  }
})

test('the website row names the extra-page price a first project pays as well as the regular one', () => {
  const text = start().page.$('#website-desc').textContent!
  assert.ok(text.includes(`${dollars(PAGES.extra)} (${dollars(firstProjectPrice(PAGES.extra))} on your first project)`), text)
})

test('the first-project box is one 44px label with its checkbox, and its description stays beside it', () => {
  const { page } = start()
  const box = page.$<HTMLInputElement>('#first-project')
  const label = box.closest('label')!
  assert.ok(label.classList.contains('min-h-11'), 'a tap anywhere on the label reaches the checkbox')
  assert.ok(label.textContent!.includes('My first project with Marque'))
  label.click()
  assert.equal(box.checked, false)
  assert.equal(box.getAttribute('aria-describedby'), 'first-project-desc')
  assert.ok(page.$('#first-project-desc'))
})

test('Save brief keeps it on this device, says so, and a second press adds no copy', async () => {
  const { page, status } = start()
  page.$<HTMLButtonElement>('[data-save-brief]').click()
  await page.wait()
  assert.equal(status(), 'Pick at least one service first.')

  page.$<HTMLInputElement>('#pick-identity').click()
  page.$<HTMLButtonElement>('[data-save-brief]').click()
  await page.wait()
  assert.equal(status(), 'Brief saved on this device. Sign in to see it under Your briefs.')
  assert.equal((page.storage(BRIEFS_KEY) as unknown[]).length, 1)

  page.$<HTMLButtonElement>('[data-save-brief]').click()
  await page.wait()
  assert.equal(status(), 'Brief already saved on this device. Sign in to see it under Your briefs.')
  assert.equal((page.storage(BRIEFS_KEY) as unknown[]).length, 1, 'still one')
})

test('at the cap, saving says the oldest brief was removed', async () => {
  const briefs = Array.from({ length: MAX_BRIEFS }, (_, i) => ({ id: `b${i}`, savedAt: `2026-11-${String(i + 1).padStart(2, '0')}T02:00:00.000Z`, selection: { ...none, print: (i % 10) + 1 } }))
  const { page, status } = start('start/', { storage: { [ACCOUNT_KEY]: session, [BRIEFS_KEY]: briefs } })
  page.$<HTMLInputElement>('#pick-ads').click()
  page.$<HTMLButtonElement>('[data-save-brief]').click()
  await page.wait()
  assert.equal(status(), `Brief saved to Your briefs. Your briefs keeps the newest ${MAX_BRIEFS}, so the oldest brief was removed.`)
  const kept = page.storage(BRIEFS_KEY) as { id: string }[]
  assert.equal(kept.length, MAX_BRIEFS)
  assert.ok(!kept.some((b) => b.id === 'b0'), 'the oldest went')
})

test('when the browser won’t keep anything, Save brief says so and points to Use this brief', async () => {
  const { page, status } = start()
  page.window.Storage.prototype.setItem = () => {
    throw new page.window.DOMException('Full', 'QuotaExceededError')
  }
  page.$<HTMLInputElement>('#pick-identity').click()
  page.$<HTMLButtonElement>('[data-save-brief]').click()
  await page.wait()
  assert.match(status() ?? '', /can’t be saved here/)
})

test('the contact form writes each problem under its field, focuses the first, and never sends', async () => {
  const { page } = start()
  const submit = page.$<HTMLButtonElement>('[data-contact] button[type="submit"]')
  assert.equal(submit.disabled, false, 'the script turned the form on')
  const error = (id: string) => (page.$(`#${id}-error`).hidden ? null : page.$(`#${id}-error [data-error-text]`).textContent)

  submit.click()
  assert.equal(error('contact-name'), 'Enter your name.')
  assert.equal(error('contact-business'), 'Enter the name of your business.')
  assert.equal(error('contact-email'), 'Enter your email address.')
  assert.equal(error('contact-message'), 'Tell us about the project, or press Use this brief to add your estimate.')
  assert.equal(page.document.activeElement?.id, 'contact-name')
  assert.equal(page.$('#contact-name').getAttribute('aria-invalid'), 'true')
  assert.match(page.$('#contact-name').getAttribute('aria-describedby') ?? '', /contact-name-error/)

  page.type('#contact-name', 'Ana Reyes')
  page.type('#contact-business', 'Kape Corner')
  page.type('#contact-email', 'ana@example..com')
  page.type('#contact-message', 'A new menu and a website before March.')
  submit.click()
  assert.equal(error('contact-name'), null)
  assert.equal(error('contact-email'), 'Enter an email address, like name@example.com.')
  assert.equal(page.document.activeElement?.id, 'contact-email')

  page.type('#contact-email', 'ana@example.com')
  submit.click()
  assert.equal(error('contact-email'), null, 'a full address is fine')
  await page.wait()
  const status = page.$('[data-contact-status]')
  assert.match(status.textContent ?? '', /^Nothing was sent: sending isn’t connected yet\. What you wrote stays in the form on this page\./, 'says plainly that nothing was sent, without calling free text a brief')
  assert.match(status.textContent ?? '', /Save brief/, 'and how to keep the brief')
  assert.doesNotMatch(status.textContent ?? '', /Thanks|in touch/, 'no promise of a reply')
  assert.equal(page.document.activeElement, status)
  assert.equal(page.$<HTMLInputElement>('#contact-name').value, 'Ana Reyes', 'nothing was sent, so what they typed stays')
  assert.equal(page.$('[data-contact-after]').hidden, false, 'and points to Your briefs')
})

/** The local backend with one concern swapped, the way a network adapter will slot in. */
function withContact(send: Backend['contact']['send']): Backend {
  return { ...createLocalBackend(null), contact: { send } }
}

async function sendContact(backend: Backend) {
  const page = loadPage('start/index.html', 'start/')
  assert.deepEqual(page.boot(backend), [])
  page.type('#contact-name', 'Ana Reyes')
  page.type('#contact-business', 'Kape Corner')
  page.type('#contact-email', 'ana@example.com')
  page.type('#contact-message', 'A new menu and a website before March.')
  page.$<HTMLButtonElement>('[data-contact] button[type="submit"]').click()
  await page.wait()
  return page
}

test('a sent brief clears the form and says how the reply comes', async () => {
  const page = await sendContact(withContact(async () => ({ status: 'sent' })))
  assert.equal(page.$('[data-contact-status]').textContent, 'Sent. We reply by email at ana@example.com, usually within a day.')
  assert.equal(page.$<HTMLInputElement>('#contact-name').value, '', 'cleared once it really went')
  assert.equal(page.$('[data-contact-after]').hidden, true)
})

test('a brief that failed to send stays in the form, with the reason', async () => {
  const page = await sendContact(withContact(async () => ({ status: 'failed', message: 'The server didn’t answer.' })))
  assert.equal(page.$('[data-contact-status]').textContent, 'It didn’t send: The server didn’t answer. What you wrote is still in the form, so you can try again in a minute.')
  assert.equal(page.$<HTMLInputElement>('#contact-name').value, 'Ana Reyes')
  assert.equal(page.$<HTMLButtonElement>('[data-contact] button[type="submit"]').disabled, false, 'ready to try again')
})

test('a field the backend rejects is marked like any other problem', async () => {
  const page = await sendContact(withContact(async () => ({ status: 'invalid', errors: { business: 'That business name is already taken.' } })))
  assert.equal(page.$('#contact-business-error [data-error-text]').textContent, 'That business name is already taken.')
  assert.equal(page.document.activeElement?.id, 'contact-business')
})
