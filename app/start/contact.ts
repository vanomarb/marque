import { parseContact } from '../lib/account.ts'
import { validateContact } from '../lib/contact.ts'
import { announce, setFieldError } from '../shared/fields.ts'

export function initContact(root: HTMLElement): void {
  const form = root.querySelector<HTMLFormElement>('form')
  const status = root.querySelector<HTMLElement>('[data-contact-status]')
  const after = root.querySelector<HTMLElement>('[data-contact-after]')
  if (!form) return
  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const name = field('name')
    const business = field('business')
    const reply = field('reply')
    const message = field('message')
    const errors: Record<string, string | undefined> = { ...validateContact({ name: name.value, business: business.value, message: message.value }) }
    const replyText = reply.value.trim()
    errors.reply = !replyText ? 'Enter your email address.' : parseContact(replyText) ? undefined : 'Enter an email address, like name@example.com.'

    const order = [name, business, reply, message]
    for (const f of order) setFieldError(f, errors[f.name] ?? null)
    const first = order.find((f) => errors[f.name])
    if (first) {
      if (after) after.hidden = true
      announce(status, 'Some fields need a change: the message under each one says what to fix.')
      first.focus()
      return
    }
    // Nothing was sent, so what they typed stays in the form rather than being lost.
    if (after) after.hidden = false
    announce(status, 'Your message is ready, but sending isn’t connected yet, so it hasn’t gone anywhere. It stays in the form on this page. To keep your priced brief, press Save brief above: it’s saved on this device under Your briefs.')
    status?.focus()
  })
}
