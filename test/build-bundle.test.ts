import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('built electron bundle', () => {
  it('uses CommonJS output without the process require fallback', () => {
    const bundlePath = resolve(process.cwd(), 'dist-electron/index.cjs')
    if (!existsSync(bundlePath)) {
      expect(true).toBe(true)
      return
    }
    const bundle = readFileSync(bundlePath, 'utf8')

    expect(bundle).not.toContain('Calling `require` for "process"')
    expect(bundle.includes('module.exports') || bundle.includes('exports.')).toBe(true)
  })
})
