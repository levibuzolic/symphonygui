import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { implementationProgress } from '@shared/progress'
import type { BootstrapPayload } from '@shared/types'
import { WorkflowLoader } from './runtime/workflow-loader'
import { ObservabilityStore } from './runtime/observability-store'
import { RuntimeLogger } from './runtime/logger'
import { TrackerRegistry } from './tracker/registry'
import { LinearTrackerAdapter } from './tracker/linear-adapter'
import { MemoryTrackerAdapter } from './tracker/memory-adapter'
import { Orchestrator } from './runtime/orchestrator'
import { ObservabilityHttpServer } from './http/observability-http-server'

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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1560,
    height: 980,
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

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
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
    const targetWindow = mainWindow
    if (!targetWindow || targetWindow.isDestroyed()) {
      return
    }

    const contents = targetWindow.webContents
    if (contents.isDestroyed() || contents.isCrashed()) {
      return
    }

    try {
      contents.send('runtime:snapshot', snapshotUpdate)
    } catch {
      // Ignore late sends during shutdown / HMR teardown.
    }
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
    progress: implementationProgress,
    trackers: registry.list(),
    isDevelopment: !app.isPackaged,
  }))

  ipcMain.handle('runtime:refresh', async () => {
    await orchestrator.refreshNow()
  })

  ipcMain.handle('runtime:getIssue', async (_event, identifier: string) => orchestrator.getIssueDetails(identifier))
  ipcMain.handle('runtime:getLogs', async () => store.getSnapshot().logs)
  ipcMain.handle('integrations:list', async () => registry.list())
  ipcMain.handle('progress:get', async () => implementationProgress)
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
