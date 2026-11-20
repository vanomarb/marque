import { dollars } from './format.ts'

export type ServiceId = 'identity' | 'website' | 'social' | 'ads' | 'photo' | 'print'

export interface Service {
  id: ServiceId
  name: string
  /** Dollars, the regular price: the cheapest the builder can price this service without the first-project discount (a test holds it to that). */
  from: number
  unit: string
  includes: string
  time: string
}

export type Platforms = (typeof PLATFORMS)[number]
export type Posts = keyof typeof SOCIAL.posts

export interface Website {
  pages: number
  /** True: Marque hosts and looks after the site for PRICE.managed a month. False: the code is handed over and the client hosts it. */
  managed: boolean
}

export interface Selection {
  identity: boolean
  website: Website | null
  social: { platforms: Platforms; posts: Posts } | null
  ads: boolean
  shoots: number
  print: number
  /** The client's first project with Marque: FIRST_PROJECT.percent comes off the one-time work. */
  firstProject: boolean
}

/** A service, or the monthly line a managed website adds. */
export type LineId = ServiceId | 'managed'

interface Line {
  id: LineId
  label: string
  /** What this line costs: its first-project price when the discount applies. */
  amount: number
  kind: 'one-time' | 'monthly'
  /** The regular price, set only on a one-time line the first-project discount has lowered. */
  regular?: number
  /** Said after the label in the brief; the receipt leaves it out for room. */
  note?: string
}

export interface Estimate {
  /** After the first-project discount. */
  oneTime: number
  /** Before the first-project discount. */
  oneTimeRegular: number
  monthly: number
  /** What the first-project discount takes off the one-time work (oneTimeRegular − oneTime); 0 when it doesn't apply. */
  discount: number
  /** From and to, in days; null when nothing is built (only monthly work, or nothing picked). */
  days: [number, number] | null
  lines: Line[]
}

/** `managed` is the monthly fee for a website Marque hosts and looks after. Marque never sells or renews domains. */
export const PRICE = { identity: 390, website: 690, managed: 39, ads: 250, shoot: 290, piece: 90 } as const
export const PAGES = { included: 6, max: 12, extra: 60 } as const
/** Two platforms with 12 posts is the base package; each platform more or fewer is perPlatform. */
export const SOCIAL = { base: 390, perPlatform: 100, posts: { 12: 0, 20: 120, 30: 250 } } as const
const PLATFORMS = [1, 2, 3, 4] as const
/** Every one-time service, alone or together, is ready in 1 to 3 days. Day 3 is the promise the late-day credit backs. */
export const DAYS = [1, 3] as const
/** For each day past day 3, perDay comes off the final invoice, never more than the price of that service. */
export const LATE_CREDIT = { perDay: 5 } as const
/** New clients: this much off their first one-time project, taken off the regular prices. Monthly work is never discounted. */
export const FIRST_PROJECT = { percent: 15 } as const
/** The offer's one name, on every badge and label that shows a first-project price. */
export const FIRST_PROJECT_LABEL = `First project, ${FIRST_PROJECT.percent}% off`
/** What ticking Social media starts at: the package every "from" price on the site names. */
export const DEFAULT_SOCIAL: { platforms: Platforms; posts: Posts } = { platforms: 1, posts: 12 }
/** What ticking Website starts at: the pages the base price covers, managed after launch. */
export const DEFAULT_WEBSITE: Website = { pages: PAGES.included, managed: true }
export const LIMITS = { shoots: 4, print: 10 } as const

export const MANAGED_LABEL = 'Managed hosting (subdomain or your domain, backups, updates)'
/** The late-day credit in one line, as the builder, the brief and the pages say it. */
export const LATE_TEXT = `Ready by day ${DAYS[1]}, or ${dollars(LATE_CREDIT.perDay)} off for each day late, up to the price of that service.`

const clampCount = (n: number, max: number) => Math.min(max, Math.max(0, Math.floor(Number.isFinite(n) ? n : 0)))
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const clampPages = (pages: number) => Math.min(PAGES.max, Math.max(1, Math.floor(pages)))

function websitePrice(pages: number): number {
  return PRICE.website + Math.max(0, clampPages(pages) - PAGES.included) * PAGES.extra
}

function socialPrice(platforms: Platforms, posts: Posts): number {
  return SOCIAL.base + (platforms - 2) * SOCIAL.perPlatform + SOCIAL.posts[posts]
}

