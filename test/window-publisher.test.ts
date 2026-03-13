import { describe, expect, it, vi } from 'vitest'
import { safeSendToWindow } from '../src/main/window-publisher'

describe('window publisher', () => {
  it('does not throw when the BrowserWindow webContents access is already destroyed', () => {
    const targetWindow = {
      isDestroyed: vi.fn(() => false),
      get webContents() {
        throw new TypeError('Object has been destroyed')
      },
    }

    expect(safeSendToWindow(targetWindow as never, 'runtime:snapshot', { ok: true })).toBe(false)
  })

  it('does not send when the target window is already destroyed', () => {
    const send = vi.fn()
    const targetWindow = {
      isDestroyed: vi.fn(() => true),
      webContents: {
        isDestroyed: vi.fn(() => false),
        isCrashed: vi.fn(() => false),
        send,
      },
    }

    expect(safeSendToWindow(targetWindow as never, 'runtime:snapshot', { ok: true })).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })
})
