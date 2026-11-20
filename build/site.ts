/** Vite's `base`, and what %BASE_URL% becomes. */
export const BASE = '/marque/'

/** What builds use without VITE_SITE_URL: the local preview address. The Pages workflow passes the published one. */
export const LOCAL_SITE_URL = `http://localhost:4173${BASE}`

const FIX = `Set VITE_SITE_URL in .env to the address the site is published at, for example https://example.com${BASE}.`

/** Every page's canonical and og: links are built from VITE_SITE_URL, so a wrong one stops the build here. */
export function checkSiteUrl(value: string | undefined): string {
  if (!value?.trim()) throw new Error(`VITE_SITE_URL is not set. ${FIX}`)
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`VITE_SITE_URL is not a URL ("${value}"). ${FIX}`)
  }
  if (!/^https?:$/.test(url.protocol) || url.pathname !== BASE || url.search || url.hash) {
    throw new Error(`VITE_SITE_URL must be an http(s) address ending in ${BASE} ("${value}"). ${FIX}`)
  }
  return value
}

export function leftoverPlaceholders(html: string): string[] {
  return [...new Set(html.match(/%[A-Z][A-Z0-9_]*%/g) ?? [])]
}
