import type { Brief } from './account.ts'
import { DEFAULT_SOCIAL, DEFAULT_WEBSITE, EMPTY_SELECTION, PLANS, isSelection, type Selection, type ServiceId } from './estimate.ts'

// Links in from Home and Pricing (?set=<plan>), a Services row (?add=<service>), Your briefs (?brief=<id>), and the
// builder's own address (?pick=<selection>), which it keeps up to date so a sign-in brings the visitor back to it.

const ONE: Record<ServiceId, Selection> = {
  identity: { ...EMPTY_SELECTION, identity: true },
  website: { ...EMPTY_SELECTION, website: { ...DEFAULT_WEBSITE } },
  social: { ...EMPTY_SELECTION, social: { ...DEFAULT_SOCIAL } },
  ads: { ...EMPTY_SELECTION, ads: true },
  photo: { ...EMPTY_SELECTION, shoots: 1 },
  print: { ...EMPTY_SELECTION, print: 1 },
}

/** One token per service, joined by dots: i, w<pages>[h for handed over], s<platforms>x<posts>, a, p<shoots>, r<pieces>, then f for a first project. */
const TOKEN = /^(?:(i)|w([1-9]\d?)(h?)|s(\d)x(\d+)|(a)|p([1-9]\d?)|r([1-9]\d?)|f)$/

/** The builder's address for a selection: "?pick=i.w6.f" for the Launch plan, or "" when nothing is picked. */
export function pickSearch(s: Selection): string {
  const tokens = [
    s.identity && 'i',
    s.website && `w${s.website.pages}${s.website.managed ? '' : 'h'}`,
    s.social && `s${s.social.platforms}x${s.social.posts}`,
    s.ads && 'a',
    s.shoots > 0 && `p${s.shoots}`,
    s.print > 0 && `r${s.print}`,
  ].filter((token) => typeof token === 'string')
  return tokens.length ? `?pick=${[...tokens, ...(s.firstProject ? ['f'] : [])].join('.')}` : ''
}

function fromPick(pick: string): Selection | null {
  const s: Selection = { ...EMPTY_SELECTION, firstProject: false }
  for (const token of pick.split('.')) {
    const m = TOKEN.exec(token)
    if (!m) return null
    const [, identity, pages, handedOver, platforms, posts, ads, shoots, print] = m
    if (identity) s.identity = true
    else if (pages) s.website = { pages: Number(pages), managed: !handedOver }
    else if (platforms) s.social = { platforms: Number(platforms), posts: Number(posts) } as Selection['social']
    else if (ads) s.ads = true
    else if (shoots) s.shoots = Number(shoots)
    else if (print) s.print = Number(print)
    else s.firstProject = true
  }
  // Only the exact spelling pickSearch gives a selection the builder could make reads back: no repeats, no odd order.
  return isSelection(s) && pickSearch(s) === `?pick=${pick}` ? s : null
}

export function selectionFromSearch(search: string, briefs: readonly Brief[]): Selection | null {
  const params = new URLSearchParams(search)
  const plan = PLANS.find((p) => p.id === params.get('set'))
  if (plan) return { ...plan.selection }
  const add = params.get('add')
  if (add && Object.hasOwn(ONE, add)) return { ...ONE[add as ServiceId] }
  const id = params.get('brief')
  if (id) return briefs.find((b) => b.id === id)?.selection ?? null
  const pick = params.get('pick')
  if (pick) return fromPick(pick)
  return null
}
