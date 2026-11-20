import type { Brief } from './account.ts'
import { DEFAULT_SOCIAL, type Selection, type ServiceId } from './estimate.ts'

// Links in from Home (?set=launch), a Services row (?add=<service>) and Your briefs (?brief=<id>).

const EMPTY: Selection = { identity: false, website: null, social: null, ads: false, shoots: 0, print: 0 }

export const LAUNCH_SET: Selection = { ...EMPTY, identity: true, website: { pages: 6 } }

const ONE: Record<ServiceId, Selection> = {
  identity: { ...EMPTY, identity: true },
  website: { ...EMPTY, website: { pages: 6 } },
  social: { ...EMPTY, social: { ...DEFAULT_SOCIAL } },
  ads: { ...EMPTY, ads: true },
  photo: { ...EMPTY, shoots: 1 },
  print: { ...EMPTY, print: 1 },
}

export function selectionFromSearch(search: string, briefs: readonly Brief[]): Selection | null {
  const params = new URLSearchParams(search)
  if (params.get('set') === 'launch') return { ...LAUNCH_SET }
  const add = params.get('add')
  if (add && Object.hasOwn(ONE, add)) return { ...ONE[add as ServiceId] }
  const id = params.get('brief')
  if (id) return briefs.find((b) => b.id === id)?.selection ?? null
  return null
}
