import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { closeAll, loadPage } from '../../tests/harness.ts'

after(closeAll)

function page(file = 'work/index.html', path = 'work/', options: Parameters<typeof loadPage>[2] = {}) {
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
  assert.equal(button.textContent, 'Menu')
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
  assert.equal(button.textContent, 'Menu', 'its name never changes')
})

test('the menu lists the pages as numbered rows, and marks the one you are on', () => {
  const { p } = page()
  const rows = p.$$<HTMLAnchorElement>('#site-menu .menu-row')
  assert.deepEqual(
    rows.map((row) => [row.querySelector('.margin-no')!.textContent, row.querySelector('.menu-name .link-quiet')!.textContent, row.getAttribute('href')]),
    [
      ['01', 'Work', '/marque/work/'],
      ['02', 'Services', '/marque/services/'],
      ['03', 'Studio', '/marque/studio/'],
      ['04', 'Sign in', '/marque/account/'],
    ],
  )
  assert.equal(rows[0].getAttribute('aria-current'), 'page', 'Work is current on the Work page')
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

test('About this site: a link to the Terms section until the script makes it open the dialog', () => {
  const before = loadPage('index.html', '')
  const links = before.$$<HTMLAnchorElement>('[data-concept]')
  assert.equal(links.length, 2, 'the hero note and the footer')
  for (const link of links) assert.equal(link.getAttribute('href'), '/marque/terms/#concept', 'without the script, a link to the concept text')

  assert.deepEqual(before.boot(), [])
  const triggers = before.$$('[data-concept]')
  assert.ok(triggers.every((t) => t.tagName === 'BUTTON' && t.getAttribute('type') === 'button' && t.getAttribute('aria-haspopup') === 'dialog'), 'with it, buttons')
  assert.deepEqual(triggers.map((t) => t.textContent), ['About this site', 'About this site'])

  const dialog = before.$<HTMLDialogElement>('#concept-dialog')
  const footerTrigger = before.$('[data-legal-row] [data-concept]')
  footerTrigger.focus()
  footerTrigger.click()
  assert.equal(dialog.open, true, 'opens')
  assert.equal(before.document.activeElement, before.$('[data-concept-close]'), 'focus on Close')
  before.$<HTMLButtonElement>('[data-concept-close]').click()
  assert.equal(dialog.open, false)
  assert.equal(before.document.activeElement, footerTrigger, 'focus back on the trigger')

  footerTrigger.click()
  before.key('Escape')
  assert.equal(dialog.open, false, 'Escape closes it')
  footerTrigger.click()
  dialog.dispatchEvent(new before.window.MouseEvent('click', { bubbles: true }))
  assert.equal(dialog.open, false, 'so does the backdrop')
  assert.equal(before.document.activeElement, footerTrigger)
})

test('every page starts its features without an error', () => {
  const pages: [string, string][] = [
    ['index.html', ''],
    ['work/index.html', 'work/'],
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
