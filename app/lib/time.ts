/** Marque is in Cebu, so "today" is always Asia/Manila, wherever the visitor is. */
export interface ManilaTime {
  /** YYYY-MM-DD. */
  isoDate: string
}

const parts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function manilaTime(at: Date): ManilaTime {
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.formatToParts(at).find((p) => p.type === type)?.value ?? ''
  return {
    isoDate: `${get('year')}-${get('month')}-${get('day')}`,
  }
}

const longDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/** "2026-11-19" → "19 November 2026". */
export function formatLongDate(isoDate: string): string {
  return longDate.format(new Date(`${isoDate}T00:00:00Z`))
}
