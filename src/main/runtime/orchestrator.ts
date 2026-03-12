import { Liquid } from 'liquidjs'
import type { IssueDetailPayload, NormalizedIssue, RunningEntry, ServiceConfig } from '@shared/types'
import { AgentRunner } from './agent-runner'
import { ConfigLayer } from './config-layer'
import { RuntimeLogger } from './logger'
import { ObservabilityStore } from './observability-store'
import { WorkflowLoader } from './workflow-loader'
import { WorkspaceManager } from './workspace-manager'
import type { TrackerRegistry } from '../tracker/registry'

export class Orchestrator {
  private static readonly CONTINUATION_DELAY_MS = 1000
  private static readonly FAILURE_RETRY_BASE_MS = 10000
  private configLayer = new ConfigLayer()
  private agentRunner = new AgentRunner()
  private workflowDefinition: ReturnType<WorkflowLoader['getCurrent']> = null
  private config: ServiceConfig | null = null
  private timer: NodeJS.Timeout | null = null
  private running = new Map<string, RunningEntry>()
  private retrying = new Map<string, { issue: NormalizedIssue; dueAtMs: number; attempt: number; error: string | null }>()

  constructor(
    private workflowLoader: WorkflowLoader,
    private registry: TrackerRegistry,
    private store: ObservabilityStore,
    private logger: RuntimeLogger,
  ) {
    this.workflowDefinition = this.workflowLoader.getCurrent() ?? null
    this.agentRunner.on('update', (event) => {
      this.logger.info('codex', event.event, { message: event.message })
      this.store.appendLog(this.logger.info('codex', event.event, { message: event.message }))
      for (const [issueId, entry] of this.running.entries()) {
        if (!entry.session.sessionId || event.sessionId === entry.session.sessionId || !event.sessionId) {
          entry.session.lastCodexEvent = event.event
          entry.session.lastCodexTimestamp = event.timestamp
          entry.session.lastCodexMessage = event.message ?? null
          entry.session.sessionId = event.sessionId ?? entry.session.sessionId
          entry.session.threadId = event.threadId ?? entry.session.threadId
          entry.session.turnId = event.turnId ?? entry.session.turnId
          entry.session.codexAppServerPid = event.pid ?? entry.session.codexAppServerPid
          entry.session.codexInputTokens = event.usage?.inputTokens ?? entry.session.codexInputTokens
          entry.session.codexOutputTokens = event.usage?.outputTokens ?? entry.session.codexOutputTokens
          entry.session.codexTotalTokens = event.usage?.totalTokens ?? entry.session.codexTotalTokens
          this.running.set(issueId, { ...entry })
        }
      }
      this.syncStore()
    })
  }

