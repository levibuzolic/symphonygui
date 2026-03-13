import type { ChangeEvent } from 'react'
import { useEffect, useState } from 'react'
import {
  Activity,
  Boxes,
  ChevronRight,
  Cog,
  Copy,
  Database,
  Logs,
  RefreshCw,
  Search,
} from 'lucide-react'
import type { SymphonyApi } from '@shared/ipc'
import type { BootstrapPayload, OrchestratorSnapshot, RetryEntry, RunningEntry, RuntimeLogEntry, TrackerDescriptor } from '@shared/types'
import { Button } from './components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card'
import { Badge } from './components/ui/badge'
import { Input } from './components/ui/input'
import { formatDurationMs, formatInt, formatRelativeTime } from './lib/format'
import { ProgressPanel } from './components/dashboard/progress-panel'

const navItems = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'running', label: 'Running', icon: Boxes },
  { id: 'logs', label: 'Logs', icon: Logs },
  { id: 'integrations', label: 'Integrations', icon: Database },
  { id: 'settings', label: 'Settings', icon: Cog },
] as const

type ViewId = (typeof navItems)[number]['id']

export function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null)
  const [snapshot, setSnapshot] = useState<OrchestratorSnapshot | null>(null)
  const [activeView, setActiveView] = useState<ViewId>('overview')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const symphony = (globalThis as typeof globalThis & { symphony: SymphonyApi }).symphony

  useEffect(() => {
    void symphony.getBootstrap().then((payload: BootstrapPayload) => {
      setBootstrap(payload)
      setSnapshot(payload.snapshot)
    })
    return symphony.onSnapshot((next: OrchestratorSnapshot) => setSnapshot(next))
  }, [symphony])

  useEffect(() => {
    if (!snapshot) return
    const firstRunning = snapshot.running[0]?.issue.identifier
    const firstRetry = snapshot.retrying[0]?.identifier
    setSelectedKey((current) => current ?? firstRunning ?? firstRetry ?? null)
  }, [snapshot])

  if (!bootstrap || !snapshot) {
    return <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">Booting Symphony Desktop…</div>
  }

  const filtered = createFilteredState(snapshot, bootstrap.trackers, searchQuery)
  const selectedRunning = filtered.running.find((entry) => entry.issue.identifier === selectedKey) ?? null
  const selectedRetry = filtered.retrying.find((entry) => entry.identifier === selectedKey) ?? null
  const selectedLog = filtered.logs.find((entry) => entry.id === selectedKey) ?? null
  const selectedIntegration = filtered.integrations.find((entry) => entry.kind === selectedKey) ?? null

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground">
      <div className="grid h-full grid-cols-[248px_minmax(0,1fr)]">
        <aside className="flex h-full flex-col border-r border-white/5 bg-black/80 px-4 py-5">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">Symphony Desktop</div>
              <div className="text-xs text-zinc-500">Technical operations console</div>
            </div>
            <Badge className="shrink-0">v0.1</Badge>
          </div>

          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <Input
                  value={searchQuery}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchQuery(String((event.target as { value?: unknown }).value ?? ''))}
                  placeholder="Search issues, sessions, logs"
                  className="pl-9"
                />
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const active = activeView === item.id
              return (
                <Button
                  key={item.id}
                  type="button"
                  variant={active ? 'secondary' : 'ghost'}
                  className="w-full justify-start gap-3"
                  onClick={() => setActiveView(item.id)}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Button>
              )
            })}
          </nav>

          <Card className="mt-6">
            <CardHeader className="pb-3">
              <CardDescription className="text-[11px] uppercase tracking-[0.2em]">Tracker</CardDescription>
              <CardTitle className="text-base">{snapshot.tracker?.label ?? 'Not configured'}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="truncate text-xs text-muted-foreground">{snapshot.workflowPath ?? 'WORKFLOW.md not loaded yet'}</p>
            </CardContent>
          </Card>

          <div className="mt-auto pt-6">
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
              <div className="mb-1 text-[11px] uppercase tracking-[0.22em] text-zinc-500">Status</div>
              <div className="flex items-center justify-between">
                <div className="text-sm text-white">{snapshot.status}</div>
                <div className="mono text-xs text-zinc-500">{formatDurationMs(snapshot.nextRefreshInMs)}</div>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex h-full min-h-0 flex-col overflow-hidden">
          <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/5 px-8 py-6">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">{activeView}</div>
              <h1 className="mt-2 truncate text-3xl font-semibold tracking-tight text-white">{viewTitle(activeView)}</h1>
            </div>
            <div className="flex min-w-0 items-center gap-3">
              <div className="hidden min-w-[360px] flex-1 md:block">
                <Input value={snapshot.workflowPath ?? ''} readOnly className="truncate text-zinc-400" />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => {
                  const clipboard = (globalThis.navigator as Navigator & { clipboard?: { writeText(text: string): Promise<void> } } | undefined)?.clipboard
                  if (snapshot.workflowPath && clipboard) {
                    void clipboard.writeText(snapshot.workflowPath)
                  }
                }}
                aria-label="Copy workflow path"
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button type="button" onClick={() => void symphony.refreshRuntime()} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Refresh now
              </Button>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.7fr)_420px] gap-4 overflow-hidden px-8 py-6">
            <section className="min-h-0 overflow-auto pr-1">
              {activeView === 'overview' ? (
                <OverviewView snapshot={snapshot} filtered={filtered} onSelect={setSelectedKey} selectedKey={selectedKey} />
              ) : null}
              {activeView === 'running' ? (
                <RunningView running={filtered.running} onSelect={setSelectedKey} selectedKey={selectedKey} />
              ) : null}
              {activeView === 'logs' ? <LogsView logs={filtered.logs} onSelect={setSelectedKey} selectedKey={selectedKey} /> : null}
              {activeView === 'integrations' ? (
                <IntegrationsView integrations={filtered.integrations} onSelect={setSelectedKey} selectedKey={selectedKey} />
              ) : null}
              {activeView === 'settings' ? <SettingsView snapshot={snapshot} bootstrap={bootstrap} /> : null}
            </section>

            <aside className="min-h-0 overflow-auto pl-1">
              <InspectorPanel
                activeView={activeView}
                selectedRunning={selectedRunning}
                selectedRetry={selectedRetry}
                selectedLog={selectedLog}
                selectedIntegration={selectedIntegration}
                snapshot={snapshot}
                progress={bootstrap.progress}
                showProgress={bootstrap.isDevelopment}
              />
            </aside>
          </div>
        </main>
      </div>
    </div>
  )
}

