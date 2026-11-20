import { accountLabel, type Session } from '../lib/account.ts'

/** The message goes in the field's #<id>-error element (its [data-error-text] when it has an icon). */
export function setFieldError(field: HTMLInputElement | HTMLTextAreaElement, message: string | null): void {
  const error = document.getElementById(`${field.id}-error`)
  const text = error?.querySelector<HTMLElement>('[data-error-text]') ?? error
  if (!error || !text) return
  error.hidden = !message
  text.textContent = message ?? ''
  if (message) field.setAttribute('aria-invalid', 'true')
  else field.removeAttribute('aria-invalid')
  const described = (field.getAttribute('aria-describedby') ?? '').split(' ').filter((id) => id && id !== error.id)
  if (message) described.push(error.id)
  if (described.length) field.setAttribute('aria-describedby', described.join(' '))
  else field.removeAttribute('aria-describedby')
}

/** Cleared first, so the same words twice are still read out. */
export function announce(region: HTMLElement | null, message: string): void {
  if (!region) return
  region.textContent = ''
  window.setTimeout(() => (region.textContent = message), 60)
}

export function showSignedIn(session: Session | null): void {
  document.documentElement.toggleAttribute('data-signed-in', !!session)
  for (const label of document.querySelectorAll<HTMLElement>('[data-account-name]')) label.textContent = session ? accountLabel(session) : 'Sign in'
}
