import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { ObservabilityStore } from "../src/main/runtime/observability-store";
import { Orchestrator } from "../src/main/runtime/orchestrator";
import { WorkflowLoader } from "../src/main/runtime/workflow-loader";
import { RuntimeLogger } from "../src/main/runtime/logger";
import { TrackerRegistry } from "../src/main/tracker/registry";
import { MemoryTrackerAdapter } from "../src/main/tracker/memory-adapter";

describe("orchestrator", () => {
  it("boots against memory workflow and produces a tracker snapshot", async () => {
    const dir = mkdtempSync(join(tmpdir(), "symphonygui-test-"));
    const workflowPath = join(dir, "WORKFLOW.md");
    writeFileSync(
      workflowPath,
      `---
tracker:
  kind: memory
workspace:
  root: ${JSON.stringify(join(dir, "workspaces"))}
codex:
  command: printf '%s\\n' '{"id":2,"result":{"thread":{"id":"thread"}}}' '{"id":3,"result":{"turn":{"id":"turn"}}}' '{"method":"turn/completed","params":{"message":"ok","usage":{"input_tokens":5,"output_tokens":2,"total_tokens":7}}}'
---
Hello {{ issue.identifier }}
`,
    );

    const store = new ObservabilityStore();
    const orchestrator = new Orchestrator(
      new WorkflowLoader(workflowPath),
      new TrackerRegistry(new Map([["memory", new MemoryTrackerAdapter()]])),
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

    await orchestrator.start();
    await orchestrator.refreshNow();
    const snapshot = store.getSnapshot();
    expect(snapshot.tracker?.kind).toBe("memory");
    expect(snapshot.workflowPath).toBe(workflowPath);
    orchestrator.stop();
  });
});
