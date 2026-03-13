import { describe, expect, it, vi } from 'vitest'
import { ObservabilityStore } from '../src/main/runtime/observability-store'

describe('main-process lifecycle guards', () => {
  it('can safely remove a snapshot listener before later store updates', () => {
    const store = new ObservabilityStore()
    const send = vi.fn()

    const listener = (snapshot: ReturnType<ObservabilityStore['getSnapshot']>) => {
      send(snapshot)
    }

    store.on('snapshot', listener)
    store.off('snapshot', listener)
    store.update({ status: 'running' })

    expect(send).not.toHaveBeenCalled()
  })
})
