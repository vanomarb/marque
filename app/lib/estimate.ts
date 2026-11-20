import { peso } from './format.ts'

export type ServiceId = 'identity' | 'website' | 'social' | 'ads' | 'photo' | 'print'

export interface Service {
  id: ServiceId
  name: string
  /** Pesos: the cheapest the builder can price this service (a test holds it to that). */
  from: number
  unit: string
  includes: string
  time: string
}

export type Platforms = 1 | 2 | 3 | 4
export type Posts = 12 | 20 | 30

export interface Selection {
  identity: boolean
  website: { pages: number } | null
  social: { platforms: Platforms; posts: Posts } | null
  ads: boolean
  shoots: number
  print: number
}

export interface Line {
  id: ServiceId
  label: string
  amount: number
  kind: 'one-time' | 'monthly'
}

export interface Estimate {
  oneTime: number
  monthly: number
  /** From and to; null when nothing is built (only monthly work, or nothing picked). */
  weeks: [number, number] | null
  lines: Line[]
}

// The page tests hold every price and timeline in the HTML to SERVICES, so a price changes only here.
export const PRICE = { identity: 45_000, website: 60_000, ads: 15_000, shoot: 18_000, piece: 8_000 } as const
export const PAGES = { included: 6, max: 12, extra: 6_000 } as const
/** Two platforms with 12 posts is the base package; each platform more or fewer is perPlatform. */
export const SOCIAL = { base: 25_000, perPlatform: 8_000, posts: { 12: 0, 20: 10_000, 30: 22_000 } } as const
/** Identity and a website overlap, so together they take 7 to 11 weeks; shoots and print fit inside any build. */
export const WEEKS = { identity: [4, 6], website: [4, 8], identityAndWebsite: [7, 11], shootsOrPrint: [1, 2] } as const satisfies Record<string, readonly [number, number]>
/** What ticking Social media starts at: the package every "from" price on the site names. */
export const DEFAULT_SOCIAL: { platforms: Platforms; posts: Posts } = { platforms: 1, posts: 12 }
export const LIMITS = { shoots: 4, print: 10 } as const

const clampCount = (n: number, max: number) => Math.min(max, Math.max(0, Math.floor(Number.isFinite(n) ? n : 0)))
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const clampPages = (pages: number) => Math.min(PAGES.max, Math.max(1, Math.floor(pages)))

export function websitePrice(pages: number): number {
  return PRICE.website + Math.max(0, clampPages(pages) - PAGES.included) * PAGES.extra
}

export function socialPrice(platforms: Platforms, posts: Posts): number {
  return SOCIAL.base + (platforms - 2) * SOCIAL.perPlatform + SOCIAL.posts[posts]
}

export function estimate(s: Selection): Estimate {
  const lines: Line[] = []
  const shoots = clampCount(s.shoots, LIMITS.shoots)
  const print = clampCount(s.print, LIMITS.print)

  if (s.identity) lines.push({ id: 'identity', label: 'Brand identity', amount: PRICE.identity, kind: 'one-time' })
  if (s.website) {
    const pages = clampPages(s.website.pages)
    lines.push({ id: 'website', label: `Website, ${plural(pages, 'page', 'pages')}`, amount: websitePrice(pages), kind: 'one-time' })
  }
  if (shoots) lines.push({ id: 'photo', label: `Photo and video, ${plural(shoots, 'shoot', 'shoots')}`, amount: shoots * PRICE.shoot, kind: 'one-time' })
  if (print) lines.push({ id: 'print', label: `Menu, signage and print, ${plural(print, 'piece', 'pieces')}`, amount: print * PRICE.piece, kind: 'one-time' })
  if (s.social) {
    const { platforms, posts } = s.social
    lines.push({ id: 'social', label: `Social media, ${plural(platforms, 'platform', 'platforms')}, ${posts} posts a month`, amount: socialPrice(platforms, posts), kind: 'monthly' })
  }
  if (s.ads) lines.push({ id: 'ads', label: 'Ads management (ad spend billed separately)', amount: PRICE.ads, kind: 'monthly' })

  const sum = (kind: Line['kind']) => lines.filter((l) => l.kind === kind).reduce((total, l) => total + l.amount, 0)

  const range = s.identity && s.website ? WEEKS.identityAndWebsite : s.identity ? WEEKS.identity : s.website ? WEEKS.website : shoots || print ? WEEKS.shootsOrPrint : null
  return { oneTime: sum('one-time'), monthly: sum('monthly'), weeks: range ? [range[0], range[1]] : null, lines }
}

