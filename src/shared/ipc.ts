import type { BootstrapPayload, NormalizedIssue, OrchestratorSnapshot, RuntimeLogEntry, TrackerDescriptor, WorkflowDocument } from './types'

export interface SymphonyApi {
  getBootstrap(): Promise<BootstrapPayload>
  refreshRuntime(): Promise<void>
  getIssue(identifier: string): Promise<NormalizedIssue | null>
  getLogs(): Promise<RuntimeLogEntry[]>
  listIntegrations(): Promise<TrackerDescriptor[]>
  getWorkflowDocument(): Promise<WorkflowDocument>
  saveWorkflowDocument(contents: string): Promise<WorkflowDocument>
  onSnapshot(listener: (snapshot: OrchestratorSnapshot) => void): () => void
}

declare global {
  interface Window {
    symphony: SymphonyApi
  }
}
