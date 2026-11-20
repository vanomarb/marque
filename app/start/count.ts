import { countFrom, countStep } from '../lib/count.ts'
import { dollars } from '../lib/format.ts'

const running = new WeakMap<HTMLElement, number>()

/** Eases to the amount over 200 ms from the figure on screen (see countFrom); reduced motion sets it at once. */
export function showDollars(el: HTMLElement, amount: number): void {
  const last = el.dataset.amount === undefined ? undefined : Number(el.dataset.amount)
  const from = countFrom(el.textContent, last, amount)
  el.dataset.amount = String(amount)
  const cancel = running.get(el)
  if (cancel) cancelAnimationFrame(cancel)
  running.delete(el)
  if (from === amount || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = dollars(amount)
    return
  }
  const start = performance.now()
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / 200)
    el.textContent = dollars(countStep(from, amount, t))
    if (t < 1) running.set(el, requestAnimationFrame(step))
    else running.delete(el)
  }
  running.set(el, requestAnimationFrame(step))
}
