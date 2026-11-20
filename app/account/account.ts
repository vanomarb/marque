import {
  accountLabel,
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
import { briefTitle, estimate, formatDays } from '../lib/estimate.ts'
import { dollars, escapeHtml, signedDollars } from '../lib/format.ts'
import { formatLongDate, localDate } from '../lib/time.ts'
import { announce, setFieldError, showSignedIn } from '../shared/fields.ts'
import { browserStore } from '../shared/storage.ts'

function briefMarkup(b: Brief): string {
  const e = estimate(b.selection)
  const id = escapeHtml(b.id)
  const title = briefTitle(b.selection)
  const saved = formatLongDate(localDate(new Date(b.savedAt)))
  const lines = e.lines.map((l) => `<li class="flex justify-between gap-4 border-t border-rule py-2"><span>${l.label}</span><span class="tabular flex-none">${signedDollars(l.amount)}${l.kind === 'monthly' ? ' a month' : ''}</span></li>`).join('')
  return (
    `<li class="border-t border-ink py-6">` +
    `<div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1"><h3 class="text-h3">${title}</h3><p class="text-sm text-graphite">Saved ${saved}</p></div>` +
    `<dl class="tabular mt-4 grid grid-cols-3 gap-4 text-sm"><div><dt class="text-graphite">One-time</dt><dd class="text-lead font-[560]">${dollars(e.oneTime)}</dd></div><div><dt class="text-graphite">Monthly</dt><dd class="text-lead font-[560]">${dollars(e.monthly)}</dd></div><div><dt class="text-graphite">Timeline</dt><dd class="font-[560]">${e.days ? formatDays(e.days) : 'Monthly work'}</dd></div></dl>` +
    `<ul class="mt-4 text-sm">${lines}</ul>` +
    `<div class="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2"><a class="button button--outline" href="/marque/start/?brief=${id}">Open in the builder<span class="sr-only">: ${title}, saved ${saved}</span></a>` +
    `<button type="button" class="link inline-flex min-h-11 items-center" data-remove="${id}">Remove<span class="sr-only"> ${title}, saved ${saved}</span></button></div></li>`
  )
}

type Mode = 'signin' | 'create'

/** What changes between Sign in and Create account; everything else on the card stays put. */
const MODES: Record<Mode, { heading: string; email: string; code: string; question: string; other: string }> = {
  signin: { heading: 'Sign in to Marque', email: 'Continue with email', code: 'Sign in', question: 'New to Marque?', other: 'Create an account' },
  create: { heading: 'Create your Marque account', email: 'Create account with email', code: 'Create account', question: 'Already have an account?', other: 'Sign in' },
}

/** With storage blocked, the sign-in lasts until the page is left. Until accounts go live, all of it stays in this browser. */
export function initAccount(root: HTMLElement): void {
  const store = browserStore()
  const one = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)
  const contactForm = one<HTMLFormElement>('[data-signin="contact"]')
  const codeForm = one<HTMLFormElement>('[data-signin="code"]')
  const start = one('[data-signin-start]')
  const list = one('[data-briefs]')
  const empty = one('[data-briefs-empty]')
  const status = one('[data-account-status]')
  if (!contactForm || !codeForm || !start || !list || !empty || !status) return
  const removeError = one('[data-briefs-error]')
  const card = one('[data-signin-card]')
  const google = one<HTMLButtonElement>('[data-google]')
  const modeRow = one('[data-mode-row]')
  const modeSwitch = one<HTMLButtonElement>('[data-mode-switch]')
  const input = (form: HTMLFormElement, name: string) => form.elements.namedItem(name) as HTMLInputElement
  const first = input(contactForm, 'first-name')
  const email = input(contactForm, 'contact')
  const codeField = input(codeForm, 'code')
  const text = (selector: string, value: string) => {
    const el = one(selector)
    if (el) el.textContent = value
  }
  let memory: Session | null = null
  let pending: { session: Session; code: string } | null = null
  let mode: Mode = window.location.hash === '#create' ? 'create' : 'signin'

  const render = () => {
    const session = loadSession(store) ?? memory
    showSignedIn(session)
    if (!session) return
    text('[data-account-greeting-name]', session.firstName ?? session.contact.value)
    text('[data-account-contact]', session.firstName ? `Signed in with ${maskContact(session.contact)}` : '')
    const briefs = loadBriefs(store)
    list.innerHTML = briefs.map(briefMarkup).join('')
    empty.hidden = briefs.length > 0
  }

  const showStep = (step: 'contact' | 'code') => {
    start.hidden = step !== 'contact'
    codeForm.hidden = step !== 'code'
  }

  const setMode = (next: Mode) => {
    mode = next
    if (card) card.dataset.mode = next
    const words = MODES[next]
    text('[data-account-heading]', words.heading)
    text('[data-email-submit]', words.email)
    text('[data-code-submit]', words.code)
    text('[data-mode-text]', words.question)
    if (modeSwitch) modeSwitch.textContent = words.other
    const nameRow = one('[data-create-only]')
    if (nameRow) nameRow.hidden = next !== 'create'
    first.required = next === 'create'
    setFieldError(first, null)
  }

  if (google) {
    google.disabled = false
    google.addEventListener('click', () => announce(one('[data-google-status]'), 'Google sign-in isn’t connected yet. Use your email below for now.'))
  }
  if (modeRow) modeRow.hidden = false
  modeSwitch?.addEventListener('click', () => {
    setMode(mode === 'signin' ? 'create' : 'signin')
    pending = null
    showStep('contact')
    window.history.replaceState(null, '', mode === 'create' ? '#create' : window.location.pathname + window.location.search)
    ;(mode === 'create' ? first : email).focus()
    announce(status, mode === 'create' ? 'Create an account: your first name and email address.' : 'Sign in with your email address.')
  })

  contactForm.addEventListener('submit', (event) => {
    event.preventDefault()
    const nameError = mode === 'create' ? validateFirstName(first.value) : null
    const contact = parseContact(email.value)
    const emailError = contact ? null : email.value.trim() ? 'Use an email address, like name@example.com.' : 'Add your email address.'
    setFieldError(first, nameError)
    setFieldError(email, emailError)
    if (nameError || !contact) {
      ;(nameError ? first : email).focus()
      return
    }
    pending = { session: { firstName: mode === 'create' ? first.value.trim() : null, contact }, code: demoCode() }
    text('[data-preview-code]', pending.code)
    text('[data-code-contact]', maskContact(contact))
    codeForm.reset()
    setFieldError(codeField, null)
    showStep('code')
    codeField.focus()
  })

  codeForm.addEventListener('submit', (event) => {
    event.preventDefault()
    if (!pending) return showStep('contact')
    if (!codeMatches(codeField.value, pending.code)) {
      setFieldError(codeField, codeField.value.trim() ? 'Those digits don’t match. Copy them from the box above.' : 'Type the four digits shown above.')
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
    one('#account-greeting')?.focus()
    const who = `${mode === 'create' ? 'Account created. ' : ''}Signed in as ${accountLabel(session)}.`
    announce(status, saved ? who : `${who} This browser isn’t keeping site data, so leaving the page signs you out.`)
  })

  codeForm.querySelector('[data-signin-back]')?.addEventListener('click', () => {
    pending = null
    showStep('contact')
    email.focus()
  })

  one('[data-signout]')?.addEventListener('click', () => {
    clearSession(store)
    memory = null
    showSignedIn(null)
    list.innerHTML = ''
    email.focus()
    announce(status, 'Signed out. Briefs saved on this device stay here.')
  })

  list.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-remove]')
    if (!button?.dataset.remove) return
    if (!removeBrief(store, button.dataset.remove)) {
      // Nothing was removed, so the list stays and the message shows where it can be seen.
      const message = 'That brief is still here: this browser didn’t let the site change what it keeps. Check that site data is allowed, then try again.'
      if (removeError) {
        const errorText = removeError.querySelector<HTMLElement>('[data-error-text]') ?? removeError
        errorText.textContent = message
        removeError.hidden = false
        removeError.focus()
      } else announce(status, message)
      return
    }
    if (removeError) removeError.hidden = true
    render()
    one('#account-title')?.focus()
    announce(status, 'Brief removed.')
  })

  setMode(mode)
  render()
}
