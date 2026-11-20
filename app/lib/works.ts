// The projects on Works, in the order they launched. The pages are written by hand; a test holds them to this list.

export type WorkId = 'usual' | 'bayline' | 'enamel'

export interface Work {
  id: WorkId
  name: string
  type: string
  /** The day it went live, as yyyy-mm-dd. */
  launched: string
}

export const WORKS: readonly Work[] = [
  { id: 'usual', name: 'Usual', type: 'Coffee bar', launched: '2026-11-19' },
  { id: 'bayline', name: 'Bayline', type: 'Car wash', launched: '2026-11-20' },
  { id: 'enamel', name: 'Enamel', type: 'Dental clinic', launched: '2026-11-20' },
]

export type WorkSort = 'newest' | 'oldest' | 'name'

/** What the sort control announces, after "Showing". */
export const SORT_NAMES: Record<WorkSort, string> = { newest: 'newest first', oldest: 'oldest first', name: 'by name, A to Z' }

export const isWorkSort = (value: unknown): value is WorkSort => typeof value === 'string' && Object.hasOwn(SORT_NAMES, value)

/** Projects that launched the same day keep to name order, so every sort is stable. */
export function sortWorks<T extends Pick<Work, 'name' | 'launched'>>(items: readonly T[], by: WorkSort): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, 'en')
  return [...items].sort((a, b) => {
    if (by === 'name') return byName(a, b)
    const byDate = by === 'newest' ? b.launched.localeCompare(a.launched) : a.launched.localeCompare(b.launched)
    return byDate || byName(a, b)
  })
}

/** The project before and after this one, going round the list in launch order. */
export function neighbours(id: WorkId): { previous: Work; next: Work } {
  const at = WORKS.findIndex((w) => w.id === id)
  return { previous: WORKS[(at + WORKS.length - 1) % WORKS.length], next: WORKS[(at + 1) % WORKS.length] }
}
