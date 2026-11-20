import { MAX_BRIEFS, loadBriefs, loadSession, saveBrief } from '../lib/account.ts'
import { DEFAULT_SOCIAL, LIMITS, PAGES, briefText, estimate, formatWeeks, type Platforms, type Posts, type Selection, type ServiceId } from '../lib/estimate.ts'
import { formatLongDate, manilaTime } from '../lib/time.ts'
import { peso } from '../lib/format.ts'
import { selectionFromSearch } from '../lib/start-link.ts'
import { showPeso } from './count.ts'
import { announce } from '../shared/fields.ts'
import { browserStore } from '../shared/storage.ts'

export function initBuilder(root: HTMLElement): void {
  const store = browserStore()
  const $ = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)
  const pick = (id: ServiceId) => $<HTMLInputElement>(`[data-service="${id}"] [data-pick]`)!
  const counter = (name: string) => $<HTMLOutputElement>(`[data-count="${name}"]`)!
  const radio = (name: string) => root.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)
  const status = $<HTMLElement>('[data-builder-status]')
  const announcer = $<HTMLElement>('[data-estimate-announce]')
  const limits: Record<string, [number, number]> = { pages: [1, PAGES.max], shoots: [1, LIMITS.shoots], pieces: [1, LIMITS.print] }

  const read = (): Selection => ({
    identity: pick('identity').checked,
    website: pick('website').checked ? { pages: Number(counter('pages').value) } : null,
    social: pick('social').checked ? { platforms: Number(radio('platforms')?.value ?? DEFAULT_SOCIAL.platforms) as Platforms, posts: Number(radio('posts')?.value ?? DEFAULT_SOCIAL.posts) as Posts } : null,
    ads: pick('ads').checked,
    shoots: pick('photo').checked ? Number(counter('shoots').value) : 0,
    print: pick('print').checked ? Number(counter('pieces').value) : 0,
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

  const setRadio = (name: string, value: number) => {
    const input = root.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`)
    if (input) input.checked = true
  }

  const write = (s: Selection) => {
    pick('identity').checked = s.identity
    pick('website').checked = !!s.website
    if (s.website) setCount('pages', s.website.pages)
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
  }

  let announceTimer = 0
  const render = (opts: { announce?: boolean } = {}) => {
    const s = read()
    const e = estimate(s)
    for (const row of root.querySelectorAll<HTMLElement>('[data-line]')) {
      const id = row.dataset.line as ServiceId
      const line = e.lines.find((l) => l.id === id)
      row.toggleAttribute('data-on', !!line)
      const label = row.querySelector<HTMLElement>('[data-line-label]')
      const amount = row.querySelector<HTMLElement>('[data-line-amount]')
      if (label) label.textContent = line ? line.label.replace(' (ad spend billed separately)', '') : (label.dataset.name ?? '')
      if (amount) amount.textContent = line ? `${peso(line.amount)}${line.kind === 'monthly' ? ' a month' : ''}` : 'Not included'
    }
    for (const el of root.querySelectorAll<HTMLElement>('[data-total="oneTime"]')) showPeso(el, e.oneTime)
    for (const el of root.querySelectorAll<HTMLElement>('[data-total="monthly"]')) showPeso(el, e.monthly)
    for (const el of root.querySelectorAll<HTMLElement>('[data-total="weeks"]')) {
      el.textContent = e.lines.length === 0 ? 'Pick a service' : e.weeks ? `${e.weeks[0]} to ${e.weeks[1]} weeks` : 'Starts when you’re ready'
    }
    root.toggleAttribute('data-empty', e.lines.length === 0)
    if (opts.announce) {
      window.clearTimeout(announceTimer)
      announceTimer = window.setTimeout(() => {
        const text = e.lines.length === 0 ? 'Nothing picked.' : `Estimate: ${peso(e.oneTime)} one-time, ${peso(e.monthly)} a month, ${formatWeeks(e.weeks)}.`
        announce(announcer, text)
      }, 450)
    }
  }

  root.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement
    if (input.name === 'platforms' || input.name === 'posts') pick('social').checked = true
    render({ announce: true })
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
    render({ announce: true })
  })

  $('[data-use-brief]')?.addEventListener('click', () => {
    const s = read()
    if (estimate(s).lines.length === 0) {
      announce(status, 'Pick at least one service first.')
      return
    }
    const contact = document.querySelector<HTMLElement>('[data-contact]')
    const message = contact?.querySelector<HTMLTextAreaElement>('textarea[name="message"]')
    const name = contact?.querySelector<HTMLInputElement>('input[name="name"]')
    if (!message) return
    message.value = briefText(s)
    message.removeAttribute('aria-invalid')
    announce(status, 'The brief is in the message box below. Add your name and business, then send it.')
    ;(name && !name.value.trim() ? name : message).focus()
  })

  $('[data-save-brief]')?.addEventListener('click', () => {
    const s = read()
    if (estimate(s).lines.length === 0) {
      announce(status, 'Pick at least one service first.')
      return
    }
    const result = saveBrief(store, s)
    const signedIn = !!loadSession(store)
    if (result.status === 'not-saved') {
      announce(status, 'Your browser isn’t keeping site data, so the brief can’t be saved here. Use this brief to put it in the form instead.')
    } else if (result.status === 'already-saved') {
      announce(status, signedIn ? 'Already saved: it’s the newest brief in Your briefs.' : 'Already saved on this device. Sign in to see it under Your briefs.')
    } else {
      const where = signedIn ? 'Saved to Your briefs.' : 'Saved on this device. Sign in to see it under Your briefs.'
      announce(status, result.removed > 0 ? `${where} Your briefs keeps the newest ${MAX_BRIEFS}, so the oldest brief was removed.` : where)
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

  const briefs = loadBriefs(store)
  const preset = selectionFromSearch(window.location.search, briefs)
  if (preset) {
    write(preset)
    const id = new URLSearchParams(window.location.search).get('brief')
    const brief = id ? briefs.find((b) => b.id === id) : null
    if (brief) announce(status, `Opened your brief from ${formatLongDate(manilaTime(new Date(brief.savedAt)).isoDate)}.`)
  }
  for (const name of Object.keys(limits)) setCount(name, Number(counter(name).value))
  render()
}
