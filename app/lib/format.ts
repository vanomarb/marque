const dollarNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/** 1100 → "$1,100". */
export function dollars(amount: number): string {
  return `$${dollarNumber.format(Math.round(amount))}`
}

/**
 * A price as markup: with a regular price, that one struck through and the first-project price beside it in the
 * savings colour, each named for screen readers, which don't read strikethrough. Built from numbers only.
 */
export function priceMarkup(amount: number, regular?: number): string {
  if (regular === undefined || regular === amount) return dollars(amount)
  return `<s class="price-was"><span class="sr-only">Regular price </span>${dollars(regular)}</s> <span class="price-now"><span class="sr-only">first-project price </span>${dollars(amount)}</span>`
}

export function parseDollars(text: string | null | undefined): number | null {
  const digits = (text ?? '').replace(/[$,\s]/g, '')
  return /^\d+$/.test(digits) ? Number(digits) : null
}

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ENTITIES[c])
}
