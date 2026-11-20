import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const app = new URL('../app/', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, app), 'utf8')
const stylesheets = readdirSync(new URL('styles/', app)).filter((file) => file.endsWith('.css'))

/** Every transition, animation, transform start state and smooth scroll lives inside a no-preference media query. */
function unguardedMotion(css: string): string[] {
  const found: string[] = []
  let depth = 0
  let guardDepth: number | null = null
  for (const line of css.split('\n')) {
    if (line.includes('@media (prefers-reduced-motion: no-preference)')) guardDepth = depth
    if (/^\s*(transition|animation|scroll-behavior)\s*:/.test(line) && !(guardDepth !== null && depth > guardDepth)) found.push(line.trim())
    depth += (line.match(/{/g) ?? []).length - (line.match(/}/g) ?? []).length
    if (guardDepth !== null && depth <= guardDepth) guardDepth = null
  }
  return found
}

test('with reduced motion, nothing in the stylesheets moves', () => {
  assert.ok(stylesheets.includes('main.css'), 'reads the stylesheets in app/styles')
  for (const file of stylesheets) assert.deepEqual(unguardedMotion(read(`styles/${file}`)), [], file)
})

test('the guard catches motion outside the media query', () => {
  assert.deepEqual(unguardedMotion('.a {\n  transition: opacity 1s;\n}'), ['transition: opacity 1s;'])
  assert.deepEqual(unguardedMotion('@media (prefers-reduced-motion: no-preference) {\n  .a {\n    transition: opacity 1s;\n  }\n}'), [])
})

test('the scroll reveal hides nothing unless the page is marked js and motion is welcome', () => {
  const css = read('styles/main.css')
  const reveal = css.slice(css.indexOf('Scroll reveal'))
  const guard = reveal.indexOf('@media (prefers-reduced-motion: no-preference)')
  assert.ok(guard > 0, 'inside the no-preference query')
  const hidden = reveal.slice(guard).match(/([^{}]+)\{\s*opacity: 0;/)?.[1] ?? ''
  assert.ok(hidden.trim().length > 0, 'finds the start state')
  for (const selector of hidden.split(',')) {
    assert.match(selector.trim(), /^\.js /, `${selector.trim()} needs .js`)
    assert.match(selector.trim(), /\[data-reveal-pending\]/, `${selector.trim()} hides only what the script marked pending`)
  }
  assert.match(reveal, /transform: translateY\(12px\)/, '12 px rise')
  assert.match(reveal, /520ms/, '520 ms')
})

function classTokens(source: string): string[] {
  return [...source.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean)
}

/** Utilities that animate must sit behind Tailwind's motion-safe variant, the same guard the stylesheets use. */
const unguardedUtilities = (source: string) => classTokens(source).filter((token) => /(^|:)(transition|animate-)/.test(token) && !/(^|:)motion-safe:/.test(token))

test('with reduced motion, no utility in the markup or the scripts moves', () => {
  const folders = readdirSync(app, { withFileTypes: true }).filter((e) => e.isDirectory() && readdirSync(new URL(`${e.name}/`, app)).includes('index.html'))
  const pages = ['index.html', '404.html', 'components/header.html', 'components/footer.html', ...folders.map((e) => `${e.name}/index.html`)]
  assert.ok(pages.length >= 13, 'finds every page')
  const sources = [...pages, ...readdirSync(app, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))]
  const animated = sources.flatMap((file) => classTokens(read(file))).filter((token) => /(^|:)(transition|animate-)/.test(token))
  assert.ok(animated.length > 0, 'finds the animated utilities')
  for (const file of sources) assert.deepEqual(unguardedUtilities(read(file)), [], file)
})

test('what is already on screen is never hidden: the script marks only targets below the first screen as pending', () => {
  const reveal = read('shared/reveal.ts')
  assert.match(reveal, /getBoundingClientRect\(\)\.top >= window\.innerHeight/, 'measures before hiding')
  assert.equal((reveal.match(/setAttribute\('data-reveal-pending'/g) ?? []).length, 1, 'one place adds the pending state')
  assert.match(reveal, /below\.forEach\(\(el\) => el\.setAttribute\('data-reveal-pending'/, 'and only to targets below the fold')
})

test('scripted motion checks the visitor’s setting first', () => {
  assert.match(read('start/count.ts'), /prefers-reduced-motion: reduce/)
  assert.match(read('shared/reveal.ts'), /prefers-reduced-motion: reduce/)
})
