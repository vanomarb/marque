import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { closeAll, loadPage } from '../../tests/harness.ts'
import { ACCOUNT_KEY, BRIEFS_KEY, loadSession, type KeyValueStore } from '../lib/account.ts'
import type { Selection } from '../lib/estimate.ts'

after(closeAll)

const none: Selection = { identity: false, website: null, social: null, ads: false, shoots: 0, print: 0 }
const session = { firstName: 'Ana Reyes', contact: { kind: 'email', value: 'ana@example.com' } }
const briefs = [
  { id: 'b2', savedAt: '2026-11-19T02:00:00.000Z', selection: { ...none, identity: true, website: { pages: 6 } } },
  { id: 'b1', savedAt: '2026-11-18T02:00:00.000Z', selection: { ...none, ads: true } },
]

function account(options: Parameters<typeof loadPage>[2] = {}) {
  const page = loadPage('account/index.html', 'account/', options)
  assert.deepEqual(page.boot(), [], 'starts without errors')
  const error = (id: string) => (page.$(`#${id}-error`).hidden ? null : page.$(`#${id}-error [data-error-text]`).textContent)
  const signedIn = () => page.document.documentElement.hasAttribute('data-signed-in')
  const names = () => page.$$('[data-account-name]').map((el) => el.textContent)
  return { page, error, signedIn, names }
}

test('sign-in: the code is shown, focus goes to its field, the right digits open the file', async () => {
  const { page, error, signedIn, names } = account()
  const contactForm = page.$<HTMLFormElement>('[data-signin="contact"]')
  const codeForm = page.$<HTMLFormElement>('[data-signin="code"]')
  assert.equal(codeForm.hidden, true)

  page.$<HTMLButtonElement>('[data-signin="contact"] button[type="submit"]').click()
  assert.equal(error('signin-first-name'), 'Add the first name for the file.')
  assert.equal(error('signin-contact'), 'Add an email address or a mobile number.')
  assert.equal(page.document.activeElement?.id, 'signin-first-name')

  page.type('#signin-first-name', 'Ana Reyes')
  page.type('#signin-contact', 'ana@example')
  page.$<HTMLButtonElement>('[data-signin="contact"] button[type="submit"]').click()
  assert.equal(error('signin-contact'), 'Use an email address, or a mobile number that starts with 09.')
  assert.equal(page.document.activeElement?.id, 'signin-contact')

  page.type('#signin-contact', 'ana@example.com')
  page.$<HTMLButtonElement>('[data-signin="contact"] button[type="submit"]').click()
  assert.equal(contactForm.hidden, true, 'the first screen goes')
  assert.equal(codeForm.hidden, false, 'the code screen shows')
  assert.equal(page.document.activeElement?.id, 'signin-code', 'focus moves to the code field')
  assert.equal(page.$('[data-code-contact]').textContent, 'a••@example.com')
  const code = page.$('[data-demo-code]').textContent ?? ''
  assert.match(code, /^\d{4}$/)

  page.type('#signin-code', code === '1234' ? '4321' : '1234')
  page.$<HTMLButtonElement>('[data-signin="code"] button[type="submit"]').click()
  assert.equal(error('signin-code'), 'Those digits don’t match. Copy them from the line above.')
  assert.equal(page.$('#signin-code').getAttribute('aria-invalid'), 'true')
  assert.equal(signedIn(), false)

  page.type('#signin-code', code)
  page.$<HTMLButtonElement>('[data-signin="code"] button[type="submit"]').click()
  assert.equal(signedIn(), true)
  assert.equal(page.document.activeElement?.id, 'account-greeting', 'focus goes to the greeting')
  assert.equal(page.$('#account-greeting').textContent, 'Filed under Ana Reyes.')
  assert.equal(page.$('[data-account-contact]').textContent, 'Contact on file: a••@example.com')
  assert.deepEqual(names(), ['Ana', 'Ana'], 'the bar and the phone menu show the first name')
  assert.deepEqual(page.storage(ACCOUNT_KEY), { firstName: 'Ana Reyes', contact: { kind: 'email', value: 'ana@example.com' } })
  await page.wait()
  assert.equal(page.$('[data-account-status]').textContent, 'Signed in as Ana.')
})

test('sign-in: "Change name or contact" goes back to the first screen, and a bare mobile number works', () => {
  const { page } = account()
  page.type('#signin-first-name', 'Ben')
  page.type('#signin-contact', '9171234567')
  page.$<HTMLButtonElement>('[data-signin="contact"] button[type="submit"]').click()
  assert.equal(page.$('[data-code-contact]').textContent, '0917 ••• 4567', 'read as 09…')
  page.$<HTMLButtonElement>('[data-signin-back]').click()
  assert.equal(page.$('[data-signin="contact"]').hidden, false)
  assert.equal(page.$('[data-signin="code"]').hidden, true)
  assert.equal(page.document.activeElement?.id, 'signin-contact')
})

test('signed in, the saved briefs are listed and one can be removed; signing out keeps them', async () => {
  const { page, signedIn, names } = account({ storage: { [ACCOUNT_KEY]: session, [BRIEFS_KEY]: briefs } })
  assert.equal(signedIn(), true)
  const items = () => page.$$('[data-briefs] > li')
  assert.equal(items().length, 2)
  assert.equal(items()[0].querySelector('h3')!.textContent, 'Brand identity and website')
  assert.equal(page.$('[data-briefs-empty]').hidden, true)

  page.$<HTMLButtonElement>('[data-remove="b2"]').click()
  assert.equal(items().length, 1)
  assert.deepEqual((page.storage(BRIEFS_KEY) as { id: string }[]).map((b) => b.id), ['b1'])
  assert.equal(page.document.activeElement?.id, 'briefs-title')
  await page.wait()
  assert.equal(page.$('[data-account-status]').textContent, 'Brief removed.')

  page.$<HTMLButtonElement>('[data-signout]').click()
  assert.equal(signedIn(), false)
  assert.deepEqual(names(), ['Sign in', 'Sign in'])
  assert.equal(page.storage(ACCOUNT_KEY), null)
  assert.equal((page.storage(BRIEFS_KEY) as unknown[]).length, 1, 'the brief stays on the device')
})

test('when the browser won’t let a brief go, it stays listed and the page says so where focus lands', () => {
  const { page } = account({ storage: { [ACCOUNT_KEY]: session, [BRIEFS_KEY]: briefs } })
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
    ['mobile with 0', JSON.stringify({ firstName: 'Ben', contact: { kind: 'mobile', value: '09171234567' } })],
    ['bare mobile', JSON.stringify({ firstName: 'Ben', contact: { kind: 'mobile', value: '9171234567' } })],
    ['+63 mobile', JSON.stringify({ firstName: 'Ben', contact: { kind: 'mobile', value: '+63 917 123 4567' } })],
    ['spaces round the name', JSON.stringify({ firstName: '  Ana  Maria ', contact: session.contact })],
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
    const first = expected ? expected.firstName.split(/\s+/)[0] : 'Sign in'
    assert.deepEqual(page.$$('[data-account-name]').map((el) => el.textContent), [first, first], `${label}: the name shown`)
    page.close()
  }
})
