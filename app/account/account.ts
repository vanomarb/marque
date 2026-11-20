import { BASE } from '../../build/site.ts'
import { accountLabel, emailProblem, maskEmail, safeNext, validateFirstName, type Brief, type Session } from '../lib/account.ts'
import type { Backend } from '../lib/backend/index.ts'
import { FIRST_PROJECT_LABEL, briefTitle, estimate, formatDays, savingsText } from '../lib/estimate.ts'
import { dollars, escapeHtml, priceMarkup } from '../lib/format.ts'
import { formatLongDate, localDate } from '../lib/time.ts'
import { announce, setBusy, setFieldError, showError, showSignedIn } from '../shared/fields.ts'

/** A saved brief as a receipt: each line (struck regular price beside the first-project one), the savings, the totals. */
function briefMarkup(b: Brief): string {
  const e = estimate(b.selection)
  const id = escapeHtml(b.id)
  const title = briefTitle(b.selection)
  const saved = formatLongDate(localDate(new Date(b.savedAt)))
  const row = (label: string, value: string) => `<li class="flex justify-between gap-4 border-t border-rule py-2"><span>${label}</span><span class="flex-none">${value}</span></li>`
  const lines = e.lines.map((l) => row(l.label, `${priceMarkup(l.amount, l.regular)}${l.kind === 'monthly' ? ' a month' : ''}`)).join('')
  const savings = e.discount ? `<p class="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-rule py-2 text-sm"><span class="offer">${FIRST_PROJECT_LABEL}</span><span class="price-now font-[560]">${savingsText(e.discount)}</span></p>` : ''
  const total = (term: string, value: string) => `<div><dt class="text-graphite">${term}</dt><dd class="font-[560]">${value}</dd></div>`
  return (
    `<li class="border-t border-ink py-6">` +
    `<div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1"><h3 class="text-h3" tabindex="-1">${title}</h3><p class="text-sm text-graphite">Saved ${saved}</p></div>` +
    `<ul class="tabular mt-4 text-sm">${lines}</ul>${savings}` +
    `<dl class="tabular grid grid-cols-3 gap-4 border-t border-ink pt-3 text-sm">${total('One-time', priceMarkup(e.oneTime, e.discount ? e.oneTimeRegular : undefined))}${total('Monthly', dollars(e.monthly))}${total('Timeline', formatDays(e.days))}</dl>` +
    `<div class="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2"><a class="button button--outline" href="${BASE}start/?brief=${id}">Open in the builder<span class="sr-only">: ${title}, saved ${saved}</span></a>` +
    `<button type="button" class="link inline-flex min-h-11 items-center" data-remove="${id}">Remove<span class="sr-only"> ${title}, saved ${saved}</span></button></div></li>`
  )
}

type Mode = 'signin' | 'create'

const SIGNED_IN_TITLE = 'Your briefs, Marque'

/** What changes between Sign in and Create account; everything else on the card stays put. */
const MODES: Record<Mode, { heading: string; email: string; code: string; question: string; other: string }> = {
  signin: { heading: 'Sign in to Marque', email: 'Continue with email', code: 'Sign in', question: 'New to Marque?', other: 'Create an account' },
  create: { heading: 'Create your Marque account', email: 'Create account with email', code: 'Create account', question: 'Already have an account?', other: 'Sign in' },
}

