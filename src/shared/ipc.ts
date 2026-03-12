import type { BootstrapPayload, NormalizedIssue, OrchestratorSnapshot, RuntimeLogEntry, TrackerDescriptor, ImplementationProgress } from './types'

export interface SymphonyApi {
  getBootstrap(): Promise<BootstrapPayload>
  refreshRuntime(): Promise<void>
  getIssue(identifier: string): Promise<NormalizedIssue | null>
  getLogs(): Promise<RuntimeLogEntry[]>
  listIntegrations(): Promise<TrackerDescriptor[]>
  getProgress(): Promise<ImplementationProgress>
  onSnapshot(listener: (snapshot: OrchestratorSnapshot) => void): () => void
}

declare global {
  interface Window {
    symphony: SymphonyApi
  }
}
