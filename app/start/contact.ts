import type { Backend } from '../lib/backend/index.ts'
import type { SendResult } from '../lib/backend/types.ts'
import { validateContact, type ContactInput } from '../lib/contact.ts'
import { announce, setBusy, setFieldError } from '../shared/fields.ts'

/** What the page says after a send that got past the checks, for each answer the backend can give. */
const OUTCOME: Record<Exclude<SendResult['status'], 'invalid'>, (email: string, message?: string) => string> = {
  sent: (email) => `Sent. We reply by email at ${email}, usually within a day.`,
  'not-connected': () =>
    'Nothing was sent: sending isn’t connected yet. What you wrote stays in the form on this page. To keep a priced brief, press Save brief above: it’s saved on this device under Your briefs.',
  failed: (_email, message) => `It didn’t send: ${message} What you wrote is still in the form, so you can try again in a minute.`,
}

export function initContact(root: HTMLElement, backend: Backend): void {
  const form = root.querySelector<HTMLFormElement>('form')
  const status = root.querySelector<HTMLElement>('[data-contact-status]')
  const after = root.querySelector<HTMLElement>('[data-contact-after]')
  if (!form) return
  const fields = (['name', 'business', 'email', 'message'] as const).map((key) => [key, form.elements.namedItem(key) as HTMLInputElement | HTMLTextAreaElement] as const)
  const showErrors = (errors: Partial<Record<keyof ContactInput, string>>) => {
    for (const [key, f] of fields) setFieldError(f, errors[key] ?? null)
    const first = fields.find(([key]) => errors[key])
    if (!first) return false
    if (after) after.hidden = true
    announce(status, 'Some fields need a change: the message under each one says what to fix.')
    first[1].focus()
    return true
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const message = Object.fromEntries(fields.map(([key, f]) => [key, f.value])) as unknown as ContactInput
    if (showErrors(validateContact(message))) return
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')
    setBusy(button, true)
    const result = await backend.contact.send(message)
    setBusy(button, false)
    if (result.status === 'invalid') return void showErrors(result.errors)
    // Only a sent message clears the form; otherwise what they typed stays.
    if (result.status === 'sent') form.reset()
    if (after) after.hidden = result.status === 'sent'
    announce(status, OUTCOME[result.status](message.email.trim(), result.status === 'failed' ? result.message : undefined))
    status?.focus()
  })
}
