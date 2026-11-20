import { SORT_NAMES, isWorkSort, sortWorks } from '../lib/works.ts'
import { announce } from '../shared/fields.ts'

/** Without this script the list stays in the order the page gives it (newest first) and the sort control stays hidden. */
export function initWorks(root: HTMLElement): void {
  const control = root.querySelector<HTMLFieldSetElement>('[data-works-sort]')
  const list = root.querySelector<HTMLElement>('[data-works-list]')
  const status = root.querySelector<HTMLElement>('[data-works-status]')
  if (!control || !list) return
  control.hidden = false

  control.addEventListener('change', (event) => {
    const by = (event.target as HTMLInputElement).value
    if (!isWorkSort(by)) return
    const items = [...list.querySelectorAll<HTMLElement>(':scope > [data-work]')].map((el) => ({ el, name: el.dataset.name ?? '', launched: el.dataset.launched ?? '' }))
    list.append(...sortWorks(items, by).map((item) => item.el))
    announce(status, `Showing ${SORT_NAMES[by]}.`)
  })
}
