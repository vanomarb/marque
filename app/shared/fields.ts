import { accountLabel, type Session } from '../lib/account.ts'

/** Shows `message` in an error element (in its [data-error-text] when it has an icon), or hides it for null. */
export function showError(error: HTMLElement | null, message: string | null): void {
  if (!error) return
  const text = error.querySelector<HTMLElement>('[data-error-text]') ?? error
  error.hidden = !message
  text.textContent = message ?? ''
}

/** The message goes in the field's #<id>-error element. */
export function setFieldError(field: HTMLInputElement | HTMLTextAreaElement, message: string | null): void {
  const error = document.getElementById(`${field.id}-error`)
  if (!error) return
  showError(error, message)
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

/** The header's account link and the menu row, as the first-paint script in the header partial sets them. */
export function showSignedIn(session: Session | null): void {
  document.documentElement.toggleAttribute('data-signed-in', !!session)
  for (const label of document.querySelectorAll<HTMLElement>('[data-account-name]')) {
    label.textContent = session ? accountLabel(session) : ''
    const link = label.closest('a')
    if (session) link?.setAttribute('title', session.email)
    else link?.removeAttribute('title')
  }
  for (const email of document.querySelectorAll<HTMLElement>('[data-account-email]')) email.textContent = session?.email ?? ''
}

/** A control waiting on the backend: switched off and marked busy, so it can't be pressed twice. */
export function setBusy(control: HTMLButtonElement | null, busy: boolean): void {
  if (!control) return
  control.disabled = busy
  if (busy) control.setAttribute('aria-busy', 'true')
  else control.removeAttribute('aria-busy')
}
