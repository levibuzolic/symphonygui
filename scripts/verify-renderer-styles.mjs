import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const assetsDir = resolve(process.cwd(), 'dist/assets')
const cssFile = readdirSync(assetsDir).find((file) => file.endsWith('.css'))

if (!cssFile) {
  throw new Error('No built CSS asset found in dist/assets.')
}

const css = readFileSync(resolve(assetsDir, cssFile), 'utf8')

if (css.includes('@tailwind') || css.includes('@import "tailwindcss"') || css.includes('@theme inline')) {
  throw new Error('Renderer CSS still contains unprocessed Tailwind directives.')
}

const expectedSelectors = ['.min-h-screen', '.grid', '.rounded-2xl', '.bg-card']
const missing = expectedSelectors.filter((selector) => !css.includes(selector))

if (missing.length > 0) {
  throw new Error(`Renderer CSS is missing expected utility output: ${missing.join(', ')}`)
}

console.log('Renderer style verification passed.')