/** A one-time price with the first-project discount: FIRST_PROJECT.percent comes off, rounded up to the dollar in the client's favour. */
export function firstProjectPrice(regular: number): number {
  return regular - Math.ceil((regular * FIRST_PROJECT.percent) / 100)
}

/** What the receipt's savings line says. */
export function savingsText(discount: number): string {
  return `You save ${dollars(discount)} on your first project`
}

/** The lines, each one-time line at its first-project price when that applies, then the totals as their sums. */
export function estimate(s: Selection): Estimate {
  const lines: Line[] = []
  const shoots = clampCount(s.shoots, LIMITS.shoots)
  const print = clampCount(s.print, LIMITS.print)

  if (s.identity) lines.push({ id: 'identity', label: 'Brand identity', amount: PRICE.identity, kind: 'one-time' })
  if (s.website) {
    const pages = clampPages(s.website.pages)
    const managed = s.website.managed
    lines.push({ id: 'website', label: `Website, ${plural(pages, 'page', 'pages')}${managed ? '' : ', code handed over'}`, amount: websitePrice(pages), kind: 'one-time' })
    if (managed) lines.push({ id: 'managed', label: MANAGED_LABEL, amount: PRICE.managed, kind: 'monthly' })
  }
  if (shoots) lines.push({ id: 'photo', label: `Photo and video, ${plural(shoots, 'shoot', 'shoots')}`, amount: shoots * PRICE.shoot, kind: 'one-time' })
  if (print) lines.push({ id: 'print', label: `Menu, signage and print, ${plural(print, 'piece', 'pieces')}`, amount: print * PRICE.piece, kind: 'one-time' })
  const oneTimeLines = lines.filter((l) => l.kind === 'one-time')
  const regular = oneTimeLines.reduce((total, l) => total + l.amount, 0)
  if (s.firstProject) {
    // Shoots and pieces save per unit, so the line is always units × the first-project price the listings show.
    const units: Partial<Record<LineId, number>> = { photo: shoots, print }
    for (const line of oneTimeLines) {
      const n = units[line.id] ?? 1
      line.regular = line.amount
      line.amount = n * firstProjectPrice(line.amount / n)
    }
  }
  if (s.social) {
    const { platforms, posts } = s.social
    lines.push({ id: 'social', label: `Social media, ${plural(platforms, 'platform', 'platforms')}, ${posts} posts a month`, amount: socialPrice(platforms, posts), kind: 'monthly' })
  }
  if (s.ads) lines.push({ id: 'ads', label: 'Ads management', note: 'ad spend billed separately', amount: PRICE.ads, kind: 'monthly' })

  const sum = (kind: Line['kind']) => lines.filter((l) => l.kind === kind).reduce((total, l) => total + l.amount, 0)

  const oneTime = sum('one-time')
  return { oneTime, oneTimeRegular: regular, monthly: sum('monthly'), discount: regular - oneTime, days: regular > 0 ? [DAYS[0], DAYS[1]] : null, lines }
}

/** The timeline of a brief with no one-time work, wherever it is shown. */
export const NO_TIMELINE = 'Monthly work, no build timeline'

export function formatDays(days: readonly [number, number] | null): string {
  return days ? `${days[0]} to ${days[1]} days` : NO_TIMELINE
}

export const SERVICES: readonly Service[] = [
  { id: 'identity', name: 'Brand identity', from: PRICE.identity, unit: 'one-time', includes: 'Logo files, colours, type and a short guidelines PDF', time: formatDays(DAYS) },
  { id: 'website', name: 'Website', from: websitePrice(1), unit: 'one-time', includes: `Design and build, up to ${PAGES.included} pages; we host it, or hand over the code`, time: formatDays(DAYS) },
  { id: 'social', name: 'Social media management', from: socialPrice(DEFAULT_SOCIAL.platforms, DEFAULT_SOCIAL.posts), unit: 'a month', includes: `1 platform, 12 posts a month, same-day replies; 2 platforms ${dollars(socialPrice(2, 12))}`, time: 'Month to month' },
  { id: 'ads', name: 'Ads management', from: PRICE.ads, unit: 'a month', includes: 'Set up, run and reported monthly. Ad spend is billed separately.', time: 'Month to month' },
  { id: 'photo', name: 'Photo and video', from: PRICE.shoot, unit: 'per shoot', includes: 'A half-day with a local photographer we book: 20 edited photos or 3 short videos', time: formatDays(DAYS) },
  { id: 'print', name: 'Menu, signage and print design', from: PRICE.piece, unit: 'per piece', includes: 'One menu, sign, flyer or packaging design, with print-ready files', time: formatDays(DAYS) },
]

