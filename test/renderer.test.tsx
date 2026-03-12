import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../src/renderer/App'
import type { BootstrapPayload } from '../src/shared/types'
import { implementationProgress } from '../src/shared/progress'

const bootstrap: BootstrapPayload = {
  isDevelopment: true,
  progress: implementationProgress,
  trackers: [
    {
      kind: 'linear',
      label: 'Linear',
      status: 'active',
      capabilities: ['candidate-fetch'],
      description: 'Linear adapter',
    },
  ],
  snapshot: {
    generatedAt: new Date().toISOString(),
    workflowPath: '/tmp/WORKFLOW.md',
    pollIntervalMs: 30000,
    nextRefreshInMs: 1000,
    counts: { running: 0, retrying: 0, claimed: 0, completed: 0 },
    codexTotals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0 },
    rateLimits: null,
    tracker: {
      kind: 'linear',
      label: 'Linear',
      status: 'active',
      capabilities: ['candidate-fetch'],
      description: 'Linear adapter',
    },
    running: [],
    retrying: [],
    logs: [],
    status: 'idle',
    errors: [],
  },
}

describe('renderer app', () => {
  it('renders dashboard shell', async () => {
    ;(globalThis as typeof globalThis & { symphony: unknown }).symphony = {
      getBootstrap: vi.fn().mockResolvedValue(bootstrap),
      refreshRuntime: vi.fn(),
      getIssue: vi.fn(),
      getLogs: vi.fn(),
      listIntegrations: vi.fn(),
      getProgress: vi.fn(),
      onSnapshot: vi.fn().mockReturnValue(() => undefined),
    }

    render(<App />)
    expect(await screen.findByText('Symphony status')).toBeInTheDocument()
    expect(screen.getByText('Implementation Progress')).toBeInTheDocument()
  })
})
