import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Colours are oklch() theme variables in app/styles/main.css; this fails on a hex colour anywhere in the sources.
// It skips href="#…" anchors, url(#…) references and &#8369;-style entities.
const HEX = /(?<![&\w-])(?<!href=")(?<!href=')(?<!url\()#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/i
const SKIP = new Set(['node_modules', '.git', 'dist'])

function files(dir: string, keep: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return SKIP.has(entry.name) ? [] : files(path, keep)
    return keep.test(entry.name) ? [path] : []
  })
}

test('no colour is written as hex', () => {
  const sources = [...files('.', /\.(html|svg)$/), ...['app', 'build', 'tests'].flatMap((dir) => files(dir, /\.(ts|css|json)$/))]
  const found = sources.flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line, i) => (HEX.test(line) ? [`${file}:${i + 1}: ${line.trim()}`] : [])),
  )
  assert.deepEqual(found, [])
})

// Contrast of the theme's oklch tokens, worked out from the CSS itself.
const css = readFileSync('app/styles/main.css', 'utf8')
const count = (text: string, part: string) => text.split(part).length - 1
function token(name: string): [number, number, number] {
  const m = css.match(new RegExp(`--color-${name}: oklch\\(([\\d.]+) ([\\d.]+) ?([\\d.]*)\\)`))
  assert.ok(m, `--color-${name} is an oklch() token`)
  return [Number(m[1]), Number(m[2]), Number(m[3] || 0)]
}
function luminance([L, C, h]: [number, number, number]): number {
  const a = C * Math.cos((h * Math.PI) / 180)
  const b = C * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const channels = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
  const [r, g, bl] = channels.map((v) => Math.min(1, Math.max(0, v)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl
}
const contrast = (a: [number, number, number], b: [number, number, number]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test('savings on ink use a lighter green of the same hue that passes AA on ink, and on paper the deep one does', () => {
  const [, , hue] = token('save')
  assert.equal(token('on-ink-save')[2], hue, 'same hue')
  assert.ok(contrast(token('on-ink-save'), token('ink')) >= 4.5, 'on-ink savings on ink')
  assert.ok(contrast(token('save'), token('paper')) >= 4.5, 'savings on paper')
  assert.match(css, /\.on-ink \.offer,\s*\.on-ink \.price-now \{\s*color: var\(--color-on-ink-save\);/, 'the offer and first-project price on ink take it')
})

function srgb([L, C, h]: [number, number, number]): number[] {
  const a = C * Math.cos((h * Math.PI) / 180)
  const b = C * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
    .map((v) => Math.min(1, Math.max(0, v)))
    .map((v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055))
}

test('a button’s hover square swaps its two colours pixel for pixel and ends on the real tokens', () => {
  const button = css.match(/\.button \{[\s\S]*?\n  \.button--outline/)?.[0] ?? ''
  assert.ok(button.includes('isolation: isolate'), 'the button blends inside itself')
  assert.match(button, /&::before,\s*&::after \{[^}]*z-index: 1;[^}]*visibility: var\(--fill-layers, visible\);/, 'both layers sit above the label')
  assert.match(button, /&::before \{\s*background-color: var\(--color-sheet\);\s*mix-blend-mode: difference;/, 'the first layer inverts against white')
  assert.match(button, /@supports \(mix-blend-mode: plus-lighter\)[^{]*\{\s*&::after \{\s*display: block;\s*background-color: rgb\(from color-mix\(in srgb, var\(--button-bg\), var\(--button-text\)\) calc\(r \* 2 - 255\) calc\(g \* 2 - 255\) calc\(b \* 2 - 255\)\);\s*mix-blend-mode: plus-lighter;/, 'the second adds back background + text − white, only where the browser can')
  // plus-lighter can only add, so every pairing the square swaps needs background + text at or above white in each channel.
  for (const [bg, text] of [['ink', 'paper'], ['sheet', 'ink']]) {
    const [x, y] = [srgb(token(bg)), srgb(token(text))]
    assert.ok(x.every((v, i) => v + y[i] >= 255), `${bg} and ${text} can trade places`)
  }
  assert.match(button, /background-color: var\(--filled-bg, var\(--button-bg\)\);\s*color: var\(--filled-text, var\(--button-text\)\);/, 'the button paints the swapped colours when it is given them')
  const swap = /--filled-bg: var\(--button-text\);\s*--filled-text: var\(--button-bg\);\s*--fill-layers: hidden;/g
  assert.equal(button.match(swap)?.length, 2, 'hovered or focused, it takes the swapped colours and hides the layers, at once under reduced motion')
  const motion = button.slice(button.indexOf('@media (prefers-reduced-motion: no-preference)'))
  assert.match(motion, /--fill-time: 360ms;\s*&::before,\s*&::after \{\s*transition: scale var\(--fill-time\)/, 'with motion, the square takes 360ms')
  assert.equal(count(motion, 'animation: button-hold var(--fill-time) step-end;'), 2, 'and the old colours hold for exactly as long')
  assert.match(css, /@keyframes button-hold \{\s*from \{\s*--filled-bg: var\(--button-bg\);\s*--filled-text: var\(--button-text\);\s*--fill-layers: visible;\s*\}\s*\}/, 'one hold, so the colours and the layers change in the same frame')
  assert.match(css, /\.button--outline \{\s*--button-bg: var\(--color-paper\);/, 'an outline button has a solid background to swap')
  assert.match(css, /\.bg-sheet \.button--outline:not\(:disabled\) \{\s*--button-bg: var\(--color-sheet\);/, 'on a white card it is white, not a grey box')
  assert.match(css, /\.segments \{[\s\S]*?label \{[^}]*min-width: 44px/, 'segment options are 44px wide')
})