/** Sign-in and the saved briefs, through the backend: today it keeps both in this browser and shows the code. */
export function initAccount(root: HTMLElement, backend: Backend): void {
  const { auth, briefs } = backend
  const one = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)
  const emailForm = one<HTMLFormElement>('[data-signin="email"]')
  const codeForm = one<HTMLFormElement>('[data-signin="code"]')
  const start = one('[data-signin-start]')
  const list = one('[data-briefs]')
  const empty = one('[data-briefs-empty]')
  const status = one('[data-account-status]')
  if (!emailForm || !codeForm || !start || !list || !empty || !status) return
  const removeError = one('[data-briefs-error]')
  const google = one<HTMLButtonElement>('[data-google]')
  const googleStatus = one('[data-google-status]')
  const preview = one('[data-preview]')
  const modeRow = one('[data-mode-row]')
  const modeSwitch = one<HTMLButtonElement>('[data-mode-switch]')
  const input = (form: HTMLFormElement, name: string) => form.elements.namedItem(name) as HTMLInputElement
  const submit = (form: HTMLFormElement) => form.querySelector<HTMLButtonElement>('button[type="submit"]')
  const first = input(emailForm, 'first-name')
  const email = input(emailForm, 'email')
  const codeField = input(codeForm, 'code')
  const text = (selector: string, value: string) => {
    const el = one(selector)
    if (el) el.textContent = value
  }
  let mode: Mode = window.location.hash === '#create' ? 'create' : 'signin'
  let codeFor = ''
  const signedOutTitle = document.title

  /** The signed-in view, or the sign-in card; the header and the tab title follow. */
  const show = (session: Session | null) => {
    showSignedIn(session)
    document.title = session ? SIGNED_IN_TITLE : signedOutTitle
    if (!session) list.innerHTML = ''
  }

  const render = async () => {
    const session = await auth.currentSession()
    show(session)
    if (!session) return
    text('[data-account-greeting-name]', session.firstName ?? session.email)
    text('[data-signed-in-with]', session.firstName ? `Signed in with ${maskEmail(session.email)}` : '')
    const saved = await briefs.list()
    list.innerHTML = saved.map(briefMarkup).join('')
    empty.hidden = saved.length > 0
  }

  const showStep = (step: 'email' | 'code') => {
    start.hidden = step !== 'email'
    codeForm.hidden = step !== 'code'
  }

  const setMode = (next: Mode) => {
    mode = next
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
    google.addEventListener('click', async () => {
      status.textContent = ''
      setBusy(google, true)
      const result = await auth.startGoogleSignIn()
      setBusy(google, false)
      if (result.status === 'redirect') return window.location.assign(result.url)
      announce(googleStatus, result.status === 'not-connected' ? 'Google sign-in isn’t connected yet. Use your email above for now.' : `Google sign-in didn’t start: ${result.message}`)
    })
  }
  if (modeRow) modeRow.hidden = false
  modeSwitch?.addEventListener('click', () => {
    setMode(mode === 'signin' ? 'create' : 'signin')
    showStep('email')
    window.history.replaceState(null, '', mode === 'create' ? '#create' : window.location.pathname + window.location.search)
    ;(mode === 'create' ? first : email).focus()
    announce(status, mode === 'create' ? 'Create an account: your first name and email address.' : 'Sign in with your email address.')
  })

  emailForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    // Every field's problem at once, before asking the backend, which checks the same rules again.
    const nameError = mode === 'create' ? validateFirstName(first.value) : null
    const emailError = emailProblem(email.value)
    setFieldError(first, nameError)
    setFieldError(email, emailError)
    if (nameError || emailError) return (nameError ? first : email).focus()
    const button = submit(emailForm)
    setBusy(button, true)
    const result = await auth.startEmailSignIn(email.value, mode === 'create' ? first.value : undefined)
    setBusy(button, false)
    setFieldError(first, result.status === 'invalid' && result.field === 'firstName' ? result.message : null)
    setFieldError(email, result.status === 'invalid' && result.field === 'email' ? result.message : null)
    if (result.status === 'invalid') return (result.field === 'firstName' ? first : email).focus()
    if (result.status === 'failed') {
      setFieldError(email, `We couldn’t send a code: ${result.message}`)
      return email.focus()
    }
    codeFor = result.email
    text('[data-code-email]', maskEmail(result.email))
    if (preview) preview.hidden = result.preview === null
    text('[data-preview-code]', result.preview ?? '')
    codeForm.reset()
    setFieldError(codeField, null)
    showStep('code')
    codeField.focus()
  })

  codeForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    const where = preview && !preview.hidden ? 'the box above' : 'the email'
    if (!codeField.value.trim()) {
      setFieldError(codeField, `Type the four digits from ${where}.`)
      return codeField.focus()
    }
    const button = submit(codeForm)
    setBusy(button, true)
    const result = await auth.verifyCode(codeFor, codeField.value)
    setBusy(button, false)
    if (result.status !== 'signed-in') {
      const problem = { 'wrong-code': `Those digits don’t match. Copy them from ${where}.`, expired: 'That code has run out. Change email to ask for a new one.' }
      setFieldError(codeField, result.status === 'failed' ? `We couldn’t check the code: ${result.message}` : problem[result.status])
      return codeField.focus()
    }
    const next = result.remembered ? safeNext(window.location.search, window.location.origin) : null
    if (next) return window.location.assign(next)
    emailForm.reset()
    showStep('email')
    await render()
    one('#account-greeting')?.focus()
    const { session } = result
    const who = `${mode === 'create' ? 'Account created. ' : ''}Signed in as ${session.firstName ? accountLabel(session) : session.email}.`
    announce(status, result.remembered ? who : `${who} This browser isn’t keeping site data, so leaving the page signs you out.`)
  })

  codeForm.querySelector('[data-signin-back]')?.addEventListener('click', () => {
    showStep('email')
    email.focus()
  })

  one('[data-signout]')?.addEventListener('click', async () => {
    await auth.signOut()
    show(null)
    if (googleStatus) googleStatus.textContent = ''
    email.focus()
    announce(status, 'Signed out. Briefs saved on this device stay here.')
  })

  list.addEventListener('click', async (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-remove]')
    const id = button?.dataset.remove
    if (!button || !id) return
    const at = [...list.querySelectorAll('[data-remove]')].indexOf(button)
    setBusy(button, true)
    const result = await briefs.remove(id)
    setBusy(button, false)
    if (result.status === 'not-removed' || result.status === 'failed') {
      // Nothing was removed, so the list stays and the message shows where it can be seen.
      const message =
        result.status === 'failed'
          ? `That brief is still here: ${result.message}`
          : 'That brief is still here: this browser didn’t let the site change what it keeps. Check that site data is allowed, then try again.'
      if (removeError) {
        showError(removeError, message)
        removeError.focus()
      } else announce(status, message)
      return
    }
    showError(removeError, null)
    const signedOut = result.status === 'not-found' && !(await auth.currentSession())
    await render()
    if (signedOut) return
    const headings = list.querySelectorAll<HTMLElement>('h3')
    ;(headings[at] ?? headings[at - 1] ?? one('#saved-title'))?.focus()
    announce(status, 'Brief removed.')
  })

  setMode(mode)
  void render()
}
