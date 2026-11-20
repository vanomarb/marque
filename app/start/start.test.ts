import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { closeAll, loadPage } from '../../tests/harness.ts'
import { ACCOUNT_KEY, BRIEFS_KEY, MAX_BRIEFS } from '../lib/account.ts'
import { LATE_TEXT, briefText, type Selection } from '../lib/estimate.ts'

after(closeAll)

const none: Selection = { identity: false, website: null, social: null, ads: false, shoots: 0, print: 0, firstProject: false }
const session = { firstName: 'Ana', contact: { kind: 'email', value: 'ana@example.com' } }

function start(path = 'start/', options: Parameters<typeof loadPage>[2] = {}) {
  const page = loadPage('start/index.html', path, options)
  assert.deepEqual(page.boot(), [], 'starts without errors')
  const totals = (name: string) => page.$$(`[data-total="${name}"]`).map((el) => el.textContent)
  const line = (id: string) => page.$(`[data-line="${id}"]`)
  return { page, totals, line, status: () => page.$('[data-builder-status]').textContent }
}

test('ticking services adds up the sheet and the phone bar, and the timeline follows', () => {
  const { page, totals, line } = start()
  assert.deepEqual(totals('oneTime'), ['$0', '$0'])
  assert.equal(totals('days')[0], 'Pick a service')

  page.$<HTMLInputElement>('#pick-identity').click()
  assert.deepEqual(totals('oneTime'), ['$332', '$332'], 'sheet and bar, at the first-project price')
  assert.equal(totals('days')[0], '1 to 3 days')
  assert.ok(line('identity').hasAttribute('data-on'))
  assert.equal(line('identity').querySelector('[data-line-amount]')!.textContent, '$390', 'each line keeps its regular price')
  assert.equal(line('discount').querySelector('[data-line-amount]')!.textContent, '\u2212$58')

  page.$<HTMLInputElement>('#pick-website').click()
  assert.equal(totals('oneTime')[0], '$918')
  assert.equal(page.$('[data-regular-note]').textContent, 'Regular price $1,080')
  assert.equal(totals('monthly')[0], '$39', 'a website starts managed')
  assert.equal(totals('days')[0], '1 to 3 days')
  assert.ok(line('managed').hasAttribute('data-on'))
  assert.equal(line('managed').querySelector('[data-line-amount]')!.textContent, '$39 a month')

  page.$<HTMLButtonElement>('[data-service="website"] [data-change="1"]').click()
  assert.equal(page.$('[data-count="pages"]').textContent, '7')
  assert.equal(totals('oneTime')[0], '$969')
  assert.equal(line('website').querySelector('[data-line-label]')!.textContent, 'Website, 7 pages')

  page.$<HTMLInputElement>('#pick-identity').click()
  assert.equal(totals('oneTime')[0], '$638', 'unticking takes it off again')
  assert.equal(totals('days')[0], '1 to 3 days')
  assert.equal(line('identity').querySelector('[data-line-amount]')!.textContent, 'Not included')
})

test('“My first project with Marque” starts ticked and takes 15% off the one-time work only; unticking shows the regular price', async () => {
  const { page, totals, line } = start('start/?set=launch')
  const box = page.$<HTMLInputElement>('#first-project')
  assert.ok(box.checked, 'ticked from the start')
  assert.equal(page.$('label[for="first-project"]').textContent, 'My first project with Marque')
  assert.equal(line('discount').querySelector('[data-line-label]')!.textContent, 'First-project discount (15% off one-time work)')
  assert.equal(line('discount').querySelector('[data-line-amount]')!.textContent, '\u2212$162')
  assert.deepEqual([totals('oneTime')[0], totals('monthly')[0]], ['$918', '$39'], 'monthly work is not discounted')

  box.click()
  assert.deepEqual(totals('oneTime'), ['$1,080', '$1,080'])
  assert.equal(line('discount').hasAttribute('data-on'), false)
  assert.equal(line('discount').querySelector('[data-line-amount]')!.textContent, 'Not applied')
  assert.equal(page.$('[data-regular-note]').hidden, true)
  await page.wait(600)
  assert.equal(page.$('[data-estimate-announce]').textContent, 'Estimate: $1,080 one-time, $39 a month, 1 to 3 days.')
  box.click()
  await page.wait(600)
  assert.equal(page.$('[data-estimate-announce]').textContent, 'Estimate: $918 one-time with the first-project discount, $39 a month, 1 to 3 days.')
})

test('the estimate states the late-day credit next to the timeline', () => {
  const { page } = start()
  assert.equal(page.$('[data-late-note]').textContent, LATE_TEXT)
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
  assert.equal(totals('oneTime')[0], '$587')
  assert.equal(totals('monthly')[0], '$0', 'no monthly fee')
  assert.equal(line('website').querySelector('[data-line-label]')!.textContent, 'Website, 6 pages, code handed over')
  assert.equal(line('managed').hasAttribute('data-on'), false)
  assert.equal(line('managed').querySelector('[data-line-amount]')!.textContent, 'Not included')
  await page.wait(600)
  assert.equal(page.$('[data-estimate-announce]').textContent, 'Estimate: $587 one-time with the first-project discount, $0 a month, 1 to 3 days.')

  choice('managed').click()
  assert.equal(totals('monthly')[0], '$39')
  assert.equal(line('managed').querySelector('[data-line-label]')!.textContent, 'Managed hosting (subdomain or your domain, SSL, backups, updates)')
  await page.wait(600)
  assert.equal(page.$('[data-estimate-announce]').textContent, 'Estimate: $587 one-time with the first-project discount, $39 a month, 1 to 3 days.')
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
  assert.ok(page.$<HTMLInputElement>('input[name="after-launch"][value="handover"]').checked)
  assert.equal(totals('monthly')[0], '$0')
})

