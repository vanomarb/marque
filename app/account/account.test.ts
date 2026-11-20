import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { closeAll, loadPage } from '../../tests/harness.ts'
import { ACCOUNT_KEY, BRIEFS_KEY, accountLabel, loadSession, type KeyValueStore } from '../lib/account.ts'
import type { Selection } from '../lib/estimate.ts'

after(closeAll)

const none: Selection = { identity: false, website: null, social: null, ads: false, shoots: 0, print: 0, firstProject: false }
const session = { firstName: 'Ana Reyes', contact: { kind: 'email', value: 'ana@example.com' } }
const briefs = [
  { id: 'b2', savedAt: '2026-11-19T02:00:00.000Z', selection: { ...none, identity: true, website: { pages: 6, managed: true }, firstProject: true } },
  { id: 'b1', savedAt: '2026-11-18T02:00:00.000Z', selection: { ...none, ads: true } },
]

function account(path = 'account/', options: Parameters<typeof loadPage>[2] = {}) {
  const page = loadPage('account/index.html', path, options)
  assert.deepEqual(page.boot(), [], 'starts without errors')
  const error = (id: string) => (page.$(`#${id}-error`).hidden ? null : page.$(`#${id}-error [data-error-text]`).textContent)
  const signedIn = () => page.document.documentElement.hasAttribute('data-signed-in')
  const names = () => page.$$('[data-account-name]').map((el) => el.textContent)
  const submit = (step: 'contact' | 'code') => page.$<HTMLButtonElement>(`[data-signin="${step}"] button[type="submit"]`).click()
  return { page, error, signedIn, names, submit }
}

test('sign in with email: the code shows as a preview, focus goes to its field, the right digits open the briefs', async () => {
  const { page, error, signedIn, names, submit } = account()
  const codeForm = page.$<HTMLFormElement>('[data-signin="code"]')
  assert.equal(codeForm.hidden, true)
  assert.equal(page.$('[data-account-heading]').textContent, 'Sign in to Marque')
  assert.equal(page.$('[data-create-only]').hidden, true, 'signing in asks for an email only')

  submit('contact')
  assert.equal(error('signin-contact'), 'Add your email address.')
  assert.equal(page.document.activeElement?.id, 'signin-contact')

  page.type('#signin-contact', 'ana@example')
  submit('contact')
  assert.equal(error('signin-contact'), 'Use an email address, like name@example.com.')

  page.type('#signin-contact', 'ana@example.com')
  submit('contact')
  assert.equal(page.$('[data-signin-start]').hidden, true, 'Google and the email form step aside')
  assert.equal(codeForm.hidden, false, 'the code step shows')
  assert.equal(page.document.activeElement?.id, 'signin-code', 'focus moves to the code field')
  assert.equal(page.$('[data-code-contact]').textContent, 'a••@example.com')
  assert.match(page.$('[data-signin="code"]').textContent ?? '', /Preview[\s\S]*Emails aren’t sent yet, so your code shows here\./, 'says plainly that nothing is emailed yet')
  const code = page.$('[data-preview-code]').textContent ?? ''
  assert.match(code, /^\d{4}$/)

  page.type('#signin-code', code === '1234' ? '4321' : '1234')
  submit('code')
  assert.equal(error('signin-code'), 'Those digits don’t match. Copy them from the box above.')
  assert.equal(page.$('#signin-code').getAttribute('aria-invalid'), 'true')
  assert.equal(signedIn(), false)

  page.type('#signin-code', code)
  submit('code')
  assert.equal(signedIn(), true)
  assert.equal(page.document.activeElement?.id, 'account-greeting', 'focus goes to the greeting')
  assert.equal(page.$('#account-greeting').textContent, 'Filed under ana@example.com.', 'no name was asked, so the email stands in')
  assert.deepEqual(names(), ['ana@example.com', 'ana@example.com'])
  assert.deepEqual(page.storage(ACCOUNT_KEY), { firstName: null, contact: { kind: 'email', value: 'ana@example.com' } })
  await page.wait()
  assert.equal(page.$('[data-account-status]').textContent, 'Signed in as ana@example.com.')
})

