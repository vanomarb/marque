import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { includePartials } from '../build/partials.ts'
import { peso } from '../app/lib/format.ts'
import { DEFAULT_SOCIAL, SERVICES, estimate } from '../app/lib/estimate.ts'
import { LAUNCH_SET } from '../app/lib/start-link.ts'
import { EMAIL, MOBILE } from '../app/lib/account.ts'
import { BASE, leftoverPlaceholders } from '../build/site.ts'

const root = new URL('../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')

const PAGES = [
  { id: 'home', path: '' },
  { id: 'work', path: 'work/' },
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
const HEADER_PAGES: PageId[] = ['home', 'work', 'services', 'studio', 'start', 'account']
const FOOTER_PAGES: PageId[] = ['terms', 'privacy', 'cookies', 'accessibility']
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
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const DISCLOSURE = 'Marque is a concept brand. This is a demonstration site: nothing you enter here is sent, and no payments are taken.'
const ABOUT_LINK = /<a [^>]*href="\/marque\/terms\/#concept"[^>]*data-concept[^>]*>About this site<\/a>/
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

test('the pages on disk are exactly the pages the site lists', () => {
  const app = new URL('app/', root)
  const folders = readdirSync(app, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(new URL(`${e.name}/index.html`, app)))
    .map((e) => `${e.name}/`)
  assert.deepEqual(folders.sort(), PAGES.filter((p) => p.path).map((p) => p.path).sort())
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
    assert.equal(count(source[page.id], `<!-- include:${where} current="${page.id}" -->`), 1, `${page.id}: ${where} marker names the page`)
    assert.equal(count(source[page.id], '<!-- include:header'), 1, `${page.id}: header marker`)
    assert.equal(count(source[page.id], '<!-- include:footer'), 1, `${page.id}: footer marker`)
    assert.doesNotMatch(source[page.id], /<header[\s>]|<footer[\s>]/, `${page.id}: no copied header or footer`)
    const html = built[page.id]
    assert.doesNotMatch(html, /<!-- include:/, `${page.id}: markers replaced`)
    // The header links its pages twice, from the bar and the phone menu, and marks both.
    const current = [...html.matchAll(/<a [^>]*data-page="([a-z-]+)" aria-current="page"/g)].map((m) => m[1])
    assert.deepEqual(current, Array(HEADER_PAGES.includes(page.id) ? 2 : 1).fill(page.id), `${page.id}: its own links, and only those, are current`)
    assert.equal(count(html, '<main id="main"'), 1, `${page.id}: main`)
    assert.equal(count(html, '<h1'), 1, `${page.id}: one h1`)
    assert.match(html, ABOUT_LINK, `${page.id}: About this site link`)
    assert.ok(html.includes('id="concept-dialog"'), `${page.id}: About this site dialog`)
  }
})

