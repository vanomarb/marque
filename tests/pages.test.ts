import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { includePartials } from '../build/partials.ts'
import { dollars } from '../app/lib/format.ts'
import { DEFAULT_SOCIAL, LATE_TEXT, MANAGED_LABEL, PRICE, SERVICES, estimate, firstProjectPrice, formatDays } from '../app/lib/estimate.ts'
import { WORKS, neighbours, sortWorks, type WorkId } from '../app/lib/works.ts'
import { LAUNCH_SET } from '../app/lib/start-link.ts'
import { EMAIL } from '../app/lib/account.ts'
import { BASE, leftoverPlaceholders } from '../build/site.ts'

const root = new URL('../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')

const PAGES = [
  { id: 'home', path: '' },
  { id: 'works', path: 'works/' },
  { id: 'usual', path: 'works/usual/' },
  { id: 'bayline', path: 'works/bayline/' },
  { id: 'enamel', path: 'works/enamel/' },
  { id: 'services', path: 'services/' },
  { id: 'studio', path: 'studio/' },
  { id: 'start', path: 'start/' },
  { id: 'account', path: 'account/' },
  { id: 'terms', path: 'terms/' },
  { id: 'privacy', path: 'privacy/' },
  { id: 'cookies', path: 'cookies/' },
  { id: 'accessibility', path: 'accessibility/' },
] as const
type PageId = (typeof PAGES)[number]['id']
const WORK_PAGES = ['usual', 'bayline', 'enamel'] as const satisfies readonly WorkId[]
/** The pages the header links to; a project page marks Works as current. */
const NAV_PAGES: PageId[] = ['home', 'works', 'services', 'studio', 'start', 'account']
const HEADER_PAGES: PageId[] = [...NAV_PAGES, ...WORK_PAGES]
const FOOTER_PAGES: PageId[] = ['terms', 'privacy', 'cookies', 'accessibility']
const currentOf = (id: PageId): string => ((WORK_PAGES as readonly string[]).includes(id) ? 'works' : id)
// The three sites are published beside Marque on the same Pages host, so a root-relative link reaches each one.
const LIVE_SITES = { usual: '/usual/', bayline: '/bayline/', enamel: '/enamel/' }

/** raw keeps %BASE_URL%; partials are filled the way the build fills them. */
const raw = { header: read('app/components/header.html'), footer: read('app/components/footer.html') }
const partials = { header: includePartials(raw.header, raw, BASE), footer: includePartials(raw.footer, raw, BASE) }
const source = Object.fromEntries(PAGES.map((page) => [page.id, read(`app/${page.path}index.html`)])) as Record<PageId, string>
const built = Object.fromEntries(PAGES.map((page) => [page.id, includePartials(source[page.id], raw, BASE)])) as Record<PageId, string>
const notFound = read('app/404.html')

const count = (html: string, text: string) => html.split(text).length - 1
const meta = (html: string, attribute: 'name' | 'property', key: string) => html.match(new RegExp(`<meta ${attribute}="${key}" content="([^"]*)"`))?.[1]
const mainOf = (html: string) => html.match(/<main id="main"[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? ''
/** What Managed hosting includes, in the words Home and Services both use. */
const MANAGED_INCLUDES = ['free Marque subdomain', 'a domain you own', 'Automatic SSL and a global CDN', 'Automatic deploys and daily backups', 'Uptime monitoring and security updates', 'Search Console', 'Up to an hour of edits a month']
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const JS_MARK = `<script>document.documentElement.classList.add('js');setTimeout(function(){if(!document.documentElement.hasAttribute('data-ready'))document.documentElement.classList.remove('js')},4000)</script>`
const footerOf = (html: string) => html.match(/<footer[\s>][\s\S]*?<\/footer>/)?.[0] ?? ''

/** Everything the site is built from, in app/ and build/ (not the README, which may credit the author). */
function productSources(): [string, string][] {
  const files: [string, string][] = [
    ...PAGES.map((p) => [`app/${p.path}index.html`, source[p.id]] as [string, string]),
    ['app/404.html', notFound],
    ['app/components/header.html', partials.header],
    ['app/components/footer.html', partials.footer],
    ['public/favicon.svg', read('public/favicon.svg')],
  ]
  const walk = (dir: string) => {
    for (const entry of readdirSync(new URL(dir, root), { withFileTypes: true })) {
      const path = `${dir}${entry.name}`
      if (entry.isDirectory()) walk(`${path}/`)
      else if (!path.endsWith('.test.ts') && !path.endsWith('.html')) files.push([path, read(path)])
    }
  }
  walk('app/')
  walk('build/')
  return files
}

/** Width and height from a WebP file's header (lossy VP8, lossless VP8L or extended VP8X). */
function webpSize(file: URL): [number, number] {
  const b = readFileSync(file)
  assert.equal(b.toString('ascii', 0, 4), 'RIFF')
  assert.equal(b.toString('ascii', 8, 12), 'WEBP')
  const chunk = b.toString('ascii', 12, 16)
  if (chunk === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)]
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21)
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)]
  }
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff]
}