test('create an account: the switch asks for a first name too, and the account is filed under it', async () => {
  const { page, error, signedIn, names, submit } = account()
  const switcher = page.$<HTMLButtonElement>('[data-mode-switch]')
  assert.equal(page.$('[data-mode-row]').hidden, false, 'the switch shows once the script runs')
  assert.equal(switcher.textContent, 'Create an account')
  switcher.click()
  assert.equal(page.$('[data-account-heading]').textContent, 'Create your Marque account')
  assert.equal(page.$('[data-create-only]').hidden, false)
  assert.equal(page.document.activeElement?.id, 'signin-first-name', 'focus on the first new field')
  assert.equal(page.$('[data-email-submit]').textContent, 'Create account with email')
  assert.equal(switcher.textContent, 'Sign in', 'and the way back')
  assert.equal(page.window.location.hash, '#create', 'a link can open this mode')

  submit('contact')
  assert.equal(error('signin-first-name'), 'Add the first name for the file.')
  assert.equal(error('signin-contact'), 'Add your email address.')
  assert.equal(page.document.activeElement?.id, 'signin-first-name')

  page.type('#signin-first-name', 'Ana Reyes')
  page.type('#signin-contact', 'ana@example.com')
  submit('contact')
  assert.equal(page.$('[data-code-submit]').textContent, 'Create account')
  page.type('#signin-code', page.$('[data-preview-code]').textContent ?? '')
  submit('code')
  assert.equal(signedIn(), true)
  assert.equal(page.$('#account-greeting').textContent, 'Filed under Ana Reyes.')
  assert.equal(page.$('[data-account-contact]').textContent, 'Signed in with a••@example.com')
  assert.deepEqual(names(), ['Ana', 'Ana'], 'the bar and the phone menu show the first name')
  assert.deepEqual(page.storage(ACCOUNT_KEY), { firstName: 'Ana Reyes', contact: { kind: 'email', value: 'ana@example.com' } })
  await page.wait()
  assert.equal(page.$('[data-account-status]').textContent, 'Account created. Signed in as Ana.')
})

test('a link to #create opens Create account; Change email goes back to the first step', () => {
  const { page } = account('account/#create')
  assert.equal(page.$('[data-account-heading]').textContent, 'Create your Marque account')
  page.type('#signin-first-name', 'Ben')
  page.type('#signin-contact', 'ben@example.com')
  page.$<HTMLButtonElement>('[data-signin="contact"] button[type="submit"]').click()
  page.$<HTMLButtonElement>('[data-signin-back]').click()
  assert.equal(page.$('[data-signin-start]').hidden, false)
  assert.equal(page.$('[data-signin="code"]').hidden, true)
  assert.equal(page.document.activeElement?.id, 'signin-contact')
})

test('Continue with Google says plainly it isn’t connected yet, and points to email', async () => {
  const { page, signedIn } = account()
  const google = page.$<HTMLButtonElement>('[data-google]')
  assert.equal(google.disabled, false, 'the script turns it on')
  assert.equal(google.textContent, 'Continue with Google', 'Google’s own wording')
  google.click()
  await page.wait()
  assert.equal(page.$('[data-google-status]').textContent, 'Google sign-in isn’t connected yet. Use your email below for now.')
  assert.equal(signedIn(), false, 'and nobody is signed in')
})

test('signed in, the saved briefs are listed with the discount, and one can be removed; signing out keeps them', async () => {
  const { page, signedIn, names } = account('account/', { storage: { [ACCOUNT_KEY]: session, [BRIEFS_KEY]: briefs } })
  assert.equal(signedIn(), true)
  const items = () => page.$$('[data-briefs] > li')
  assert.equal(items().length, 2)
  assert.equal(items()[0].querySelector('h3')!.textContent, 'Brand identity and website')
  assert.deepEqual([...items()[0].querySelectorAll('dd')].map((dd) => dd.textContent), ['$918', '$39', '1 to 3 days'], 'totals and timeline')
  const lines = [...items()[0].querySelectorAll('ul li')].map((li) => li.textContent)
  assert.ok(lines.includes('Managed hosting (subdomain or your domain, SSL, backups, updates)$39 a month'), 'the managed line')
  assert.ok(lines.includes('First-project discount (15% off one-time work)−$162'), 'the discount line')
  assert.equal(page.$('[data-briefs-empty]').hidden, true)

  page.$<HTMLButtonElement>('[data-remove="b2"]').click()
  assert.equal(items().length, 1)
  assert.deepEqual((page.storage(BRIEFS_KEY) as { id: string }[]).map((b) => b.id), ['b1'])
  assert.equal(page.document.activeElement?.id, 'account-title')
  await page.wait()
  assert.equal(page.$('[data-account-status]').textContent, 'Brief removed.')

  page.$<HTMLButtonElement>('[data-signout]').click()
  assert.equal(signedIn(), false)
  assert.deepEqual(names(), ['Sign in', 'Sign in'])
  assert.equal(page.storage(ACCOUNT_KEY), null)
  assert.equal((page.storage(BRIEFS_KEY) as unknown[]).length, 1, 'the brief stays on the device')
  assert.equal(page.document.activeElement?.id, 'signin-contact')
})

