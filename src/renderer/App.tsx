import type { ChangeEvent } from "react";
import { useEffect, useState } from "react";
import {
  Activity,
  Boxes,
  ChevronRight,
  Columns3,
  Cog,
  Copy,
  Database,
  Logs,
  RefreshCw,
  Search,
} from "lucide-react";
import type { SymphonyApi } from "@shared/ipc";
import type {
  AppSettings,
  BootstrapPayload,
  OrchestratorSnapshot,
  RetryEntry,
  RunningEntry,
  RuntimeLogEntry,
  TrackerDescriptor,
  WorkflowDocument,
} from "@shared/types";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Badge } from "./components/ui/badge";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { formatDurationMs, formatInt, formatRelativeTime } from "./lib/format";
import { KanbanWindow } from "./components/kanban/kanban-window";

const navItems = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "running", label: "Running", icon: Boxes },
  { id: "logs", label: "Logs", icon: Logs },
  { id: "integrations", label: "Integrations", icon: Database },
  { id: "settings", label: "Settings", icon: Cog },
] as const;

type ViewId = (typeof navItems)[number]["id"];

export function App() {
  const isKanbanRoute =
    ((globalThis as { location?: { hash?: string } }).location?.hash ?? "") === "#kanban";
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [snapshot, setSnapshot] = useState<OrchestratorSnapshot | null>(null);
  const [activeView, setActiveView] = useState<ViewId>("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [workflowDocument, setWorkflowDocument] = useState<WorkflowDocument | null>(null);
  const [workflowDraft, setWorkflowDraft] = useState("");
  const [workflowStatus, setWorkflowStatus] = useState<{
    tone: "idle" | "success" | "error";
    message: string | null;
  }>({
    tone: "idle",
    message: null,
  });
  const [isSavingWorkflow, setIsSavingWorkflow] = useState(false);
  const symphony = (globalThis as typeof globalThis & { symphony: SymphonyApi }).symphony;

  useEffect(() => {
    void Promise.all([symphony.getBootstrap(), symphony.getWorkflowDocument()]).then(
      ([payload, document]) => {
        setBootstrap(payload);
        setSnapshot(payload.snapshot);
        setWorkflowDocument(document);
        setWorkflowDraft(document.contents);
      },
    );
    return symphony.onSnapshot((next: OrchestratorSnapshot) => setSnapshot(next));
  }, [symphony]);

  useEffect(() => {
    if (!snapshot) return;
    const firstRunning = snapshot.running[0]?.issue.identifier;
    const firstRetry = snapshot.retrying[0]?.identifier;
    setSelectedKey((current) => current ?? firstRunning ?? firstRetry ?? null);
  }, [snapshot]);

  if (!bootstrap || !snapshot) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Booting Symphony Desktop…
      </div>
    );
  }

  if (isKanbanRoute) {
    return <KanbanWindow bootstrap={bootstrap} onBootstrapRefresh={setBootstrap} />;
  }

  const isWorkflowDirty = workflowDocument !== null && workflowDraft !== workflowDocument.contents;
  const filtered = createFilteredState(snapshot, bootstrap.trackers, searchQuery);
  const selectedRunning =
    filtered.running.find((entry) => entry.issue.identifier === selectedKey) ?? null;
  const selectedRetry = filtered.retrying.find((entry) => entry.identifier === selectedKey) ?? null;
  const selectedLog = filtered.logs.find((entry) => entry.id === selectedKey) ?? null;
  const selectedIntegration =
    filtered.integrations.find((entry) => entry.kind === selectedKey) ?? null;
  const showOnboarding =
    !bootstrap.settings.onboardingCompleted &&
    !bootstrap.settings.localKanban.enabled &&
    !bootstrap.settings.activeTrackerKind &&
    !snapshot.tracker;

  const reloadWorkflowDocument = async () => {
    const document = await symphony.getWorkflowDocument();
    setWorkflowDocument(document);
    setWorkflowDraft(document.contents);
    setWorkflowStatus({ tone: "idle", message: "Reloaded from disk." });
  };

  const saveWorkflowDocument = async () => {
    setIsSavingWorkflow(true);
    setWorkflowStatus({ tone: "idle", message: null });

    try {
      const document = await symphony.saveWorkflowDocument(workflowDraft);
      setWorkflowDocument(document);
      setWorkflowDraft(document.contents);
      setWorkflowStatus({
        tone: "success",
        message: "Saved to WORKFLOW.md and refreshed the runtime.",
      });
    } catch (error) {
      setWorkflowStatus({ tone: "error", message: `Save failed: ${String(error)}` });
    } finally {
      setIsSavingWorkflow(false);
    }
  };

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground">
      <div className="grid h-full grid-cols-[248px_minmax(0,1fr)]">
        <aside className="flex h-full flex-col border-r border-white/5 bg-black/80 px-4 py-5">
          <div className="app-drag mb-6 flex items-center justify-between gap-3 rounded-xl px-1 py-1">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">Symphony Desktop</div>
              <div className="text-xs text-zinc-500">Technical operations console</div>
            </div>
            <Badge className="app-no-drag shrink-0">v0.1</Badge>
          </div>

          <div className="app-no-drag relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <Input
              value={searchQuery}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setSearchQuery(String((event.target as { value?: unknown }).value ?? ""))
              }
              placeholder="Search issues, sessions, logs"
              className="pl-9"
            />
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeView === item.id;
              return (
                <Button
                  key={item.id}
                  type="button"
                  variant={active ? "secondary" : "ghost"}
                  className="w-full justify-start gap-3"
                  onClick={() => setActiveView(item.id)}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Button>
              );
            })}
            {bootstrap.settings.localKanban.enabled ? (
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start gap-3"
                onClick={() => void symphony.openKanbanWindow()}
              >
                <Columns3 className="h-4 w-4" />
                Kanban
              </Button>
            ) : null}
          </nav>

          <Card className="mt-6">
            <CardHeader className="pb-3">
              <CardDescription className="text-[11px] uppercase tracking-[0.2em]">
                Tracker
              </CardDescription>
              <CardTitle className="text-base">
                {snapshot.tracker?.label ?? "Not configured"}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="truncate text-xs text-muted-foreground">
                {snapshot.workflowPath ?? "WORKFLOW.md not loaded yet"}
              </p>
            </CardContent>
          </Card>

          <div className="mt-auto pt-6">
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
              <div className="mb-1 text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                Status
              </div>
              <div className="flex items-center justify-between">
                <div className="text-sm text-white">{snapshot.status}</div>
                <div className="mono text-xs text-zinc-500">
                  {formatDurationMs(snapshot.nextRefreshInMs)}
                </div>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex h-full min-h-0 flex-col overflow-hidden">
          <header className="app-drag flex shrink-0 items-center justify-between gap-4 border-b border-white/5 px-8 py-6">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">{activeView}</div>
              <h1 className="mt-2 truncate text-3xl font-semibold tracking-tight text-white">
                {viewTitle(activeView)}
              </h1>
            </div>
            <div className="app-no-drag flex min-w-0 items-center gap-3">
              <div className="hidden min-w-[360px] flex-1 md:block">
                <Input
                  value={snapshot.workflowPath ?? ""}
                  readOnly
                  className="truncate text-zinc-400"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="app-no-drag"
                onClick={() => {
                  const clipboard = (
                    globalThis.navigator as
                      | (Navigator & { clipboard?: { writeText(text: string): Promise<void> } })
                      | undefined
                  )?.clipboard;
                  if (snapshot.workflowPath && clipboard) {
                    void clipboard.writeText(snapshot.workflowPath);
                  }
                }}
                aria-label="Copy workflow path"
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                onClick={() => void symphony.refreshRuntime()}
                className="app-no-drag gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh now
              </Button>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.7fr)_420px] overflow-hidden">
            <section className="min-h-0 overflow-auto">
              <div className="space-y-0 px-8 py-6 pr-6">
                {activeView === "overview" ? (
                  <OverviewView
                    snapshot={snapshot}
                    filtered={filtered}
                    onSelect={setSelectedKey}
                    selectedKey={selectedKey}
                  />
                ) : null}
                {activeView === "running" ? (
                  <RunningView
                    running={filtered.running}
                    onSelect={setSelectedKey}
                    selectedKey={selectedKey}
                  />
                ) : null}
                {activeView === "logs" ? (
                  <LogsView
                    logs={filtered.logs}
                    onSelect={setSelectedKey}
                    selectedKey={selectedKey}
                  />
                ) : null}
                {activeView === "integrations" ? (
                  <IntegrationsView
                    integrations={filtered.integrations}
                    onSelect={setSelectedKey}
                    selectedKey={selectedKey}
                  />
                ) : null}
                {activeView === "settings" ? (
                  <SettingsView
                    snapshot={snapshot}
                    bootstrap={bootstrap}
                    workflowDocument={workflowDocument}
                    workflowDraft={workflowDraft}
                    isWorkflowDirty={isWorkflowDirty}
                    isSavingWorkflow={isSavingWorkflow}
                    workflowStatus={workflowStatus}
                    onWorkflowDraftChange={setWorkflowDraft}
                    onWorkflowReload={() => void reloadWorkflowDocument()}
                    onWorkflowSave={() => void saveWorkflowDocument()}
                    onEnableLocalKanban={async () => {
                      await symphony.enableLocalKanban();
                      await reloadBootstrap(symphony, setBootstrap, setSnapshot);
                    }}
                    onDisableLocalKanban={async () => {
                      await symphony.disableLocalKanban();
                      await reloadBootstrap(symphony, setBootstrap, setSnapshot);
                    }}
                    onOpenKanban={() => void symphony.openKanbanWindow()}
                  />
                ) : null}
              </div>
            </section>

            <aside className="min-h-0 overflow-auto border-l border-white/5">
              <div className="px-6 py-6">
                <InspectorPanel
                  activeView={activeView}
                  selectedRunning={selectedRunning}
                  selectedRetry={selectedRetry}
                  selectedLog={selectedLog}
                  selectedIntegration={selectedIntegration}
                  snapshot={snapshot}
                />
              </div>
            </aside>
          </div>
        </main>
      </div>
      {showOnboarding ? (
        <OnboardingModal
          settings={bootstrap.settings}
          onUseLocalKanban={async () => {
            await symphony.enableLocalKanban();
            await reloadBootstrap(symphony, setBootstrap, setSnapshot);
            await symphony.openKanbanWindow();
          }}
          onSetUpIntegration={() => setActiveView("settings")}
          onSkip={async () => {
            await symphony.completeOnboarding();
            await reloadBootstrap(symphony, setBootstrap, setSnapshot);
          }}
        />
      ) : null}
    </div>
  );
}

