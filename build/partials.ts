export type PartialName = 'header' | 'footer'

const INCLUDE = /<!-- include:(header|footer)(?: current="([a-z-]+)")? -->/g

/** The build and the tests both put pages together with this. */
export function includePartials(html: string, partials: Record<PartialName, string>, base: string): string {
  if (!/^\/(?:[a-z0-9-]+\/)*$/.test(base)) throw new Error(`includePartials: the base "${base}" must start and end with "/"`)
  const page = html.replace(INCLUDE, (_marker, name: PartialName, current?: string) => {
    let part = partials[name].trim()
    if (current) {
      const link = `data-page="${current}"`
      if (!part.includes(link)) throw new Error(`include:${name}: no link with ${link} for the current page "${current}"`)
      part = part.replaceAll(link, `${link} aria-current="page"`)
    }
    return part
  })
  return page.replaceAll('%BASE_URL%', base)
}
