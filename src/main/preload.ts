import { contextBridge, ipcRenderer } from 'electron'
import type { SymphonyApi } from '@shared/ipc'
import type { OrchestratorSnapshot } from '@shared/types'

const api: SymphonyApi = {
  getBootstrap: () => ipcRenderer.invoke('app:getBootstrap'),
  refreshRuntime: () => ipcRenderer.invoke('runtime:refresh'),
  getIssue: (identifier) => ipcRenderer.invoke('runtime:getIssue', identifier),
  getLogs: () => ipcRenderer.invoke('runtime:getLogs'),
  listIntegrations: () => ipcRenderer.invoke('integrations:list'),
  getWorkflowDocument: () => ipcRenderer.invoke('workflow:getDocument'),
  saveWorkflowDocument: (contents) => ipcRenderer.invoke('workflow:saveDocument', contents),
  onSnapshot: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, snapshot: OrchestratorSnapshot) => listener(snapshot)
    ipcRenderer.on('runtime:snapshot', wrapped)
    return () => ipcRenderer.removeListener('runtime:snapshot', wrapped)
  },
}

contextBridge.exposeInMainWorld('symphony', api)