test('the pages on disk are exactly the pages the site lists, plus the old /work/ address that redirects', () => {
  const folders = readdirSync(new URL('app/', root), { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('/index.html'))
    .map((file) => file.slice(0, -'index.html'.length))
  assert.deepEqual(folders.sort(), [...PAGES.filter((p) => p.path).map((p) => p.path), 'work/'].sort())
})

test('the old Work address sends visitors on to Works, and each old case-study link to its own page', () => {
  const old = read('app/work/index.html')
  assert.match(old, /<meta http-equiv="refresh" content="0; url=\/marque\/works\/" \/>/, 'a refresh to Works')
  assert.ok(old.includes('<link rel="canonical" href="%VITE_SITE_URL%works/" />'), 'canonical to Works')
  assert.equal(meta(old, 'name', 'robots'), 'noindex')
  assert.match(old, /<a href="\/marque\/works\/">Works<\/a>/, 'a plain link for anyone the refresh misses')
  assert.match(old, /\^\(usual\|bayline\|enamel\)\$/, '#usual and the others go to their own pages')
  assert.ok(!old.includes('<!-- include:'), 'no header or footer: it only redirects')
})

test('every page has its own title, description and canonical, and stays out of search', () => {
  const titles = new Set<string>()
  const descriptions = new Set<string>()
  for (const page of PAGES) {
    const html = source[page.id]
    const url = `%VITE_SITE_URL%${page.path}`
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1]
    const description = meta(html, 'name', 'description')
    assert.ok(title && title.length <= 60, `${page.id}: title`)
    assert.ok(description && description.length >= 50 && description.length <= 160, `${page.id}: description`)
    titles.add(title)
    descriptions.add(description)
    assert.ok(html.includes(`<link rel="canonical" href="${url}" />`), `${page.id}: canonical`)
    assert.equal(meta(html, 'name', 'robots'), 'noindex', `${page.id}: noindex`)
    assert.equal(meta(html, 'property', 'og:title'), title, `${page.id}: og:title`)
    assert.equal(meta(html, 'property', 'og:description'), description, `${page.id}: og:description`)
    assert.equal(meta(html, 'property', 'og:url'), url, `${page.id}: og:url`)
    assert.equal(meta(html, 'property', 'og:type'), 'website', `${page.id}: og:type`)
    assert.equal(meta(html, 'property', 'og:image'), '%VITE_SITE_URL%og.png', `${page.id}: og:image`)
    assert.equal(meta(html, 'name', 'twitter:card'), 'summary_large_image', `${page.id}: twitter card`)
    assert.equal(meta(html, 'name', 'twitter:image'), '%VITE_SITE_URL%og.png', `${page.id}: twitter image`)
    assert.match(meta(html, 'name', 'theme-color') ?? '', /^oklch\(/, `${page.id}: theme-color`)
    assert.ok(html.includes('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />'), `${page.id}: favicon`)
    assert.ok(html.includes('<script type="module" src="/main.ts"></script>'), `${page.id}: script`)
    assert.ok(html.includes('<html lang="en">'), `${page.id}: language`)
  }
  assert.equal(titles.size, PAGES.length, 'titles are unique')
  assert.equal(descriptions.size, PAGES.length, 'descriptions are unique')
})

test('every page takes the shared header and footer, and exactly its own link is marked current', () => {
  for (const page of PAGES) {
    const where = HEADER_PAGES.includes(page.id) ? 'header' : 'footer'
    assert.equal(count(source[page.id], `<!-- include:${where} current="${currentOf(page.id)}" -->`), 1, `${page.id}: ${where} marker names the page`)
    assert.equal(count(source[page.id], '<!-- include:header'), 1, `${page.id}: header marker`)
    assert.equal(count(source[page.id], '<!-- include:footer'), 1, `${page.id}: footer marker`)
    assert.doesNotMatch(source[page.id], /<header[\s>]|<footer[\s>]/, `${page.id}: no copied header or footer`)
    const html = built[page.id]
    assert.doesNotMatch(html, /<!-- include:/, `${page.id}: markers replaced`)
    // The header links its pages twice, from the bar and the phone menu, and marks both.
    const current = [...html.matchAll(/<a [^>]*data-page="([a-z-]+)" aria-current="page"/g)].map((m) => m[1])
    assert.deepEqual(current, Array(HEADER_PAGES.includes(page.id) ? 2 : 1).fill(currentOf(page.id)), `${page.id}: its own links, and only those, are current`)
    assert.equal(count(html, '<main id="main"'), 1, `${page.id}: main`)
    assert.equal(count(html, '<h1'), 1, `${page.id}: one h1`)
  }
})

test('the header reaches the main pages; the footer has Company, Help and Legal, the newsletter, replies and meetings', () => {
  for (const id of NAV_PAGES) {
    const page = PAGES.find((p) => p.id === id)!
    assert.match(partials.header, new RegExp(`href="/marque/${page.path}"[^>]*data-page="${id}"`), `header: ${id}`)
  }
  for (const id of FOOTER_PAGES) assert.match(partials.footer, new RegExp(`href="/marque/${id}/"[^>]*data-page="${id}"`), `footer: ${id}`)
  const column = (heading: string) => partials.footer.match(new RegExp(`>${heading}</h2>([\\s\\S]*?)</nav>`))?.[1] ?? ''
  assert.deepEqual([...column('Company').matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)</g)].map((m) => [m[1], m[2]]), [
    ['/marque/studio/', 'Studio'],
    ['/marque/works/', 'Works'],
    ['/marque/start/#contact', 'Contact'],
  ])
  assert.deepEqual([...column('Help').matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)</g)].map((m) => [m[1], m[2]]), [
    ['/marque/services/#faq', 'FAQ'],
    ['/marque/accessibility/', 'Accessibility'],
  ])
  assert.deepEqual([...column('Legal').matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)</g)].map((m) => [m[1], m[2]]), [
    ['/marque/terms/', 'Terms of Service'],
    ['/marque/privacy/', 'Privacy Policy'],
    ['/marque/cookies/', 'Cookie Policy'],
  ])
  assert.match(partials.footer, /<form [^>]*data-mock-form="newsletter"/, 'footer: newsletter')
  assert.ok(partials.footer.includes('Within a day, any day'), 'footer: replies')
  assert.ok(partials.footer.includes('On a call, in your time zone'), 'footer: meetings')
})

test('an include for a page the partials do not know fails the build', () => {
  assert.throws(() => includePartials('<!-- include:header current="pricing" -->', raw, BASE), /pricing/)
  assert.throws(() => includePartials('<!-- include:footer current="careers" -->', raw, BASE), /careers/)
})

