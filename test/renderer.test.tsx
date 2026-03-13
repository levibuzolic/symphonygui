import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/renderer/App";
import type { BootstrapPayload } from "../src/shared/types";

const refreshRuntime = vi.fn();
const getWorkflowDocument = vi.fn();
const saveWorkflowDocument = vi.fn();
const openKanbanWindow = vi.fn();

function createBootstrap(overrides: Partial<BootstrapPayload> = {}): BootstrapPayload {
  return {
    isDevelopment: true,
    settings: {
      onboardingCompleted: true,
      activeTrackerKind: "linear",
      localKanban: {
        enabled: false,
        initialized: false,
        databasePath: null,
        lastOpenedBoardId: null,
      },
    },
    kanbanBoards: [],
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
    ...overrides,
  };
}

function installSymphonyStub(bootstrap = createBootstrap()) {
  refreshRuntime.mockReset();
  getWorkflowDocument.mockReset();
  saveWorkflowDocument.mockReset();
  openKanbanWindow.mockReset();
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
    getSettings: vi.fn(),
    completeOnboarding: vi.fn(),
    enableLocalKanban: vi.fn(),
    disableLocalKanban: vi.fn(),
    openKanbanWindow,
    listKanbanBoards: vi.fn(),
    getKanbanBoard: vi.fn(),
    createKanbanTask: vi.fn(),
    updateKanbanTask: vi.fn(),
    moveKanbanTask: vi.fn(),
    archiveKanbanTask: vi.fn(),
    updateKanbanBoard: vi.fn(),
    createKanbanColumn: vi.fn(),
    updateKanbanColumn: vi.fn(),
    onSnapshot: vi.fn().mockReturnValue(() => undefined),
  };
}

describe("renderer app", () => {
  it("renders dashboard shell", async () => {
    installSymphonyStub();
    render(<App />);
    expect(await screen.findByText("Symphony status")).toBeInTheDocument();
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

  it("shows onboarding when no tracker is active and local kanban is disabled", async () => {
    installSymphonyStub(
      createBootstrap({
        settings: {
          onboardingCompleted: false,
          activeTrackerKind: null,
          localKanban: {
            enabled: false,
            initialized: false,
            databasePath: null,
            lastOpenedBoardId: null,
          },
        },
        snapshot: {
          ...createBootstrap().snapshot,
          tracker: null,
        },
      }),
    );

    render(<App />);
    expect(
      await screen.findByText("Start with the built-in board or connect an external tracker."),
    ).toBeInTheDocument();
  });

  it("shows a kanban sidebar action when local kanban is enabled", async () => {
    installSymphonyStub(
      createBootstrap({
        settings: {
          onboardingCompleted: true,
          activeTrackerKind: "local",
          localKanban: {
            enabled: true,
            initialized: true,
            databasePath: "/tmp/local-kanban.sqlite",
            lastOpenedBoardId: "board-default",
          },
        },
        kanbanBoards: [
          {
            id: "board-default",
            name: "My Tasks",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        trackers: [
          {
            kind: "local",
            label: "Local Kanban",
            status: "active",
            capabilities: ["candidate-fetch"],
            description: "Local board",
          },
        ],
        snapshot: {
          ...createBootstrap().snapshot,
          tracker: {
            kind: "local",
            label: "Local Kanban",
            status: "active",
            capabilities: ["candidate-fetch"],
            description: "Local board",
          },
        },
      }),
    );

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Kanban" }));
    expect(openKanbanWindow).toHaveBeenCalledTimes(1);
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
    expect(html).toContain(
      "grid min-h-0 flex-1 grid-cols-[minmax(0,1.7fr)_420px] overflow-hidden",
    );
  });

  it("marks the title chrome as draggable and header controls as no-drag", async () => {
    installSymphonyStub();
    const { container } = render(<App />);

    const refreshButton = await screen.findByRole("button", { name: /refresh now/i });
    const header = String((container as unknown as { innerHTML?: string }).innerHTML ?? "").includes(
      "app-drag flex shrink-0 items-center justify-between",
    );

    expect(header).toBe(true);
    expect(String((refreshButton as unknown as { className?: string }).className ?? "")).toContain(
      "app-no-drag",
    );
  });
});
