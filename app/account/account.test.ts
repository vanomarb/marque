import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { closeAll, loadPage, type Page } from '../../tests/harness.ts'
import { EMAIL_MAX, FIRST_NAME_MAX, accountLabel } from '../lib/account.ts'
import { ACCOUNT_KEY, readSession } from '../lib/backend/local-auth.ts'
import { BRIEFS_KEY } from '../lib/backend/local-briefs.ts'
import type { KeyValueStore } from '../lib/backend/storage.ts'
import { FIRST_PROJECT_LABEL, NO_TIMELINE, estimate, savingsText, type Selection } from '../lib/estimate.ts'
import { dollars } from '../lib/format.ts'

after(closeAll)

const none: Selection = { identity: false, website: null, social: null, ads: false, shoots: 0, print: 0, firstProject: false }
const session = { firstName: 'Ana Reyes', email: 'ana@example.com' }
const launch: Selection = { ...none, identity: true, website: { pages: 6, managed: true }, firstProject: true }
const briefs = [
  { id: 'b2', savedAt: '2026-11-19T02:00:00.000Z', selection: launch },
  { id: 'b1', savedAt: '2026-11-18T02:00:00.000Z', selection: { ...none, ads: true } },
]
const SIGNED_OUT_TITLE = 'Sign in or create an account, Marque'

function account(path = 'account/', options: Parameters<typeof loadPage>[2] = {}) {
  const page = loadPage('account/index.html', path, options)
  assert.deepEqual(page.boot(), [], 'starts without errors')
  const error = (id: string) => (page.$(`#${id}-error`).hidden ? null : page.$(`#${id}-error [data-error-text]`).textContent)
  const signedIn = () => page.document.documentElement.hasAttribute('data-signed-in')
  const header = () => ({ name: page.$('[data-account-name]').textContent, emails: page.$$('[data-account-email]').map((el) => el.textContent) })
  /** Presses the step's button and waits for the backend's answer. */
  const submit = (step: 'email' | 'code') => {
    page.$<HTMLButtonElement>(`[data-signin="${step}"] button[type="submit"]`).click()
    return page.wait(10)
  }
  const signInWithCode = async (email: string) => {
    page.type('#signin-email', email)
    await submit('email')
    page.type('#signin-code', page.$('[data-preview-code]').textContent ?? '')
    await submit('code')
  }
  return { page, error, signedIn, header, submit, signInWithCode }
}

/** jsdom can't navigate and won't let location.assign be replaced, so the page's scripts get a window whose location records where it was sent. */
function recordNavigation(page: Page): string[] {
  const went: string[] = []
  const real = page.window.location
  const location = { origin: real.origin, pathname: real.pathname, search: real.search, hash: real.hash, assign: (url: string) => void went.push(url) }
  Object.assign(globalThis, { window: new Proxy(page.window, { get: (target, key) => (key === 'location' ? location : Reflect.get(target, key)) }) })
  return went
}