test('the product never names its author, and no link leaves for a portfolio, a phone, an inbox or a social account', () => {
  for (const [file, text] of productSources()) {
    assert.doesNotMatch(text, /van omar|benaires|designed and built|portfolio|github/i, file)
    assert.doesNotMatch(text, /href="(?:tel|mailto):/i, file)
    assert.doesNotMatch(text, /(?:facebook|instagram|tiktok|twitter|linkedin|youtube)\.com|\bx\.com\//i, file)
  }
})

test('Marque is a real studio: no page, partial or script calls it a concept or the site a demonstration', () => {
  for (const [file, text] of productSources()) {
    assert.doesNotMatch(text, /concept|demonstration|About this site|data-concept/i, file)
  }
  assert.ok(!existsSync(new URL('app/shared/concept.ts', root)), 'the concept dialog script is gone')
  const legalRow = footerOf(partials.footer).match(/<div [^>]*data-legal-row[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? ''
  assert.ok(legalRow.includes('© 2026 Marque'), 'legal row: copyright')
})

test('where nothing is sent yet, the page says so plainly', () => {
  assert.match(mainOf(source.start), /Sending isn’t connected yet\./, 'the contact form')
  assert.match(read('app/start/contact.ts'), /sending isn’t connected yet/, 'the contact form after a send')
  assert.match(read('app/shared/forms.ts'), /Sign-up isn’t connected yet/, 'the newsletter')
  assert.match(mainOf(source.account), /Emails aren’t sent yet, so your code shows here\./, 'the sign-in code')
  assert.match(read('app/account/account.ts'), /Google sign-in isn’t connected yet/, 'Continue with Google')
  for (const id of ['terms', 'privacy'] as const) assert.match(mainOf(source[id]), /What isn’t connected yet/, `${id}: what isn’t connected`)
})

test('there is no password field anywhere, only an email address and an on-screen code', () => {
  for (const [file, text] of productSources()) assert.doesNotMatch(text, /type=\\?"password\\?"|type='password'/, file)
  const account = mainOf(source.account)
  assert.ok(source.account.includes('<main id="main" data-account>'), 'account feature')
  assert.match(account, /<input [^>]*name="first-name"/, 'first name, for a new account')
  assert.match(account, /<input [^>]*name="contact" type="email" autocomplete="email"/, 'email address')
  assert.match(account, /<input [^>]*autocomplete="one-time-code"/, 'one-time code')
  assert.ok(account.includes('data-preview-code'), 'the code is shown on screen, as a preview')
  assert.ok(account.includes('data-briefs'), 'Your briefs')
  assert.match(account, /<button class="button-provider" type="button" data-google disabled>/, 'Continue with Google, off until the script explains it')
  assert.ok(account.includes('data-mode-switch'), 'Sign in and Create account are both reachable')
})

test('the builder and the contact form are on Start a project only, and the form starts without the builder', () => {
  for (const page of PAGES) {
    assert.equal(source[page.id].includes('data-builder'), page.id === 'start', `${page.id}: builder`)
    assert.equal(source[page.id].includes('data-contact'), page.id === 'start', `${page.id}: contact form`)
  }
  const start = mainOf(source.start)
  assert.ok(start.includes('id="builder"') && start.includes('id="contact"'), 'sections to link to')
  for (const service of SERVICES) assert.ok(start.includes(`data-service="${service.id}"`), `builder row: ${service.id}`)
  for (const name of ['name', 'business', 'reply', 'message']) assert.match(start, new RegExp(`<(?:input|textarea) [^>]*name="${name}"`), `contact field: ${name}`)
  assert.ok(start.includes('data-use-brief') && start.includes('data-save-brief'), 'Use this brief and Save brief')
  assert.equal(count(start, 'aria-live="polite"') >= 2, true, 'builder and form announce changes')
})

test('Home markets the studio with its own work and prices and links on', () => {
  const home = mainOf(source.home)
  for (const [site, url] of Object.entries(LIVE_SITES)) {
    assert.ok(home.includes(`href="/marque/works/${site}/"`), `${site}: links to its project page`)
    assert.ok(home.includes(`src="/work/${site}-cover-800.webp"`), `${site}: screenshot`)
    assert.ok(!home.includes(`href="${url}"`), `${site}: the live site is opened from the case study, not from Home`)
  }
  const launch = estimate(LAUNCH_SET)
  assert.ok(home.includes('href="/marque/start/?set=launch"'), 'the launch set opens in the builder')
  assert.ok(home.includes(dollars(launch.oneTime)) && home.includes(formatDays(launch.days)), 'the launch set in real prices and days')
  assert.ok(home.includes(`<s class="price-was text-h3"><span class="sr-only">regular price </span>${dollars(launch.oneTime + launch.discount)}</s>`), 'its regular price struck through beside it')
  assert.match(home, /Day 3, or money off/, 'the late-day credit')
  assert.ok(home.includes(`${dollars(PRICE.managed)} a month`), 'what running the site costs after launch')
  const hosting = home.match(/<h3[^>]*>What Managed hosting includes, for \$39 a month<\/h3>[\s\S]*?<\/ul>/)?.[0] ?? ''
  for (const item of MANAGED_INCLUDES) assert.ok(hosting.includes(item), `Managed hosting: ${item}`)
  for (const service of SERVICES) {
    const row = home.match(new RegExp(`<a [^>]*href="/marque/services/#${service.id}"[\\s\\S]*?</a>`))?.[0]
    assert.ok(row, `${service.id}: teaser row links to Services`)
    assert.ok(row.includes(`>${service.name}<`) && row.includes(dollars(service.from)), `${service.id}: name and starting price`)
    assert.equal(row.includes('<s '), service.unit !== 'a month', `${service.id}: a first-project price only on one-time work`)
    if (service.unit !== 'a month') assert.ok(row.includes(`${dollars(service.from)}</s> <span class="sr-only">first-project price </span>${dollars(firstProjectPrice(service.from))}`), `${service.id}: the regular price struck beside the first-project price`)
  }
  for (const n of ['01', '02', '03', '04', '05', '06']) assert.ok(home.includes(`>${n}</`), `section ${n} in the margin`)
  assert.ok(count(home, 'data-step') >= 4, 'how we work, step by step')
  assert.ok(home.includes('href="/marque/start/"'), 'a closing call to start a project')
  for (const id of ['home', 'works', ...WORK_PAGES] as const) {
    assert.doesNotMatch(mainOf(source[id]), /\b\d[\d,]*\+? (?:happy |satisfied )?(?:clients|customers|brands|projects|reviews)\b|★|\bstars?\b|award|trusted by|testimonial|\d+\s?%(?! off)|increase|grew|growth|revenue|sales up|conversion/i, `${id}: no invented proof`)
  }
})

test('the three work cards on Home are the same size at every width, so their screenshots and names line up', () => {
  const cards = [...mainOf(source.home).matchAll(/<a class="work-card ([^"]*)"[\s\S]*?<\/a>/g)]
  assert.equal(cards.length, 3, 'three work cards')
  const spans = cards.map(([, classes]) => classes.split(/\s+/).filter((c) => /(^|:)col-span-/.test(c)).join(' '))
  const sizes = cards.map(([card]) => card.match(/sizes="([^"]*)"/)?.[1])
  for (const [i, span] of spans.entries()) assert.equal(span, spans[0], `card ${i + 1} spans the same columns as the first`)
  for (const [i, size] of sizes.entries()) assert.equal(size, sizes[0], `card ${i + 1} asks for the same image width as the first`)
})

test('Home’s work cards swap to a legible phone crop below 48rem, all three the same shape', () => {
  const cards = [...mainOf(source.home).matchAll(/<a class="work-card [^"]*"[\s\S]*?<\/a>/g)].map((m) => m[0])
  assert.equal(cards.length, 3)
  for (const [i, site] of Object.keys(LIVE_SITES).entries()) {
    const sourceTag = cards[i].match(/<source\s[^>]*>/)?.[0]
    assert.ok(sourceTag, `${site}: a <source> for phones`)
    assert.match(sourceTag, /media="\(max-width: 47\.99rem\)"/, `${site}: phones only`)
    const candidates = sourceTag.match(/srcset="([^"]*)"/)![1].split(',').map((c) => c.trim().split(/\s+/))
    for (const [file, width] of candidates) {
      const [w, h] = webpSize(new URL(`public${file}`, root))
      assert.equal(`${w}w`, width, `${site}: ${file} is ${width}`)
      assert.equal(h / w, 2 / 3, `${site}: ${file} is a 3:2 card`)
    }
    assert.match(sourceTag, /width="390" height="260"/, `${site}: the source carries its real shape`)
  }
})


test('no example could be a real mobile number', () => {
  for (const [id, html] of [...PAGES.map((p) => [p.id, source[p.id]]), ['features', read('app/start/contact.ts') + read('app/account/account.ts')]]) assert.doesNotMatch(html, /0917/, `${id}: no live mobile prefix in an example`)
})

test('a heading that code focuses draws no field-like box, while controls keep their ring', () => {
  const css = read('app/styles/main.css')
  assert.match(css, /\[tabindex='-1'\]:not\(a, button, input, select, textarea, summary\):focus-visible\s*\{\s*outline: none/)
})

test('builder rows put the price under the name on phones, every row alike', () => {
  const rows = [...source.start.matchAll(/<li class="service-row[\s\S]*?<div class="(flex [^"]*)">\s*<label/g)].map((m) => m[1])
  assert.equal(rows.length, SERVICES.length)
  for (const classes of rows) assert.ok(classes.startsWith('flex flex-col items-start') && classes.includes('sm:flex-row'), classes)
})

test('Works lists every project newest first, each with its thumbnail, mark, type, services and launch date', () => {
  const works = mainOf(source.works)
  const cards = [...works.matchAll(/<li data-work data-name="([^"]+)" data-launched="([^"]+)">([\s\S]*?)<\/li>/g)]
  assert.deepEqual(cards.map((m) => m[1]), sortWorks(WORKS, 'newest').map((w) => w.name), 'the page’s own order is newest first')
  for (const [, name, launched, card] of cards) {
    const work = WORKS.find((w) => w.name === name)!
    assert.equal(launched, work.launched, `${name}: launch date`)
    assert.ok(card.includes(`href="/marque/works/${work.id}/"`), `${name}: opens its page`)
    assert.ok(card.includes(`src="/work/${work.id}-cover-800.webp"`), `${name}: its thumbnail`)
    assert.ok(card.includes(`class="fill-${work.id}"`), `${name}: its mark`)
    assert.ok(card.includes(`>${work.type}<`), `${name}: what kind of business`)
    assert.match(card, new RegExp(`<time datetime="${work.launched}">\\d+ November 2026</time>`), `${name}: a readable date`)
    assert.match(card, />What we made</, `${name}: the services`)
  }
  assert.match(works, /<fieldset data-works-sort hidden>\s*<legend[^>]*>Sort<\/legend>/, 'a labelled sort control, hidden until the script runs')
  for (const value of ['newest', 'oldest', 'name']) assert.match(works, new RegExp(`<input type="radio" name="sort" value="${value}"`), `sort: ${value}`)
  assert.ok(works.includes('aria-live="polite" data-works-status'), 'it announces the new order')
})

test('each project has its own page, led by its own colour and mark, with screens, the brief, the live site and the next project', () => {
  const bands = { usual: 'bg-usual text-usual-ink', bayline: 'bg-bayline text-bayline-ink', enamel: 'bg-enamel-ink text-enamel' }
  const themes = new Set<string>()
  for (const site of WORK_PAGES) {
    const page = mainOf(source[site])
    const work = WORKS.find((w) => w.id === site)!
    themes.add(meta(source[site], 'name', 'theme-color') ?? '')
    assert.match(page, new RegExp(`^\\s*<section class="[^"]*${bands[site]}"`), `${site}: opens on its own colour`)
    assert.ok(page.includes(`<h1 class="mt-6" id="work-title">${work.name}</h1>`), `${site}: its name`)
    assert.match(page, new RegExp(`class="[^"]*\\b(?:fill|stroke)-${site}(?:"| )`), `${site}: its mark, in its colour (inverted where the hero is that colour)`)
    assert.ok(page.includes(`<time datetime="${work.launched}">`), `${site}: launch date`)
    assert.ok(page.includes(`src="/work/${site}-desktop-800.webp"`) && page.includes(`src="/work/${site}-phone-390.webp"`), `${site}: desktop and phone screens`)
    for (const heading of ['The brief', 'What we did', 'What we made']) assert.ok(page.includes(`>${heading}</h2>`), `${site}: ${heading}`)
    assert.match(page, /<dt[^>]*>Timeline<\/dt>/, `${site}: services and timeline`)
    assert.ok(page.includes(`href="${LIVE_SITES[site]}" target="_blank" rel="noopener">Open ${work.name}<span class="sr-only"> (opens in a new tab)</span>`), `${site}: opens the live site in a new tab`)
    assert.ok(page.includes('A Marque studio project.'), `${site}: honest about whose project it is`)
    const { previous, next } = neighbours(site)
    assert.ok(page.includes(`href="/marque/works/${previous.id}/" rel="prev"`) && page.includes(`href="/marque/works/${next.id}/" rel="next"`), `${site}: previous and next`)
    assert.match(page, /<nav [^>]*aria-label="Breadcrumb"[\s\S]*?href="\/marque\/works\/"/, `${site}: back to Works`)
  }
  assert.equal(themes.size, 3, 'each page tints the browser in its own colour')
})

test('Services lists every service with its starting price and time, and links each one into the builder', () => {
  const services = mainOf(source.services)
  for (const service of SERVICES) {
    const row = services.match(new RegExp(`<section [^>]*id="${service.id}"[\\s\\S]*?</section>`))?.[0]
    assert.ok(row, `${service.id}: its own section`)
    assert.ok(row.includes(`>${service.name}</h2>`), `${service.id}: name`)
    assert.ok(row.includes(dollars(service.from)) && row.includes(service.unit) && row.includes(service.time), `${service.id}: price, unit and time`)
    if (service.unit !== 'a month') {
      assert.ok(row.includes(`${dollars(service.from)}</s> <span class="sr-only">first-project price </span>${dollars(firstProjectPrice(service.from))}`), `${service.id}: first-project price beside the regular one`)
      assert.ok(row.includes('Ready by day 3, or $5 off for each day late'), `${service.id}: the late-day credit beside the timeline`)
    }
    assert.ok(row.includes(`href="/marque/start/?add=${service.id}"`), `${service.id}: into the builder`)
  }
  const faq = services.match(/id="faq"[\s\S]*$/)?.[0] ?? ''
  assert.ok(count(faq, '<summary') >= 5, 'FAQ')
  const website = services.match(/<section [^>]*id="website"[\s\S]*?<\/section>/)![0]
  const managed = website.match(/<h3[^>]*>Managed, \$39 a month<\/h3>[\s\S]*?<\/ul>/)?.[0] ?? ''
  for (const item of [...MANAGED_INCLUDES, 'Cancel any time and take the code with you']) assert.ok(managed.includes(item), `Managed: ${item}`)
  const handed = website.match(/<h3[^>]*>Handed over, no monthly fee<\/h3>[\s\S]*?<\/ul>/)?.[0] ?? ''
  for (const item of ['repository transferred to you', 'guide to deploying it', 'yours to set up']) assert.ok(handed.includes(item), `Handed over: ${item}`)
  assert.ok(website.includes('Domains: use the free subdomain or bring one you own'), 'domains are not included')
  for (const question of ['Do you sell domains?', 'Can I leave Managed hosting?', 'What happens on handover?']) assert.ok(faq.includes(`<summary>${question}</summary>`), `FAQ: ${question}`)
})

test('no page promises weeks: the one-time work is ready in days', () => {
  for (const id of ['home', 'services', 'studio', 'start'] as const) {
    const text = mainOf(source[id]).replace(/days, not weeks/g, '').replace(/three times a week/g, '')
    assert.doesNotMatch(text, /\bweeks?\b/i, id)
  }
})

test('the builder’s website row offers managed or handed over, managed first, with a visible legend', () => {
  const row = mainOf(source.start).match(/<li class="service-row[^"]*" data-service="website">[\s\S]*?<\/li>/)![0]
  const group = row.match(/<fieldset[^>]*>[\s\S]*?<\/fieldset>/)?.[0] ?? ''
  assert.match(group, /<legend class="text-sm font-\[560\]">After launch<\/legend>/)
  assert.match(group, /<div class="segments mt-2">/, 'the same segments as the other options')
  assert.match(group, /<input type="radio" name="after-launch" value="managed" checked \/><span>Managed<\/span>/)
  assert.match(group, /<input type="radio" name="after-launch" value="handover" \/><span>Handed over<\/span>/)
  assert.ok(group.includes(`Managed is ${dollars(PRICE.managed)} a month`), 'the monthly fee, in words')
  for (const words of ['free Marque subdomain', 'a domain you own', 'Cancel any time and take the code', 'a deploy guide', 'Domains aren’t included']) assert.ok(group.includes(words), `After launch: ${words}`)
  assert.doesNotMatch(row.replace(group, ''), /\bSSL\b|hosting|domain/i, 'hosting is described only with the choice')
  assert.ok(source.start.includes('data-line="managed"'), 'a sheet row for the managed line')
})

test('no page sells, registers or renews a domain, and hosting comes only with Managed', () => {
  const texts: [string, string][] = [...PAGES.map((page): [string, string] => [page.id, mainOf(source[page.id])]), ['README', read('README.md')]]
  for (const [id, text] of texts) {
    assert.doesNotMatch(text, /domain renewal|domain registration|renew(?:s|ed|ing)? (?:the |your |a )?domains?|regist(?:er|ers|ered|ering) (?:or connect )?(?:the |your |a )?domains?|domains? (?:is |are )?(?:registered|included)/i, `${id}: no domain sales`)
    assert.doesNotMatch(text, /every website (?:launches|comes) with|launch (?:is )?included|launch comes with/i, `${id}: no launch package with every website`)
  }
  // Each block that names a hosting feature is about Managed, or says the owner sets it up.
  for (const id of ['home', 'services', 'studio', 'start', 'terms'] as const) {
    const blocks = mainOf(source[id]).split(/(?=<(?:h2|h3|summary|legend)\b)/).filter((block) => /\bSSL\b|global CDN|automatic deploys|daily backups|uptime monitoring/i.test(block))
    for (const block of blocks) assert.match(block, /Managed|yours to set up/, `${id}: ${block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)}`)
  }
  assert.doesNotMatch(MANAGED_LABEL, /renew|regist/i, 'the estimate line')
})

test('Home’s service rows fill dark on hover with room on both sides, so no text touches the edge', () => {
  const rows = [...mainOf(source.home).matchAll(/<a class="(group grid [^"]*)" href="\/marque\/services\/#/g)].map((m) => m[1].split(/\s+/))
  assert.equal(rows.length, SERVICES.length)
  for (const classes of rows) {
    assert.ok(classes.includes('hover:bg-ink'), 'fills on hover')
    assert.ok(classes.includes('px-3') && classes.includes('md:px-5'), classes.join(' '))
  }
})

test('Studio is the About page: who the studio is, how it works, and where', () => {
  const studio = mainOf(source.studio)
  assert.ok(count(studio, 'data-step') >= 4, 'the process, step by step')
  assert.ok(studio.includes('Within a day, any day you write') && studio.includes('on a call'), 'replies and meetings')
})

test('the legal pages read like those of a studio with clients anywhere, and list exactly the keys the code stores', () => {
  const privacy = mainOf(source.privacy)
  assert.ok(privacy.includes('the data protection law where you live') && privacy.includes('GDPR'), 'the law where the visitor lives')
  for (const id of ['terms', 'privacy'] as const) assert.doesNotMatch(mainOf(source[id]), /Philippine|Republic Act|National Privacy Commission/, `${id}: no single country's law`)
  assert.match(mainOf(source.cookies), /no cookies/i, 'no cookies')
  for (const id of ['terms', 'privacy', 'cookies', 'accessibility'] as const) assert.ok(mainOf(source[id]).includes('Last updated'), `${id}: dated`)
  const terms = mainOf(source.terms)
  assert.ok(terms.includes('If we deliver a service after day 3, we take $5 off the final invoice for every day late, up to the price of that service.'), 'Terms: the late-day credit')
  assert.ok(terms.includes('New clients get 15% off their first one-time project') && terms.includes('One first-project discount per client.'), 'Terms: the first-project discount')
  // The keys as the code defines them (export const …_KEY = 'marque.…'), not a copy kept here.
  const code = productSources().filter(([file]) => /\.(?:ts|css)$/.test(file)).map(([, text]) => text).join('\n')
  const keys = [...code.matchAll(/_KEY = '(marque\.[a-z]+)'/g)].map(([, key]) => key).sort()
  assert.deepEqual(keys, ['marque.account', 'marque.briefs'])
  for (const id of ['privacy', 'cookies'] as const) {
    const html = mainOf(source[id])
    assert.deepEqual([...html.matchAll(/<dt[^>]*>(marque\.[a-z]+)<\/dt>/g)].map(([, key]) => key).sort(), keys, `${id}: lists the code's keys`)
    assert.deepEqual([...new Set([...html.matchAll(/marque\.[a-z]+/g)].map(([key]) => key))].sort(), keys, `${id}: names no other key`)
  }
})

test('every image has alt text, its real size, a srcset of files that exist, and loads lazily unless it is first', () => {
  for (const page of PAGES) {
    const images = [...source[page.id].matchAll(/<img\s[^>]*>/g)].map((m) => m[0])
    const eager = images.filter((img) => !img.includes('loading="lazy"'))
    assert.ok(eager.length <= 1, `${page.id}: at most one image loads eagerly`)
    if (eager.length) assert.ok(eager[0] === images[0] && eager[0].includes('fetchpriority="high"'), `${page.id}: only the first image is eager, at high priority`)
    for (const img of images) {
      const attr = (name: string) => img.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]
      assert.ok(attr('alt') && attr('alt')!.length > 10, `${page.id}: alt on ${img}`)
      assert.ok(attr('sizes'), `${page.id}: sizes on ${img}`)
      const src = attr('src')!
      assert.match(src, /^\/work\/[a-z]+-[a-z]+-\d+\.webp$/, `${page.id}: ${src} (Vite adds the /marque/ base)`)
      const [w, h] = webpSize(new URL(`public${src}`, root))
      assert.equal(`${attr('width')}x${attr('height')}`, `${w}x${h}`, `${page.id}: ${src} has its real size`)
      const candidates = attr('srcset')!.split(',').map((c) => c.trim().split(/\s+/))
      assert.ok(candidates.length >= 2, `${page.id}: srcset on ${src}`)
      for (const [file, width] of candidates) {
        assert.ok(existsSync(new URL(`public${file}`, root)), `${page.id}: ${file} exists`)
        assert.equal(`${webpSize(new URL(`public${file}`, root))[0]}w`, width, `${page.id}: ${file} is ${width}`)
      }
    }
  }
})

test('every icon is a Phosphor icon in the regular or light weight', () => {
  const icons = [...PAGES.map((p) => source[p.id]), notFound, partials.header, partials.footer].flatMap((html) => [...html.matchAll(/<i data-icon="([a-z0-9-]+)" data-weight="([a-z]+)"/g)])
  assert.ok(icons.length > 0, 'finds the icons')
  for (const [, name, weight] of icons) {
    assert.ok(weight === 'regular' || weight === 'light', `${name}: ${weight}`)
    const file = weight === 'regular' ? `${name}.svg` : `${name}-${weight}.svg`
    assert.ok(existsSync(new URL(`node_modules/@phosphor-icons/core/assets/${weight}/${file}`, root)), `${name} exists`)
  }
})

test('without JavaScript, every page keeps the header in the flow and the menu links inline', () => {
  for (const [id, html] of [...PAGES.map((p) => [p.id, source[p.id]]), ['404', notFound]]) {
    const noscript = html.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1] ?? ''
    assert.ok(noscript.includes('[data-header] { position: sticky; }'), `${id}: sticky header`)
    assert.ok(noscript.includes('[data-menu] { position: static;'), `${id}: inline menu links`)
  }
})

test('the 404 takes the shared header and footer and points to every main page', () => {
  const html = includePartials(notFound, raw, BASE)
  assert.equal(count(notFound, '<!-- include:header -->'), 1, 'header marker, no current page')
  assert.equal(count(notFound, '<!-- include:footer -->'), 1, 'footer marker')
  assert.doesNotMatch(html, /data-page="[a-z-]+" aria-current="page"/, 'no link is current')
  assert.ok(notFound.includes('<script type="module" src="/main.ts"></script>'), 'script, so the menu opens')
  assert.equal(meta(notFound, 'name', 'robots'), 'noindex')
  assert.ok(!notFound.includes('rel="canonical"'), 'no canonical on a 404')
  assert.equal(meta(notFound, 'property', 'og:title'), notFound.match(/<title>([^<]+)<\/title>/)?.[1])
  assert.equal(meta(notFound, 'property', 'og:image'), '%VITE_SITE_URL%og.png')
  for (const id of ['home', 'works', 'services', 'studio', 'start']) {
    const page = PAGES.find((p) => p.id === id)!
    assert.ok(html.includes(`href="${BASE}${page.path}"`), `links to ${id}`)
  }
  assert.equal(count(html, '<h1'), 1, 'one h1')
})

test('sections reveal on scroll only once the script has marked the page, and the marking undoes itself if scripts fail', () => {
  for (const [id, html] of [...PAGES.map((p) => [p.id, source[p.id]]), ['404', notFound]]) {
    const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? ''
    assert.ok(head.includes(JS_MARK), `${id}: the js class goes on <html> before the page draws`)
    assert.ok(head.indexOf(JS_MARK) < head.indexOf('<script type="module"'), `${id}: before the module`)
    assert.ok(count(mainOf(html), 'data-reveal') >= 2, `${id}: sections that reveal`)
  }
})

test('signed in, the header shows the client’s first name from the first paint', () => {
  const links = [...partials.header.matchAll(/<a [^>]*data-page="account"[\s\S]*?<\/a>/g)].map((m) => m[0])
  assert.equal(links.length, 2, 'the bar’s account link and the phone menu’s')
  for (const link of links) {
    assert.ok(link.includes('data-account-name') && link.includes('Sign in'), 'a place for the name, which says Sign in when signed out')
    assert.match(link, /<span class="sr-only[^"]*">Your briefs, signed in as <\/span>/, 'accessible name says who is signed in')
  }
  // On phones the name lives in the menu, so the wordmark keeps its place in the bar.
  const bar = partials.header.slice(0, partials.header.indexOf('<nav'))
  assert.doesNotMatch(bar, /href="\/marque\/account\/"/, 'no account link in the bar')
  assert.ok(bar.includes('<span>Marque</span>'), 'the wordmark is always shown')
})

test('one inline script marks the signed-in header, after every name it fills, with the same rules as loadSession', () => {
  const scripts = [...partials.header.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  assert.equal(scripts.length, 1, 'one script')
  const [whole, script] = scripts[0]
  const at = partials.header.indexOf(whole)
  assert.equal(count(partials.header.slice(0, at), 'data-account-name'), 2, 'after both names it fills')
  assert.ok(!partials.header.slice(at + whole.length).includes('data-account-name'), 'and before nothing it should fill')
  assert.ok(script.includes("localStorage.getItem('marque.account')"), 'reads the session')
  assert.ok(script.includes("setAttribute('data-signed-in'"), 'marks the page')
  assert.ok(script.includes("querySelectorAll('[data-account-name]')"), 'fills every account link')
  assert.ok(script.includes(EMAIL.source), 'the email pattern parseContact uses')
  assert.ok(!/mobile|\\d\{9\}/.test(script), 'email only, like parseContact')
  assert.match(script, /length <= 40/, 'the first-name limit validateFirstName uses')
})

test('the phone menu is a modal dialog that drops from the header: a labelled close, numbered rows, a paper scrim', () => {
  const button = partials.header.match(/<button [^>]*data-menu-button[^>]*>[\s\S]*?<\/button>/)?.[0] ?? ''
  assert.match(button, /aria-controls="site-menu"/, 'the button names the menu it opens')
  assert.match(button, /aria-expanded="false"/, 'and says it is closed')
  assert.match(button, />Menu</, 'its name is Menu')
  const dialog = partials.header.match(/<dialog [^>]*id="site-menu"[\s\S]*?<\/dialog>/)?.[0] ?? ''
  assert.ok(dialog, 'a dialog with the id the button controls')
  const open = dialog.match(/^<dialog [^>]*>/)![0]
  assert.match(open, /aria-label="Menu"/, 'the dialog has a name')
  assert.match(open, /border-b-2 border-ink/, 'the panel ends in a 2 px ink edge')
  assert.match(open, /backdrop:bg-paper\/\d+/, 'the scrim is paper, from the tokens')
  assert.doesNotMatch(open, /shadow/, 'no shadow: the system has none')
  const close = dialog.match(/<button [^>]*data-menu-close[^>]*>([^<]*)<\/button>/)
  assert.ok(close, 'a close button')
  assert.match(close[0], /aria-label="Close menu"/, 'labelled')
  assert.equal(close[1], 'Close', 'with the word on it')
  const rows = [...dialog.matchAll(/<li class="([^"]*)">\s*<a [^>]*href="([^"]+)"[^>]*>\s*<span class="[^"]*margin-no[^"]*" aria-hidden="true">(\d\d)<\/span>/g)]
  assert.deepEqual(rows.map((m) => [m[3], m[2]]), [
    ['01', '/marque/works/'],
    ['02', '/marque/services/'],
    ['03', '/marque/studio/'],
    ['04', '/marque/account/'],
  ], 'numbered index rows, in the order of the bar')
  for (const [, classes] of rows) assert.ok(classes.includes('border-b') && classes.includes('border-rule'), 'each row carries its own full-width rule')
  assert.match(dialog, /class="ruler"/, 'the panel opens on the ruler, like every section')
  // The bar's links stay the desktop navigation, and the no-JavaScript fallback.
  const desktop = partials.header.match(/<ul [^>]*data-menu[\s>][\s\S]*?<\/ul>/)?.[0] ?? ''
  assert.match(desktop, /max-lg:hidden/, 'with JavaScript, phones use the dialog instead')
  for (const page of ['works', 'services', 'studio', 'account']) assert.ok(desktop.includes(`data-page="${page}"`), `bar: ${page}`)
  assert.match(read('app/styles/main.css'), /html:has\(#site-menu:modal\)\s*\{\s*overflow: hidden/, 'the page behind does not scroll while the menu is open')
})

test('the sign-in speaks in the studio’s own words, not the lines the other sites share', () => {
  const account = mainOf(source.account) + read('app/account/account.ts')
  for (const shared of ['Use a different email or number', 'Enter your code', 'Demo code', 'There’s no password: we show you a one-time code', 'A mobile number starting with 09, or an email address', 'Get a code', 'One-time code', 'Hello,', 'this demonstration shows it here instead']) {
    assert.ok(!account.includes(shared), `no "${shared}"`)
  }
  for (const own of ['Sign in to Marque', 'Create your Marque account', 'Continue with Google', 'Continue with email', 'Your sign-in code', 'Four-digit code', 'Change email', 'Filed under']) {
    assert.ok(account.includes(own), `says "${own}"`)
  }
  assert.match(mainOf(source.account), /<p class="field-error[^"]*" id="briefs-error" tabindex="-1" hidden data-briefs-error>/, 'a visible place to say a brief could not be removed')
})

test('prices are in dollars, which the latin font file covers, so no page preloads the latin-ext file', () => {
  const fonts = read('app/styles/fonts.css')
  const faces = [...fonts.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)].map((m) => m[1]).filter((face) => face.includes("'Bricolage Grotesque'"))
  const covers = (face: string, code: number) =>
    (face.match(/unicode-range:([^;]+);/)?.[1] ?? '').split(',').some((range) => {
      const [from, to] = range.trim().replace('U+', '').split('-').map((hex) => parseInt(hex, 16))
      return code >= from && code <= (to ?? from)
    })
  const latin = faces.filter((face) => covers(face, 0x24))
  assert.equal(latin.length, 1, 'one face carries $')
  assert.ok(!latin[0].includes('latin-ext'), 'and it is the latin file')
  for (const [id, html] of [...PAGES.map((p) => [p.id, source[p.id]]), ['404', notFound]]) {
    assert.ok(!html.includes('\u20b1'), `${id}: no peso sign`)
    assert.ok(!html.includes('latin-ext-wght-normal.woff2" as="font"'), `${id}: no latin-ext preload`)
  }
})

const FORMS = [
  ...PAGES.map((page) => ({ where: page.id as string, html: source[page.id] })),
  { where: 'footer', html: partials.footer },
  { where: 'header', html: partials.header },
].flatMap(({ where, html }) => [...html.matchAll(/<form\b[\s\S]*?<\/form>/g)].map((m) => ({ where, form: m[0] })))

test('without JavaScript no form can submit what a visitor typed: each submit button starts disabled and the form says it needs JavaScript', () => {
  assert.ok(FORMS.length >= 4, 'contact, two sign-in steps and the newsletter')
  for (const { where, form } of FORMS) {
    const open = form.match(/<form\b[^>]*>/)![0]
    assert.doesNotMatch(open, /method="get"/i, `${where}: no explicit GET`)
    const submits = [...form.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]).filter((tag) => !/type="button"/.test(tag))
    assert.ok(submits.length > 0, `${where}: has a submit button`)
    for (const tag of submits) assert.match(tag, /\bdisabled\b/, `${where}: submit starts disabled (${tag})`)
    assert.doesNotMatch(form, /<input\b[^>]*type="submit"/, `${where}: no input submit`)
    assert.match(form, /<noscript>[\s\S]*?JavaScript[\s\S]*?<\/noscript>/, `${where}: says it needs JavaScript`)
  }
})

test('the script is what turns the forms on, and no page claims a form works without JavaScript', () => {
  assert.match(read('app/boot.ts'), /enableForms/, 'the script enables the submit buttons')
  assert.match(read('app/main.ts'), /boot\(\)/, 'and the page module starts it')
  for (const id of ['start', 'accessibility'] as const) assert.doesNotMatch(source[id], /(?:form|forms)[^.<]*(?:still )?works? without/i, `${id}: no claim that a form works without JavaScript`)
  assert.doesNotMatch(source.accessibility, /contact form still works/)
})

test('the builder starts social media at the advertised one platform, in the page, the script and the links', () => {
  const checked = (name: string) => mainOf(source.start).match(new RegExp(`<input type="radio" name="${name}" value="(\\d+)" checked`))?.[1]
  assert.equal(checked('platforms'), String(DEFAULT_SOCIAL.platforms))
  assert.equal(checked('posts'), String(DEFAULT_SOCIAL.posts))
  assert.match(read('app/start/builder.ts'), /DEFAULT_SOCIAL\.platforms/, 'the builder falls back to the default')
  assert.match(read('app/lib/start-link.ts'), /DEFAULT_SOCIAL/, 'the link preset uses the default')
})

test('the builder fills its sheet rows by service id, never by what a label starts with', () => {
  assert.doesNotMatch(read('app/start/builder.ts'), /startsWith/)
})

test('the partials and the 404 link with %BASE_URL%, never a hard-coded base, and the build fills it in', () => {
  for (const [file, text] of [['app/components/header.html', raw.header], ['app/components/footer.html', raw.footer], ['app/404.html', notFound]]) {
    assert.ok(!text.includes(BASE), `${file}: no hard-coded ${BASE}`)
    const links = [...text.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1])
    assert.ok(links.length > 0, `${file}: has links`)
    for (const href of links) assert.match(href, /^(?:%BASE_URL%|#|https:\/\/)/, `${file}: ${href}`)
  }
  const page = includePartials(notFound, raw, BASE)
  assert.ok(page.includes(`href="${BASE}works/"`) && page.includes(`href="${BASE}terms/"`), 'filled in the page and its partials')
  assert.ok(!page.includes('%BASE_URL%'))
  assert.throws(() => includePartials(notFound, raw, 'marque'), /base/)
})

test('once the partials are in, the only placeholder left in any page is %VITE_SITE_URL%, which Vite fills from VITE_SITE_URL', () => {
  for (const page of PAGES) assert.deepEqual(leftoverPlaceholders(built[page.id]), ['%VITE_SITE_URL%'], page.id)
  assert.deepEqual(leftoverPlaceholders(includePartials(notFound, raw, BASE)), ['%VITE_SITE_URL%'], '404')
})

test('the build checks VITE_SITE_URL first and refuses to finish with a placeholder left in a page', () => {
  const config = read('vite.config.ts')
  assert.match(config, /process\.env\.VITE_SITE_URL = env\.VITE_SITE_URL = LOCAL_SITE_URL/, 'falls back to the local address without VITE_SITE_URL')
  assert.match(config, /checkSiteUrl\(env\.VITE_SITE_URL\)/, 'checks the address before building')
  assert.match(config, /leftoverPlaceholders\(html\)/, 'checks every built page')
  assert.match(config, /base: BASE/, 'one base for Vite and the partials')
  assert.match(read('package.json'), /"build": "tsc --noEmit && tsc --noEmit -p tsconfig\.test\.json && vite build"/, 'the build type-checks the tests and the config too')
})

test('Continue with Google carries Google’s mark in its own four colours, from the theme, never hex', () => {
  const button = mainOf(source.account).match(/<button class="button-provider"[\s\S]*?<\/button>/)?.[0] ?? ''
  for (const colour of ['blue', 'green', 'yellow', 'red']) {
    assert.ok(button.includes(`class="fill-google-${colour}"`), `the ${colour} part of the G`)
    assert.match(read('app/styles/main.css'), new RegExp(`--color-google-${colour}: oklch\\(`), `${colour} is an oklch token`)
  }
  assert.match(button, /<svg [^>]*aria-hidden="true"/, 'the mark is decoration; the words name the button')
})

test('the builder offers the first-project discount, ticked from the start, with its own line in the estimate', () => {
  const start = mainOf(source.start)
  assert.match(start, /<input class="check[^"]*" type="checkbox" id="first-project" checked data-first-project aria-describedby="first-project-desc" \/>/)
  assert.ok(start.includes('<label class="cursor-pointer font-[560]" for="first-project">My first project with Marque</label>'))
  assert.ok(start.includes('data-line="discount" data-off="Not applied"'), 'a discount line in the sheet')
  assert.ok(start.includes(`data-late-note>${LATE_TEXT}</p>`), 'the late-day credit beside the timeline')
})

test('BACKEND.md plans what the front end is waiting for, and the launch checklist takes noindex off', () => {
  const plan = read('BACKEND.md')
  for (const topic of ['Google', 'one-time code', 'brief', 'contact', 'verified email', 'first-project', 'late-day credit', 'subdomain', 'custom domain', 'export', 'noindex', 'payments']) {
    assert.match(plan, new RegExp(topic, 'i'), `BACKEND.md covers ${topic}`)
  }
})
