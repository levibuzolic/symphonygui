import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorkflowLoader, parseWorkflowFile } from "../src/main/runtime/workflow-loader";
import { ConfigLayer } from "../src/main/runtime/config-layer";

describe("workflow loader", () => {
  it("parses front matter and prompt body", () => {
    const definition = parseWorkflowFile(
      `---
tracker:
  kind: linear
  project_slug: demo
---
Hello {{ issue.identifier }}`,
      "/tmp/WORKFLOW.md",
    );
    expect(definition.config).toMatchObject({ tracker: { kind: "linear", project_slug: "demo" } });
    expect(definition.promptTemplate).toBe("Hello {{ issue.identifier }}");
  });

  it("coerces workflow config into typed settings", () => {
    const definition = parseWorkflowFile(
      `---
tracker:
  kind: linear
  project_slug: demo
  api_key: abc
polling:
  interval_ms: "1000"
---
Prompt`,
      "/tmp/WORKFLOW.md",
    );
    const config = new ConfigLayer().parse(definition);
    expect(config.polling.intervalMs).toBe(1000);
    expect(config.tracker.projectSlug).toBe("demo");
  });

  it("reads and writes workflow documents through the loader boundary", () => {
    const root = mkdtempSync(join(tmpdir(), "symphonygui-workflow-loader-"));
    const workflowPath = join(root, "WORKFLOW.md");

    try {
      const loader = new WorkflowLoader(workflowPath);
      const saved = loader.save("---\ntracker:\n  kind: memory\n---\nPrompt from settings");

      expect(saved.path).toBe(workflowPath);
      expect(saved.exists).toBe(true);
      expect(saved.contents).toContain("Prompt from settings");
      expect(readFileSync(workflowPath, "utf8")).toContain("Prompt from settings");
      expect(loader.load().config).toMatchObject({ tracker: { kind: "memory" } });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
