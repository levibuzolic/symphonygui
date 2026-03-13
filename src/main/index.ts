import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import type {
  BootstrapPayload,
  CreateKanbanColumnInput,
  CreateKanbanTaskInput,
  MoveKanbanTaskInput,
  UpdateKanbanBoardInput,
  UpdateKanbanColumnInput,
  UpdateKanbanTaskInput,
} from "@shared/types";
import { WorkflowLoader } from "./runtime/workflow-loader";
import { ConfigLayer } from "./runtime/config-layer";
import { ObservabilityStore } from "./runtime/observability-store";
import { RuntimeLogger } from "./runtime/logger";
import { TrackerRegistry } from "./tracker/registry";
import { LinearTrackerAdapter } from "./tracker/linear-adapter";
import { MemoryTrackerAdapter } from "./tracker/memory-adapter";
import { LocalSqliteTrackerAdapter } from "./tracker/local-sqlite-adapter";
import { LocalKanbanStore } from "./tracker/local-kanban-store";
import { hasConfiguredExternalTracker } from "./tracker/tracker-selection";
import { Orchestrator } from "./runtime/orchestrator";
import { ObservabilityHttpServer } from "./http/observability-http-server";
import { safeSendToWindow } from "./window-publisher";
import { createWindowStateStore } from "./services/window-state";
import { AppSettingsStore } from "./settings/app-settings-store";

const workflowLoader = new WorkflowLoader();
const configLayer = new ConfigLayer();
const store = new ObservabilityStore();
const logger = new RuntimeLogger();

let settingsStore: AppSettingsStore;
let kanbanStore: LocalKanbanStore;
let registry: TrackerRegistry;
let orchestrator: Orchestrator;
let httpServer: ObservabilityHttpServer;

let mainWindow: BrowserWindow | null = null;
let kanbanWindow: BrowserWindow | null = null;
let unsubscribeSnapshotListener: (() => void) | null = null;
let isQuitting = false;
let persistWindowStateTimeout: NodeJS.Timeout | null = null;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
const windowStateStore = createWindowStateStore(app.getPath("userData"));

if (!hasSingleInstanceLock) {
  app.quit();
}

function focusWindow(targetWindow: BrowserWindow | null) {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return;
  }

  if (targetWindow.isMinimized()) {
    targetWindow.restore();
  }

  targetWindow.focus();
}

function getOpenWindows() {
  return [mainWindow, kanbanWindow].filter(
    (targetWindow): targetWindow is BrowserWindow =>
      targetWindow !== null && !targetWindow.isDestroyed(),
  );
}

function loadRendererWindow(targetWindow: BrowserWindow, hash = "") {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void targetWindow.loadURL(hash ? `${devServerUrl}/#${hash}` : devServerUrl);
  } else {
    void targetWindow.loadFile(join(__dirname, "../dist/index.html"), hash ? { hash } : undefined);
  }

  if (process.env.SYMPHONY_SMOKE_TEST) {
    targetWindow.webContents.once("did-finish-load", () => {
      setTimeout(() => app.quit(), 300);
    });
  }
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    focusWindow(mainWindow);
    return mainWindow;
  }

  const windowState = windowStateStore.load();
  mainWindow = new BrowserWindow({
    width: windowState.bounds.width,
    height: windowState.bounds.height,
    x: windowState.bounds.x,
    y: windowState.bounds.y,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: "#050505",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
    },
    show: !process.env.SYMPHONY_SMOKE_TEST,
  });

  loadRendererWindow(mainWindow);

  if (windowState.isMaximized) {
    mainWindow.maximize();
  }

  const persistWindowState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    windowStateStore.save({
      bounds: mainWindow.isMaximized() ? mainWindow.getNormalBounds() : mainWindow.getBounds(),
      isMaximized: mainWindow.isMaximized(),
    });
  };

  const schedulePersistWindowState = () => {
    if (persistWindowStateTimeout) {
      clearTimeout(persistWindowStateTimeout);
    }

    persistWindowStateTimeout = setTimeout(() => {
      persistWindowStateTimeout = null;
      persistWindowState();
    }, 150);
  };

  mainWindow.on("move", schedulePersistWindowState);
  mainWindow.on("resize", schedulePersistWindowState);
  mainWindow.on("maximize", schedulePersistWindowState);
  mainWindow.on("unmaximize", schedulePersistWindowState);
  mainWindow.on("close", persistWindowState);
  mainWindow.on("closed", () => {
    if (persistWindowStateTimeout) {
      clearTimeout(persistWindowStateTimeout);
      persistWindowStateTimeout = null;
    }
    mainWindow = null;
  });

  return mainWindow;
}

