import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const mainBundlePath = resolve(process.cwd(), 'dist-electron/index.cjs')
const preloadBundlePath = resolve(process.cwd(), 'dist-electron/preload.cjs')

const mainBundle = readFileSync(mainBundlePath, 'utf8')
const preloadBundle = readFileSync(preloadBundlePath, 'utf8')

const forbiddenFallback = 'Calling `require` for "process"'

if (mainBundle.includes(forbiddenFallback) || preloadBundle.includes(forbiddenFallback)) {
  throw new Error('Electron bundle still contains the ESM require fallback for "process".')
}

if (!mainBundle.includes('exports') && !mainBundle.includes('module.exports')) {
  throw new Error('Electron main bundle was not emitted as CommonJS.')
}

console.log('Electron bundle verification passed.')