test('sign in with email: the code shows as a preview, focus goes to its field, the right digits open the briefs', async () => {
  const { page, error, signedIn, header, submit } = account()
  const codeForm = page.$<HTMLFormElement>('[data-signin="code"]')
  assert.equal(codeForm.hidden, true)
  assert.equal(page.$('[data-account-heading]').textContent, 'Sign in to Marque')
  assert.equal(page.$('[data-create-only]').hidden, true, 'signing in asks for an email only')
  assert.equal(page.$<HTMLInputElement>('#signin-email').name, 'email')

  await submit('email')
  assert.equal(error('signin-email'), 'Enter your email address.')
  assert.equal(page.document.activeElement?.id, 'signin-email')

  page.type('#signin-email', 'ana@example')
  await submit('email')
  assert.equal(error('signin-email'), 'Enter an email address, like name@example.com.')

  page.type('#signin-email', 'ana@example.com')
  await submit('email')
  assert.equal(page.$('[data-signin-start]').hidden, true, 'Google and the email form step aside')
  assert.equal(codeForm.hidden, false, 'the code step shows')
  assert.equal(page.document.activeElement?.id, 'signin-code', 'focus moves to the code field')
  assert.equal(page.$('[data-code-email]').textContent, 'a•••@example.com')
  assert.match(page.$('[data-signin="code"]').textContent ?? '', /Preview[\s\S]*Emails aren’t sent yet, so your code shows here\./, 'says plainly that nothing is emailed yet')
  const code = page.$('[data-preview-code]').textContent ?? ''
  assert.match(code, /^\d{4}$/)
  const field = page.$<HTMLInputElement>('#signin-code')
  assert.equal(field.maxLength, 4, 'room for four digits, no more')
  assert.equal(field.getAttribute('pattern'), '\\d{4}')

  page.type('#signin-code', code === '1234' ? '4321' : '1234')
  await submit('code')
  assert.equal(error('signin-code'), 'Those digits don’t match. Copy them from the box above.')
  assert.equal(field.getAttribute('aria-invalid'), 'true')
  assert.equal(signedIn(), false)

  page.type('#signin-code', code)
  await submit('code')
  assert.equal(signedIn(), true)
  assert.equal(page.document.activeElement?.id, 'account-greeting', 'focus goes to the greeting')
  assert.equal(page.$('#account-greeting').textContent, 'Filed under ana@example.com.', 'no name was asked, so the email stands in')
  assert.deepEqual(header(), { name: 'ana', emails: ['ana@example.com', 'ana@example.com'] }, 'the bar shows the part before the @, the full address is in its name and in the menu')
  assert.equal(page.document.title, 'Your briefs, Marque', 'the tab names the view')
  assert.deepEqual(page.storage(ACCOUNT_KEY), { firstName: null, email: 'ana@example.com' })
  await page.wait()
  assert.equal(page.$('[data-account-status]').textContent, 'Signed in as ana@example.com.')
})

test('create an account: the switch asks for a first name too, and the account is filed under it', async () => {
  const { page, error, signedIn, header, submit } = account()
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

  await submit('email')
  assert.equal(error('signin-first-name'), 'Enter your first name so we can file your briefs under it.')
  assert.equal(error('signin-email'), 'Enter your email address.')
  assert.equal(page.document.activeElement?.id, 'signin-first-name')

  page.type('#signin-first-name', 'Ana Reyes')
  page.type('#signin-email', 'ana@example.com')
  await submit('email')
  assert.equal(page.$('[data-code-submit]').textContent, 'Create account')
  page.type('#signin-code', page.$('[data-preview-code]').textContent ?? '')
  await submit('code')
  assert.equal(signedIn(), true)
  assert.equal(page.$('#account-greeting').textContent, 'Filed under Ana Reyes.')
  assert.equal(page.$('[data-signed-in-with]').textContent, 'Signed in with a•••@example.com')
  assert.deepEqual(header(), { name: 'Ana', emails: ['ana@example.com', 'ana@example.com'] }, 'the bar shows the first name')
  assert.deepEqual(page.storage(ACCOUNT_KEY), { firstName: 'Ana Reyes', email: 'ana@example.com' })
  await page.wait()
  assert.equal(page.$('[data-account-status]').textContent, 'Account created. Signed in as Ana.')
})

test('a link to #create opens Create account; Change email goes back to the first step', async () => {
  const { page, submit } = account('account/#create')
  assert.equal(page.$('[data-account-heading]').textContent, 'Create your Marque account')
  page.type('#signin-first-name', 'Ben')
  page.type('#signin-email', 'ben@example.com')
  await submit('email')
  page.$<HTMLButtonElement>('[data-signin-back]').click()
  assert.equal(page.$('[data-signin-start]').hidden, false)
  assert.equal(page.$('[data-signin="code"]').hidden, true)
  assert.equal(page.document.activeElement?.id, 'signin-email')
})

test('Continue with Google says plainly it isn’t connected yet, and points to email', async () => {
  const { page, signedIn } = account()
  const google = page.$<HTMLButtonElement>('[data-google]')
  assert.equal(google.disabled, false, 'the script turns it on')
  assert.equal(google.textContent, 'Continue with Google', 'Google’s own wording')
  google.click()
  await page.wait()
  assert.equal(page.$('[data-google-status]').textContent, 'Google sign-in isn’t connected yet. Use your email above for now.')
  assert.equal(signedIn(), false, 'and nobody is signed in')
})

