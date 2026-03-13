export type TrackerKind = "linear" | "notion" | "trello" | string;

export interface NormalizedBlocker {
  id: string | null;
  identifier: string | null;
  state: string | null;
}

export interface NormalizedIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number | null;
  state: string;
  branchName: string | null;
  url: string | null;
  labels: string[];
  blockedBy: NormalizedBlocker[];
  createdAt: string | null;
  updatedAt: string | null;
  metadata?: Record<string, unknown>;
}

export interface WorkflowDefinition {
  config: Record<string, unknown>;
  promptTemplate: string;
  sourcePath: string;
  loadedAt: string;
}

export interface TrackerDescriptor {
  kind: TrackerKind;
  label: string;
  status: "active" | "available" | "disabled";
  capabilities: string[];
  description: string;
}

export interface LocalKanbanSettings {
  enabled: boolean;
  initialized: boolean;
  databasePath: string | null;
  lastOpenedBoardId: string | null;
}

export interface AppSettings {
  onboardingCompleted: boolean;
  activeTrackerKind: TrackerKind | null;
  localKanban: LocalKanbanSettings;
}

export interface KanbanBoard {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface KanbanColumn {
  id: string;
  boardId: string;
  name: string;
  position: number;
  isActive: boolean;
  isTerminal: boolean;
}

export interface KanbanTask {
  id: string;
  boardId: string;
  columnId: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number | null;
  branchName: string | null;
  url: string | null;
  position: number;
  labels: string[];
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface KanbanBoardPayload {
  board: KanbanBoard;
  columns: KanbanColumn[];
  tasks: KanbanTask[];
}

export interface CreateKanbanTaskInput {
  boardId: string;
  columnId: string;
  title: string;
  description?: string | null;
  priority?: number | null;
  labels?: string[];
}

export interface UpdateKanbanTaskInput {
  id: string;
  title: string;
  description?: string | null;
  priority?: number | null;
  columnId?: string;
  labels?: string[];
}

export interface MoveKanbanTaskInput {
  taskId: string;
  targetColumnId: string;
  targetPosition: number;
}

export interface UpdateKanbanBoardInput {
  boardId: string;
  name: string;
}

export interface CreateKanbanColumnInput {
  boardId: string;
  name: string;
  isActive?: boolean;
  isTerminal?: boolean;
}

export interface UpdateKanbanColumnInput {
  id: string;
  name: string;
  isActive?: boolean;
  isTerminal?: boolean;
}

export interface TrackerToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface TrackerConfig {
  kind: TrackerKind;
  endpoint: string;
  apiKey: string | null;
  projectSlug: string | null;
  activeStates: string[];
  terminalStates: string[];
}

export interface PollingConfig {
  intervalMs: number;
}

export interface WorkspaceConfig {
  root: string;
}

export interface HooksConfig {
  afterCreate: string | null;
  beforeRun: string | null;
  afterRun: string | null;
  beforeRemove: string | null;
  timeoutMs: number;
}

export interface AgentConfig {
  maxConcurrentAgents: number;
  maxTurns: number;
  maxRetryBackoffMs: number;
  maxConcurrentAgentsByState: Record<string, number>;
  sshHosts: string[];
  maxConcurrentAgentsPerHost: number | null;
}

export interface CodexConfig {
  command: string;
  approvalPolicy: string | Record<string, unknown>;
  threadSandbox: string;
  turnSandboxPolicy: Record<string, unknown>;
  turnTimeoutMs: number;
  readTimeoutMs: number;
  stallTimeoutMs: number;
}

export interface ServerConfig {
  port: number | null;
}

export interface ServiceConfig {
  tracker: TrackerConfig;
  polling: PollingConfig;
  workspace: WorkspaceConfig;
  hooks: HooksConfig;
  agent: AgentConfig;
  codex: CodexConfig;
  server: ServerConfig;
}

export interface WorkspaceInfo {
  path: string;
  workspaceKey: string;
  createdNow: boolean;
}

export interface RunAttempt {
  issueId: string;
  issueIdentifier: string;
  attempt: number | null;
  workspacePath: string;
  startedAt: string;
  status: string;
  error?: string;
  workerHost?: string | null;
}

export interface LiveSession {
  sessionId: string | null;
  threadId: string | null;
  turnId: string | null;
  codexAppServerPid: string | null;
  lastCodexEvent: string | null;
  lastCodexTimestamp: string | null;
  lastCodexMessage: string | null;
  codexInputTokens: number;
  codexOutputTokens: number;
  codexTotalTokens: number;
  lastReportedInputTokens: number;
  lastReportedOutputTokens: number;
  lastReportedTotalTokens: number;
  turnCount: number;
}

export interface RetryEntry {
  issueId: string;
  identifier: string;
  attempt: number;
  dueAtMs: number;
  error: string | null;
}

export interface RateLimitSnapshot {
  primary?: string | null;
  secondary?: string | null;
  credits?: string | null;
  [key: string]: unknown;
}

export interface CodexUpdateEvent {
  event: string;
  timestamp: string;
  message?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  rateLimits?: RateLimitSnapshot;
  threadId?: string;
  turnId?: string;
  sessionId?: string;
  pid?: string | null;
}

export interface RunningEntry {
  issue: NormalizedIssue;
  attempt: number | null;
  startedAt: string;
  status: string;
  session: LiveSession;
  workerHost: string | null;
  workspacePath: string;
}

export interface RuntimeLogEntry {
  id: string;
  level: "info" | "warn" | "error";
  timestamp: string;
  scope: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface IssueDetailPayload {
  issue: NormalizedIssue;
  running: RunningEntry | null;
  retry: RetryEntry | null;
}

export interface OrchestratorSnapshot {
  generatedAt: string;
  workflowPath: string | null;
  pollIntervalMs: number;
  nextRefreshInMs: number | null;
  counts: {
    running: number;
    retrying: number;
    claimed: number;
    completed: number;
  };
  codexTotals: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    secondsRunning: number;
  };
  rateLimits: RateLimitSnapshot | null;
  tracker: TrackerDescriptor | null;
  running: RunningEntry[];
  retrying: RetryEntry[];
  logs: RuntimeLogEntry[];
  status: "idle" | "running" | "error";
  errors: string[];
}

export interface BootstrapPayload {
  snapshot: OrchestratorSnapshot;
  trackers: TrackerDescriptor[];
  settings: AppSettings;
  kanbanBoards: KanbanBoard[];
  isDevelopment: boolean;
}

export interface WorkflowDocument {
  path: string;
  contents: string;
  exists: boolean;
}