function OverviewView({
  snapshot,
  filtered,
  onSelect,
  selectedKey,
}: {
  snapshot: OrchestratorSnapshot
  filtered: FilteredState
  onSelect: (key: string) => void
  selectedKey: string | null
}) {
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <MetricCard label="Agents" value={`${snapshot.counts.running}/${snapshot.counts.claimed || snapshot.counts.running || 0}`} hint="Running / claimed" />
        <MetricCard label="Throughput" value={`${formatInt(snapshot.codexTotals.totalTokens)} tps`} hint="Token surface" />
        <MetricCard label="Runtime" value={`${snapshot.codexTotals.secondsRunning}s`} hint="Aggregate session runtime" />
        <MetricCard label="Retry Queue" value={String(snapshot.counts.retrying)} hint={`Next refresh ${formatDurationMs(snapshot.nextRefreshInMs)}`} />
      </section>

      <RunningCard running={filtered.running} onSelect={onSelect} selectedKey={selectedKey} />
      <RetryCard retrying={filtered.retrying} onSelect={onSelect} selectedKey={selectedKey} />
    </div>
  )
}

function RunningView({
  running,
  onSelect,
  selectedKey,
}: {
  running: RunningEntry[]
  onSelect: (key: string) => void
  selectedKey: string | null
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Running sessions</CardTitle>
            <CardDescription>All active workers, session identifiers, and live activity.</CardDescription>
          </div>
          <Badge>{running.length} active</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {running.length === 0 ? (
          <EmptyState title="No active sessions" description="No workers are currently running. Dispatch begins when candidate issues are available." />
        ) : (
          running.map((entry) => (
            <SelectionRow
              key={entry.issue.id}
              title={entry.issue.identifier}
              subtitle={entry.issue.title}
              meta={`${entry.issue.state} • ${formatInt(entry.session.codexTotalTokens)} tokens`}
              selected={selectedKey === entry.issue.identifier}
              onClick={() => onSelect(entry.issue.identifier)}
            />
          ))
        )}
      </CardContent>
    </Card>
  )
}