export function formatWeeks(weeks: readonly [number, number] | null): string {
  return weeks ? `${weeks[0]} to ${weeks[1]} weeks` : 'monthly work, no build timeline'
}

export const SERVICES: readonly Service[] = [
  { id: 'identity', name: 'Brand identity', from: PRICE.identity, unit: 'one-time', includes: 'Logo, colours, type and a guidelines document', time: formatWeeks(WEEKS.identity) },
  { id: 'website', name: 'Website', from: websitePrice(1), unit: 'one-time', includes: `Design and build, up to ${PAGES.included} pages`, time: formatWeeks(WEEKS.website) },
  { id: 'social', name: 'Social media management', from: socialPrice(DEFAULT_SOCIAL.platforms, DEFAULT_SOCIAL.posts), unit: 'a month', includes: `1 platform, 12 posts a month, replies in office hours; 2 platforms ${peso(socialPrice(2, 12))}`, time: 'Month to month' },
  { id: 'ads', name: 'Ads management', from: PRICE.ads, unit: 'a month', includes: 'Meta and Google ads; ad spend billed separately', time: 'Month to month' },
  { id: 'photo', name: 'Photo and video', from: PRICE.shoot, unit: 'per shoot', includes: 'A half-day shoot: 20 edited photos or 3 short videos', time: formatWeeks(WEEKS.shootsOrPrint) },
  { id: 'print', name: 'Menu, signage and print design', from: PRICE.piece, unit: 'per piece', includes: 'One menu, sign, flyer or packaging design, print-ready', time: formatWeeks(WEEKS.shootsOrPrint) },
]

export function briefText(s: Selection): string {
  const e = estimate(s)
  const head = 'Project brief from the Marque builder'
  if (e.lines.length === 0) return `${head}\n\nNo services picked yet.`
  const lines = e.lines.map((l) => `${l.label}: ${peso(l.amount)}, ${l.kind === 'monthly' ? 'a month' : 'one-time'}`)
  return [
    head,
    '',
    ...lines,
    '',
    ...(e.oneTime > 0 ? [`One-time total: ${peso(e.oneTime)}`] : []),
    `Monthly total: ${peso(e.monthly)}`,
    `Timeline: ${formatWeeks(e.weeks)}`,
  ].join('\n')
}

export function sameSelection(a: Selection, b: Selection): boolean {
  const key = (s: Selection) => JSON.stringify([s.identity, s.website?.pages ?? null, s.social ? [s.social.platforms, s.social.posts] : null, s.ads, s.shoots, s.print])
  return key(a) === key(b)
}

const isCount = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0

export function isSelection(value: unknown): value is Selection {
  const v = value as Selection | null
  if (!v || typeof v !== 'object') return false
  if (typeof v.identity !== 'boolean' || typeof v.ads !== 'boolean') return false
  if (!isCount(v.shoots) || v.shoots > LIMITS.shoots || !isCount(v.print) || v.print > LIMITS.print) return false
  if (v.website !== null && !(typeof v.website === 'object' && isCount(v.website.pages) && v.website.pages >= 1 && v.website.pages <= PAGES.max)) return false
  if (v.social !== null && !(typeof v.social === 'object' && [1, 2, 3, 4].includes(v.social.platforms) && [12, 20, 30].includes(v.social.posts))) return false
  return true
}

const SHORT: { test: (s: Selection) => boolean; name: string }[] = [
  { test: (s) => s.identity, name: 'brand identity' },
  { test: (s) => !!s.website, name: 'website' },
  { test: (s) => s.shoots > 0, name: 'photo and video' },
  { test: (s) => s.print > 0, name: 'print' },
  { test: (s) => !!s.social, name: 'social media' },
  { test: (s) => s.ads, name: 'ads' },
]

/** "Brand identity, website and ads", in the order the lines appear. */
export function briefTitle(s: Selection): string {
  const names = SHORT.filter((x) => x.test(s)).map((x) => x.name)
  if (names.length === 0) return 'Empty brief'
  const text = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return text.charAt(0).toUpperCase() + text.slice(1)
}
