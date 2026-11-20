import { sampleQuotesMarkup, sampleStatsMarkup } from '../app/lib/samples.ts'

/** app/components/<name>.html: the end of every <head>, the header and the footer. */
export const PARTIALS = ['head', 'header', 'footer'] as const
export type PartialName = (typeof PARTIALS)[number]

const INCLUDE = new RegExp(`<!-- include:(${PARTIALS.join('|')})(?: current="([a-z-]+)")? -->`, 'g')
const SAMPLES = /<!-- samples:(stats|quotes)(?: ids="([a-z,-]+)")? -->/g

/** The build and the tests both put pages together with this. */
export function includePartials(html: string, partials: Record<PartialName, string>, base: string): string {
  if (!/^\/(?:[a-z0-9-]+\/)*$/.test(base)) throw new Error(`includePartials: the base "${base}" must start and end with "/"`)
  if (/<!--\s*samples:/i.test(html.match(/<head>[\s\S]*?<\/head>/)?.[0] ?? '')) {
    throw new Error('includePartials: a samples marker is inside <head>. Sample content stays out of the title, meta tags and schema.')
  }
  const page = html
    .replace(INCLUDE, (_marker, name: PartialName, current?: string) => {
      let part = partials[name].trim()
      if (current) {
        const link = `data-page="${current}"`
        if (!part.includes(link)) throw new Error(`include:${name}: no link with ${link} for the current page "${current}"`)
        part = part.replaceAll(link, `${link} aria-current="page"`)
      }
      return part
    })
    .replace(SAMPLES, (_marker, kind: 'stats' | 'quotes', ids?: string) => {
      if (kind === 'stats') return sampleStatsMarkup()
      if (!ids) throw new Error('samples:quotes needs ids="…", or it renders an empty list.')
      return sampleQuotesMarkup(ids.split(','))
    })
  const unread = page.match(/<!--\s*(?:include|samples)\b[\s\S]*?-->/i)?.[0]
  if (unread) throw new Error(`includePartials: the build can't read the marker ${unread}. Check its spelling against build/partials.ts.`)
  return page.replaceAll('%BASE_URL%', base)
}
