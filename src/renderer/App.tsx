import { useEffect, useState } from 'react'
import { Activity, Boxes, Cog, Database, GitBranch, Logs, RefreshCw, Search, Settings2 } from 'lucide-react'
import type { SymphonyApi } from '@shared/ipc'
import type { BootstrapPayload, OrchestratorSnapshot } from '@shared/types'
import { Button } from './components/ui/button'
import { Card } from './components/ui/card'
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

export function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null)
  const [snapshot, setSnapshot] = useState<OrchestratorSnapshot | null>(null)
  const [activeView, setActiveView] = useState<(typeof navItems)[number]['id']>('overview')
  const symphony = (globalThis as typeof globalThis & { symphony: SymphonyApi }).symphony

  useEffect(() => {
    void symphony.getBootstrap().then((payload: BootstrapPayload) => {
      setBootstrap(payload)
      setSnapshot(payload.snapshot)
    })
    return symphony.onSnapshot((next: OrchestratorSnapshot) => setSnapshot(next))
  }, [symphony])

  if (!bootstrap || !snapshot) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">Booting Symphony Desktop…</div>
  }

  const running = snapshot.running
  const retrying = snapshot.retrying
  const integrations = bootstrap.trackers

  return (
    <div className="grid min-h-screen grid-cols-[248px_1fr]">
      <aside className="border-r border-white/5 bg-black/80 px-4 py-5">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Symphony Desktop</div>
            <div className="text-xs text-zinc-500">Technical operations console</div>
          </div>
          <Badge>v0.1</Badge>
        </div>
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-400">
          <Search className="h-4 w-4" />
          Search issues, sessions, logs
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = activeView === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${active ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200'}`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            )
          })}
        </nav>
        <div className="mt-8 rounded-2xl border border-white/5 bg-white/[0.03] p-4">
          <div className="mb-1 text-xs uppercase tracking-[0.2em] text-zinc-500">Tracker</div>
          <div className="text-sm text-white">{snapshot.tracker?.label ?? 'Not configured'}</div>
          <div className="mt-2 text-xs text-zinc-500">{snapshot.workflowPath ?? 'WORKFLOW.md not loaded yet'}</div>
        </div>
      </aside>
      <main className="px-8 py-6">
        <header className="mb-6 flex items-center justify-between gap-4 border-b border-white/5 pb-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">Overview</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Symphony status</h1>
          </div>
          <div className="flex items-center gap-3">
            <Input value={snapshot.workflowPath ?? ''} readOnly className="w-[360px] text-zinc-400" />
            <Button onClick={() => void symphony.refreshRuntime()} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh now
            </Button>
          </div>
        </header>

        <section className="mb-6 grid grid-cols-4 gap-4">
          <MetricCard label="Agents" value={`${snapshot.counts.running}/${snapshot.counts.claimed || snapshot.counts.running || 0}`} hint="Running / claimed" />
          <MetricCard label="Throughput" value={`${formatInt(snapshot.codexTotals.totalTokens)} tps`} hint="Token surface" />
          <MetricCard label="Runtime" value={`${snapshot.codexTotals.secondsRunning}s`} hint="Aggregate session runtime" />
          <MetricCard label="Retry Queue" value={String(snapshot.counts.retrying)} hint={`Next refresh ${formatDurationMs(snapshot.nextRefreshInMs)}`} />
        </section>

        <section className="grid grid-cols-[1.6fr_1fr] gap-4">
          <div className="space-y-4">
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
                <div>
                  <div className="text-sm font-medium text-white">Running sessions</div>
                  <div className="text-xs text-zinc-500">Live worker status, tokens, and latest events.</div>
                </div>
                <Badge>{running.length} active</Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b border-white/5 text-xs uppercase tracking-[0.16em] text-zinc-500">
                    <tr>
                      <th className="px-5 py-3">Issue</th>
                      <th className="px-5 py-3">State</th>
                      <th className="px-5 py-3">Age / turns</th>
                      <th className="px-5 py-3">Tokens</th>
                      <th className="px-5 py-3">Last event</th>
                    </tr>
                  </thead>
                  <tbody>
                    {running.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-8 text-center text-zinc-500">
                          No active sessions. Configure `WORKFLOW.md` and a tracker token to start the runtime.
                        </td>
                      </tr>
                    ) : (
                      running.map((entry) => (
                        <tr key={entry.issue.id} className="border-b border-white/5 last:border-b-0">
                          <td className="px-5 py-4">
                            <div className="font-medium text-white">{entry.issue.identifier}</div>
                            <div className="text-xs text-zinc-500">{entry.issue.title}</div>
                          </td>
                          <td className="px-5 py-4"><Badge>{entry.issue.state}</Badge></td>
                          <td className="px-5 py-4 text-zinc-400">
                            <div>{formatRelativeTime(entry.startedAt)}</div>
                            <div className="mono text-xs text-zinc-600">{entry.session.turnCount} turns</div>
                          </td>
                          <td className="px-5 py-4 text-zinc-400">
                            <div>{formatInt(entry.session.codexTotalTokens)}</div>
                            <div className="mono text-xs text-zinc-600">
                              in {formatInt(entry.session.codexInputTokens)} / out {formatInt(entry.session.codexOutputTokens)}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-zinc-400">{entry.session.lastCodexMessage ?? 'Waiting for first event'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-white">Retry queue</div>
                  <div className="text-xs text-zinc-500">Issues currently backing off after failure or continuation.</div>
                </div>
                <Badge>{retrying.length}</Badge>
              </div>
              <div className="space-y-3">
                {retrying.length === 0 ? (
                  <div className="text-sm text-zinc-500">No queued retries.</div>
                ) : (
                  retrying.map((entry) => (
                    <div key={entry.issueId} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
                      <div>
                        <div className="font-medium text-white">{entry.identifier}</div>
                        <div className="text-xs text-zinc-500">{entry.error ?? 'Pending continuation retry'}</div>
                      </div>
                      <div className="mono text-xs text-zinc-500">attempt {entry.attempt}</div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-white">Runtime details</div>
                  <div className="text-xs text-zinc-500">Current limits and tracker health.</div>
                </div>
                <Badge>{snapshot.status}</Badge>
              </div>
              <div className="space-y-3 text-sm text-zinc-400">
                <Detail label="Workflow" value={snapshot.workflowPath ?? 'Unavailable'} mono />
                <Detail label="Rate limits" value={JSON.stringify(snapshot.rateLimits ?? { primary: 'n/a', secondary: 'n/a' })} mono />
                <Detail label="Errors" value={snapshot.errors[0] ?? 'No active errors'} />
              </div>
            </Card>

            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-white">Integrations</div>
                  <div className="text-xs text-zinc-500">Tracker adapters available to this runtime.</div>
                </div>
                <GitBranch className="h-4 w-4 text-zinc-500" />
              </div>
              <div className="space-y-3">
                {integrations.map((integration) => (
                  <div key={integration.kind} className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="font-medium text-white">{integration.label}</div>
                      <Badge>{integration.status}</Badge>
                    </div>
                    <div className="text-xs text-zinc-500">{integration.description}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {integration.capabilities.map((capability) => (
                        <Badge key={capability} className="text-[10px] normal-case tracking-normal">{capability}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-white">Recent logs</div>
                  <div className="text-xs text-zinc-500">Structured runtime messages from the orchestrator and agent runner.</div>
                </div>
                <Settings2 className="h-4 w-4 text-zinc-500" />
              </div>
              <div className="space-y-3">
                {snapshot.logs.slice(0, 6).map((log) => (
                  <div key={log.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <Badge>{log.level}</Badge>
                      <div className="mono text-[11px] text-zinc-600">{formatRelativeTime(log.timestamp)}</div>
                    </div>
                    <div className="text-sm text-white">{log.message}</div>
                    <div className="text-xs text-zinc-500">{log.scope}</div>
                  </div>
                ))}
              </div>
            </Card>

            {bootstrap.isDevelopment ? <ProgressPanel progress={bootstrap.progress} /> : null}
          </div>
        </section>
      </main>
    </div>
  )
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="p-5">
      <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">{label}</div>
      <div className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</div>
      <div className="mt-1 text-sm text-zinc-500">{hint}</div>
    </Card>
  )
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="text-zinc-500">{label}</div>
      <div className={`max-w-[65%] text-right ${mono ? 'mono text-xs' : ''}`}>{value}</div>
    </div>
  )
}