test('a sign-in that started on another page goes back to it', async () => {
  const { page, signInWithCode } = account('account/?next=%2Fmarque%2Fpricing%2F')
  const went = recordNavigation(page)
  await signInWithCode('ana@example.com')
  assert.deepEqual(went, ['/marque/pricing/'])
})

test('when the browser won’t keep the session, signing in stays on this page and says leaving signs you out', async () => {
  const { page, signedIn, signInWithCode } = account('account/?next=%2Fmarque%2Fpricing%2F')
  const went = recordNavigation(page)
  page.window.Storage.prototype.setItem = () => {
    throw new page.window.DOMException('Blocked', 'SecurityError')
  }
  await signInWithCode('ana@example.com')
  assert.deepEqual(went, [], 'going back would sign out at once')
  assert.equal(signedIn(), true)
  await page.wait()
  assert.equal(page.$('[data-account-status]').textContent, 'Signed in as ana@example.com. This browser isn’t keeping site data, so leaving the page signs you out.')
})

test('signed in, the saved briefs are listed with the discount, and removing one moves focus to the next', async () => {
  const { page, signedIn } = account('account/', { storage: { [ACCOUNT_KEY]: session, [BRIEFS_KEY]: briefs } })
  await page.wait()
  assert.equal(signedIn(), true)
  assert.equal(page.document.title, 'Your briefs, Marque')
  const items = () => page.$$('[data-briefs] > li')
  assert.equal(items().length, 2)
  assert.equal(items()[0].querySelector('h3')!.textContent, 'Brand identity and website')
  const card = items()[0]
  const e = estimate(launch)
  const struck = ({ amount, regular }: { amount: number; regular?: number }) => `Regular price ${dollars(regular ?? amount)} first-project price ${dollars(amount)}`
  const lines = [...card.querySelectorAll('ul li')].map((li) => li.textContent)
  assert.deepEqual(lines, [`Brand identity${struck(e.lines[0])}`, `Website, 6 pages${struck(e.lines[1])}`, `${e.lines[2].label}$39 a month`], 'each one-time line with its regular price struck beside the first-project price')
  assert.equal(card.querySelectorAll('s.price-was').length, 3, 'two lines and the total')
  assert.ok((card.textContent ?? '').includes(`${FIRST_PROJECT_LABEL}${savingsText(e.discount)}`), 'the savings, once')
  assert.deepEqual([...card.querySelectorAll('dd')].map((dd) => dd.textContent), [struck({ amount: e.oneTime, regular: e.oneTimeRegular }), '$39', '1 to 3 days'], 'totals and timeline')
  const plain = items()[1]
  assert.equal(plain.querySelectorAll('s').length, 0, 'a brief without the discount shows regular prices only')
  assert.equal(plain.querySelectorAll('dd')[2].textContent, NO_TIMELINE, 'monthly work, in the builder’s words')
  assert.equal(page.$('[data-briefs-empty]').hidden, true)

  const remove = page.$<HTMLButtonElement>('[data-remove="b2"]')
  remove.click()
  assert.equal(remove.getAttribute('aria-busy'), 'true', 'it can’t be pressed twice while the backend answers')
  await page.wait(10)
  assert.equal(items().length, 1)
  assert.deepEqual((page.storage(BRIEFS_KEY) as { id: string }[]).map((b) => b.id), ['b1'])
  assert.equal(page.document.activeElement, items()[0].querySelector('h3'), 'focus on the next brief’s heading')
  await page.wait()
  assert.equal(page.$('[data-account-status]').textContent, 'Brief removed.')

  page.$<HTMLButtonElement>('[data-remove="b1"]').click()
  await page.wait(10)
  assert.equal(items().length, 0)
  assert.equal(page.document.activeElement?.id, 'saved-title', 'none left, so focus on the list’s heading')
  assert.equal(page.$('[data-briefs-empty]').hidden, false)
})

