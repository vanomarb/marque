import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { includePartials, type PartialName } from './build/partials.ts'
import { BASE, LOCAL_SITE_URL, checkSiteUrl, leftoverPlaceholders } from './build/site.ts'

const page = (name: string) => fileURLToPath(new URL(name, import.meta.url))

// Every folder in app/ with an index.html is a page, so adding one needs no change here.
const pages = Object.fromEntries(
  readdirSync(page('./app/'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(page(`./app/${entry.name}/index.html`)))
    .map((entry) => [entry.name, page(`./app/${entry.name}/index.html`)]),
)

// Reads the partials on every transform, so an edit shows on reload; runs before inlinePhosphor to inline their icons.
function sharedPartials(): Plugin {
  const dir = fileURLToPath(new URL('./app/components/', import.meta.url))
  const read = (name: PartialName) => readFileSync(`${dir}${name}.html`, 'utf8')
  return {
    name: 'marque:shared-partials',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => includePartials(html, { header: read('header'), footer: read('footer') }, BASE),
    },
    configureServer(server) {
      server.watcher.add(dir)
      server.watcher.on('change', (file) => {
        if (file.startsWith(dir)) server.ws.send({ type: 'full-reload' })
      })
    },
  }
}

// The <i>'s classes move onto the SVG; Tailwind finds them in its scan of the HTML.
function inlinePhosphor(): Plugin {
  const assets = fileURLToPath(new URL('./node_modules/@phosphor-icons/core/assets/', import.meta.url))
  const cache = new Map<string, string>()
  const load = (weight: string, name: string) => {
    const file = weight === 'regular' ? `regular/${name}.svg` : `${weight}/${name}-${weight}.svg`
    if (!cache.has(file)) {
      if (!existsSync(assets + file)) throw new Error(`inline-phosphor: no icon "${name}" in the ${weight} weight`)
      cache.set(file, readFileSync(assets + file, 'utf8').trim())
    }
    return cache.get(file)!
  }
  return {
    name: 'marque:inline-phosphor',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) =>
        html.replace(/<i\s+([^>]*data-icon="[^"]*"[^>]*)><\/i>/g, (_tag, attrs: string) => {
          const get = (name: string) => attrs.match(new RegExp(`${name}="([^"]*)"`))?.[1]
          const name = get('data-icon')!
          const weight = get('data-weight') ?? 'regular'
          if (weight !== 'regular' && weight !== 'light') throw new Error(`inline-phosphor: ${name} uses "${weight}"; Marque uses regular or light`)
          const classes = get('class')
          return load(weight, name).replace('<svg ', `<svg ${classes ? `class="${classes}" ` : ''}aria-hidden="true" focusable="false" `)
        }),
    },
  }
}

// The heads preload fonts from /node_modules/, which sits outside the Vite root (app/): point those URLs at the real folder.
function nodeModulesUrls(): Plugin {
  const dir = fileURLToPath(new URL('./node_modules/', import.meta.url))
  return {
    name: 'node-modules-urls',
    transformIndexHtml: {
      order: 'pre',
      handler: (html, { filename, server }) => html.replaceAll('"/node_modules/', `"${server ? `/@fs${dir}` : `${relative(dirname(filename), dir)}/`}`),
    },
  }
}

function noPlaceholdersLeft(): Plugin {
  return {
    name: 'marque:no-placeholders-left',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (html, { filename }) => {
        const left = leftoverPlaceholders(html)
        if (left.length) throw new Error(`${filename} still has ${left.join(', ')} after the build. Check its spelling, and that VITE_SITE_URL is set.`)
        return html
      },
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, page('./'), 'VITE_')
  // Without the variable or a .env, the local preview address; the Pages workflow passes the published one.
  if (env.VITE_SITE_URL === undefined) process.env.VITE_SITE_URL = env.VITE_SITE_URL = LOCAL_SITE_URL
  checkSiteUrl(env.VITE_SITE_URL)
  return {
    root: 'app',
    publicDir: '../public',
    envDir: '..',
    base: BASE,
    plugins: [sharedPartials(), inlinePhosphor(), nodeModulesUrls(), tailwindcss(), noPlaceholdersLeft()],
    build: {
      outDir: '../dist',
      emptyOutDir: true,
      target: 'es2022',
      // Tailwind v4's browser floor; all of them read oklch(), so the minifier adds no hex or lab() fallbacks.
      cssTarget: ['chrome111', 'edge111', 'firefox128', 'safari16.4'],
      rolldownOptions: {
        input: {
          main: page('./app/index.html'),
          ...pages,
          notFound: page('./app/404.html'),
        },
      },
    },
  }
})