function LogsView({
  logs,
  onSelect,
  selectedKey,
}: {
  logs: RuntimeLogEntry[]
  onSelect: (key: string) => void
  selectedKey: string | null
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Recent logs</CardTitle>
            <CardDescription>Structured runtime events from orchestration, tracker, and app-server transport.</CardDescription>
          </div>
          <Badge>{logs.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {logs.length === 0 ? (
          <EmptyState title="No log entries" description="Logs will appear here as the runtime state changes." />
        ) : (
          logs.map((log) => (
            <SelectionRow
              key={log.id}
              title={log.message}
              subtitle={log.scope}
              meta={`${log.level} • ${formatRelativeTime(log.timestamp)}`}
              selected={selectedKey === log.id}
              onClick={() => onSelect(log.id)}
            />
          ))
        )}
      </CardContent>
    </Card>
  )
}

function IntegrationsView({
  integrations,
  onSelect,
  selectedKey,
}: {
  integrations: TrackerDescriptor[]
  onSelect: (key: string) => void
  selectedKey: string | null
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Integrations</CardTitle>
            <CardDescription>Registered tracker adapters and their declared capabilities.</CardDescription>
          </div>
          <Badge>{integrations.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {integrations.map((integration) => (
          <SelectionRow
            key={integration.kind}
            title={integration.label}
            subtitle={integration.description}
            meta={integration.status}
            selected={selectedKey === integration.kind}
            onClick={() => onSelect(integration.kind)}
          />
        ))}
      </CardContent>
    </Card>
  )
}

function SettingsView({ snapshot, bootstrap }: { snapshot: OrchestratorSnapshot; bootstrap: BootstrapPayload }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Runtime settings</CardTitle>
          <CardDescription>Current workflow attachment and desktop runtime state.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Detail label="Workflow path" value={snapshot.workflowPath ?? 'Unavailable'} mono />
          <Detail label="Poll interval" value={formatDurationMs(snapshot.pollIntervalMs)} />
          <Detail label="Runtime status" value={snapshot.status} />
          <Detail label="Development mode" value={bootstrap.isDevelopment ? 'Enabled' : 'Disabled'} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Operator notes</CardTitle>
          <CardDescription>Current implementation assumptions surfaced in-app.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>The desktop shell keeps the application pinned to a fixed viewport with internal pane scrolling only.</p>
          <p>Future tracker integrations should be added through the adapter registry instead of branching renderer state by provider.</p>
        </CardContent>
      </Card>
    </div>
  )
}

function RunningCard({
  running,
  onSelect,
  selectedKey,
}: {
  running: RunningEntry[]
  onSelect: (key: string) => void
  selectedKey: string | null
}) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Running sessions</CardTitle>
            <CardDescription>Live worker status, tokens, and latest events.</CardDescription>
          </div>
          <Badge>{running.length} active</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-hidden rounded-xl border border-white/5">
          <div className="grid grid-cols-[120px_120px_160px_140px_minmax(0,1fr)] gap-4 border-b border-white/5 px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            <div>Issue</div>
            <div>State</div>
            <div>Age / turns</div>
            <div>Tokens</div>
            <div>Last event</div>
          </div>
          {running.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">No active sessions. Configure `WORKFLOW.md` and a tracker token to start the runtime.</div>
          ) : (
            <div className="divide-y divide-white/5">
              {running.map((entry) => (
                <button
                  key={entry.issue.id}
                  type="button"
                  onClick={() => onSelect(entry.issue.identifier)}
                  className={`grid w-full grid-cols-[120px_120px_160px_140px_minmax(0,1fr)] gap-4 px-5 py-4 text-left transition ${selectedKey === entry.issue.identifier ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'}`}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-white">{entry.issue.identifier}</div>
                    <div className="truncate text-xs text-muted-foreground">{entry.issue.title}</div>
                  </div>
                  <div><Badge>{entry.issue.state}</Badge></div>
                  <div className="text-sm text-zinc-300">
                    <div>{formatRelativeTime(entry.startedAt)}</div>
                    <div className="mono text-xs text-zinc-500">{entry.session.turnCount} turns</div>
                  </div>
                  <div className="text-sm text-zinc-300">
                    <div>{formatInt(entry.session.codexTotalTokens)}</div>
                    <div className="mono text-xs text-zinc-500">in {formatInt(entry.session.codexInputTokens)} / out {formatInt(entry.session.codexOutputTokens)}</div>
                  </div>
                  <div className="truncate text-sm text-zinc-400">{entry.session.lastCodexMessage ?? 'Waiting for first event'}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function RetryCard({
  retrying,
  onSelect,
  selectedKey,
}: {
  retrying: RetryEntry[]
  onSelect: (key: string) => void
  selectedKey: string | null
}) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Retry queue</CardTitle>
            <CardDescription>Issues currently backing off after failure or continuation.</CardDescription>
          </div>
          <Badge>{retrying.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {retrying.length === 0 ? (
          <EmptyState title="No queued retries" description="The orchestrator currently has no retry backlog." />
        ) : (
          retrying.map((entry) => (
            <SelectionRow
              key={entry.issueId}
              title={entry.identifier}
              subtitle={entry.error ?? 'Pending continuation retry'}
              meta={`attempt ${entry.attempt}`}
              selected={selectedKey === entry.identifier}
              onClick={() => onSelect(entry.identifier)}
            />
          ))
        )}
      </CardContent>
    </Card>
  )
}

function InspectorPanel({
  activeView,
  selectedRunning,
  selectedRetry,
  selectedLog,
  selectedIntegration,
  snapshot,
  progress,
  showProgress,
}: {
  activeView: ViewId
  selectedRunning: RunningEntry | null
  selectedRetry: RetryEntry | null
  selectedLog: RuntimeLogEntry | null
  selectedIntegration: TrackerDescriptor | null
  snapshot: OrchestratorSnapshot
  progress: BootstrapPayload['progress']
  showProgress: boolean
}) {
  return (
    <div className="space-y-4">
      {activeView === 'overview' || activeView === 'running' ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>{selectedRunning ? selectedRunning.issue.identifier : 'Runtime details'}</CardTitle>
                <CardDescription>
                  {selectedRunning ? selectedRunning.issue.title : 'Current limits and tracker health.'}
                </CardDescription>
              </div>
              <Badge>{selectedRunning?.issue.state ?? snapshot.status}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedRunning ? (
              <>
                <Detail label="Workspace" value={selectedRunning.workspacePath} mono />
                <Detail label="Session" value={selectedRunning.session.sessionId ?? 'Pending'} mono />
                <Detail label="Latest event" value={selectedRunning.session.lastCodexMessage ?? 'No event yet'} />
                <Detail label="Started" value={formatRelativeTime(selectedRunning.startedAt)} />
              </>
            ) : (
              <>
                <Detail label="Workflow" value={snapshot.workflowPath ?? 'Unavailable'} mono />
                <Detail label="Rate limits" value={JSON.stringify(snapshot.rateLimits ?? { primary: 'n/a', secondary: 'n/a' })} mono />
                <Detail label="Errors" value={snapshot.errors[0] ?? 'No active errors'} />
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {activeView === 'overview' || activeView === 'running' ? (
        <Card>
          <CardHeader>
            <CardTitle>{selectedRetry ? selectedRetry.identifier : 'Retry detail'}</CardTitle>
            <CardDescription>{selectedRetry ? 'Selected retry entry' : 'Select a retry entry to inspect timing and error context.'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedRetry ? (
              <>
                <Detail label="Attempt" value={String(selectedRetry.attempt)} />
                <Detail label="Due" value={formatDurationMs(Math.max(selectedRetry.dueAtMs - Date.now(), 0))} />
                <Detail label="Error" value={selectedRetry.error ?? 'Pending continuation retry'} />
              </>
            ) : (
              <EmptyState title="Nothing selected" description="Choose a retry entry from the queue to inspect it here." compact />
            )}
          </CardContent>
        </Card>
      ) : null}

      {activeView === 'integrations' ? (
        <Card>
          <CardHeader>
            <CardTitle>{selectedIntegration?.label ?? 'Integration detail'}</CardTitle>
            <CardDescription>
              {selectedIntegration?.description ?? 'Select an adapter to inspect its contract and availability.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedIntegration ? (
              <>
                <Detail label="Kind" value={selectedIntegration.kind} />
                <Detail label="Status" value={selectedIntegration.status} />
                <div className="space-y-2">
                  <div className="text-sm text-zinc-400">Capabilities</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedIntegration.capabilities.map((capability) => (
                      <Badge key={capability} className="text-[10px] normal-case tracking-normal">{capability}</Badge>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <EmptyState title="No integration selected" description="Choose an adapter from the list to inspect its supported capabilities." compact />
            )}
          </CardContent>
        </Card>
      ) : null}

      {activeView === 'logs' ? (
        <Card>
          <CardHeader>
            <CardTitle>{selectedLog ? 'Log detail' : 'Recent logs'}</CardTitle>
            <CardDescription>{selectedLog ? selectedLog.scope : 'Select a log entry to inspect its scope and timing.'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedLog ? (
              <>
                <Detail label="Level" value={selectedLog.level} />
                <Detail label="Scope" value={selectedLog.scope} />
                <Detail label="Time" value={formatRelativeTime(selectedLog.timestamp)} />
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-sm text-zinc-300">{selectedLog.message}</div>
              </>
            ) : (
              snapshot.logs.slice(0, 8).map((log) => (
                <div key={log.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <Badge>{log.level}</Badge>
                    <div className="mono text-[11px] text-zinc-600">{formatRelativeTime(log.timestamp)}</div>
                  </div>
                  <div className="truncate text-sm text-white">{log.message}</div>
                  <div className="text-xs text-zinc-500">{log.scope}</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}

      {showProgress ? <ProgressPanel progress={progress} /> : null}
    </div>
  )
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardDescription className="text-[11px] uppercase tracking-[0.18em]">{label}</CardDescription>
        <CardTitle className="text-4xl font-semibold tracking-tight">{value}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 text-sm text-muted-foreground">{hint}</CardContent>
    </Card>
  )
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="shrink-0 text-sm text-zinc-500">{label}</div>
      <div className={`max-w-[65%] text-right text-sm text-zinc-300 ${mono ? 'mono break-all text-xs' : 'break-words'}`}>{value}</div>
    </div>
  )
}

function EmptyState({ title, description, compact = false }: { title: string; description: string; compact?: boolean }) {
  return (
    <div className={`rounded-xl border border-dashed border-white/10 bg-white/[0.02] text-center ${compact ? 'px-4 py-8' : 'px-6 py-12'}`}>
      <div className="text-sm font-medium text-white">{title}</div>
      <div className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{description}</div>
    </div>
  )
}

function SelectionRow({
  title,
  subtitle,
  meta,
  selected,
  onClick,
}: {
  title: string
  subtitle: string
  meta: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-xl border px-4 py-4 text-left transition ${selected ? 'border-white/15 bg-white/[0.05]' : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]'}`}
    >
      <div className="min-w-0">
        <div className="truncate text-base font-medium text-white">{title}</div>
        <div className="truncate text-sm text-muted-foreground">{subtitle}</div>
      </div>
      <div className="ml-4 flex items-center gap-3">
        <div className="mono text-xs text-zinc-500">{meta}</div>
        <ChevronRight className="h-4 w-4 text-zinc-600" />
      </div>
    </button>
  )
}

function createFilteredState(snapshot: OrchestratorSnapshot, integrations: TrackerDescriptor[], searchQuery: string) {
  const query = searchQuery.trim().toLowerCase()
  if (!query) {
    return {
      running: snapshot.running,
      retrying: snapshot.retrying,
      logs: snapshot.logs,
      integrations,
    }
  }

  return {
    running: snapshot.running.filter((entry) =>
      [entry.issue.identifier, entry.issue.title, entry.issue.state, entry.session.lastCodexMessage ?? ''].some((value) =>
        value.toLowerCase().includes(query),
      ),
    ),
    retrying: snapshot.retrying.filter((entry) =>
      [entry.identifier, entry.error ?? ''].some((value) => value.toLowerCase().includes(query)),
    ),
    logs: snapshot.logs.filter((entry) =>
      [entry.message, entry.scope, entry.level].some((value) => value.toLowerCase().includes(query)),
    ),
    integrations: integrations.filter((entry) =>
      [entry.label, entry.description, ...entry.capabilities].some((value) => value.toLowerCase().includes(query)),
    ),
  }
}

function viewTitle(activeView: ViewId) {
  switch (activeView) {
    case 'overview':
      return 'Symphony status'
    case 'running':
      return 'Running sessions'
    case 'logs':
      return 'Runtime logs'
    case 'integrations':
      return 'Tracker integrations'
    case 'settings':
      return 'Application settings'
  }
}

type FilteredState = ReturnType<typeof createFilteredState>
