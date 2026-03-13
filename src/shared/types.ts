export type TrackerKind = 'linear' | 'notion' | 'trello' | string

export interface NormalizedBlocker {
  id: string | null
  identifier: string | null
  state: string | null
}

export interface NormalizedIssue {
  id: string
  identifier: string
  title: string
  description: string | null
  priority: number | null
  state: string
  branchName: string | null
  url: string | null
  labels: string[]
  blockedBy: NormalizedBlocker[]
  createdAt: string | null
  updatedAt: string | null
  metadata?: Record<string, unknown>
}

export interface WorkflowDefinition {
  config: Record<string, unknown>
  promptTemplate: string
  sourcePath: string
  loadedAt: string
}

export interface TrackerDescriptor {
  kind: TrackerKind
  label: string
  status: 'active' | 'available' | 'disabled'
  capabilities: string[]
  description: string
}

export interface TrackerToolSpec {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface TrackerConfig {
  kind: TrackerKind
  endpoint: string
  apiKey: string | null
  projectSlug: string | null
  activeStates: string[]
  terminalStates: string[]
}

export interface PollingConfig {
  intervalMs: number
}

export interface WorkspaceConfig {
  root: string
}

export interface HooksConfig {
  afterCreate: string | null
  beforeRun: string | null
  afterRun: string | null
  beforeRemove: string | null
  timeoutMs: number
}

export interface AgentConfig {
  maxConcurrentAgents: number
  maxTurns: number
  maxRetryBackoffMs: number
  maxConcurrentAgentsByState: Record<string, number>
  sshHosts: string[]
  maxConcurrentAgentsPerHost: number | null
}

export interface CodexConfig {
  command: string
  approvalPolicy: string | Record<string, unknown>
  threadSandbox: string
  turnSandboxPolicy: Record<string, unknown>
  turnTimeoutMs: number
  readTimeoutMs: number
  stallTimeoutMs: number
}

export interface ServerConfig {
  port: number | null
}

export interface ServiceConfig {
  tracker: TrackerConfig
  polling: PollingConfig
  workspace: WorkspaceConfig
  hooks: HooksConfig
  agent: AgentConfig
  codex: CodexConfig
  server: ServerConfig
}

export interface WorkspaceInfo {
  path: string
  workspaceKey: string
  createdNow: boolean
}

export interface RunAttempt {
  issueId: string
  issueIdentifier: string
  attempt: number | null
  workspacePath: string
  startedAt: string
  status: string
  error?: string
  workerHost?: string | null
}

export interface LiveSession {
  sessionId: string | null
  threadId: string | null
  turnId: string | null
  codexAppServerPid: string | null
  lastCodexEvent: string | null
  lastCodexTimestamp: string | null
  lastCodexMessage: string | null
  codexInputTokens: number
  codexOutputTokens: number
  codexTotalTokens: number
  lastReportedInputTokens: number
  lastReportedOutputTokens: number
  lastReportedTotalTokens: number
  turnCount: number
}

export interface RetryEntry {
  issueId: string
  identifier: string
  attempt: number
  dueAtMs: number
  error: string | null
}

export interface RateLimitSnapshot {
  primary?: string | null
  secondary?: string | null
  credits?: string | null
  [key: string]: unknown
}

export interface CodexUpdateEvent {
  event: string
  timestamp: string
  message?: string
  usage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
  }
  rateLimits?: RateLimitSnapshot
  threadId?: string
  turnId?: string
  sessionId?: string
  pid?: string | null
}

export interface RunningEntry {
  issue: NormalizedIssue
  attempt: number | null
  startedAt: string
  status: string
  session: LiveSession
  workerHost: string | null
  workspacePath: string
}

export interface RuntimeLogEntry {
  id: string
  level: 'info' | 'warn' | 'error'
  timestamp: string
  scope: string
  message: string
  metadata?: Record<string, unknown>
}

export interface IssueDetailPayload {
  issue: NormalizedIssue
  running: RunningEntry | null
  retry: RetryEntry | null
}

export interface OrchestratorSnapshot {
  generatedAt: string
  workflowPath: string | null
  pollIntervalMs: number
  nextRefreshInMs: number | null
  counts: {
    running: number
    retrying: number
    claimed: number
    completed: number
  }
  codexTotals: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    secondsRunning: number
  }
  rateLimits: RateLimitSnapshot | null
  tracker: TrackerDescriptor | null
  running: RunningEntry[]
  retrying: RetryEntry[]
  logs: RuntimeLogEntry[]
  status: 'idle' | 'running' | 'error'
  errors: string[]
}

export interface BootstrapPayload {
  snapshot: OrchestratorSnapshot
  trackers: TrackerDescriptor[]
  isDevelopment: boolean
}

export interface WorkflowDocument {
  path: string
  contents: string
  exists: boolean
}
