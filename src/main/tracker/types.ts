import type { NormalizedIssue, ServiceConfig, TrackerDescriptor, TrackerToolSpec } from '@shared/types'

export interface TrackerToolExecutor {
  execute(name: string, args: unknown): Promise<Record<string, unknown>>
}

export interface TrackerAdapter {
  descriptor(config: ServiceConfig): TrackerDescriptor
  fetchCandidateIssues(config: ServiceConfig): Promise<NormalizedIssue[]>
  fetchCurrentStates(config: ServiceConfig, issueIds: string[]): Promise<Map<string, string>>
  fetchTerminalIssues(config: ServiceConfig): Promise<NormalizedIssue[]>
  fetchIssueByIdentifier?(config: ServiceConfig, identifier: string): Promise<NormalizedIssue | null>
  getDynamicTools?(): TrackerToolSpec[]
  executeDynamicTool?(name: string, args: unknown, config: ServiceConfig): Promise<Record<string, unknown>>
}