test('a brief already removed in another tab is removed here too, without an error', async () => {
  const { page } = account('account/', { storage: { [ACCOUNT_KEY]: session, [BRIEFS_KEY]: briefs } })
  await page.wait()
  page.window.localStorage.setItem(BRIEFS_KEY, JSON.stringify(briefs.slice(1)))
  page.$<HTMLButtonElement>('[data-remove="b2"]').click()
  await page.wait(10)
  assert.equal(page.$$('[data-briefs] > li').length, 1)
  assert.equal(page.$('#briefs-error').hidden, true)
  await page.wait()
  assert.equal(page.$('[data-account-status]').textContent, 'Brief removed.')
})

test('signing out keeps the briefs on the device, names the view again and clears what was said before', async () => {
  const { page, signedIn, header } = account('account/', { storage: { [ACCOUNT_KEY]: session, [BRIEFS_KEY]: briefs } })
  await page.wait()
  page.$<HTMLButtonElement>('[data-google]').click()
  await page.wait()
  assert.match(page.$('[data-google-status]').textContent ?? '', /isn’t connected yet/)
  page.$<HTMLButtonElement>('[data-signout]').click()
  await page.wait(10)
  assert.equal(signedIn(), false)
  assert.deepEqual(header(), { name: '', emails: ['', ''] })
  assert.equal(page.document.title, SIGNED_OUT_TITLE)
  assert.equal(page.storage(ACCOUNT_KEY), null)
  assert.equal((page.storage(BRIEFS_KEY) as unknown[]).length, 2, 'the briefs stay on the device')
  assert.equal(page.document.activeElement?.id, 'signin-email')
  await page.wait()
  assert.equal(page.$('[data-account-status]').textContent, 'Signed out. Briefs saved on this device stay here.')
  assert.equal(page.$('[data-google-status]').textContent, '', 'an earlier Google message doesn’t linger')

  page.$<HTMLButtonElement>('[data-google]').click()
  await page.wait()
  assert.equal(page.$('[data-account-status]').textContent, '', 'and the sign-out message clears once Google is pressed')
  assert.match(page.$('[data-google-status]').textContent ?? '', /isn’t connected yet/)
})

test('one brief with a date no calendar can show doesn’t hide the others', async () => {
  const odd = { ...briefs[1], id: 'b0', savedAt: '0099-06-01T00:00:00Z' }
  const { page } = account('account/', { storage: { [ACCOUNT_KEY]: session, [BRIEFS_KEY]: [...briefs, odd] } })
  await page.wait()
  assert.equal(page.$$('[data-briefs] > li').length, 2)
  assert.equal(page.$('[data-briefs-empty]').hidden, true)
})

test('when the browser won’t let a brief go, it stays listed and the page says so where focus lands', async () => {
  const { page } = account('account/', { storage: { [ACCOUNT_KEY]: session, [BRIEFS_KEY]: briefs } })
  await page.wait()
  page.window.Storage.prototype.setItem = () => {
    throw new page.window.DOMException('Blocked', 'SecurityError')
  }
  page.$<HTMLButtonElement>('[data-remove="b2"]').click()
  await page.wait(10)
  assert.equal(page.$$('[data-briefs] > li').length, 2, 'still listed')
  const problem = page.$('#briefs-error')
  assert.equal(problem.hidden, false)
  assert.match(problem.textContent ?? '', /^That brief is still here/)
  assert.equal(page.document.activeElement, problem)
})

test('a single-section page and the menu’s rows carry no margin number', () => {
  const { page } = account()
  assert.equal(page.$$('main .margin-no').length, 0)
  assert.equal(page.$$('#site-menu .margin-no').length, 0)
})

const holding = (raw: string | null): KeyValueStore => ({ getItem: () => raw, setItem: () => {}, removeItem: () => {} })

