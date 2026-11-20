import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { closeAll, loadPage } from '../../tests/harness.ts'
import { ACCOUNT_KEY, BRIEFS_KEY, MAX_BRIEFS } from '../lib/account.ts'
import { briefText, type Selection } from '../lib/estimate.ts'

after(closeAll)

const none: Selection = { identity: false, website: null, social: null, ads: false, shoots: 0, print: 0 }
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
  assert.deepEqual(totals('oneTime'), ['₱0', '₱0'])
  assert.equal(totals('weeks')[0], 'Pick a service')

  page.$<HTMLInputElement>('#pick-identity').click()
  assert.deepEqual(totals('oneTime'), ['₱45,000', '₱45,000'], 'sheet and bar')
  assert.equal(totals('weeks')[0], '4 to 6 weeks')
  assert.ok(line('identity').hasAttribute('data-on'))
  assert.equal(line('identity').querySelector('[data-line-amount]')!.textContent, '₱45,000')

  page.$<HTMLInputElement>('#pick-website').click()
  assert.equal(totals('oneTime')[0], '₱105,000')
  assert.equal(totals('weeks')[0], '7 to 11 weeks')

  page.$<HTMLButtonElement>('[data-service="website"] [data-change="1"]').click()
  assert.equal(page.$('[data-count="pages"]').textContent, '7')
  assert.equal(totals('oneTime')[0], '₱111,000')
  assert.equal(line('website').querySelector('[data-line-label]')!.textContent, 'Website, 7 pages')

  page.$<HTMLInputElement>('#pick-identity').click()
  assert.equal(totals('oneTime')[0], '₱66,000', 'unticking takes it off again')
  assert.equal(line('identity').querySelector('[data-line-amount]')!.textContent, 'Not included')
})

test('Social media starts at one platform and ₱17,000 a month; changing an option picks the service', () => {
  const { page, totals, line } = start()
  assert.equal(page.$<HTMLInputElement>('input[name="platforms"]:checked').value, '1')
  page.$<HTMLInputElement>('#pick-social').click()
  assert.equal(totals('monthly')[0], '₱17,000')
  assert.equal(line('social').querySelector('[data-line-label]')!.textContent, 'Social media, 1 platform, 12 posts a month')
  assert.equal(totals('weeks')[0], 'Starts when you’re ready', 'monthly work has no build time')

  page.$<HTMLInputElement>('#pick-social').click()
  page.$<HTMLInputElement>('input[name="platforms"][value="2"]').click()
  assert.ok(page.$<HTMLInputElement>('#pick-social').checked, 'choosing two platforms ticks Social media')
  assert.equal(totals('monthly')[0], '₱25,000')
})

test('a link from Home opens the launch set already picked, its totals set at once even with motion on', () => {
  const { page, totals } = start('start/?set=launch', { reducedMotion: false })
  assert.ok(page.$<HTMLInputElement>('#pick-identity').checked)
  assert.ok(page.$<HTMLInputElement>('#pick-website').checked)
  assert.equal(page.$('[data-count="pages"]').textContent, '6')
  assert.deepEqual(totals('oneTime'), ['₱105,000', '₱105,000'], 'no count up from ₱0 on the first render')
  assert.equal(totals('weeks')[0], '7 to 11 weeks')
})

test('a link from Services opens social media at its advertised price', () => {
  const { page, totals } = start('start/?add=social')
  assert.ok(page.$<HTMLInputElement>('#pick-social').checked)
  assert.equal(totals('monthly')[0], '₱17,000')
})

test('Use this brief puts the priced brief in the message box and moves to the first empty field', () => {
  const { page } = start('start/?set=launch')
  page.$<HTMLButtonElement>('[data-use-brief]').click()
  assert.equal(page.$<HTMLTextAreaElement>('#contact-message').value, briefText({ ...none, identity: true, website: { pages: 6 } }))
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
  assert.equal(error('contact-reply'), 'Enter an email address or a mobile number.')
  assert.equal(error('contact-message'), 'Tell us about the project, or use the brief from the builder.')
  assert.equal(page.document.activeElement?.id, 'contact-name')
  assert.equal(page.$('#contact-name').getAttribute('aria-invalid'), 'true')
  assert.match(page.$('#contact-name').getAttribute('aria-describedby') ?? '', /contact-name-error/)

  page.type('#contact-name', 'Ana Reyes')
  page.type('#contact-business', 'Kape Mabolo')
  page.type('#contact-reply', 'ana@example..com')
  page.type('#contact-message', 'A new menu and a website before March.')
  submit.click()
  assert.equal(error('contact-name'), null)
  assert.equal(error('contact-reply'), 'Enter an email address or a Philippine mobile number starting with 09.')
  assert.equal(page.document.activeElement?.id, 'contact-reply')

  page.type('#contact-reply', '917 123 4567')
  submit.click()
  assert.equal(error('contact-reply'), null, 'a bare ten-digit mobile number is fine')
  await page.wait()
  const status = page.$('[data-contact-status]')
  assert.match(status.textContent ?? '', /^Thanks, Ana\. This is a demonstration site, so your brief wasn’t sent or saved\./)
  assert.equal(page.document.activeElement, status)
  assert.equal(page.$<HTMLInputElement>('#contact-name').value, '', 'the form is cleared')
  assert.equal(page.$('[data-contact-after]').hidden, false, 'and points to Your briefs')
})