  async start() {
    this.workflowLoader.startWatching()
    this.workflowLoader.on('updated', () => void this.reload())
    this.workflowLoader.on('error', (error) => {
      this.logger.error('workflow', 'Workflow reload failed', { error: String(error) })
      this.store.setErrors([String(error)])
    })
    await this.reload()
    this.schedule()
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  async refreshNow() {
    await this.tick()
  }

  getIssue(identifier: string) {
    return [...this.running.values()].find((entry) => entry.issue.identifier === identifier)?.issue ?? null
  }

  async getIssueDetails(identifier: string): Promise<IssueDetailPayload | null> {
    const running = [...this.running.values()].find((entry) => entry.issue.identifier === identifier) ?? null
    const retry = [...this.retrying.values()].find((entry) => entry.issue.identifier === identifier) ?? null

    if (running || retry) {
      return {
        issue: running?.issue ?? retry!.issue,
        running,
        retry: retry
          ? {
              issueId: retry.issue.id,
              identifier: retry.issue.identifier,
              attempt: retry.attempt,
              dueAtMs: retry.dueAtMs,
              error: retry.error,
            }
          : null,
      }
    }

    if (!this.config) return null
    const adapter = this.registry.get(this.config.tracker.kind)
    const issue = await adapter?.fetchIssueByIdentifier?.(this.config, identifier)
    if (!issue) return null
    return { issue, running: null, retry: null }
  }

  private async reload() {
    try {
      this.workflowDefinition = this.workflowLoader.load()
      this.config = this.configLayer.parse(this.workflowDefinition)
      const adapter = this.registry.get(this.config.tracker.kind)
      this.store.setTracker(adapter?.descriptor(this.config) ?? null)
      this.store.update({
        workflowPath: this.workflowDefinition.sourcePath,
        pollIntervalMs: this.config.polling.intervalMs,
      })
      await this.cleanupTerminalWorkspaces()
      this.store.setErrors([])
      this.logger.info('workflow', 'Workflow loaded', { path: this.workflowDefinition.sourcePath })
      this.store.appendLog(this.logger.info('workflow', 'Workflow loaded', { path: this.workflowDefinition.sourcePath }))
    } catch (error) {
      const message = String(error)
      this.logger.error('workflow', 'Workflow load failed', { error: message })
      this.store.appendLog(this.logger.error('workflow', 'Workflow load failed', { error: message }))
      this.store.setErrors([message])
    }
  }

  private schedule(delay = 1000) {
    this.timer = setTimeout(() => {
      void this.tick().finally(() => this.schedule(this.config?.polling.intervalMs ?? 30000))
    }, delay)
  }

  private async tick() {
    if (!this.config || !this.workflowDefinition) return
    const adapter = this.registry.get(this.config.tracker.kind)
    if (!adapter) {
      this.store.setErrors([`unsupported_tracker:${this.config.tracker.kind}`])
      return
    }

    try {
      await this.runRetryQueue(adapter)
      await this.reconcileRunningIssues(adapter)
      const issues = await adapter.fetchCandidateIssues(this.config)
      this.logger.info('orchestrator', 'Fetched candidate issues', { count: issues.length })
      this.store.appendLog(this.logger.info('orchestrator', 'Fetched candidate issues', { count: issues.length }))
      const eligible = issues
        .filter((issue) => this.isIssueEligible(issue))
        .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999) || (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.identifier.localeCompare(b.identifier))

      for (const issue of eligible.slice(0, Math.max(this.config.agent.maxConcurrentAgents - this.running.size, 0))) {
        void this.dispatchIssue(issue, adapter)
      }

      this.syncStore()
    } catch (error) {
      const message = String(error)
      this.logger.error('orchestrator', 'Tick failed', { error: message })
      this.store.appendLog(this.logger.error('orchestrator', 'Tick failed', { error: message }))
      this.store.setErrors([message])
    }
  }

  private async dispatchIssue(issue: NormalizedIssue, adapter: NonNullable<ReturnType<TrackerRegistry['get']>>) {
    if (!this.config || !this.workflowDefinition) return
    const workspaceManager = new WorkspaceManager(this.config.workspace.root, this.config.hooks)
    const workspace = workspaceManager.ensureWorkspace(issue.identifier)
    const engine = new Liquid({ strictFilters: true, strictVariables: true })
    const prompt = await engine.parseAndRender(
      this.workflowDefinition.promptTemplate || 'You are working on a Linear issue.',
      { issue, attempt: null },
    )

    const entry: RunningEntry = {
      issue,
      attempt: null,
      startedAt: new Date().toISOString(),
      status: 'launching',
      workerHost: null,
      workspacePath: workspace.path,
      session: {
        sessionId: null,
        threadId: null,
        turnId: null,
        codexAppServerPid: null,
        lastCodexEvent: null,
        lastCodexTimestamp: null,
        lastCodexMessage: null,
        codexInputTokens: 0,
        codexOutputTokens: 0,
        codexTotalTokens: 0,
        lastReportedInputTokens: 0,
        lastReportedOutputTokens: 0,
        lastReportedTotalTokens: 0,
        turnCount: 1,
      },
    }
    this.running.set(issue.id, entry)
    this.syncStore()

    try {
      await workspaceManager.runHook(this.config.hooks.beforeRun, workspace.path)
      entry.status = 'running'
      this.syncStore()
      const result = await this.agentRunner.runIssue(issue, this.config, workspace.path, prompt, adapter)
      entry.status = result.code === 0 ? 'completed' : 'failed'
      this.running.delete(issue.id)
      await workspaceManager.runHook(this.config.hooks.afterRun, workspace.path)
      this.store.update({
        codexTotals: {
          inputTokens: this.store.getSnapshot().codexTotals.inputTokens + entry.session.codexInputTokens,
          outputTokens: this.store.getSnapshot().codexTotals.outputTokens + entry.session.codexOutputTokens,
          totalTokens: this.store.getSnapshot().codexTotals.totalTokens + entry.session.codexTotalTokens,
          secondsRunning: this.store.getSnapshot().codexTotals.secondsRunning + Math.round((Date.now() - new Date(entry.startedAt).getTime()) / 1000),
        },
      })
      if (result.code !== 0) {
        this.scheduleRetry(issue, 1, `exit_code:${result.code}`)
      } else {
        this.scheduleRetry(issue, 1, null, Orchestrator.CONTINUATION_DELAY_MS)
      }
      this.syncStore()
    } catch (error) {
      this.running.delete(issue.id)
      this.scheduleRetry(issue, 1, String(error))
      this.logger.error('orchestrator', 'Issue dispatch failed', { issue: issue.identifier, error: String(error) })
      this.store.appendLog(this.logger.error('orchestrator', 'Issue dispatch failed', { issue: issue.identifier, error: String(error) }))
      this.syncStore()
    }
  }

