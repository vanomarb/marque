import { initNav } from './shared/nav.ts'
import { initReveal } from './shared/reveal.ts'
import { initMockForms } from './shared/forms.ts'
import { initBuilder } from './start/builder.ts'
import { initContact } from './start/contact.ts'
import { initAccount } from './account/account.ts'
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

/** main.ts calls this in the browser and tests/harness.ts calls it in jsdom, so the tests run exactly this. */
export function boot(): void {
  start('forms on', enableForms)
  start('navigation', initNav)
  start('forms', initMockForms)
  mount('[data-builder]', initBuilder)
  mount('[data-contact]', initContact)
  mount('[data-account]', initAccount)
  mount('[data-works]', initWorks)
  start('scroll reveal', initReveal)
}
