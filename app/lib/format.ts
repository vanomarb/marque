const dollarNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/** 1100 → "$1,100". */
export function dollars(amount: number): string {
  return `$${dollarNumber.format(Math.round(amount))}`
}

/** -162 → "−$162", with a true minus sign, so a discount reads as one. */
export function signedDollars(amount: number): string {
  return amount < 0 ? `\u2212${dollars(-amount)}` : dollars(amount)
}

export function parseDollars(text: string | null | undefined): number | null {
  const digits = (text ?? '').replace(/[$,\s]/g, '')
  return /^\d+$/.test(digits) ? Number(digits) : null
}

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ENTITIES[c])
}
