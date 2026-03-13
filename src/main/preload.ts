import { contextBridge, ipcRenderer } from "electron";
import type { SymphonyApi } from "@shared/ipc";
import type { OrchestratorSnapshot } from "@shared/types";

const api: SymphonyApi = {
  getBootstrap: () => ipcRenderer.invoke("app:getBootstrap"),
  refreshRuntime: () => ipcRenderer.invoke("runtime:refresh"),
  getIssue: (identifier) => ipcRenderer.invoke("runtime:getIssue", identifier),
  getLogs: () => ipcRenderer.invoke("runtime:getLogs"),
  listIntegrations: () => ipcRenderer.invoke("integrations:list"),
  getWorkflowDocument: () => ipcRenderer.invoke("workflow:getDocument"),
  saveWorkflowDocument: (contents) => ipcRenderer.invoke("workflow:saveDocument", contents),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  completeOnboarding: () => ipcRenderer.invoke("settings:completeOnboarding"),
  enableLocalKanban: () => ipcRenderer.invoke("kanban:enable"),
  disableLocalKanban: () => ipcRenderer.invoke("kanban:disable"),
  openKanbanWindow: () => ipcRenderer.invoke("kanban:openWindow"),
  listKanbanBoards: () => ipcRenderer.invoke("kanban:listBoards"),
  getKanbanBoard: (boardId) => ipcRenderer.invoke("kanban:getBoard", boardId),
  createKanbanTask: (input) => ipcRenderer.invoke("kanban:createTask", input),
  updateKanbanTask: (input) => ipcRenderer.invoke("kanban:updateTask", input),
  moveKanbanTask: (input) => ipcRenderer.invoke("kanban:moveTask", input),
  archiveKanbanTask: (taskId) => ipcRenderer.invoke("kanban:archiveTask", taskId),
  updateKanbanBoard: (input) => ipcRenderer.invoke("kanban:updateBoard", input),
  createKanbanColumn: (input) => ipcRenderer.invoke("kanban:createColumn", input),
  updateKanbanColumn: (input) => ipcRenderer.invoke("kanban:updateColumn", input),
  onSnapshot: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, snapshot: OrchestratorSnapshot) =>
      listener(snapshot);
    ipcRenderer.on("runtime:snapshot", wrapped);
    return () => ipcRenderer.removeListener("runtime:snapshot", wrapped);
  },
};

contextBridge.exposeInMainWorld("symphony", api);
