import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/renderer/App";
import type { BootstrapPayload } from "../src/shared/types";

const refreshRuntime = vi.fn();
const getWorkflowDocument = vi.fn();
const saveWorkflowDocument = vi.fn();

const bootstrap: BootstrapPayload = {
  isDevelopment: true,
  trackers: [
    {
      kind: "linear",
      label: "Linear",
      status: "active",
      capabilities: ["candidate-fetch"],
      description: "Linear adapter",
    },
  ],
  snapshot: {
    generatedAt: new Date().toISOString(),
    workflowPath: "/tmp/WORKFLOW.md",
    pollIntervalMs: 30000,
    nextRefreshInMs: 1000,
    counts: { running: 0, retrying: 0, claimed: 0, completed: 0 },
    codexTotals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0 },
    rateLimits: null,
    tracker: {
      kind: "linear",
      label: "Linear",
      status: "active",
      capabilities: ["candidate-fetch"],
      description: "Linear adapter",
    },
    running: [],
    retrying: [],
    logs: [
      {
        id: "log-1",
        level: "info",
        timestamp: new Date().toISOString(),
        scope: "orchestrator",
        message: "Fetched candidate issues",
      },
    ],
    status: "idle",
    errors: [],
  },
};

function installSymphonyStub() {
  refreshRuntime.mockReset();
  getWorkflowDocument.mockReset();
  saveWorkflowDocument.mockReset();
  getWorkflowDocument.mockResolvedValue({
    path: "/tmp/WORKFLOW.md",
    contents: "---\ntracker:\n  kind: linear\n---\nPrompt body",
    exists: true,
  });
  saveWorkflowDocument.mockImplementation(async (contents: string) => ({
    path: "/tmp/WORKFLOW.md",
    contents,
    exists: true,
  }));
  (globalThis as typeof globalThis & { symphony: unknown }).symphony = {
    getBootstrap: vi.fn().mockResolvedValue(bootstrap),
    refreshRuntime,
    getIssue: vi.fn(),
    getLogs: vi.fn(),
    listIntegrations: vi.fn(),
    getWorkflowDocument,
    saveWorkflowDocument,
    onSnapshot: vi.fn().mockReturnValue(() => undefined),
  };
}

describe("renderer app", () => {
  it("renders dashboard shell", async () => {
    installSymphonyStub();
    render(<App />);
    expect(await screen.findByText("Symphony status")).toBeInTheDocument();
    expect(screen.queryByText("Implementation Progress")).not.toBeInTheDocument();
  });

  it("switches views from the sidebar", async () => {
    installSymphonyStub();
    render(<App />);

    await screen.findByText("Symphony status");
    fireEvent.click(screen.getByRole("button", { name: "Logs" }));

    expect(screen.getByText("Runtime logs")).toBeInTheDocument();
    expect(screen.getAllByText("Fetched candidate issues").length).toBeGreaterThan(0);
  });

  it("allows editing and saving the workflow from settings", async () => {
    installSymphonyStub();
    render(<App />);

    await screen.findByText("Symphony status");
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    const editor = await screen.findByRole("textbox", { name: "Workflow document" });
    fireEvent.change(editor, {
      target: { value: "---\ntracker:\n  kind: memory\n---\nNew prompt body" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save workflow/i }));

    expect(saveWorkflowDocument).toHaveBeenCalledWith(
      "---\ntracker:\n  kind: memory\n---\nNew prompt body",
    );
    expect(
      await screen.findByText("Saved to WORKFLOW.md and refreshed the runtime."),
    ).toBeInTheDocument();
  });

  it("triggers a refresh from the header action", async () => {
    installSymphonyStub();
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /refresh now/i }));
    expect(refreshRuntime).toHaveBeenCalledTimes(1);
  });

  it("renders a fixed-height shell instead of a full-page document layout", async () => {
    installSymphonyStub();
    const { container } = render(<App />);

    await screen.findByText("Symphony status");
    const html = String((container as unknown as { innerHTML?: string }).innerHTML ?? "");
    expect(html).toContain("h-screen overflow-hidden bg-background text-foreground");
    expect(html).toContain("grid min-h-0 flex-1 grid-cols-[minmax(0,1.7fr)_420px] overflow-hidden");
    expect(html).not.toContain(
      "grid min-h-0 flex-1 grid-cols-[minmax(0,1.7fr)_420px] gap-4 overflow-hidden px-8 py-6",
    );
  });

  it("marks the title chrome as draggable and header controls as no-drag", async () => {
    installSymphonyStub();
    const { container } = render(<App />);

    const refreshButton = await screen.findByRole("button", { name: /refresh now/i });
    const header = String(
      (container as unknown as { innerHTML?: string }).innerHTML ?? "",
    ).includes("app-drag flex shrink-0 items-center justify-between");

    expect(header).toBe(true);
    expect(String((refreshButton as unknown as { className?: string }).className ?? "")).toContain(
      "app-no-drag",
    );
  });
});