interface Plan {
  id: 'launch' | 'website' | 'grow'
  name: string
  /** What the builder opens with (?set=<id>), first-project box ticked. */
  selection: Selection
}

/** Nothing picked, with the first-project box ticked, as the builder starts. */
export const EMPTY_SELECTION: Selection = { identity: false, website: null, social: null, ads: false, shoots: 0, print: 0, firstProject: true }

/** The plans on Pricing: real mixes of the services above, priced by estimate(). Launch leads. */
export const PLANS: readonly Plan[] = [
  { id: 'launch', name: 'Launch', selection: { ...EMPTY_SELECTION, identity: true, website: { ...DEFAULT_WEBSITE } } },
  { id: 'website', name: 'Website', selection: { ...EMPTY_SELECTION, website: { ...DEFAULT_WEBSITE } } },
  { id: 'grow', name: 'Grow', selection: { ...EMPTY_SELECTION, social: { ...DEFAULT_SOCIAL }, ads: true } },
]

export function briefText(s: Selection): string {
  const e = estimate(s)
  const head = 'Project brief from the Marque builder'
  if (e.lines.length === 0) return `${head}\n\nNo services picked yet.`
  const lines = e.lines.map((l) => `${l.label}${l.note ? ` (${l.note})` : ''}: ${dollars(l.amount)}, ${l.kind === 'monthly' ? 'a month' : 'one-time'}${l.regular ? ` (regular price ${dollars(l.regular)})` : ''}`)
  return [
    head,
    '',
    ...lines,
    '',
    ...(e.discount ? [`${FIRST_PROJECT_LABEL}. ${savingsText(e.discount)}`] : []),
    ...(e.oneTime > 0 ? [`One-time total: ${dollars(e.oneTime)}${e.discount ? ` (regular price ${dollars(e.oneTimeRegular)})` : ''}`] : []),
    `Monthly total: ${dollars(e.monthly)}`,
    `Timeline: ${formatDays(e.days)}`,
    ...(e.days ? [LATE_TEXT] : []),
    ...(s.website ? ['The website’s days start once the text and photos are in.'] : []),
  ].join('\n')
}

export function sameSelection(a: Selection, b: Selection): boolean {
  const key = (s: Selection) => JSON.stringify([s.identity, s.website ? [s.website.pages, s.website.managed] : null, s.social ? [s.social.platforms, s.social.posts] : null, s.ads, s.shoots, s.print, s.firstProject])
  return key(a) === key(b)
}

const isCount = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0

/** A selection as storage may hold it: older briefs have a website without `managed`, and no `firstProject`. */
export type StoredSelection = Omit<Selection, 'website' | 'firstProject'> & { website: (Omit<Website, 'managed'> & { managed?: boolean }) | null; firstProject?: boolean }

export function isSelection(value: unknown): value is StoredSelection {
  const v = value as StoredSelection | null
  if (!v || typeof v !== 'object') return false
  if (typeof v.identity !== 'boolean' || typeof v.ads !== 'boolean') return false
  if (!isCount(v.shoots) || v.shoots > LIMITS.shoots || !isCount(v.print) || v.print > LIMITS.print) return false
  if (v.website !== null && !(typeof v.website === 'object' && isCount(v.website.pages) && v.website.pages >= 1 && v.website.pages <= PAGES.max && (v.website.managed === undefined || typeof v.website.managed === 'boolean'))) return false
  if (v.social !== null && !(typeof v.social === 'object' && PLATFORMS.includes(v.social.platforms) && typeof v.social.posts === 'number' && Object.hasOwn(SOCIAL.posts, v.social.posts))) return false
  if (v.firstProject !== undefined && typeof v.firstProject !== 'boolean') return false
  return true
}

/** Older briefs keep the prices they were saved with: a website without `managed` reads as handed over, and no `firstProject` as no discount. */
export function fromStored(s: StoredSelection): Selection {
  return { ...s, website: s.website ? { pages: s.website.pages, managed: s.website.managed === true } : null, firstProject: s.firstProject === true }
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
