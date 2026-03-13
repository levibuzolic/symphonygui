import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../src/renderer/App'
import type { BootstrapPayload } from '../src/shared/types'
import { implementationProgress } from '../src/shared/progress'

const refreshRuntime = vi.fn()

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
    logs: [
      {
        id: 'log-1',
        level: 'info',
        timestamp: new Date().toISOString(),
        scope: 'orchestrator',
        message: 'Fetched candidate issues',
      },
    ],
    status: 'idle',
    errors: [],
  },
}

function installSymphonyStub() {
  refreshRuntime.mockReset()
  ;(globalThis as typeof globalThis & { symphony: unknown }).symphony = {
    getBootstrap: vi.fn().mockResolvedValue(bootstrap),
    refreshRuntime,
    getIssue: vi.fn(),
    getLogs: vi.fn(),
    listIntegrations: vi.fn(),
    getProgress: vi.fn(),
    onSnapshot: vi.fn().mockReturnValue(() => undefined),
  }
}

describe('renderer app', () => {
  it('renders dashboard shell', async () => {
    installSymphonyStub()
    render(<App />)
    expect(await screen.findByText('Symphony status')).toBeInTheDocument()
    expect(screen.getByText('Implementation Progress')).toBeInTheDocument()
  })

  it('switches views from the sidebar', async () => {
    installSymphonyStub()
    render(<App />)

    await screen.findByText('Symphony status')
    fireEvent.click(screen.getByRole('button', { name: 'Logs' }))

    expect(screen.getByText('Runtime logs')).toBeInTheDocument()
    expect(screen.getAllByText('Fetched candidate issues').length).toBeGreaterThan(0)
  })

  it('triggers a refresh from the header action', async () => {
    installSymphonyStub()
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: /refresh now/i }))
    expect(refreshRuntime).toHaveBeenCalledTimes(1)
  })

  it('renders a fixed-height shell instead of a full-page document layout', async () => {
    installSymphonyStub()
    const { container } = render(<App />)

    await screen.findByText('Symphony status')
    expect(String((container as unknown as { innerHTML?: string }).innerHTML ?? '')).toContain('h-screen overflow-hidden bg-background text-foreground')
  })
})
