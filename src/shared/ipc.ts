import type {
  AppSettings,
  BootstrapPayload,
  CreateKanbanColumnInput,
  CreateKanbanTaskInput,
  KanbanBoard,
  KanbanBoardPayload,
  MoveKanbanTaskInput,
  NormalizedIssue,
  OrchestratorSnapshot,
  RuntimeLogEntry,
  TrackerDescriptor,
  UpdateKanbanBoardInput,
  UpdateKanbanColumnInput,
  UpdateKanbanTaskInput,
  WorkflowDocument,
} from "./types";

export interface SymphonyApi {
  getBootstrap(): Promise<BootstrapPayload>;
  refreshRuntime(): Promise<void>;
  getIssue(identifier: string): Promise<NormalizedIssue | null>;
  getLogs(): Promise<RuntimeLogEntry[]>;
  listIntegrations(): Promise<TrackerDescriptor[]>;
  getWorkflowDocument(): Promise<WorkflowDocument>;
  saveWorkflowDocument(contents: string): Promise<WorkflowDocument>;
  getSettings(): Promise<AppSettings>;
  completeOnboarding(): Promise<AppSettings>;
  enableLocalKanban(): Promise<AppSettings>;
  disableLocalKanban(): Promise<AppSettings>;
  openKanbanWindow(): Promise<void>;
  listKanbanBoards(): Promise<KanbanBoard[]>;
  getKanbanBoard(boardId?: string | null): Promise<KanbanBoardPayload | null>;
  createKanbanTask(input: CreateKanbanTaskInput): Promise<KanbanBoardPayload>;
  updateKanbanTask(input: UpdateKanbanTaskInput): Promise<KanbanBoardPayload>;
  moveKanbanTask(input: MoveKanbanTaskInput): Promise<KanbanBoardPayload>;
  archiveKanbanTask(taskId: string): Promise<KanbanBoardPayload>;
  updateKanbanBoard(input: UpdateKanbanBoardInput): Promise<KanbanBoardPayload>;
  createKanbanColumn(input: CreateKanbanColumnInput): Promise<KanbanBoardPayload>;
  updateKanbanColumn(input: UpdateKanbanColumnInput): Promise<KanbanBoardPayload>;
  onBootstrap(listener: (bootstrap: BootstrapPayload) => void): () => void;
  onKanbanBoardChange(listener: (board: KanbanBoardPayload | null) => void): () => void;
  onSnapshot(listener: (snapshot: OrchestratorSnapshot) => void): () => void;
}

declare global {
  interface Window {
    symphony: SymphonyApi;
  }
}
