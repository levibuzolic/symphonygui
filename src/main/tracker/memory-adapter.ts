import type { NormalizedIssue, ServiceConfig, TrackerDescriptor } from '@shared/types'
import type { TrackerAdapter } from './types'

const memoryIssues: NormalizedIssue[] = [
  {
    id: 'mem-1',
    identifier: 'DEMO-101',
    title: 'Build polished integrations overview',
    description: 'Create a future-proof integrations page that can list multiple tracker adapters.',
    priority: 1,
    state: 'In Progress',
    branchName: 'demo-101-integrations-overview',
    url: null,
    labels: ['design', 'frontend'],
    blockedBy: [],
    createdAt: '2026-03-10T09:00:00.000Z',
    updatedAt: '2026-03-13T09:00:00.000Z',
  },
  {
    id: 'mem-2',
    identifier: 'DEMO-102',
    title: 'Tighten retry and reconciliation flow',
    description: 'Implement scheduler-driven retries and cleanup of terminal-state workspaces.',
    priority: 2,
    state: 'Todo',
    branchName: 'demo-102-retry-reconciliation',
    url: null,
    labels: ['runtime'],
    blockedBy: [],
    createdAt: '2026-03-10T10:00:00.000Z',
    updatedAt: '2026-03-13T08:00:00.000Z',
  },
  {
    id: 'mem-3',
    identifier: 'DEMO-103',
    title: 'Package the macOS build',
    description: 'Validate the packaged desktop application and hide dev-only surfaces in production.',
    priority: 3,
    state: 'Todo',
    branchName: 'demo-103-packaging',
    url: null,
    labels: ['desktop'],
    blockedBy: [{ id: 'mem-2', identifier: 'DEMO-102', state: 'Todo' }],
    createdAt: '2026-03-11T11:00:00.000Z',
    updatedAt: '2026-03-12T08:00:00.000Z',
  },
]

export class MemoryTrackerAdapter implements TrackerAdapter {
  descriptor(config: ServiceConfig): TrackerDescriptor {
    return {
      kind: 'memory',
      label: 'Local Demo',
      status: config.tracker.kind === 'memory' ? 'active' : 'available',
      capabilities: ['candidate-fetch', 'state-refresh', 'terminal-fetch', 'local-demo'],
      description: 'In-memory tracker adapter for local UI and runtime verification.',
    }
  }

  async fetchCandidateIssues(config: ServiceConfig): Promise<NormalizedIssue[]> {
    return memoryIssues.filter((issue) => config.tracker.activeStates.includes(issue.state))
  }

  async fetchCurrentStates(_config: ServiceConfig, issueIds: string[]) {
    return new Map(
      memoryIssues
        .filter((issue) => issueIds.includes(issue.id))
        .map((issue) => [issue.id, issue.state]),
    )
  }

  async fetchTerminalIssues(config: ServiceConfig): Promise<NormalizedIssue[]> {
    return memoryIssues.filter((issue) => config.tracker.terminalStates.includes(issue.state))
  }

  async fetchIssueByIdentifier(_config: ServiceConfig, identifier: string) {
    return memoryIssues.find((issue) => issue.identifier === identifier) ?? null
  }
}