function OverviewView({
  snapshot,
  filtered,
  onSelect,
  selectedKey,
}: {
  snapshot: OrchestratorSnapshot;
  filtered: FilteredState;
  onSelect: (key: string) => void;
  selectedKey: string | null;
}) {
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <MetricCard
          label="Agents"
          value={`${snapshot.counts.running}/${snapshot.counts.claimed || snapshot.counts.running || 0}`}
          hint="Running / claimed"
        />
        <MetricCard
          label="Throughput"
          value={`${formatInt(snapshot.codexTotals.totalTokens)} tps`}
          hint="Token surface"
        />
        <MetricCard
          label="Runtime"
          value={`${snapshot.codexTotals.secondsRunning}s`}
          hint="Aggregate session runtime"
        />
        <MetricCard
          label="Retry Queue"
          value={String(snapshot.counts.retrying)}
          hint={`Next refresh ${formatDurationMs(snapshot.nextRefreshInMs)}`}
        />
      </section>

      <RunningCard running={filtered.running} onSelect={onSelect} selectedKey={selectedKey} />
      <RetryCard retrying={filtered.retrying} onSelect={onSelect} selectedKey={selectedKey} />
    </div>
  );
}

function RunningView({
  running,
  onSelect,
  selectedKey,
}: {
  running: RunningEntry[];
  onSelect: (key: string) => void;
  selectedKey: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Running sessions</CardTitle>
            <CardDescription>
              All active workers, session identifiers, and live activity.
            </CardDescription>
          </div>
          <Badge>{running.length} active</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {running.length === 0 ? (
          <EmptyState
            title="No active sessions"
            description="No workers are currently running. Dispatch begins when candidate issues are available."
          />
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
  );
}

function LogsView({
  logs,
  onSelect,
  selectedKey,
}: {
  logs: RuntimeLogEntry[];
  onSelect: (key: string) => void;
  selectedKey: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Recent logs</CardTitle>
            <CardDescription>
              Structured runtime events from orchestration, tracker, and app-server transport.
            </CardDescription>
          </div>
          <Badge>{logs.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {logs.length === 0 ? (
          <EmptyState
            title="No log entries"
            description="Logs will appear here as the runtime state changes."
          />
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
  );
}

function IntegrationsView({
  integrations,
  onSelect,
  selectedKey,
}: {
  integrations: TrackerDescriptor[];
  onSelect: (key: string) => void;
  selectedKey: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Integrations</CardTitle>
            <CardDescription>
              Registered tracker adapters and their declared capabilities.
            </CardDescription>
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
  );
}

function SettingsView({
  snapshot,
  bootstrap,
  workflowDocument,
  workflowDraft,
  isWorkflowDirty,
  isSavingWorkflow,
  workflowStatus,
  onWorkflowDraftChange,
  onWorkflowReload,
  onWorkflowSave,
  onEnableLocalKanban,
  onDisableLocalKanban,
  onOpenKanban,
}: {
  snapshot: OrchestratorSnapshot;
  bootstrap: BootstrapPayload;
  workflowDocument: WorkflowDocument | null;
  workflowDraft: string;
  isWorkflowDirty: boolean;
  isSavingWorkflow: boolean;
  workflowStatus: { tone: "idle" | "success" | "error"; message: string | null };
  onWorkflowDraftChange: (next: string) => void;
  onWorkflowReload: () => void;
  onWorkflowSave: () => void;
  onEnableLocalKanban: () => void | Promise<void>;
  onDisableLocalKanban: () => void | Promise<void>;
  onOpenKanban: () => void;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Workflow editor</CardTitle>
              <CardDescription>
                Edit the live `WORKFLOW.md` without leaving the desktop app.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={isWorkflowDirty ? "secondary" : "outline"}>
                {isWorkflowDirty ? "Unsaved changes" : "In sync"}
              </Badge>
              <Badge>{snapshot.status}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-3">
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                    Workflow source
                  </div>
                  <div className="mono text-[11px] text-zinc-500">
                    {workflowDocument?.exists ? "existing file" : "new file"}
                  </div>
                </div>
                <div className="mono truncate text-xs text-zinc-300">
                  {workflowDocument?.path ?? snapshot.workflowPath ?? "Unavailable"}
                </div>
              </div>

              <Textarea
                aria-label="Workflow document"
                data-allow-select="true"
                value={workflowDraft}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                  onWorkflowDraftChange(
                    String((event.currentTarget as { value?: unknown }).value ?? ""),
                  )
                }
                spellCheck={false}
                className="mono min-h-[520px] resize-none border-white/8 bg-black/40 text-xs leading-6 text-zinc-100"
              />

              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3">
                <div
                  className={`text-sm ${workflowStatus.tone === "error" ? "text-red-300" : workflowStatus.tone === "success" ? "text-emerald-300" : "text-zinc-400"}`}
                >
                  {workflowStatus.message ??
                    "Changes are written directly to the workflow file and picked up by the runtime."}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={onWorkflowReload}
                    disabled={isSavingWorkflow}
                  >
                    Revert
                  </Button>
                  <Button
                    type="button"
                    onClick={onWorkflowSave}
                    disabled={!isWorkflowDirty || isSavingWorkflow}
                  >
                    {isSavingWorkflow ? "Saving…" : "Save workflow"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                <div className="mb-3 text-xs uppercase tracking-[0.18em] text-zinc-500">
                  Runtime attachment
                </div>
                <div className="space-y-4">
                  <Detail label="Poll interval" value={formatDurationMs(snapshot.pollIntervalMs)} />
                  <Detail label="Runtime status" value={snapshot.status} />
                  <Detail
                    label="Development mode"
                    value={bootstrap.isDevelopment ? "Enabled" : "Disabled"}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                <div className="mb-3 text-xs uppercase tracking-[0.18em] text-zinc-500">
                  Local kanban
                </div>
                <div className="space-y-4">
                  <Detail
                    label="Enabled"
                    value={bootstrap.settings.localKanban.enabled ? "Yes" : "No"}
                  />
                  <Detail
                    label="Active tracker"
                    value={bootstrap.settings.activeTrackerKind ?? "None"}
                  />
                  <Detail
                    label="Database"
                    value={
                      bootstrap.settings.localKanban.databasePath ??
                      "Created on first Local Kanban enable"
                    }
                    mono
                  />
                  <div className="flex flex-wrap gap-2">
                    {bootstrap.settings.localKanban.enabled ? (
                      <>
                        <Button type="button" onClick={onOpenKanban}>
                          Open board
                        </Button>
                        <Button type="button" variant="outline" onClick={() => void onDisableLocalKanban()}>
                          Hide Local Kanban
                        </Button>
                      </>
                    ) : (
                      <Button type="button" onClick={() => void onEnableLocalKanban()}>
                        Enable Local Kanban
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                <div className="mb-3 text-xs uppercase tracking-[0.18em] text-zinc-500">
                  Editing notes
                </div>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    Front matter controls tracker, polling, workspace, hooks, agent, and Codex
                    runtime configuration.
                  </p>
                  <p>The body below the YAML block is the prompt template rendered per issue.</p>
                  <p>
                    Save writes to disk immediately. If the workflow becomes invalid, runtime errors
                    will surface in the logs and status panels.
                  </p>
                  <p>
                    Disabling Local Kanban only hides it from the UI. The local SQLite database is
                    retained on disk.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function OnboardingModal({
  settings,
  onUseLocalKanban,
  onSetUpIntegration,
  onSkip,
}: {
  settings: AppSettings;
  onUseLocalKanban: () => void | Promise<void>;
  onSetUpIntegration: () => void;
  onSkip: () => void | Promise<void>;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/70 px-6">
      <div className="w-full max-w-3xl overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.16),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0)),#09090b] shadow-[0_30px_140px_rgba(0,0,0,0.75)]">
        <div className="grid gap-0 md:grid-cols-[1.2fr_0.8fr]">
          <div className="border-b border-white/8 p-8 md:border-b-0 md:border-r">
            <div className="mb-3 text-[11px] uppercase tracking-[0.32em] text-amber-100/70">
              First launch
            </div>
            <h2 className="max-w-xl text-4xl font-semibold tracking-tight text-white">
              Start with the built-in board or connect an external tracker.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-400">
              Symphony can run against external systems, but it can also ship with a local board so
              you can start moving work immediately.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                type="button"
                className="bg-amber-300 text-black hover:bg-amber-200"
                onClick={() => void onUseLocalKanban()}
              >
                Use Local Kanban
              </Button>
              <Button type="button" variant="outline" onClick={onSetUpIntegration}>
                Set Up Integration
              </Button>
              <Button type="button" variant="ghost" onClick={() => void onSkip()}>
                Skip for now
              </Button>
            </div>
          </div>
          <div className="space-y-4 p-8">
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">
                Local defaults
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {["Inbox", "Todo", "In Progress", "Blocked", "Done"].map((label) => (
                  <Badge key={label}>{label}</Badge>
                ))}
              </div>
              <p className="mt-4 text-sm text-zinc-400">
                The first board includes a sample task so the drag and edit flow is obvious on first
                use.
              </p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">
                Current state
              </div>
              <div className="mt-3 text-sm text-zinc-300">
                Active tracker: {settings.activeTrackerKind ?? "None selected"}
              </div>
              <div className="mt-1 text-sm text-zinc-400">
                Local kanban: {settings.localKanban.enabled ? "Enabled" : "Disabled"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RunningCard({
  running,
  onSelect,
  selectedKey,
}: {
  running: RunningEntry[];
  onSelect: (key: string) => void;
  selectedKey: string | null;
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
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">
              No active sessions. Configure `WORKFLOW.md` and a tracker token to start the runtime.
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {running.map((entry) => (
                <button
                  key={entry.issue.id}
                  type="button"
                  onClick={() => onSelect(entry.issue.identifier)}
                  className={`grid w-full grid-cols-[120px_120px_160px_140px_minmax(0,1fr)] gap-4 px-5 py-4 text-left transition ${selectedKey === entry.issue.identifier ? "bg-white/[0.04]" : "hover:bg-white/[0.02]"}`}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-white">{entry.issue.identifier}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {entry.issue.title}
                    </div>
                  </div>
                  <div>
                    <Badge>{entry.issue.state}</Badge>
                  </div>
                  <div className="text-sm text-zinc-300">
                    <div>{formatRelativeTime(entry.startedAt)}</div>
                    <div className="mono text-xs text-zinc-500">
                      {entry.session.turnCount} turns
                    </div>
                  </div>
                  <div className="text-sm text-zinc-300">
                    <div>{formatInt(entry.session.codexTotalTokens)}</div>
                    <div className="mono text-xs text-zinc-500">
                      in {formatInt(entry.session.codexInputTokens)} / out{" "}
                      {formatInt(entry.session.codexOutputTokens)}
                    </div>
                  </div>
                  <div className="truncate text-sm text-zinc-400">
                    {entry.session.lastCodexMessage ?? "Waiting for first event"}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RetryCard({
  retrying,
  onSelect,
  selectedKey,
}: {
  retrying: RetryEntry[];
  onSelect: (key: string) => void;
  selectedKey: string | null;
}) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Retry queue</CardTitle>
            <CardDescription>
              Issues currently backing off after failure or continuation.
            </CardDescription>
          </div>
          <Badge>{retrying.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {retrying.length === 0 ? (
          <EmptyState
            title="No queued retries"
            description="The orchestrator currently has no retry backlog."
          />
        ) : (
          retrying.map((entry) => (
            <SelectionRow
              key={entry.issueId}
              title={entry.identifier}
              subtitle={entry.error ?? "Pending continuation retry"}
              meta={`attempt ${entry.attempt}`}
              selected={selectedKey === entry.identifier}
              onClick={() => onSelect(entry.identifier)}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function InspectorPanel({
  activeView,
  selectedRunning,
  selectedRetry,
  selectedLog,
  selectedIntegration,
  snapshot,
}: {
  activeView: ViewId;
  selectedRunning: RunningEntry | null;
  selectedRetry: RetryEntry | null;
  selectedLog: RuntimeLogEntry | null;
  selectedIntegration: TrackerDescriptor | null;
  snapshot: OrchestratorSnapshot;
}) {
  return (
    <div className="space-y-4">
      {activeView === "overview" || activeView === "running" ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>
                  {selectedRunning ? selectedRunning.issue.identifier : "Runtime details"}
                </CardTitle>
                <CardDescription>
                  {selectedRunning
                    ? selectedRunning.issue.title
                    : "Current limits and tracker health."}
                </CardDescription>
              </div>
              <Badge>{selectedRunning?.issue.state ?? snapshot.status}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedRunning ? (
              <>
                <Detail label="Workspace" value={selectedRunning.workspacePath} mono />
                <Detail
                  label="Session"
                  value={selectedRunning.session.sessionId ?? "Pending"}
                  mono
                />
                <Detail
                  label="Latest event"
                  value={selectedRunning.session.lastCodexMessage ?? "No event yet"}
                />
                <Detail label="Started" value={formatRelativeTime(selectedRunning.startedAt)} />
              </>
            ) : (
              <>
                <Detail label="Workflow" value={snapshot.workflowPath ?? "Unavailable"} mono />
                <Detail
                  label="Rate limits"
                  value={JSON.stringify(
                    snapshot.rateLimits ?? { primary: "n/a", secondary: "n/a" },
                  )}
                  mono
                />
                <Detail label="Errors" value={snapshot.errors[0] ?? "No active errors"} />
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {activeView === "overview" || activeView === "running" ? (
        <Card>
          <CardHeader>
            <CardTitle>{selectedRetry ? selectedRetry.identifier : "Retry detail"}</CardTitle>
            <CardDescription>
              {selectedRetry
                ? "Selected retry entry"
                : "Select a retry entry to inspect timing and error context."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedRetry ? (
              <>
                <Detail label="Attempt" value={String(selectedRetry.attempt)} />
                <Detail
                  label="Due"
                  value={formatDurationMs(Math.max(selectedRetry.dueAtMs - Date.now(), 0))}
                />
                <Detail label="Error" value={selectedRetry.error ?? "Pending continuation retry"} />
              </>
            ) : (
              <EmptyState
                title="Nothing selected"
                description="Choose a retry entry from the queue to inspect it here."
                compact
              />
            )}
          </CardContent>
        </Card>
      ) : null}

      {activeView === "integrations" ? (
        <Card>
          <CardHeader>
            <CardTitle>{selectedIntegration?.label ?? "Integration detail"}</CardTitle>
            <CardDescription>
              {selectedIntegration?.description ??
                "Select an adapter to inspect its contract and availability."}
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
                      <Badge key={capability} className="text-[10px] normal-case tracking-normal">
                        {capability}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <EmptyState
                title="No integration selected"
                description="Choose an adapter from the list to inspect its supported capabilities."
                compact
              />
            )}
          </CardContent>
        </Card>
      ) : null}

      {activeView === "logs" ? (
        <Card>
          <CardHeader>
            <CardTitle>{selectedLog ? "Log detail" : "Recent logs"}</CardTitle>
            <CardDescription>
              {selectedLog
                ? selectedLog.scope
                : "Select a log entry to inspect its scope and timing."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedLog ? (
              <>
                <Detail label="Level" value={selectedLog.level} />
                <Detail label="Scope" value={selectedLog.scope} />
                <Detail label="Time" value={formatRelativeTime(selectedLog.timestamp)} />
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-sm text-zinc-300">
                  {selectedLog.message}
                </div>
              </>
            ) : (
              snapshot.logs.slice(0, 8).map((log) => (
                <div key={log.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <Badge>{log.level}</Badge>
                    <div className="mono text-[11px] text-zinc-600">
                      {formatRelativeTime(log.timestamp)}
                    </div>
                  </div>
                  <div className="truncate text-sm text-white">{log.message}</div>
                  <div className="text-xs text-zinc-500">{log.scope}</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardDescription className="text-[11px] uppercase tracking-[0.18em]">
          {label}
        </CardDescription>
        <CardTitle className="text-4xl font-semibold tracking-tight">{value}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 text-sm text-muted-foreground">{hint}</CardContent>
    </Card>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="shrink-0 text-sm text-zinc-500">{label}</div>
      <div
        className={`max-w-[65%] text-right text-sm text-zinc-300 ${mono ? "mono break-all text-xs" : "break-words"}`}
      >
        {value}
      </div>
    </div>
  );
}

function EmptyState({
  title,
  description,
  compact = false,
}: {
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-dashed border-white/10 bg-white/[0.02] text-center ${compact ? "px-4 py-8" : "px-6 py-12"}`}
    >
      <div className="text-sm font-medium text-white">{title}</div>
      <div className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{description}</div>
    </div>
  );
}

function SelectionRow({
  title,
  subtitle,
  meta,
  selected,
  onClick,
}: {
  title: string;
  subtitle: string;
  meta: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-xl border px-4 py-4 text-left transition ${selected ? "border-white/15 bg-white/[0.05]" : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]"}`}
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
  );
}

function createFilteredState(
  snapshot: OrchestratorSnapshot,
  integrations: TrackerDescriptor[],
  searchQuery: string,
) {
  const query = searchQuery.trim().toLowerCase();
  if (!query) {
    return {
      running: snapshot.running,
      retrying: snapshot.retrying,
      logs: snapshot.logs,
      integrations,
    };
  }

  return {
    running: snapshot.running.filter((entry) =>
      [
        entry.issue.identifier,
        entry.issue.title,
        entry.issue.state,
        entry.session.lastCodexMessage ?? "",
      ].some((value) => value.toLowerCase().includes(query)),
    ),
    retrying: snapshot.retrying.filter((entry) =>
      [entry.identifier, entry.error ?? ""].some((value) => value.toLowerCase().includes(query)),
    ),
    logs: snapshot.logs.filter((entry) =>
      [entry.message, entry.scope, entry.level].some((value) =>
        value.toLowerCase().includes(query),
      ),
    ),
    integrations: integrations.filter((entry) =>
      [entry.label, entry.description, ...entry.capabilities].some((value) =>
        value.toLowerCase().includes(query),
      ),
    ),
  };
}

function viewTitle(activeView: ViewId) {
  switch (activeView) {
    case "overview":
      return "Symphony status";
    case "running":
      return "Running sessions";
    case "logs":
      return "Runtime logs";
    case "integrations":
      return "Tracker integrations";
    case "settings":
      return "Application settings";
  }
}

type FilteredState = ReturnType<typeof createFilteredState>;

async function reloadBootstrap(
  symphony: SymphonyApi,
  setBootstrap: (payload: BootstrapPayload) => void,
  setSnapshot: (snapshot: OrchestratorSnapshot) => void,
) {
  const payload = await symphony.getBootstrap();
  setBootstrap(payload);
  setSnapshot(payload.snapshot);
}