test('the header reaches the main pages; the footer has Company, Help and Legal, the newsletter, area and hours', () => {
  for (const id of HEADER_PAGES) {
    const page = PAGES.find((p) => p.id === id)!
    assert.match(partials.header, new RegExp(`href="/marque/${page.path}"[^>]*data-page="${id}"`), `header: ${id}`)
  }
  for (const id of FOOTER_PAGES) assert.match(partials.footer, new RegExp(`href="/marque/${id}/"[^>]*data-page="${id}"`), `footer: ${id}`)
  const column = (heading: string) => partials.footer.match(new RegExp(`>${heading}</h2>([\\s\\S]*?)</nav>`))?.[1] ?? ''
  assert.deepEqual([...column('Company').matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)</g)].map((m) => [m[1], m[2]]), [
    ['/marque/studio/', 'Studio'],
    ['/marque/work/', 'Work'],
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
  assert.ok(partials.footer.includes('Mabolo, Cebu City'), 'footer: area')
  assert.match(partials.footer, /Monday to Friday, 9:00 AM to 6:00 PM/, 'footer: studio hours')
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

test('the footer has no disclosure line, only an About this site link in its legal row; the dialog and Terms say it', () => {
  const footer = footerOf(partials.footer)
  assert.ok(footer, 'footer element')
  assert.ok(!footer.includes(DISCLOSURE) && !/is a concept brand/.test(footer), 'no disclosure line in the footer')
  const legalRow = footer.match(/<div [^>]*data-legal-row[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? ''
  assert.ok(legalRow.includes('© 2026 Marque'), 'legal row: copyright')
  assert.match(legalRow, ABOUT_LINK, 'legal row: About this site opens the dialog')
  const dialog = partials.footer.match(/<dialog [\s\S]*?<\/dialog>/)?.[0] ?? ''
  assert.ok(dialog.includes('id="concept-dialog"') && dialog.includes('>About this site</h2>') && dialog.includes(DISCLOSURE), 'the dialog states it')
  assert.ok(mainOf(built.terms).includes(DISCLOSURE), 'Terms states it')
  for (const page of PAGES) assert.ok(!source[page.id].includes('Is this a real business?'), `${page.id}: no "real business" FAQ`)
})

test('the concept note sits beside the main action on Home and on Start a project, and nowhere else', () => {
  const note = /Marque is a concept brand[^<]*<a [^>]*data-concept[^>]*>About this site<\/a>/
  for (const page of PAGES) assert.equal(note.test(mainOf(source[page.id])), page.id === 'home' || page.id === 'start', `${page.id}: concept note`)
})

test('there is no password field anywhere, only an email or mobile number and an on-screen code', () => {
  for (const [file, text] of productSources()) assert.doesNotMatch(text, /type=\\?"password\\?"|type='password'/, file)
  const account = mainOf(source.account)
  assert.ok(account.includes('data-account'), 'account feature')
  assert.match(account, /<input [^>]*name="first-name"/, 'first name')
  assert.match(account, /<input [^>]*name="contact"/, 'email or mobile number')
  assert.match(account, /<input [^>]*autocomplete="one-time-code"/, 'one-time code')
  assert.ok(account.includes('data-demo-code'), 'the code is shown on screen')
  assert.ok(account.includes('data-briefs'), 'Your briefs')
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
    assert.ok(home.includes(`href="/marque/work/#${site}"`), `${site}: links to its case study`)
    assert.ok(home.includes(`src="/work/${site}-cover-800.webp"`), `${site}: screenshot`)
    assert.ok(!home.includes(`href="${url}"`), `${site}: the live site is opened from the case study, not from Home`)
  }
  const launch = estimate(LAUNCH_SET)
  assert.ok(home.includes('href="/marque/start/?set=launch"'), 'the launch set opens in the builder')
  assert.ok(home.includes(peso(launch.oneTime)) && home.includes(`${launch.weeks![0]} to ${launch.weeks![1]} weeks`), 'the launch set in real prices')
  for (const service of SERVICES) {
    const row = home.match(new RegExp(`<a [^>]*href="/marque/services/#${service.id}"[\\s\\S]*?</a>`))?.[0]
    assert.ok(row, `${service.id}: teaser row links to Services`)
    assert.ok(row.includes(`>${service.name}<`) && row.includes(peso(service.from)), `${service.id}: name and starting price`)
  }
  for (const n of ['01', '02', '03', '04', '05', '06']) assert.ok(home.includes(`>${n}</`), `section ${n} in the margin`)
  assert.ok(count(home, 'data-step') >= 4, 'how we work, step by step')
  assert.ok(home.includes('href="/marque/start/"'), 'a closing call to start a project')
  assert.doesNotMatch(home, /\b\d[\d,]*\+? (?:happy |satisfied )?(?:clients|customers|brands|projects|reviews)\b|★|\bstars?\b|award|trusted by/i, 'no invented proof')
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

test('Work’s "Concept project" is plain text, not a button-shaped box', () => {
  const labels = [...mainOf(source.work).matchAll(/<p class="([^"]*)">Concept project<\/p>/g)]
  assert.equal(labels.length, 3)
  for (const [, classes] of labels) assert.doesNotMatch(classes, /\bborder\b/, 'no box')
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

test('Work shows the three concept projects, what the studio made, and opens each live site', () => {
  const work = mainOf(source.work)
  for (const [site, url] of Object.entries(LIVE_SITES)) {
    const section = work.match(new RegExp(`<article [^>]*id="${site}"[\\s\\S]*?</article>`))?.[0]
    assert.ok(section, `${site}: case study`)
    assert.ok(section.includes('Concept project'), `${site}: labelled concept work`)
    assert.ok(section.includes(`href="${url}"`), `${site}: link to the live site`)
    assert.ok(section.includes(`src="/work/${site}-desktop-800.webp"`) && section.includes(`src="/work/${site}-phone-390.webp"`), `${site}: desktop and phone screenshots`)
    assert.match(section, /<dl[\s>]/, `${site}: what we made`)
  }
  assert.doesNotMatch(work, /\d+\s?%|percent|increase|grew|growth|revenue|sales up|conversion/i, 'no invented results')
})

test('Services lists every service with its starting price and time, and links each one into the builder', () => {
  const services = mainOf(source.services)
  for (const service of SERVICES) {
    const row = services.match(new RegExp(`<section [^>]*id="${service.id}"[\\s\\S]*?</section>`))?.[0]
    assert.ok(row, `${service.id}: its own section`)
    assert.ok(row.includes(`>${service.name}</h2>`), `${service.id}: name`)
    assert.ok(row.includes(peso(service.from)) && row.includes(service.unit) && row.includes(service.time), `${service.id}: price, unit and time`)
    assert.ok(row.includes(`href="/marque/start/?add=${service.id}"`), `${service.id}: into the builder`)
  }
  const faq = services.match(/id="faq"[\s\S]*$/)?.[0] ?? ''
  assert.ok(count(faq, '<summary') >= 5, 'FAQ')
})

test('Studio is the About page: who the studio is, how it works, and where', () => {
  const studio = mainOf(source.studio)
  assert.ok(count(studio, 'data-step') >= 4, 'the process, step by step')
  assert.ok(studio.includes('Mabolo') && studio.includes('Monday to Friday'), 'area and hours')
})

test('the legal pages read like a Philippine studio’s and list exactly the keys the code stores', () => {
  const privacy = mainOf(source.privacy)
  assert.ok(privacy.includes('Data Privacy Act of 2012') && privacy.includes('Republic Act No. 10173'), 'Data Privacy Act')
  assert.ok(privacy.includes('National Privacy Commission'), 'NPC')
  assert.match(mainOf(source.cookies), /no cookies/i, 'no cookies')
  for (const id of ['terms', 'privacy', 'cookies', 'accessibility'] as const) {
    assert.match(mainOf(source[id]), /demonstration site/, `${id}: demonstration`)
    assert.ok(mainOf(source[id]).includes('Last updated'), `${id}: dated`)
  }
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
  assert.ok(ABOUT_LINK.test(html) && html.includes('id="concept-dialog"'), 'About this site link and dialog')
  assert.ok(notFound.includes('<script type="module" src="/main.ts"></script>'), 'script, so the dialog opens')
  assert.equal(meta(notFound, 'name', 'robots'), 'noindex')
  assert.ok(!notFound.includes('rel="canonical"'), 'no canonical on a 404')
  assert.equal(meta(notFound, 'property', 'og:title'), notFound.match(/<title>([^<]+)<\/title>/)?.[1])
  assert.equal(meta(notFound, 'property', 'og:image'), '%VITE_SITE_URL%og.png')
  for (const id of ['home', 'work', 'services', 'studio', 'start']) {
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
  assert.ok(script.includes(MOBILE.source), 'the mobile pattern parseContact uses')
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
    ['01', '/marque/work/'],
    ['02', '/marque/services/'],
    ['03', '/marque/studio/'],
    ['04', '/marque/account/'],
  ], 'numbered index rows, in the order of the bar')
  for (const [, classes] of rows) assert.ok(classes.includes('border-b') && classes.includes('border-rule'), 'each row carries its own full-width rule')
  assert.match(dialog, /class="ruler"/, 'the panel opens on the ruler, like every section')
  // The bar's links stay the desktop navigation, and the no-JavaScript fallback.
  const desktop = partials.header.match(/<ul [^>]*data-menu[\s>][\s\S]*?<\/ul>/)?.[0] ?? ''
  assert.match(desktop, /max-lg:hidden/, 'with JavaScript, phones use the dialog instead')
  for (const page of ['work', 'services', 'studio', 'account']) assert.ok(desktop.includes(`data-page="${page}"`), `bar: ${page}`)
  assert.match(read('app/styles/main.css'), /html:has\(#site-menu:modal\)\s*\{\s*overflow: hidden/, 'the page behind does not scroll while the menu is open')
})

test('the sign-in speaks in the studio’s own words, not the lines the other sites share', () => {
  const account = mainOf(source.account) + read('app/account/account.ts')
  for (const shared of ['Use a different email or number', 'Enter your code', 'Demo code', 'There’s no password: we show you a one-time code', 'A mobile number starting with 09, or an email address', 'Get a code', 'One-time code', 'Hello,', 'this demonstration shows it here instead']) {
    assert.ok(!account.includes(shared), `no "${shared}"`)
  }
  for (const own of ['Sign in with two lines and a code.', 'Name on the file', 'Show my code', 'Copy these four digits.', 'Four-digit code', 'Open my briefs', 'Change name or contact', 'Filed under']) {
    assert.ok(account.includes(own), `says "${own}"`)
  }
  assert.match(mainOf(source.account), /<p class="field-error[^"]*" id="briefs-error" tabindex="-1" hidden data-briefs-error>/, 'a visible place to say a brief could not be removed')
})

test('the ₱ comes from the latin-ext font file, which every page that sets a price preloads', () => {
  const fonts = read('app/styles/fonts.css')
  const faces = [...fonts.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)].map((m) => m[1]).filter((face) => face.includes("'Bricolage Grotesque'"))
  const covers = (face: string, code: number) =>
    (face.match(/unicode-range:([^;]+);/)?.[1] ?? '').split(',').some((range) => {
      const [from, to] = range.trim().replace('U+', '').split('-').map((hex) => parseInt(hex, 16))
      return code >= from && code <= (to ?? from)
    })
  const peso = faces.filter((face) => covers(face, 0x20b1))
  assert.equal(peso.length, 1, 'one face carries U+20B1')
  const file = peso[0].match(/url\('\.\.\/\.\.\/(node_modules\/[^']+\.woff2)'\)/)?.[1]
  assert.ok(file && existsSync(new URL(file, root)), 'its file exists')
  const preload = `<link rel="preload" href="/${file}" as="font" type="font/woff2" crossorigin />`
  // Your briefs prints prices from its script as soon as a signed-in visitor lands, so it counts as a page with prices.
  for (const page of PAGES) {
    const prices = source[page.id].includes('₱') || page.id === 'account'
    assert.equal(source[page.id].includes(preload), prices, `${page.id}: ${prices ? 'preloads' : 'does not preload'} the ₱ file`)
  }
  assert.ok(!notFound.includes(preload), '404: no prices')
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

test('without JavaScript, About this site is a link to the Terms section that says what the site is', () => {
  const triggers = [...PAGES.map((p) => source[p.id]), notFound, partials.header, partials.footer].flatMap((html) => [...html.matchAll(/<[a-z]+ [^>]*data-concept[\s>][^>]*>/g)].map((m) => m[0]))
  assert.ok(triggers.length >= 3, 'the footer link and the two notes')
  for (const tag of triggers) assert.match(tag, /^<a [^>]*href="\/marque\/terms\/#concept"/, tag)
  const section = mainOf(built.terms).match(/<h2 id="concept"[^>]*>[^<]*<\/h2>\s*<p>([^<]*)<\/p>/)
  assert.ok(section, 'Terms has the section the link points at')
  assert.equal(section[1], DISCLOSURE, 'and it opens with the concept text')
})

test('the partials and the 404 link with %BASE_URL%, never a hard-coded base, and the build fills it in', () => {
  for (const [file, text] of [['app/components/header.html', raw.header], ['app/components/footer.html', raw.footer], ['app/404.html', notFound]]) {
    assert.ok(!text.includes(BASE), `${file}: no hard-coded ${BASE}`)
    const links = [...text.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1])
    assert.ok(links.length > 0, `${file}: has links`)
    for (const href of links) assert.match(href, /^(?:%BASE_URL%|#|https:\/\/)/, `${file}: ${href}`)
  }
  const page = includePartials(notFound, raw, BASE)
  assert.ok(page.includes(`href="${BASE}work/"`) && page.includes(`href="${BASE}terms/#concept"`), 'filled in the page and its partials')
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
