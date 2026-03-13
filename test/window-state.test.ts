import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createWindowStateStore } from '../src/main/services/window-state'

describe('window state store', () => {
  it('returns defaults when no persisted state exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'symphonygui-window-state-'))

    try {
      const store = createWindowStateStore(root)
      expect(store.load()).toEqual({
        bounds: {
          width: 1560,
          height: 980,
        },
        isMaximized: false,
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('persists and restores window bounds and maximized state', () => {
    const root = mkdtempSync(join(tmpdir(), 'symphonygui-window-state-'))

    try {
      const store = createWindowStateStore(root)
      store.save({
        bounds: {
          x: 120,
          y: 48,
          width: 1440,
          height: 920,
        },
        isMaximized: true,
      })

      expect(store.load()).toEqual({
        bounds: {
          x: 120,
          y: 48,
          width: 1440,
          height: 920,
        },
        isMaximized: true,
      })
      expect(JSON.parse(readFileSync(join(root, 'window-state.json'), 'utf8'))).toMatchObject({
        bounds: {
          x: 120,
          y: 48,
          width: 1440,
          height: 920,
        },
        isMaximized: true,
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('falls back safely when persisted state is invalid', () => {
    const root = mkdtempSync(join(tmpdir(), 'symphonygui-window-state-'))

    try {
      writeFileSync(join(root, 'window-state.json'), '{"bounds":{"width":0,"height":-5},"isMaximized":"nope"}', 'utf8')

      const store = createWindowStateStore(root)
      expect(store.load()).toEqual({
        bounds: {
          width: 1560,
          height: 980,
        },
        isMaximized: false,
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
