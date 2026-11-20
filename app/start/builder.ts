import type { Brief } from '../lib/account.ts'
import { MAX_BRIEFS } from '../lib/backend/types.ts'
import type { Backend } from '../lib/backend/index.ts'
import { DEFAULT_SOCIAL, DEFAULT_WEBSITE, LIMITS, PAGES, briefText, estimate, formatDays, savingsText, type LineId, type Platforms, type Posts, type Selection, type ServiceId } from '../lib/estimate.ts'
import { formatLongDate, localDate } from '../lib/time.ts'
import { dollars, priceMarkup } from '../lib/format.ts'
import { pickSearch, selectionFromSearch } from '../lib/start-link.ts'
import { showDollars } from './count.ts'
import { announce, setBusy, setFieldError } from '../shared/fields.ts'

/** The contact fields Use this brief asks for when they are empty, in the order the form shows them. */
const EMPTY_FIELDS = [
  ['name', 'your name'],
  ['business', 'the business name'],
  ['email', 'your email address'],
] as const

export function initBuilder(root: HTMLElement, backend: Backend): void {
  const $ = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)
  const pick = (id: ServiceId) => $<HTMLInputElement>(`[data-service="${id}"] [data-pick]`)!
  const counter = (name: string) => $<HTMLOutputElement>(`[data-count="${name}"]`)!
  const radio = (name: string) => root.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)
  const firstProject = $<HTMLInputElement>('[data-first-project]')
  const status = $<HTMLElement>('[data-builder-status]')
  const announcer = $<HTMLElement>('[data-estimate-announce]')
  const limits: Record<string, [number, number]> = { pages: [1, PAGES.max], shoots: [1, LIMITS.shoots], pieces: [1, LIMITS.print] }

  const managed = () => {
    const choice = radio('after-launch')
    return choice ? choice.value === 'managed' : DEFAULT_WEBSITE.managed
  }

  const read = (): Selection => ({
    identity: pick('identity').checked,
    website: pick('website').checked ? { pages: Number(counter('pages').value), managed: managed() } : null,
    social: pick('social').checked ? { platforms: Number(radio('platforms')?.value ?? DEFAULT_SOCIAL.platforms) as Platforms, posts: Number(radio('posts')?.value ?? DEFAULT_SOCIAL.posts) as Posts } : null,
    ads: pick('ads').checked,
    shoots: pick('photo').checked ? Number(counter('shoots').value) : 0,
    print: pick('print').checked ? Number(counter('pieces').value) : 0,
    firstProject: firstProject?.checked ?? true,
  })

  const setCount = (name: string, value: number) => {
    const [min, max] = limits[name]
    const v = Math.min(max, Math.max(min, value))
    const out = counter(name)
    out.value = String(v)
    out.textContent = String(v)
    const group = out.closest<HTMLElement>('.stepper')
    group?.querySelector<HTMLButtonElement>('[data-change="-1"]')?.toggleAttribute('disabled', v <= min)
    group?.querySelector<HTMLButtonElement>('[data-change="1"]')?.toggleAttribute('disabled', v >= max)
  }

  const setRadio = (name: string, value: number | string) => {
    const input = root.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`)
    if (input) input.checked = true
  }

  const write = (s: Selection) => {
    pick('identity').checked = s.identity
    pick('website').checked = !!s.website
    if (s.website) {
      setCount('pages', s.website.pages)
      setRadio('after-launch', s.website.managed ? 'managed' : 'handover')
    }
    pick('social').checked = !!s.social
    if (s.social) {
      setRadio('platforms', s.social.platforms)
      setRadio('posts', s.social.posts)
    }
    pick('ads').checked = s.ads
    pick('photo').checked = s.shoots > 0
    if (s.shoots > 0) setCount('shoots', s.shoots)
    pick('print').checked = s.print > 0
    if (s.print > 0) setCount('pieces', s.print)
    if (firstProject) firstProject.checked = s.firstProject
  }

  let announceTimer = 0
  const render = (opts: { announce?: boolean } = {}) => {
    const s = read()
    const e = estimate(s)
    for (const row of root.querySelectorAll<HTMLElement>('[data-line]')) {
      const id = row.dataset.line as LineId
      const line = e.lines.find((l) => l.id === id)
      row.toggleAttribute('data-on', !!line)
      const label = row.querySelector<HTMLElement>('[data-line-label]')
      const amount = row.querySelector<HTMLElement>('[data-line-amount]')
      if (label) label.textContent = line ? line.label : (label.dataset.name ?? '')
      if (amount) amount.innerHTML = line ? `${priceMarkup(line.amount, line.regular)}${line.kind === 'monthly' ? ' a month' : ''}` : 'Not included'
    }
    // The service rows show first-project prices only while the box is ticked; the receipt follows the estimate.
    root.toggleAttribute('data-first', s.firstProject)
    for (const el of root.querySelectorAll<HTMLElement>('[data-savings]')) el.hidden = e.discount === 0
    for (const el of root.querySelectorAll<HTMLElement>('[data-savings-amount]')) el.textContent = dollars(e.discount)
    for (const el of root.querySelectorAll<HTMLElement>('[data-total-regular]')) {
      el.hidden = e.discount === 0
      const figure = el.querySelector<HTMLElement>('[data-figure]')
      if (figure) figure.textContent = dollars(e.oneTimeRegular)
    }
    for (const el of root.querySelectorAll<HTMLElement>('[data-total="oneTime"]')) {
      el.classList.toggle('price-now', e.discount > 0)
      showDollars(el, e.oneTime)
    }
    for (const el of root.querySelectorAll<HTMLElement>('[data-total="monthly"]')) showDollars(el, e.monthly)
    for (const el of root.querySelectorAll<HTMLElement>('[data-total="days"]')) {
      el.textContent = e.lines.length === 0 ? 'Pick a service' : formatDays(e.days)
    }
    for (const el of root.querySelectorAll<HTMLElement>('[data-late-note]')) el.hidden = e.days === null
    root.toggleAttribute('data-empty', e.lines.length === 0)
    if (opts.announce) {
      window.clearTimeout(announceTimer)
      announceTimer = window.setTimeout(() => {
        const savings = e.discount ? ` ${savingsText(e.discount)}.` : ''
        const text = e.lines.length === 0 ? 'Nothing picked.' : `Estimate: ${dollars(e.oneTime)} one-time, ${dollars(e.monthly)} a month, ${formatDays(e.days)}.${savings}`
        announce(announcer, text)
      }, 450)
    }
  }

  // The address carries the selection, so the header's Sign in link brings the visitor back to what they picked.
  const changed = () => {
    render({ announce: true })
    const { pathname, hash } = window.location
    window.history.replaceState(window.history.state, '', `${pathname}${pickSearch(read())}${hash}`)
  }

  root.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement
    if (input.name === 'platforms' || input.name === 'posts') pick('social').checked = true
    if (input.name === 'after-launch') pick('website').checked = true
    changed()
  })

  root.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-change]')
    if (!button) return
    const out = button.closest('.stepper')?.querySelector<HTMLOutputElement>('output')
    const name = out?.dataset.count
    if (!out || !name) return
    const row = button.closest<HTMLElement>('[data-service]')
    const picker = row?.querySelector<HTMLInputElement>('[data-pick]')
    if (picker) picker.checked = true
    setCount(name, Number(out.value) + Number(button.dataset.change))
    changed()
  })

  let lastBrief = ''
  $('[data-use-brief]')?.addEventListener('click', () => {
    const s = read()
    if (estimate(s).lines.length === 0) {
      announce(status, 'Pick at least one service first.')
      return
    }
    const contact = document.querySelector<HTMLElement>('[data-contact]')
    const message = contact?.querySelector<HTMLTextAreaElement>('textarea[name="message"]')
    if (!contact || !message) return
    // Only the brief this button put there is swapped; anything the visitor typed, the brief included once edited, stays.
    const brief = briefText(s)
    const typed = message.value
    message.value = lastBrief && typed.includes(lastBrief) ? typed.replace(lastBrief, () => brief) : typed.trim() ? `${typed.trimEnd()}\n\n${brief}` : brief
    lastBrief = brief
    setFieldError(message, null)
    const empty = EMPTY_FIELDS.flatMap(([name, words]) => {
      const input = contact.querySelector<HTMLInputElement>(`input[name="${name}"]`)
      return input && !input.value.trim() ? [{ input, words }] : []
    })
    const words = empty.map((field) => field.words)
    const list = words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0]
    announce(status, list ? `The brief is in the message box below. Add ${list}, then send it.` : 'The brief is in the message box below, ready to send.')
    ;(empty[0]?.input ?? message).focus()
  })

  const saveButton = $<HTMLButtonElement>('[data-save-brief]')
  saveButton?.addEventListener('click', async () => {
    const s = read()
    if (estimate(s).lines.length === 0) {
      announce(status, 'Pick at least one service first.')
      return
    }
    setBusy(saveButton, true)
    const result = await backend.briefs.save(s)
    const signedIn = !!(await backend.auth.currentSession())
    setBusy(saveButton, false)
    if (result.status === 'failed') {
      announce(status, `The brief didn’t save: ${result.message} Use this brief to put it in the form instead.`)
    } else if (result.status === 'not-saved') {
      announce(status, 'Your browser isn’t keeping site data, so the brief can’t be saved here. Use this brief to put it in the form instead.')
    } else if (result.status === 'already-saved') {
      announce(status, signedIn ? 'Brief already saved: it’s the newest in Your briefs.' : 'Brief already saved on this device. Sign in to see it under Your briefs.')
    } else {
      const where = signedIn ? 'Brief saved to Your briefs.' : 'Brief saved on this device. Sign in to see it under Your briefs.'
      announce(status, result.dropped > 0 ? `${where} Your briefs keeps the newest ${MAX_BRIEFS}, so the oldest brief was removed.` : where)
    }
  })

  const bar = $<HTMLElement>('[data-builder-bar]')
  const rows = $<HTMLElement>('[data-builder-rows]')
  const sheet = $<HTMLElement>('#summary')
  if (bar && rows && sheet && 'IntersectionObserver' in window) {
    let rowsVisible = false
    let sheetVisible = false
    const update = () => {
      bar.hidden = !(rowsVisible && !sheetVisible)
    }
    new IntersectionObserver(([entry]) => {
      rowsVisible = entry.isIntersecting
      update()
    }).observe(rows)
    new IntersectionObserver(([entry]) => {
      sheetVisible = entry.isIntersecting
      update()
    }).observe(sheet)
  }

  const start = (saved: readonly Brief[]) => {
    const preset = selectionFromSearch(window.location.search, saved)
    if (preset) write(preset)
    else if (new URLSearchParams(window.location.search).has('pick')) announce(status, 'That link’s picks couldn’t be read, so the builder starts empty.')
    const id = new URLSearchParams(window.location.search).get('brief')
    const brief = id ? saved.find((b) => b.id === id) : null
    if (brief) announce(status, `Opened your brief from ${formatLongDate(localDate(new Date(brief.savedAt)))}.`)
    else if (id) announce(status, 'That brief isn’t in your saved briefs. Sign in with the account that saved it.')
    for (const name of Object.keys(limits)) setCount(name, Number(counter(name).value))
    render()
  }
  // Only a saved brief needs the backend; plans and services open straight away, totals set without counting up.
  if (new URLSearchParams(window.location.search).has('brief')) void backend.briefs.list().then(start)
  else start([])
}
