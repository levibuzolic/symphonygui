import type { AppSettings, ServiceConfig, TrackerDescriptor } from "@shared/types";
import type { TrackerAdapter } from "./types";

export class TrackerRegistry {
  constructor(private adapters: Map<string, TrackerAdapter>) {}

  get(kind: string) {
    return this.adapters.get(kind);
  }

  list(config?: ServiceConfig, settings?: AppSettings): TrackerDescriptor[] {
    return [...this.adapters.entries()]
      .filter(([kind]) => kind !== "local" || settings?.localKanban.enabled)
      .map(([kind, adapter]) =>
        adapter.descriptor(
          config ?? {
            tracker: {
              kind,
              endpoint: "",
              apiKey: null,
              projectSlug: null,
              activeStates: [],
              terminalStates: [],
            },
            polling: { intervalMs: 30000 },
            workspace: { root: "" },
            hooks: {
              afterCreate: null,
              beforeRun: null,
              afterRun: null,
              beforeRemove: null,
              timeoutMs: 60000,
            },
            agent: {
              maxConcurrentAgents: 10,
              maxTurns: 20,
              maxRetryBackoffMs: 300000,
              maxConcurrentAgentsByState: {},
              sshHosts: [],
              maxConcurrentAgentsPerHost: null,
            },
            codex: {
              command: "codex app-server",
              approvalPolicy: "never",
              threadSandbox: "workspace-write",
              turnSandboxPolicy: {},
              turnTimeoutMs: 3600000,
              readTimeoutMs: 5000,
              stallTimeoutMs: 300000,
            },
            server: { port: null },
          },
        ),
      );
  }
}
