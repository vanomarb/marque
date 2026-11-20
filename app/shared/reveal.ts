/** Only targets below the first screen are hidden; data-ready tells the head script this ran, so it keeps the js class. */
export function initReveal(): void {
  const root = document.documentElement
  root.setAttribute('data-ready', '')
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return

  const targets = [...document.querySelectorAll<HTMLElement>('[data-reveal]')].flatMap((section) => {
    const items = [...section.querySelectorAll<HTMLElement>('[data-reveal-item]')]
    return items.length ? items : [section]
  })
  // Measure first, then write, so the layout is read once.
  const below = targets.filter((el) => el.getBoundingClientRect().top >= window.innerHeight)
  if (below.length === 0) return
  below.forEach((el) => el.setAttribute('data-reveal-pending', ''))

  const observer = new IntersectionObserver(
    (entries) => {
      const entering = entries.filter((e) => e.isIntersecting).map((e) => e.target as HTMLElement)
      entering.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
      entering.forEach((el, i) => {
        el.style.setProperty('--reveal-delay', `${Math.min(i, 8) * 60}ms`)
        el.setAttribute('data-in', '')
        observer.unobserve(el)
      })
    },
    { rootMargin: '0px 0px -6% 0px' },
  )
  below.forEach((el) => observer.observe(el))
}