test('a brief saved before the managed choice and the discount opens as it was priced: handed over, no discount', () => {
  const { firstProject: _, ...older } = none
  const old = [{ id: 'old', savedAt: '2026-11-01T02:00:00.000Z', selection: { ...older, website: { pages: 8 } } }]
  const { page, totals } = start('start/?brief=old', { storage: { [BRIEFS_KEY]: old } })
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
  assert.equal(totals('days')[0], 'Starts when you’re ready', 'monthly work has no build time')

  page.$<HTMLInputElement>('#pick-social').click()
  page.$<HTMLInputElement>('input[name="platforms"][value="2"]').click()
  assert.ok(page.$<HTMLInputElement>('#pick-social').checked, 'choosing two platforms ticks Social media')
  assert.equal(totals('monthly')[0], '$390')
})

test('a link from Home opens the launch set already picked, its totals set at once even with motion on', () => {
  const { page, totals } = start('start/?set=launch', { reducedMotion: false })
  assert.ok(page.$<HTMLInputElement>('#pick-identity').checked)
  assert.ok(page.$<HTMLInputElement>('#pick-website').checked)
  assert.equal(page.$('[data-count="pages"]').textContent, '6')
  assert.ok(page.$<HTMLInputElement>('input[name="after-launch"][value="managed"]').checked)
  assert.deepEqual(totals('oneTime'), ['$918', '$918'], 'no count up from $0 on the first render')
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

test('Save brief keeps it on this device, says so, and a second press adds no copy', async () => {
  const { page, status } = start()
  page.$<HTMLButtonElement>('[data-save-brief]').click()
  await page.wait()
  assert.equal(status(), 'Pick at least one service first.')

  page.$<HTMLInputElement>('#pick-identity').click()
  page.$<HTMLButtonElement>('[data-save-brief]').click()
  await page.wait()
  assert.equal(status(), 'Saved on this device. Sign in to see it under Your briefs.')
  assert.equal((page.storage(BRIEFS_KEY) as unknown[]).length, 1)

  page.$<HTMLButtonElement>('[data-save-brief]').click()
  await page.wait()
  assert.equal(status(), 'Already saved on this device. Sign in to see it under Your briefs.')
  assert.equal((page.storage(BRIEFS_KEY) as unknown[]).length, 1, 'still one')
})

test('at the cap, saving says the oldest brief was removed', async () => {
  const briefs = Array.from({ length: MAX_BRIEFS }, (_, i) => ({ id: `b${i}`, savedAt: `2026-11-${String(i + 1).padStart(2, '0')}T02:00:00.000Z`, selection: { ...none, print: (i % 10) + 1 } }))
  const { page, status } = start('start/', { storage: { [ACCOUNT_KEY]: session, [BRIEFS_KEY]: briefs } })
  page.$<HTMLInputElement>('#pick-ads').click()
  page.$<HTMLButtonElement>('[data-save-brief]').click()
  await page.wait()
  assert.equal(status(), `Saved to Your briefs. Your briefs keeps the newest ${MAX_BRIEFS}, so the oldest brief was removed.`)
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
  assert.equal(error('contact-reply'), 'Enter your email address.')
  assert.equal(error('contact-message'), 'Tell us about the project, or use the brief from the builder.')
  assert.equal(page.document.activeElement?.id, 'contact-name')
  assert.equal(page.$('#contact-name').getAttribute('aria-invalid'), 'true')
  assert.match(page.$('#contact-name').getAttribute('aria-describedby') ?? '', /contact-name-error/)

  page.type('#contact-name', 'Ana Reyes')
  page.type('#contact-business', 'Kape Corner')
  page.type('#contact-reply', 'ana@example..com')
  page.type('#contact-message', 'A new menu and a website before March.')
  submit.click()
  assert.equal(error('contact-name'), null)
  assert.equal(error('contact-reply'), 'Enter an email address, like name@example.com.')
  assert.equal(page.document.activeElement?.id, 'contact-reply')

  page.type('#contact-reply', 'ana@example.com')
  submit.click()
  assert.equal(error('contact-reply'), null, 'a full address is fine')
  await page.wait()
  const status = page.$('[data-contact-status]')
  assert.match(status.textContent ?? '', /sending isn’t connected yet, so it hasn’t gone anywhere/, 'says plainly that nothing was sent')
  assert.match(status.textContent ?? '', /Save brief/, 'and how to keep the brief')
  assert.doesNotMatch(status.textContent ?? '', /Thanks|in touch/, 'no promise of a reply')
  assert.equal(page.document.activeElement, status)
  assert.equal(page.$<HTMLInputElement>('#contact-name').value, 'Ana Reyes', 'nothing was sent, so what they typed stays')
  assert.equal(page.$('[data-contact-after]').hidden, false, 'and points to Your briefs')
})
