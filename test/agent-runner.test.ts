import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { AgentRunner } from "../src/main/runtime/agent-runner";
import type { NormalizedIssue, ServiceConfig } from "../src/shared/types";
import type { TrackerAdapter } from "../src/main/tracker/types";

const config: ServiceConfig = {
  tracker: {
    kind: "memory",
    endpoint: "",
    apiKey: null,
    projectSlug: null,
    activeStates: ["Todo", "In Progress"],
    terminalStates: ["Done"],
  },
  polling: { intervalMs: 30000 },
  workspace: { root: join(tmpdir(), "symphonygui-runner-tests") },
  hooks: {
    afterCreate: null,
    beforeRun: null,
    afterRun: null,
    beforeRemove: null,
    timeoutMs: 60000,
  },
  agent: {
    maxConcurrentAgents: 1,
    maxTurns: 1,
    maxRetryBackoffMs: 300000,
    maxConcurrentAgentsByState: {},
    sshHosts: [],
    maxConcurrentAgentsPerHost: null,
  },
  codex: {
    command: `printf '%s\n' '{"id":2,"result":{"thread":{"id":"thread-1"}}}'`,
    approvalPolicy: "never",
    threadSandbox: "workspace-write",
    turnSandboxPolicy: {},
    turnTimeoutMs: 1000,
    readTimeoutMs: 1000,
    stallTimeoutMs: 1000,
  },
  server: { port: null },
};

const issue: NormalizedIssue = {
  id: "issue-1",
  identifier: "DEMO-1",
  title: "Handle early process exit",
  description: null,
  priority: 1,
  state: "In Progress",
  branchName: null,
  url: null,
  labels: [],
  blockedBy: [],
  createdAt: null,
  updatedAt: null,
};

const adapter: TrackerAdapter = {
  descriptor: () => ({
    kind: "memory",
    label: "Memory",
    status: "active",
    capabilities: [],
    description: "test adapter",
  }),
  fetchCandidateIssues: async () => [],
  fetchCurrentStates: async () => new Map(),
  fetchTerminalIssues: async () => [],
};

describe("agent runner", () => {
  it("does not crash when the child closes stdin before turn/start is written", async () => {
    const runner = new AgentRunner();
    const updates: string[] = [];
    runner.on("update", (event) => {
      updates.push(event.event);
    });

    const workspace = mkdtempSync(join(tmpdir(), "symphonygui-agent-runner-"));
    const result = await runner.runIssue(issue, config, workspace, "hello world", adapter);

    expect(result.code).toBe(0);
    expect(
      updates.some((event) => event === "transport_closed" || event === "transport_error"),
    ).toBe(true);
  });
});
