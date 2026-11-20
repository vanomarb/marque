import { initAccount } from './account/account.ts'
import { createBackend, type Backend } from './lib/backend/index.ts'
import { initButtonFill } from './shared/fill.ts'
import { initNav } from './shared/nav.ts'
import { initNewsletter } from './shared/newsletter.ts'
import { initReveal } from './shared/reveal.ts'
import { initBuilder } from './start/builder.ts'
import { initContact } from './start/contact.ts'
import { initWorks } from './works/works.ts'

/** The forms are switched off in the HTML so that, without this script, a submit can never put what a visitor typed into the URL. */
function enableForms(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>('form button[type="submit"][disabled]')) button.disabled = false
}

/** Each feature starts on its own, so one that fails leaves the others and the page working. */
function start(name: string, init: () => void): void {
  try {
    init()
  } catch (error) {
    console.error(`Marque: ${name} could not start.`, error)
  }
}

function mount(selector: string, init: (root: HTMLElement) => void): void {
  const root = document.querySelector<HTMLElement>(selector)
  if (root) start(selector, () => init(root))
}

/** Tests call this too, so they run the real start-up, with their own backend if they pass one. */
export function boot(backend: Backend = createBackend()): void {
  start('forms on', enableForms)
  start('navigation', initNav)
  start('button fill', initButtonFill)
  start('newsletter', () => initNewsletter(backend))
  mount('[data-builder]', (root) => initBuilder(root, backend))
  mount('[data-contact]', (root) => initContact(root, backend))
  mount('[data-account]', (root) => initAccount(root, backend))
  mount('[data-works]', initWorks)
  start('scroll reveal', initReveal)
}
