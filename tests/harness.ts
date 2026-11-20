import { readFileSync } from 'node:fs'
import { JSDOM, VirtualConsole } from 'jsdom'
import { includePartials } from '../build/partials.ts'
import { BASE } from '../build/site.ts'
import { boot } from '../app/boot.ts'
import type { Backend } from '../app/lib/backend/index.ts'

// The stand-ins below imitate what jsdom lacks; they are not the code under test.

/** A file in the repository, by its path from the repository root. */
export const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const partials = { head: read('app/components/head.html'), header: read('app/components/header.html'), footer: read('app/components/footer.html') }

interface PageOptions {
  /** Set before the page parses; values that aren't strings are JSON-encoded. */
  storage?: Record<string, unknown>
  /** Default true, so totals are set at once. */
  reducedMotion?: boolean
}

export interface Page {
  window: JSDOM['window']
  document: Document
  /** Returns any start-up errors it logged. Without a backend, the page gets the real local one. */
  boot(backend?: Backend): string[]
  $<T extends Element = HTMLElement>(selector: string): T
  $$<T extends Element = HTMLElement>(selector: string): T[]
  type(selector: string, text: string): void
  key(key: string, target?: Element): void
  /** The live-region announcements wait 60 ms. */
  wait(ms?: number): Promise<void>
  resize(wide: boolean): void
  storage(key: string): unknown
  close(): void
}

const open: Page[] = []

/** Open pages' timers would otherwise keep the test process alive. */
export function closeAll(): void {
  while (open.length) open.pop()!.close()
}

/** `file` is relative to app/; `path` may carry a query, like 'start/?set=launch'. */
export function loadPage(file: string, path: string, options: PageOptions = {}): Page {
  const { storage = {}, reducedMotion = true } = options
  let wide = false
  const mediaListeners = new Set<(event: { matches: boolean }) => void>()
  const virtualConsole = new VirtualConsole()
  const problems: string[] = []
  virtualConsole.on('jsdomError', (error: Error) => problems.push(error.message))

  const dom = new JSDOM(includePartials(read(`app/${file}`), partials, BASE), {
    url: `https://marque.test${BASE}${path}`,
    pretendToBeVisual: true,
    // The only mode where jsdom runs inline scripts while parsing and keeps <noscript> inert. boot() stands in for
    // the module script.
    runScripts: 'dangerously',
    virtualConsole,
    beforeParse(window) {
      // Stand-in: matchMedia for the two queries the scripts ask.
      window.matchMedia = ((query: string) => ({
        media: query,
        get matches() {
          if (query.includes('prefers-reduced-motion: reduce')) return reducedMotion
          if (query.includes('min-width: 64rem')) return wide
          return false
        },
        addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => {
          if (query.includes('min-width: 64rem')) mediaListeners.add(listener)
        },
        removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => mediaListeners.delete(listener),
      })) as unknown as typeof window.matchMedia

      // Stand-in: an IntersectionObserver that never reports, as if nothing scrolled.
      window.IntersectionObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return []
        }
      } as unknown as typeof window.IntersectionObserver

      // Stand-in for <dialog>. It doesn't hand focus back on close: the site's code must, and the tests check it.
      const dialog = window.HTMLDialogElement.prototype as HTMLDialogElement & Record<string, unknown>
      dialog.showModal = function (this: HTMLDialogElement) {
        if (this.open) throw new window.DOMException('The dialog is already open.', 'InvalidStateError')
        this.setAttribute('open', '')
        const target = this.querySelector<HTMLElement>('[autofocus]') ?? this.querySelector<HTMLElement>('a[href], button, input, select, textarea')
        target?.focus()
      }
      dialog.close = function (this: HTMLDialogElement) {
        if (!this.open) return
        this.removeAttribute('open')
        this.dispatchEvent(new window.Event('close'))
      }
      window.document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return
        const top = [...window.document.querySelectorAll('dialog[open]')].pop() as HTMLDialogElement | undefined
        if (top && top.dispatchEvent(new window.Event('cancel', { cancelable: true }))) top.close()
      })

      // jsdom can't navigate, so links stop once every handler on the page has seen the click.
      window.addEventListener('click', (event) => {
        if ((event.target as Element | null)?.closest?.('a[href]')) event.preventDefault()
      })

      for (const [key, value] of Object.entries(storage)) window.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
    },
  })
  const { window } = dom
  const document = window.document

  const page: Page = {
    window,
    document,
    boot(backend) {
      // The feature modules use the browser's globals, so point them at this page.
      Object.assign(globalThis, {
        window,
        document,
        Node: window.Node,
        requestAnimationFrame: window.requestAnimationFrame.bind(window),
        cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
        IntersectionObserver: window.IntersectionObserver,
      })
      const logged: string[] = []
      const original = console.error
      console.error = (...args: unknown[]) => void logged.push(args.map(String).join(' '))
      try {
        boot(backend)
      } finally {
        console.error = original
      }
      return [...logged, ...problems]
    },
    $<T extends Element = HTMLElement>(selector: string) {
      const found = document.querySelector<T>(selector)
      if (!found) throw new Error(`No element matches ${selector}`)
      return found
    },
    $$<T extends Element = HTMLElement>(selector: string) {
      return [...document.querySelectorAll<T>(selector)]
    },
    type(selector, text) {
      const field = page.$<HTMLInputElement>(selector)
      field.value = text
      field.dispatchEvent(new window.Event('input', { bubbles: true }))
    },
    key(key, target = document.activeElement ?? document.body) {
      target.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    },
    wait(ms = 80) {
      return new Promise((resolve) => window.setTimeout(resolve, ms))
    },
    resize(next) {
      wide = next
      for (const listener of mediaListeners) listener({ matches: next })
    },
    storage(key) {
      const text = window.localStorage.getItem(key)
      return text === null ? null : JSON.parse(text)
    },
    close() {
      window.close()
    },
  }
  open.push(page)
  return page
}
