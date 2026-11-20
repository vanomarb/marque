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
    errors.reply = !replyText ? 'Enter an email address or a mobile number.' : parseContact(replyText) ? undefined : 'Enter an email address or a Philippine mobile number starting with 09.'

    const order = [name, business, reply, message]
    for (const f of order) setFieldError(f, errors[f.name] ?? null)
    const first = order.find((f) => errors[f.name])
    if (first) {
      if (after) after.hidden = true
      announce(status, 'Some fields need a change: the message under each one says what to fix.')
      first.focus()
      return
    }
    const firstName = name.value.trim().split(/\s+/)[0]
    form.reset()
    if (after) after.hidden = false
    announce(status, `Thanks, ${firstName}. This is a demonstration site, so your brief wasn’t sent or saved. Use Save brief in the builder above to keep a copy under Your briefs.`)
    status?.focus()
  })
}
