import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { closeAll, loadPage } from '../../tests/harness.ts'
import { createLocalBackend, type Backend } from '../lib/backend/index.ts'

after(closeAll)

function page(file = 'works/index.html', path = 'works/', options: Parameters<typeof loadPage>[2] = {}) {
  const p = loadPage(file, path, options)
  assert.deepEqual(p.boot(), [], 'starts without errors')
  const button = p.$<HTMLButtonElement>('[data-menu-button]')
  const menu = p.$<HTMLDialogElement>('#site-menu')
  const openMenu = () => {
    button.click()
    assert.equal(menu.open, true, 'the menu opens')
  }
  return { p, button, menu, openMenu }
}

test('the phone menu opens as a dialog from the Menu button, with focus on Close, and Escape closes it', () => {
  const { p, button, menu, openMenu } = page()
  assert.equal(button.getAttribute('aria-controls'), 'site-menu')
  assert.equal(button.getAttribute('aria-label'), 'Menu', 'an icon button, named for screen readers')
  assert.equal(button.textContent, '', 'no visible text, only the list icon')
  assert.ok(button.querySelector('[data-icon="list"]'), 'the list icon, inlined as decorative SVG at build time')
  assert.equal(menu.open, false, 'closed until asked')
  button.focus()
  openMenu()
  assert.equal(button.getAttribute('aria-expanded'), 'true')
  const close = p.$('[data-menu-close]')
  assert.equal(p.document.activeElement, close, 'focus moves in, to Close, where Menu was')
  assert.equal(close.getAttribute('aria-label'), 'Close menu')

  p.key('Escape')
  assert.equal(menu.open, false, 'Escape closes it')
  assert.equal(button.getAttribute('aria-expanded'), 'false')
  assert.equal(p.document.activeElement, button, 'focus returns to Menu')
  assert.equal(button.getAttribute('aria-label'), 'Menu', 'its name never changes')
})

test('the menu lists the pages as rows in the bar’s order, without numbers, and marks the one you are on', () => {
  const { p } = page()
  const rows = p.$$<HTMLAnchorElement>('#site-menu .menu-row')
  assert.deepEqual(
    rows.map((row) => [row.querySelector('.menu-name .link-quiet')!.textContent, row.getAttribute('href')]),
    [
      ['Works', '/marque/works/'],
      ['Services', '/marque/services/'],
      ['Pricing', '/marque/pricing/'],
      ['Studio', '/marque/studio/'],
      ['Sign in', '/marque/account/'],
    ],
  )
  assert.equal(p.$$('#site-menu .margin-no').length, 0, 'nav rows aren’t a sequence, so they carry no number')
  assert.equal(p.$<HTMLAnchorElement>('#site-menu a[data-page="start"]').textContent, 'Start a project', 'the project CTA lives in the menu sheet')
  assert.equal(rows[0].getAttribute('aria-current'), 'page', 'Works is current on the Works page')
  assert.ok(rows.slice(1).every((row) => !row.hasAttribute('aria-current')))
})

test('a tap on the scrim, the Close button or a row closes the menu, each time handing focus back', () => {
  const { p, button, menu, openMenu } = page()
  const closedBy = (what: string, act: () => void) => {
    openMenu()
    act()
    assert.equal(menu.open, false, `${what} closes it`)
    assert.equal(button.getAttribute('aria-expanded'), 'false', `${what}: aria-expanded`)
    assert.equal(p.document.activeElement, button, `${what}: focus back on Menu`)
  }
  // A click on the dialog element itself is a click on the scrim.
  closedBy('the scrim', () => menu.dispatchEvent(new p.window.MouseEvent('click', { bubbles: true })))
  closedBy('Close', () => p.$<HTMLButtonElement>('[data-menu-close]').click())
  closedBy('a row', () => p.$<HTMLAnchorElement>('#site-menu a[href="/marque/services/"]').click())

  openMenu()
  p.$('[data-menu-panel] .ruler').dispatchEvent(new p.window.MouseEvent('click', { bubbles: true }))
  assert.equal(menu.open, true, 'a tap inside the panel, between links, leaves it open')
  p.key('Escape')
})

test('growing past the desktop breakpoint closes the menu', () => {
  const { p, menu, openMenu } = page()
  openMenu()
  p.resize(true)
  assert.equal(menu.open, false)
})

test('every page starts its features without an error', () => {
  const pages: [string, string][] = [
    ['index.html', ''],
    ['works/index.html', 'works/'],
    ['pricing/index.html', 'pricing/'],
    ['works/usual/index.html', 'works/usual/'],
    ['works/bayline/index.html', 'works/bayline/'],
    ['works/enamel/index.html', 'works/enamel/'],
    ['services/index.html', 'services/'],
    ['studio/index.html', 'studio/'],
    ['start/index.html', 'start/'],
    ['account/index.html', 'account/'],
    ['terms/index.html', 'terms/'],
    ['privacy/index.html', 'privacy/'],
    ['cookies/index.html', 'cookies/'],
    ['accessibility/index.html', 'accessibility/'],
    ['404.html', 'nope/'],
  ]
  for (const [file, path] of pages) {
    const p = loadPage(file, path)
    assert.deepEqual(p.boot(), [], file)
    assert.ok(p.$$('form button[type="submit"]').every((b) => !(b as HTMLButtonElement).disabled), `${file}: forms turned on`)
    p.close()
  }
})