function openKanbanWindow() {
  if (kanbanWindow && !kanbanWindow.isDestroyed()) {
    focusWindow(kanbanWindow);
    return;
  }

  kanbanWindow = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: "#050505",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
    },
    show: !process.env.SYMPHONY_SMOKE_TEST,
  });

  loadRendererWindow(kanbanWindow, "kanban");
  kanbanWindow.on("closed", () => {
    kanbanWindow = null;
  });
}

function getSettings() {
  return settingsStore.get();
}

function getEffectiveConfig() {
  try {
    const definition = workflowLoader.getCurrent() ?? workflowLoader.load();
    return configLayer.parse(definition);
  } catch {
    return null;
  }
}

function getTrackers() {
  return registry.list(getEffectiveConfig() ?? undefined, getSettings());
}

function getKanbanBoards() {
  return getSettings().localKanban.enabled ? kanbanStore.listBoards() : [];
}

function createBootstrapPayload(): BootstrapPayload {
  return {
    snapshot: store.getSnapshot(),
    trackers: getTrackers(),
    settings: settingsStore.get(),
    kanbanBoards: getKanbanBoards(),
    isDevelopment: !app.isPackaged,
  };
}

function publishBootstrap() {
  const payload = createBootstrapPayload();
  for (const targetWindow of getOpenWindows()) {
    safeSendToWindow(targetWindow, "app:bootstrap", payload);
  }
}

function publishKanbanBoard(board: ReturnType<LocalKanbanStore["getBoard"]>) {
  for (const targetWindow of getOpenWindows()) {
    safeSendToWindow(targetWindow, "kanban:boardChanged", board);
  }
}

async function runKanbanMutation(
  action: () => ReturnType<LocalKanbanStore["getBoard"]>,
): Promise<ReturnType<LocalKanbanStore["getBoard"]>> {
  const payload = action();
  publishBootstrap();
  publishKanbanBoard(payload);
  return payload;
}

function maybePromoteLocalKanban() {
  const config = getEffectiveConfig();
  if (config && hasConfiguredExternalTracker(config)) {
    return settingsStore.get();
  }
  return settingsStore.setActiveTrackerKind("local");
}

async function enableLocalKanban() {
  kanbanStore.initializeDefaults();
  const firstBoard = kanbanStore.listBoards()[0] ?? null;
  const nextSettings = settingsStore.update({
    onboardingCompleted: true,
    localKanban: {
      enabled: true,
      initialized: true,
      databasePath: kanbanStore.getDatabasePath(),
      lastOpenedBoardId: firstBoard?.id ?? null,
    },
  });
  maybePromoteLocalKanban();
  await orchestrator.reloadRuntimeConfig();
  await orchestrator.refreshNow();
  publishBootstrap();
  publishKanbanBoard(firstBoard ? kanbanStore.getBoard(firstBoard.id) : null);
  return nextSettings;
}

async function disableLocalKanban() {
  const current = settingsStore.get();
  const next = settingsStore.update({
    localKanban: {
      ...current.localKanban,
      enabled: false,
    },
  });
  if (next.activeTrackerKind === "local") {
    settingsStore.setActiveTrackerKind(null);
  }
  if (kanbanWindow && !kanbanWindow.isDestroyed()) {
    kanbanWindow.close();
  }
  await orchestrator.reloadRuntimeConfig();
  publishBootstrap();
  publishKanbanBoard(null);
  return settingsStore.get();
}

