/** The header hairline on scroll and the phone menu; main.css locks the page while the menu is open. */
export function initNav(): void {
  const header = document.querySelector<HTMLElement>('[data-header]')
  if (!header) return

  const sentinel = document.createElement('div')
  sentinel.className = 'pointer-events-none absolute top-0 left-0 h-6 w-px'
  sentinel.setAttribute('aria-hidden', 'true')
  document.body.prepend(sentinel)
  new IntersectionObserver(([entry]) => header.toggleAttribute('data-compact', !entry.isIntersecting)).observe(sentinel)

  // Signing in from a page brings you back to it. Written as the link is used, since the builder keeps its picks in the address.
  const pointToAccount = (event: Event) => {
    const link = (event.target as Element | null)?.closest?.<HTMLAnchorElement>('a[data-page="account"]')
    if (!link) return
    const back = !document.documentElement.hasAttribute('data-signed-in') && !window.location.pathname.endsWith('/account/')
    link.setAttribute('href', back ? `${link.pathname}?next=${encodeURIComponent(window.location.pathname + window.location.search)}` : link.pathname)
  }
  for (const type of ['pointerover', 'focusin', 'click']) document.addEventListener(type, pointToAccount)

  const button = header.querySelector<HTMLButtonElement>('[data-menu-button]')
  const menu = document.querySelector<HTMLDialogElement>('#site-menu')
  if (!button || !menu) return
  const wide = window.matchMedia('(min-width: 64rem)')

  button.addEventListener('click', () => {
    if (menu.open) return
    menu.showModal()
    button.setAttribute('aria-expanded', 'true')
  })

  menu.querySelector('[data-menu-close]')?.addEventListener('click', () => menu.close())

  // The menu sits in one wrapper, so a click on the dialog element itself is on the scrim.
  menu.addEventListener('click', (event) => {
    if (event.target === menu || (event.target as Element).closest('a')) menu.close()
  })

  menu.addEventListener('close', () => {
    button.setAttribute('aria-expanded', 'false')
    button.focus()
  })

  wide.addEventListener('change', (event) => {
    if (event.matches && menu.open) menu.close()
  })
}
