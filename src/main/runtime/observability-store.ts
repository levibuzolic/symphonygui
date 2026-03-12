import { EventEmitter } from 'node:events'
import type { OrchestratorSnapshot, RetryEntry, RunningEntry, RuntimeLogEntry, TrackerDescriptor } from '@shared/types'

export class ObservabilityStore extends EventEmitter {
  private snapshot: OrchestratorSnapshot = {
    generatedAt: new Date().toISOString(),
    workflowPath: null,
    pollIntervalMs: 30000,
    nextRefreshInMs: null,
    counts: { running: 0, retrying: 0, claimed: 0, completed: 0 },
    codexTotals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0 },
    rateLimits: null,
    tracker: null,
    running: [],
    retrying: [],
    logs: [],
    status: 'idle',
    errors: [],
  }

  getSnapshot() {
    return this.snapshot
  }

  update(partial: Partial<OrchestratorSnapshot>) {
    this.snapshot = {
      ...this.snapshot,
      ...partial,
      generatedAt: new Date().toISOString(),
    }
    this.snapshot.counts = {
      running: this.snapshot.running.length,
      retrying: this.snapshot.retrying.length,
      claimed: this.snapshot.running.length + this.snapshot.retrying.length,
      completed: this.snapshot.counts.completed,
    }
    this.emit('snapshot', this.snapshot)
  }

  setRunning(running: RunningEntry[]) {
    this.update({ running })
  }

  setRetrying(retrying: RetryEntry[]) {
    this.update({ retrying })
  }

  appendLog(log: RuntimeLogEntry) {
    this.update({ logs: [log, ...this.snapshot.logs].slice(0, 250) })
  }

  setTracker(tracker: TrackerDescriptor | null) {
    this.update({ tracker })
  }

  setErrors(errors: string[]) {
    this.update({ errors, status: errors.length ? 'error' : this.snapshot.running.length ? 'running' : 'idle' })
  }
}
