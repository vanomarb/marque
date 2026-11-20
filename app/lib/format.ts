const pesoNumber = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 })

/** 45000 → "₱45,000". */
export function peso(amount: number): string {
  return `₱${pesoNumber.format(Math.round(amount))}`
}

export function parsePeso(text: string | null | undefined): number | null {
  const digits = (text ?? '').replace(/[₱,\s]/g, '')
  return /^\d+$/.test(digits) ? Number(digits) : null
}

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ENTITIES[c])
}