test('when the browser won’t let a brief go, it stays listed and the page says so where focus lands', () => {
  const { page } = account('account/', { storage: { [ACCOUNT_KEY]: session, [BRIEFS_KEY]: briefs } })
  page.window.Storage.prototype.setItem = () => {
    throw new page.window.DOMException('Blocked', 'SecurityError')
  }
  page.$<HTMLButtonElement>('[data-remove="b2"]').click()
  assert.equal(page.$$('[data-briefs] > li').length, 2, 'still listed')
  const problem = page.$('#briefs-error')
  assert.equal(problem.hidden, false)
  assert.match(problem.textContent ?? '', /^That brief is still here/)
  assert.equal(page.document.activeElement, problem)
})

const holding = (raw: string | null): KeyValueStore => ({ getItem: () => raw, setItem: () => {}, removeItem: () => {} })

test('the header’s inline script and loadSession agree on every stored record, so no hand-edited record flashes a name', () => {
  const records: [string, string | null][] = [
    ['email', JSON.stringify(session)],
    ['no name', JSON.stringify({ firstName: null, contact: session.contact })],
    ['name left out', JSON.stringify({ contact: session.contact })],
    ['mobile with 0', JSON.stringify({ firstName: 'Ben', contact: { kind: 'mobile', value: '09171234567' } })],
    ['bare mobile', JSON.stringify({ firstName: 'Ben', contact: { kind: 'mobile', value: '9171234567' } })],
    ['+63 mobile', JSON.stringify({ firstName: 'Ben', contact: { kind: 'mobile', value: '+63 917 123 4567' } })],
    ['spaces round the name', JSON.stringify({ firstName: '  Ana  Maria ', contact: session.contact })],
    ['spaces round the email', JSON.stringify({ firstName: null, contact: { kind: 'email', value: ' ana@example.com ' } })],
    ['forty characters', JSON.stringify({ firstName: 'A'.repeat(40), contact: session.contact })],
    ['forty-one characters', JSON.stringify({ firstName: 'A'.repeat(41), contact: session.contact })],
    ['empty name', JSON.stringify({ firstName: '   ', contact: session.contact })],
    ['name not text', JSON.stringify({ firstName: 7, contact: session.contact })],
    ['no contact', JSON.stringify({ firstName: 'Ana' })],
    ['unknown kind', JSON.stringify({ firstName: 'Ana', contact: { kind: 'fax', value: 'ana@example.com' } })],
    ['contact not text', JSON.stringify({ firstName: 'Ana', contact: { kind: 'mobile', value: 9171234567 } })],
    ['empty domain label', JSON.stringify({ firstName: 'Ana', contact: { kind: 'email', value: 'x@y..zz' } })],
    ['not a number', JSON.stringify({ firstName: 'Ana', contact: { kind: 'mobile', value: '0817 123 4567' } })],
    ['broken JSON', '{"firstName":'],
    ['a list', '[]'],
    ['a string', '"Ana"'],
    ['nothing', null],
  ]
  for (const [label, raw] of records) {
    const page = loadPage('account/index.html', 'account/', { storage: raw === null ? {} : { [ACCOUNT_KEY]: raw } })
    const expected = loadSession(holding(raw))
    const html = page.document.documentElement
    assert.equal(html.hasAttribute('data-signed-in'), !!expected, `${label}: signed in only when loadSession accepts it`)
    const shown = expected ? accountLabel(expected) : 'Sign in'
    assert.deepEqual(page.$$('[data-account-name]').map((el) => el.textContent), [shown, shown], `${label}: the name shown`)
    page.close()
  }
})