test('signed out, Sign in carries the address the page has when it is used, so signing in brings you back to it', () => {
  const out = loadPage('pricing/index.html', 'pricing/')
  assert.deepEqual(out.boot(), [])
  const [bar, menu] = out.$$<HTMLAnchorElement>('a[data-page="account"]')
  const next = (path: string) => `/marque/account/?next=${encodeURIComponent(path)}`
  // A page can change its address after loading (the builder keeps its picks there), so the link is written when used.
  out.window.history.replaceState(null, '', '/marque/pricing/?plan=launch')
  bar.focus()
  assert.equal(bar.getAttribute('href'), next('/marque/pricing/?plan=launch'), 'on focus, for the keyboard')
  out.window.history.replaceState(null, '', '/marque/pricing/?plan=grow')
  bar.dispatchEvent(new out.window.MouseEvent('pointerover', { bubbles: true }))
  assert.equal(bar.getAttribute('href'), next('/marque/pricing/?plan=grow'), 'on hover, before any button is pressed')
  out.window.history.replaceState(null, '', '/marque/pricing/?plan=website')
  menu.click()
  assert.equal(menu.getAttribute('href'), next('/marque/pricing/?plan=website'), 'on a tap')
})

test('signed in, the account link opens the briefs, with no page to come back to', () => {
  const signedIn = loadPage('pricing/index.html', 'pricing/', { storage: { 'marque.account': { firstName: 'Ana', email: 'ana@example.com' } } })
  assert.deepEqual(signedIn.boot(), [])
  const links = signedIn.$$<HTMLAnchorElement>('a[data-page="account"]')
  links[0].focus()
  links[1].click()
  assert.ok(links.every((a) => a.getAttribute('href') === '/marque/account/'))
})

test('a button\'s hover fill starts where the pointer crossed its edge, sized to cover the whole button', async () => {
  const { fillFrom } = await import('./fill.ts')
  const box = { left: 100, top: 50, width: 200, height: 48 }
  assert.deepEqual(fillFrom(box, 100, 74), { x: 0, y: 24, size: 402 }, 'from the left edge it must reach the right edge')
  assert.deepEqual(fillFrom(box, 200, 50), { x: 100, y: 0, size: 202 }, 'from the top middle it reaches either side')
  assert.deepEqual(fillFrom(box, 400, 90), { x: 200, y: 40, size: 402 }, 'a pointer outside is kept on the edge')

  const p = loadPage('index.html', '')
  assert.deepEqual(p.boot(), [])
  const button = p.$<HTMLAnchorElement>('main .button')
  button.getBoundingClientRect = () => ({ ...box, right: 300, bottom: 98, x: 100, y: 50, toJSON: () => box }) as DOMRect
  button.dispatchEvent(new p.window.MouseEvent('pointerover', { bubbles: true, clientX: 300, clientY: 98 }))
  assert.deepEqual(['--fill-x', '--fill-y', '--fill-size'].map((name) => button.style.getPropertyValue(name)), ['200px', '48px', '402px'], 'set as custom properties for the stylesheet')
  button.dispatchEvent(new p.window.MouseEvent('pointerout', { bubbles: true, clientX: 100, clientY: 50, relatedTarget: p.document.body }))
  assert.deepEqual(['--fill-x', '--fill-y'].map((name) => button.style.getPropertyValue(name)), ['0px', '0px'], 'and moved to where it left, to shrink back that way')
})

test('the newsletter says what happened to the address, for each answer the backend can give', async () => {
  const answers: [Awaited<ReturnType<Backend['newsletter']['subscribe']>>, string, string][] = [
    [{ status: 'not-connected' }, 'Sign-up isn’t connected yet, so your address hasn’t been sent or kept.', 'ana@example.com'],
    [{ status: 'subscribed' }, 'Check your inbox: one email asks you to confirm the address.', ''],
    [{ status: 'failed', message: 'The list is closed.' }, 'Your address didn’t go through: The list is closed. Try again in a minute.', 'ana@example.com'],
  ]
  for (const [answer, said, left] of answers) {
    const p = loadPage('index.html', '')
    assert.deepEqual(p.boot({ ...createLocalBackend(null), newsletter: { subscribe: async () => answer } }), [])
    p.type('#footer-email', 'ana@example.com')
    p.$<HTMLButtonElement>('[data-newsletter] button[type="submit"]').click()
    await p.wait()
    assert.equal(p.$('[data-form-status]').textContent, said, answer.status)
    assert.equal(p.$<HTMLInputElement>('#footer-email').value, left, `${answer.status}: only a real sign-up clears the field`)
    p.close()
  }
})
