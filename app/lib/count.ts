import { parseDollars } from './format.ts'

/**
 * On the first render it starts at `next`, so a deep link doesn't count up from the page's $0. After that it starts
 * from the figure on screen, so a change mid-count carries on from what the visitor sees.
 */
export function countFrom(onScreen: string | null, lastTarget: number | undefined, next: number): number {
  if (lastTarget === undefined) return next
  return parseDollars(onScreen) ?? lastTarget
}

/** t runs 0 to 1: eased out, in whole hundreds, and exactly `to` at the end. */
export function countStep(from: number, to: number, t: number): number {
  if (t >= 1) return to
  const eased = 1 - (1 - Math.max(0, t)) ** 3
  return Math.round((from + (to - from) * eased) / 100) * 100
}