app.on("second-instance", () => {
  focusWindow(mainWindow);
});

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) {
    return;
  }

  settingsStore = new AppSettingsStore(app.getPath("userData"));
  kanbanStore = new LocalKanbanStore(join(app.getPath("userData"), "local-kanban.sqlite"));

  const settings = settingsStore.get();
  if (settings.localKanban.initialized) {
    kanbanStore.initializeDefaults();
    settingsStore.update({
      localKanban: {
        ...settings.localKanban,
        databasePath: kanbanStore.getDatabasePath(),
      },
    });
  }

  registry = new TrackerRegistry(
    new Map([
      ["linear", new LinearTrackerAdapter()],
      ["memory", new MemoryTrackerAdapter()],
      ["local", new LocalSqliteTrackerAdapter(kanbanStore)],
    ]),
  );
  orchestrator = new Orchestrator(workflowLoader, registry, store, logger, () =>
    settingsStore.get(),
  );
  httpServer = new ObservabilityHttpServer(store, orchestrator);

  await orchestrator.start();
  const snapshot = store.getSnapshot();
  if (snapshot.workflowPath && !snapshot.errors.length) {
    const requestedPort = 43119;
    try {
      const actualPort = await httpServer.start(requestedPort);
      logger.info("http", "Observability HTTP server started", { requestedPort, actualPort });
      store.appendLog(
        logger.info("http", "Observability HTTP server started", { requestedPort, actualPort }),
      );
    } catch (error) {
      logger.warn("http", "Observability HTTP server failed to start", {
        requestedPort,
        error: String(error),
      });
      store.appendLog(
        logger.warn("http", "Observability HTTP server failed to start", {
          requestedPort,
          error: String(error),
        }),
      );
    }
  }

  createMainWindow();

  const publishSnapshot = (snapshotUpdate: BootstrapPayload["snapshot"]) => {
    if (isQuitting) {
      return;
    }
    safeSendToWindow(mainWindow, "runtime:snapshot", snapshotUpdate);
  };

  const snapshotListener = (snapshotUpdate: BootstrapPayload["snapshot"]) => {
    publishSnapshot(snapshotUpdate);
  };

  store.on("snapshot", snapshotListener);
  unsubscribeSnapshotListener = () => {
    store.off("snapshot", snapshotListener);
  };

  ipcMain.handle(
    "app:getBootstrap",
    async (): Promise<BootstrapPayload> => createBootstrapPayload(),
  );

  ipcMain.handle("runtime:refresh", async () => {
    await orchestrator.refreshNow();
  });

  ipcMain.handle("runtime:getIssue", async (_event, identifier: string) =>
    orchestrator.getIssueDetails(identifier),
  );
  ipcMain.handle("runtime:getLogs", async () => store.getSnapshot().logs);
  ipcMain.handle("integrations:list", async () => getTrackers());
  ipcMain.handle("workflow:getDocument", async () => workflowLoader.getDocument());
  ipcMain.handle("workflow:saveDocument", async (_event, contents: string) => {
    const document = workflowLoader.save(contents);
    try {
      await orchestrator.refreshNow();
    } catch (error) {
      logger.warn("workflow", "Workflow refresh after save failed", { error: String(error) });
      store.appendLog(
        logger.warn("workflow", "Workflow refresh after save failed", { error: String(error) }),
      );
    }
    return document;
  });
  ipcMain.handle("settings:get", async () => settingsStore.get());
  ipcMain.handle("settings:completeOnboarding", async () =>
    settingsStore.markOnboardingCompleted(),
  );
  ipcMain.handle("kanban:enable", async () => enableLocalKanban());
  ipcMain.handle("kanban:disable", async () => disableLocalKanban());
  ipcMain.handle("kanban:openWindow", async () => {
    openKanbanWindow();
  });
  ipcMain.handle("kanban:listBoards", async () => getKanbanBoards());
  ipcMain.handle("kanban:getBoard", async (_event, boardId: string | null | undefined) => {
    if (!settingsStore.get().localKanban.enabled) {
      return null;
    }
    return kanbanStore.getBoard(boardId);
  });
  ipcMain.handle("kanban:createTask", async (_event, input: CreateKanbanTaskInput) =>
    runKanbanMutation(() => kanbanStore.createTask(input)),
  );
  ipcMain.handle("kanban:updateTask", async (_event, input: UpdateKanbanTaskInput) =>
    runKanbanMutation(() => kanbanStore.updateTask(input)),
  );
  ipcMain.handle("kanban:moveTask", async (_event, input: MoveKanbanTaskInput) =>
    runKanbanMutation(() => kanbanStore.moveTask(input)),
  );
  ipcMain.handle("kanban:archiveTask", async (_event, taskId: string) =>
    runKanbanMutation(() => kanbanStore.archiveTask(taskId)),
  );
  ipcMain.handle("kanban:updateBoard", async (_event, input: UpdateKanbanBoardInput) =>
    runKanbanMutation(() => kanbanStore.updateBoard(input)),
  );
  ipcMain.handle("kanban:createColumn", async (_event, input: CreateKanbanColumnInput) =>
    runKanbanMutation(() => kanbanStore.createColumn(input)),
  );
  ipcMain.handle("kanban:updateColumn", async (_event, input: UpdateKanbanColumnInput) =>
    runKanbanMutation(() => kanbanStore.updateColumn(input)),
  );
});

app.on("activate", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    focusWindow(mainWindow);
    return;
  }

  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

app.on("window-all-closed", () => {
  isQuitting = true;
  unsubscribeSnapshotListener?.();
  unsubscribeSnapshotListener = null;
  if (process.platform !== "darwin") {
    orchestrator?.stop();
    httpServer?.stop();
    app.quit();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  unsubscribeSnapshotListener?.();
  unsubscribeSnapshotListener = null;
  orchestrator?.stop();
  httpServer?.stop();
});