  private syncStore() {
    this.store.setRunning([...this.running.values()])
    this.store.setRetrying(
      [...this.retrying.values()]
        .sort((a, b) => a.dueAtMs - b.dueAtMs)
        .map((entry) => ({
        issueId: entry.issue.id,
        identifier: entry.issue.identifier,
        attempt: entry.attempt,
        dueAtMs: entry.dueAtMs,
        error: entry.error,
      })),
    )
    this.store.update({
      status: this.running.size ? 'running' : this.store.getSnapshot().errors.length ? 'error' : 'idle',
      nextRefreshInMs: this.config?.polling.intervalMs ?? null,
    })
  }

  private isIssueEligible(issue: NormalizedIssue) {
    if (!this.config) return false
    if (this.running.has(issue.id) || this.retrying.has(issue.id)) return false
    if (!this.config.tracker.activeStates.includes(issue.state)) return false
    if (this.config.tracker.terminalStates.includes(issue.state)) return false
    if (issue.state === 'Todo' && issue.blockedBy.some((blocker) => blocker.state && !this.config!.tracker.terminalStates.includes(blocker.state))) {
      return false
    }
    return true
  }

  private async reconcileRunningIssues(adapter: NonNullable<ReturnType<TrackerRegistry['get']>>) {
    if (!this.config || this.running.size === 0) return
    const stateMap = await adapter.fetchCurrentStates(this.config, [...this.running.keys()])
    for (const [issueId, entry] of this.running.entries()) {
      const currentState = stateMap.get(issueId)
      if (!currentState) continue
      entry.issue.state = currentState
      if (this.config.tracker.terminalStates.includes(currentState)) {
        this.running.delete(issueId)
        new WorkspaceManager(this.config.workspace.root, this.config.hooks).removeWorkspace(entry.issue.identifier)
        this.store.appendLog(this.logger.info('orchestrator', 'Released terminal issue', { issue: entry.issue.identifier, state: currentState }))
      }
    }
  }

  private async runRetryQueue(adapter: NonNullable<ReturnType<TrackerRegistry['get']>>) {
    if (!this.config || this.retrying.size === 0) return
    const dueEntries = [...this.retrying.values()].filter((entry) => entry.dueAtMs <= Date.now())
    if (dueEntries.length === 0) return

    const activeIssues = await adapter.fetchCandidateIssues(this.config)
    const activeById = new Map(activeIssues.map((issue) => [issue.id, issue]))

    for (const retry of dueEntries) {
      this.retrying.delete(retry.issue.id)
      const refreshed = activeById.get(retry.issue.id)
      if (!refreshed || !this.isIssueEligible(refreshed)) {
        continue
      }
      void this.dispatchIssue(refreshed, adapter)
    }
  }

  private scheduleRetry(issue: NormalizedIssue, attempt: number, error: string | null, customDelay?: number) {
    if (!this.config) return
    const delay = customDelay ?? Math.min(Orchestrator.FAILURE_RETRY_BASE_MS * 2 ** Math.max(attempt - 1, 0), this.config.agent.maxRetryBackoffMs)
    this.retrying.set(issue.id, {
      issue,
      attempt,
      error,
      dueAtMs: Date.now() + delay,
    })
  }

  private async cleanupTerminalWorkspaces() {
    if (!this.config) return
    const adapter = this.registry.get(this.config.tracker.kind)
    if (!adapter) return
    const terminalIssues = await adapter.fetchTerminalIssues(this.config)
    const manager = new WorkspaceManager(this.config.workspace.root, this.config.hooks)
    for (const issue of terminalIssues) {
      manager.removeWorkspace(issue.identifier)
    }
  }
}
