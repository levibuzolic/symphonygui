import { describe, expect, it, vi } from "vitest";
import { RuntimeLogger } from "../src/main/runtime/logger";
import { ObservabilityStore } from "../src/main/runtime/observability-store";
import { Orchestrator } from "../src/main/runtime/orchestrator";

function createConfig() {
  return {
    tracker: {
      kind: "memory",
      endpoint: "",
      apiKey: null,
      projectSlug: null,
      activeStates: ["Todo", "In Progress"],
      terminalStates: ["Done", "Canceled"],
    },
    polling: { intervalMs: 30_000 },
    workspace: { root: "/tmp/symphonygui-test" },
    hooks: {
      afterCreate: null,
      beforeRun: null,
      afterRun: null,
      beforeRemove: null,
      timeoutMs: 1_000,
    },
    agent: {
      maxConcurrentAgents: 1,
      maxTurns: 10,
      maxRetryBackoffMs: 60_000,
      maxConcurrentAgentsByState: {},
      sshHosts: [],
      maxConcurrentAgentsPerHost: null,
    },
    codex: {
      command: "codex",
      approvalPolicy: "never",
      threadSandbox: "workspace-write",
      turnSandboxPolicy: {},
      turnTimeoutMs: 1_000,
      readTimeoutMs: 1_000,
      stallTimeoutMs: 1_000,
    },
    server: { port: null },
  };
}

describe("orchestrator shutdown", () => {
  it("does not append tick logs after stop when an in-flight poll resolves late", async () => {
    const deferred = {
      resolve: (_value: unknown[]): void => {},
    };
    const delayedIssues = new Promise<unknown[]>((resolve) => {
      deferred.resolve = resolve as (value: unknown[]) => void;
    });

    const adapter = {
      fetchCandidateIssues: vi.fn(() => delayedIssues),
      fetchCurrentStates: vi.fn(async () => new Map()),
      fetchTerminalIssues: vi.fn(async () => []),
      descriptor: vi.fn(() => null),
    };

    const workflowLoader = {
      getCurrent: vi.fn(() => null),
      startWatching: vi.fn(),
      stopWatching: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    const registry = {
      get: vi.fn(() => adapter),
    };

    const store = new ObservabilityStore();
    const appendLog = vi.spyOn(store, "appendLog");
    const orchestrator = new Orchestrator(
      workflowLoader as never,
      registry as never,
      store,
      new RuntimeLogger(),
      () => ({
        onboardingCompleted: true,
        activeTrackerKind: "memory",
        localKanban: {
          enabled: false,
          initialized: false,
          databasePath: null,
          lastOpenedBoardId: null,
        },
      }),
    );

    (orchestrator as unknown as { config: ReturnType<typeof createConfig> }).config =
      createConfig();
    (
      orchestrator as unknown as {
        workflowDefinition: {
          config: Record<string, never>;
          promptTemplate: string;
          sourcePath: string;
          loadedAt: string;
        };
      }
    ).workflowDefinition = {
      config: {},
      promptTemplate: "noop",
      sourcePath: "/tmp/WORKFLOW.md",
      loadedAt: new Date().toISOString(),
    };

    const tickPromise = (orchestrator as unknown as { tick(): Promise<void> }).tick();
    orchestrator.stop();
    deferred.resolve([]);
    await tickPromise;

    expect(appendLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: "Fetched candidate issues" }),
    );
  });
});