test('the header’s inline script and readSession agree on every stored record, so no hand-edited record flashes a name', () => {
  const oldShape = (value: unknown) => ({ firstName: 'Ana', contact: { kind: 'email', value } })
  const records: [string, string | null][] = [
    ['email', JSON.stringify(session)],
    ['no name', JSON.stringify({ firstName: null, email: session.email })],
    ['name left out', JSON.stringify({ email: session.email })],
    ['spaces round the name', JSON.stringify({ firstName: '  Ana  Maria ', email: session.email })],
    ['spaces round the email', JSON.stringify({ firstName: null, email: ' ana@example.com ' })],
    ['forty characters', JSON.stringify({ firstName: 'A'.repeat(40), email: session.email })],
    ['forty-one characters', JSON.stringify({ firstName: 'A'.repeat(41), email: session.email })],
    ['empty name', JSON.stringify({ firstName: '   ', email: session.email })],
    ['name not text', JSON.stringify({ firstName: 7, email: session.email })],
    ['no email', JSON.stringify({ firstName: 'Ana' })],
    ['email not text', JSON.stringify({ firstName: 'Ana', email: 7 })],
    ['email null, old contact shape too', JSON.stringify({ ...oldShape('ana@example.com'), email: null })],
    ['empty domain label', JSON.stringify({ firstName: 'Ana', email: 'x@y..zz' })],
    ['old contact shape', JSON.stringify(oldShape('ana@example.com'))],
    ['old contact shape, no name', JSON.stringify({ contact: { kind: 'email', value: ' ana@example.com ' } })],
    ['old mobile contact', JSON.stringify({ firstName: 'Ben', contact: { kind: 'mobile', value: '09171234567' } })],
    ['old unknown kind', JSON.stringify({ firstName: 'Ana', contact: { kind: 'fax', value: 'ana@example.com' } })],
    ['old contact not text', JSON.stringify(oldShape(9171234567))],
    ['old contact a string', JSON.stringify({ firstName: 'Ana', contact: 'ana@example.com' })],
    ['broken JSON', '{"firstName":'],
    ['a list', '[]'],
    ['a string', '"Ana"'],
    ['a number', '7'],
    ['null', 'null'],
    ['nothing', null],
  ]
  for (const [label, raw] of records) {
    const page = loadPage('account/index.html', 'account/', { storage: raw === null ? {} : { [ACCOUNT_KEY]: raw } })
    const expected = readSession(holding(raw))
    const html = page.document.documentElement
    assert.equal(html.hasAttribute('data-signed-in'), !!expected, `${label}: signed in only when readSession accepts it`)
    if (label.startsWith('old contact shape')) assert.equal(expected, null, `${label}: the old stored shape reads as signed out`)
    assert.equal(page.$('[data-account-name]').textContent, expected ? accountLabel(expected) : '', `${label}: the name shown`)
    assert.deepEqual(page.$$('[data-account-email]').map((el) => el.textContent), expected ? [expected.email, expected.email] : ['', ''], `${label}: the address`)
    assert.equal(page.$('[data-account-name]').closest('a')!.getAttribute('title'), expected ? expected.email : null, `${label}: the address on hover`)
    page.close()
  }
})

test('Remove pressed after signing out in another tab shows the sign-in card and does not claim a removal', async () => {
  const { page, signedIn } = account('account/', { storage: { [ACCOUNT_KEY]: session, [BRIEFS_KEY]: briefs.map((b) => ({ ...b, owner: 'ana@example.com' })) } })
  await page.wait()
  page.window.localStorage.removeItem(ACCOUNT_KEY)
  page.$<HTMLButtonElement>('[data-remove="b2"]').click()
  await page.wait(10)
  await page.wait()
  assert.notEqual(page.$('[data-account-status]').textContent, 'Brief removed.')
  assert.equal(JSON.parse(page.window.localStorage.getItem(BRIEFS_KEY) ?? '[]').length, 2, 'both briefs are still stored')
  assert.equal(signedIn(), false)
})

test('the sign-in fields stop at the limits their checks enforce', () => {
  const { page } = account()
  assert.equal(page.$('#signin-first-name').getAttribute('maxlength'), String(FIRST_NAME_MAX))
  assert.equal(page.$('#signin-email').getAttribute('maxlength'), String(EMAIL_MAX))
})

test('the intro offers the email code, and says Google is not connected yet', () => {
  const { page } = account()
  const intro = page.$('main p.text-lead').textContent ?? ''
  assert.match(intro, /use your email and a code\. Google sign-in isn’t connected yet\./)
})
