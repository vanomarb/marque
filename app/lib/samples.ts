// Placeholder figures and quotes for the prototype: see "Sample content" in BACKEND.md. Never in titles, meta or schema.

interface SampleStat {
  id: string
  value: string
  label: string
}

interface SampleQuote {
  id: string
  quote: string
  /** A first name only: no surname, company or photo. */
  firstName: string
  role: string
  /** The kind of business, not a business name. */
  business: string
}

export const SAMPLE_STATS: readonly SampleStat[] = [
  { id: 'shipped', value: '42', label: 'Projects shipped' },
  { id: 'median', value: '2.4', label: 'Median days from brief to launch' },
  { id: 'on-time', value: '96%', label: 'Delivered by day 3' },
  { id: 'returning', value: '61%', label: 'Came back for a second project' },
]

export const SAMPLE_QUOTES: readonly SampleQuote[] = [
  { id: 'turnaround', quote: 'We approved the quote on Monday and the site was live on Wednesday afternoon, menu and all.', firstName: 'Mara', role: 'founder', business: 'bakery' },
  { id: 'credit', quote: 'The photo edits landed a day past day 3. The final invoice already took $5 off, and I hadn’t said a word.', firstName: 'Tomás', role: 'owner', business: 'bike repair shop' },
  { id: 'receipt', quote: 'I priced it in the builder, and the final invoice added up the same, down to the discounted lines.', firstName: 'Priya', role: 'co-founder', business: 'yoga studio' },
  { id: 'handover', quote: 'When we changed hosts we took the code and a short guide, and the site was back up that evening.', firstName: 'Jon', role: 'founder', business: 'coffee cart' },
]

export function sampleStatsMarkup(): string {
  const items = SAMPLE_STATS.map(
    (s) => `<div class="border-t border-rule pt-3" data-sample="${s.id}"><dt class="text-sm text-graphite">${s.label}</dt><dd class="tabular mt-1 text-h3 font-[560]">${s.value}</dd></div>`,
  ).join('')
  return `<div data-samples="stats"><dl class="grid grid-cols-2 gap-x-[var(--gap)] gap-y-6 lg:grid-cols-4">${items}</dl></div>`
}

export function sampleQuotesMarkup(ids: readonly string[]): string {
  const items = ids
    .map((id) => {
      const q = SAMPLE_QUOTES.find((x) => x.id === id)
      if (!q) throw new Error(`samples: no quote "${id}" in app/lib/samples.ts`)
      return `<li data-sample="${q.id}"><figure class="border-t border-rule pt-4"><blockquote><p class="max-w-[34rem]">“${q.quote}”</p></blockquote><figcaption class="mt-3 text-sm text-graphite">${q.firstName}, ${q.role}, ${q.business}</figcaption></figure></li>`
    })
    .join('')
  return `<div data-samples="quotes"><ul class="grid gap-x-[var(--gap)] gap-y-6 md:grid-cols-2">${items}</ul></div>`
}
