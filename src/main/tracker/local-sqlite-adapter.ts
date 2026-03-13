import type { ServiceConfig, TrackerDescriptor } from '@shared/types'
import type { TrackerAdapter } from './types'
import { LocalKanbanStore } from './local-kanban-store'

export class LocalSqliteTrackerAdapter implements TrackerAdapter {
  constructor(private readonly store: LocalKanbanStore) {}

  descriptor(config: ServiceConfig): TrackerDescriptor {
    return {
      kind: 'local',
      label: 'Local Kanban',
      status: config.tracker.kind === 'local' ? 'active' : 'available',
      capabilities: ['candidate-fetch', 'state-refresh', 'terminal-fetch', 'local-kanban'],
      description: 'Built-in SQLite kanban board for teams without an external tracker.',
    }
  }

  async fetchCandidateIssues(config: ServiceConfig) {
    void config
    return this.store.fetchCandidateIssues()
  }

  async fetchCurrentStates(_config: ServiceConfig, issueIds: string[]) {
    return this.store.fetchCurrentStates(issueIds)
  }

  async fetchTerminalIssues(config: ServiceConfig) {
    void config
    return this.store.fetchTerminalIssues()
  }

  async fetchIssueByIdentifier(_config: ServiceConfig, identifier: string) {
    return this.store.fetchIssueByIdentifier(identifier)
  }
}
