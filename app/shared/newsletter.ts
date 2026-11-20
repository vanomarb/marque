import type { Backend } from '../lib/backend/index.ts'
import { setBusy } from './fields.ts'

/** The footer's sign-up, on every page; the status line says what happened to the address. */
export function initNewsletter(backend: Backend): void {
  document.addEventListener('submit', async (event) => {
    const form = (event.target as Element | null)?.closest<HTMLFormElement>('form[data-newsletter]')
    if (!form) return
    event.preventDefault()
    const status = form.querySelector<HTMLElement>('[data-form-status]')
    const email = form.querySelector<HTMLInputElement>('input[name="email"]')
    if (!email || !status) return
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')
    setBusy(button, true)
    const result = await backend.newsletter.subscribe(email.value)
    setBusy(button, false)
    if (result.status === 'invalid') {
      email.setAttribute('aria-invalid', 'true')
      status.textContent = result.message
      email.focus()
      return
    }
    email.removeAttribute('aria-invalid')
    if (result.status === 'subscribed') {
      status.textContent = 'Check your inbox: one email asks you to confirm the address.'
      form.reset()
    } else if (result.status === 'not-connected') status.textContent = 'Sign-up isn’t connected yet, so your address hasn’t been sent or kept.'
    else status.textContent = `Your address didn’t go through: ${result.message} Try again in a minute.`
  })
}
