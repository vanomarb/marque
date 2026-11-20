import {
  clearSession,
  codeMatches,
  demoCode,
  loadBriefs,
  loadSession,
  maskContact,
  parseContact,
  removeBrief,
  saveSession,
  validateFirstName,
  type Brief,
  type Session,
} from '../lib/account.ts'
import { briefTitle, estimate, formatWeeks } from '../lib/estimate.ts'
import { escapeHtml, peso } from '../lib/format.ts'
import { formatLongDate, manilaTime } from '../lib/time.ts'
import { announce, setFieldError, showSignedIn } from '../shared/fields.ts'
import { browserStore } from '../shared/storage.ts'

function briefMarkup(b: Brief): string {
  const e = estimate(b.selection)
  const id = escapeHtml(b.id)
  const title = briefTitle(b.selection)
  const saved = formatLongDate(manilaTime(new Date(b.savedAt)).isoDate)
  const lines = e.lines.map((l) => `<li class="flex justify-between gap-4 border-t border-rule py-2"><span>${l.label}</span><span class="tabular flex-none">${peso(l.amount)}${l.kind === 'monthly' ? ' a month' : ''}</span></li>`).join('')
  return (
    `<li class="border-t border-ink py-6">` +
    `<div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1"><h3 class="text-h3">${title}</h3><p class="text-sm text-graphite">Saved ${saved}</p></div>` +
    `<dl class="tabular mt-4 grid grid-cols-3 gap-4 text-sm"><div><dt class="text-graphite">One-time</dt><dd class="text-lead font-[560]">${peso(e.oneTime)}</dd></div><div><dt class="text-graphite">Monthly</dt><dd class="text-lead font-[560]">${peso(e.monthly)}</dd></div><div><dt class="text-graphite">Timeline</dt><dd class="font-[560]">${e.weeks ? formatWeeks(e.weeks) : 'Monthly work'}</dd></div></dl>` +
    `<ul class="mt-4 text-sm">${lines}</ul>` +
    `<div class="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2"><a class="button button--outline" href="/marque/start/?brief=${id}">Open in the builder<span class="sr-only">: ${title}, saved ${saved}</span></a>` +
    `<button type="button" class="link inline-flex min-h-11 items-center" data-remove="${id}">Remove<span class="sr-only"> ${title}, saved ${saved}</span></button></div></li>`
  )
}

/** With storage blocked, the sign-in lasts until the page is left. */
export function initAccount(root: HTMLElement): void {
  const store = browserStore()
  const contactForm = root.querySelector<HTMLFormElement>('[data-signin="contact"]')
  const codeForm = root.querySelector<HTMLFormElement>('[data-signin="code"]')
  const list = root.querySelector<HTMLElement>('[data-briefs]')
  const empty = root.querySelector<HTMLElement>('[data-briefs-empty]')
  const status = root.querySelector<HTMLElement>('[data-account-status]')
  const removeError = root.querySelector<HTMLElement>('[data-briefs-error]')
  if (!contactForm || !codeForm || !list || !empty || !status) return
  const out = (selector: string) => root.querySelector<HTMLElement>(selector)
  const input = (form: HTMLFormElement, name: string) => form.elements.namedItem(name) as HTMLInputElement
  let memory: Session | null = null
  let pending: { session: Session; code: string } | null = null

  const render = () => {
    const session = loadSession(store) ?? memory
    showSignedIn(session?.firstName ?? null)
    if (!session) return
    const name = out('[data-account-greeting-name]')
    const contact = out('[data-account-contact]')
    if (name) name.textContent = session.firstName
    if (contact) contact.textContent = `Contact on file: ${maskContact(session.contact)}`
    const briefs = loadBriefs(store)
    list.innerHTML = briefs.map(briefMarkup).join('')
    empty.hidden = briefs.length > 0
  }

  const showStep = (step: 'contact' | 'code') => {
    contactForm.hidden = step !== 'contact'
    codeForm.hidden = step !== 'code'
  }

  contactForm.addEventListener('submit', (event) => {
    event.preventDefault()
    const first = input(contactForm, 'first-name')
    const contactField = input(contactForm, 'contact')
    const nameError = validateFirstName(first.value)
    const contact = parseContact(contactField.value)
    const contactError = contact ? null : contactField.value.trim() ? 'Use an email address, or a mobile number that starts with 09.' : 'Add an email address or a mobile number.'
    setFieldError(first, nameError)
    setFieldError(contactField, contactError)
    if (nameError || !contact) {
      ;(nameError ? first : contactField).focus()
      return
    }
    pending = { session: { firstName: first.value.trim(), contact }, code: demoCode() }
    const code = out('[data-demo-code]')
    const where = out('[data-code-contact]')
    if (code) code.textContent = pending.code
    if (where) where.textContent = maskContact(contact)
    codeForm.reset()
    setFieldError(input(codeForm, 'code'), null)
    showStep('code')
    input(codeForm, 'code').focus()
  })

  codeForm.addEventListener('submit', (event) => {
    event.preventDefault()
    if (!pending) return showStep('contact')
    const codeField = input(codeForm, 'code')
    if (!codeMatches(codeField.value, pending.code)) {
      setFieldError(codeField, codeField.value.trim() ? 'Those digits don’t match. Copy them from the line above.' : 'Type the four digits printed above.')
      codeField.focus()
      return
    }
    const session = pending.session
    const saved = saveSession(store, session)
    memory = saved ? null : session
    pending = null
    contactForm.reset()
    showStep('contact')
    render()
    out('#account-greeting')?.focus()
    const first = session.firstName.split(/\s+/)[0]
    announce(status, saved ? `Signed in as ${first}.` : `Signed in as ${first}. This browser isn’t keeping site data, so leaving the page signs you out.`)
  })

  codeForm.querySelector('[data-signin-back]')?.addEventListener('click', () => {
    pending = null
    showStep('contact')
    input(contactForm, 'contact').focus()
  })

  root.querySelector('[data-signout]')?.addEventListener('click', () => {
    clearSession(store)
    memory = null
    showSignedIn(null)
    list.innerHTML = ''
    input(contactForm, 'first-name').focus()
    announce(status, 'Signed out. Briefs saved on this device stay here.')
  })

  list.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-remove]')
    if (!button?.dataset.remove) return
    if (!removeBrief(store, button.dataset.remove)) {
      // Nothing was removed, so the list stays and the message shows where it can be seen.
      const message = 'That brief is still here: this browser didn’t let the site change what it keeps. Check that site data is allowed, then try again.'
      if (removeError) {
        const text = removeError.querySelector<HTMLElement>('[data-error-text]') ?? removeError
        text.textContent = message
        removeError.hidden = false
        removeError.focus()
      } else announce(status, message)
      return
    }
    if (removeError) removeError.hidden = true
    render()
    out('#briefs-title')?.focus()
    announce(status, 'Brief removed.')
  })

  render()
}
