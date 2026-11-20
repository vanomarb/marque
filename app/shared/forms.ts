import { EMAIL } from '../lib/account.ts'

export function initMockForms(): void {
  document.addEventListener('submit', (event) => {
    const form = (event.target as Element | null)?.closest<HTMLFormElement>('form[data-mock-form="newsletter"]')
    if (!form) return
    event.preventDefault()
    const status = form.querySelector<HTMLElement>('[data-form-status]')
    const email = form.querySelector<HTMLInputElement>('input[name="email"]')
    if (!email || !status) return
    const value = email.value.trim()
    const problem = !value ? 'Enter your email address.' : EMAIL.test(value) ? null : 'Enter an email address, like name@example.com.'
    if (problem) {
      email.setAttribute('aria-invalid', 'true')
      status.textContent = problem
      email.focus()
      return
    }
    email.removeAttribute('aria-invalid')
    status.textContent = 'Thanks. This is a demonstration site, so your address wasn’t sent or kept.'
    form.reset()
  })
}
