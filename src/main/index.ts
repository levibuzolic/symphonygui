import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import type { BootstrapPayload } from '@shared/types'
import { WorkflowLoader } from './runtime/workflow-loader'
import { ObservabilityStore } from './runtime/observability-store'
import { RuntimeLogger } from './runtime/logger'
import { TrackerRegistry } from './tracker/registry'
import { LinearTrackerAdapter } from './tracker/linear-adapter'
import { MemoryTrackerAdapter } from './tracker/memory-adapter'
import { Orchestrator } from './runtime/orchestrator'
import { ObservabilityHttpServer } from './http/observability-http-server'
import { safeSendToWindow } from './window-publisher'
import { createWindowStateStore } from './services/window-state'

const workflowLoader = new WorkflowLoader()
const store = new ObservabilityStore()
const logger = new RuntimeLogger()
const registry = new TrackerRegistry(new Map([
  ['linear', new LinearTrackerAdapter()],
  ['memory', new MemoryTrackerAdapter()],
]))
const orchestrator = new Orchestrator(workflowLoader, registry, store, logger)
const httpServer = new ObservabilityHttpServer(store, orchestrator)

let mainWindow: BrowserWindow | null = null
let unsubscribeSnapshotListener: (() => void) | null = null
let isQuitting = false
let persistWindowStateTimeout: NodeJS.Timeout | null = null

const hasSingleInstanceLock = app.requestSingleInstanceLock()
const windowStateStore = createWindowStateStore(app.getPath('userData'))

if (!hasSingleInstanceLock) {
  app.quit()
}

function focusWindow(targetWindow: BrowserWindow | null) {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return
  }

  if (targetWindow.isMinimized()) {
    targetWindow.restore()
  }

  targetWindow.focus()
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    focusWindow(mainWindow)
    return mainWindow
  }

  const windowState = windowStateStore.load()
  mainWindow = new BrowserWindow({
    width: windowState.bounds.width,
    height: windowState.bounds.height,
    x: windowState.bounds.x,
    y: windowState.bounds.y,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: '#050505',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
    },
    show: !process.env.SYMPHONY_SMOKE_TEST,
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  if (process.env.SYMPHONY_SMOKE_TEST) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => app.quit(), 300)
    })
  }

  if (windowState.isMaximized) {
    mainWindow.maximize()
  }

  const persistWindowState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return
    }

    windowStateStore.save({
      bounds: mainWindow.isMaximized() ? mainWindow.getNormalBounds() : mainWindow.getBounds(),
      isMaximized: mainWindow.isMaximized(),
    })
  }

  const schedulePersistWindowState = () => {
    if (persistWindowStateTimeout) {
      clearTimeout(persistWindowStateTimeout)
    }

    persistWindowStateTimeout = setTimeout(() => {
      persistWindowStateTimeout = null
      persistWindowState()
    }, 150)
  }

  mainWindow.on('move', schedulePersistWindowState)
  mainWindow.on('resize', schedulePersistWindowState)
  mainWindow.on('maximize', schedulePersistWindowState)
  mainWindow.on('unmaximize', schedulePersistWindowState)
  mainWindow.on('close', persistWindowState)
  mainWindow.on('closed', () => {
    if (persistWindowStateTimeout) {
      clearTimeout(persistWindowStateTimeout)
      persistWindowStateTimeout = null
    }
    mainWindow = null
  })

  return mainWindow
}

app.on('second-instance', () => {
  focusWindow(mainWindow)
})

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) {
    return
  }

  await orchestrator.start()
  const snapshot = store.getSnapshot()
  if (snapshot.workflowPath && !snapshot.errors.length) {
    const requestedPort = 43119
    try {
      const actualPort = await httpServer.start(requestedPort)
      logger.info('http', 'Observability HTTP server started', { requestedPort, actualPort })
      store.appendLog(logger.info('http', 'Observability HTTP server started', { requestedPort, actualPort }))
    } catch (error) {
      logger.warn('http', 'Observability HTTP server failed to start', { requestedPort, error: String(error) })
      store.appendLog(logger.warn('http', 'Observability HTTP server failed to start', { requestedPort, error: String(error) }))
    }
  }
  createWindow()

  const publishSnapshot = (snapshotUpdate: BootstrapPayload['snapshot']) => {
    if (isQuitting) {
      return
    }
    safeSendToWindow(mainWindow, 'runtime:snapshot', snapshotUpdate)
  }

  const snapshotListener = (snapshotUpdate: BootstrapPayload['snapshot']) => {
    publishSnapshot(snapshotUpdate)
  }

  store.on('snapshot', snapshotListener)
  unsubscribeSnapshotListener = () => {
    store.off('snapshot', snapshotListener)
  }

  ipcMain.handle('app:getBootstrap', async (): Promise<BootstrapPayload> => ({
    snapshot: store.getSnapshot(),
    trackers: registry.list(),
    isDevelopment: !app.isPackaged,
  }))

  ipcMain.handle('runtime:refresh', async () => {
    await orchestrator.refreshNow()
  })

  ipcMain.handle('runtime:getIssue', async (_event, identifier: string) => orchestrator.getIssueDetails(identifier))
  ipcMain.handle('runtime:getLogs', async () => store.getSnapshot().logs)
  ipcMain.handle('integrations:list', async () => registry.list())
  ipcMain.handle('workflow:getDocument', async () => workflowLoader.getDocument())
  ipcMain.handle('workflow:saveDocument', async (_event, contents: string) => {
    const document = workflowLoader.save(contents)
    try {
      await orchestrator.refreshNow()
    } catch (error) {
      logger.warn('workflow', 'Workflow refresh after save failed', { error: String(error) })
      store.appendLog(logger.warn('workflow', 'Workflow refresh after save failed', { error: String(error) }))
    }
    return document
  })
})

app.on('activate', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    focusWindow(mainWindow)
    return
  }

  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('window-all-closed', () => {
  isQuitting = true
  unsubscribeSnapshotListener?.()
  unsubscribeSnapshotListener = null
  if (process.platform !== 'darwin') {
    orchestrator.stop()
    httpServer.stop()
    app.quit()
  }
})

app.on('before-quit', () => {
  isQuitting = true
  unsubscribeSnapshotListener?.()
  unsubscribeSnapshotListener = null
  orchestrator.stop()
  httpServer.stop()
})
