import type { ChangeEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Archive,
  ArrowUpRight,
  GripVertical,
  PencilLine,
  Plus,
  RefreshCw,
  Settings2,
  Sparkles,
} from "lucide-react";
import type { SymphonyApi } from "@shared/ipc";
import type { BootstrapPayload, KanbanBoardPayload, KanbanTask } from "@shared/types";
import { cn } from "@shared/utils";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@renderer/components/ui/card";
import { Input } from "@renderer/components/ui/input";
import { Textarea } from "@renderer/components/ui/textarea";

type TaskDraft = {
  id: string | null;
  title: string;
  description: string;
  priority: string;
  columnId: string;
  labels: string;
};

type ColumnDraft = {
  id: string | null;
  name: string;
  isActive: boolean;
  isTerminal: boolean;
};

type KanbanWindowProps = {
  bootstrap: BootstrapPayload;
  mode?: "embedded" | "window";
  onOpenDetached?: () => void;
};

export function KanbanWindow({ bootstrap, mode = "window", onOpenDetached }: KanbanWindowProps) {
  const symphony = (globalThis as typeof globalThis & { symphony: SymphonyApi }).symphony;
  const [board, setBoard] = useState<KanbanBoardPayload | null>(null);
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [boardNameDraft, setBoardNameDraft] = useState("");
  const [columnDraft, setColumnDraft] = useState<ColumnDraft | null>(null);
  const [showBoardSettings, setShowBoardSettings] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const isDetached = mode === "window";

  useEffect(() => {
    if (!bootstrap.settings.localKanban.enabled) {
      setBoard(null);
      return;
    }

    const boardId =
      bootstrap.settings.localKanban.lastOpenedBoardId ?? bootstrap.kanbanBoards[0]?.id ?? null;
    void symphony.getKanbanBoard(boardId).then((payload) => setBoard(payload));
  }, [
    bootstrap.kanbanBoards,
    bootstrap.settings.localKanban.enabled,
    bootstrap.settings.localKanban.lastOpenedBoardId,
    symphony,
  ]);

  useEffect(
    () =>
      symphony.onKanbanBoardChange((payload) => {
        setBoard((current) => {
          if (!payload) {
            return null;
          }
          if (current && current.board.id !== payload.board.id) {
            return current;
          }
          return payload;
        });
      }),
    [symphony],
  );

  const tasksByColumn = useMemo(() => {
    const next = new Map<string, KanbanTask[]>();
    for (const column of board?.columns ?? []) {
      next.set(
        column.id,
        (board?.tasks ?? [])
          .filter((task) => task.columnId === column.id)
          .sort((a, b) => a.position - b.position),
      );
    }
    return next;
  }, [board]);

  async function refreshBoard() {
    const next = await symphony.getKanbanBoard(board?.board.id ?? null);
    setBoard(next);
  }

  async function handleUpdateBoard() {
    if (!board) {
      return;
    }

    const payload = await symphony.updateKanbanBoard({
      boardId: board.board.id,
      name: boardNameDraft.trim() || board.board.name,
    });
    setBoard(payload);
    setShowBoardSettings(false);
  }

  async function handleCreateOrUpdateColumn() {
    if (!board || !columnDraft || !columnDraft.name.trim()) {
      return;
    }

    const payload = columnDraft.id
      ? await symphony.updateKanbanColumn({
          id: columnDraft.id,
          name: columnDraft.name.trim(),
          isActive: columnDraft.isActive,
          isTerminal: columnDraft.isTerminal,
        })
      : await symphony.createKanbanColumn({
          boardId: board.board.id,
          name: columnDraft.name.trim(),
          isActive: columnDraft.isActive,
          isTerminal: columnDraft.isTerminal,
        });
    setBoard(payload);
    setColumnDraft(null);
  }

  async function handleCreateOrUpdateTask() {
    if (!draft || !board || !draft.title.trim()) {
      return;
    }

    const priority = draft.priority ? Number.parseInt(draft.priority, 10) : null;
    const payload = draft.id
      ? await symphony.updateKanbanTask({
          id: draft.id,
          title: draft.title.trim(),
          description: draft.description.trim() || null,
          priority: Number.isFinite(priority) ? priority : null,
          columnId: draft.columnId,
          labels: parseLabels(draft.labels),
        })
      : await symphony.createKanbanTask({
          boardId: board.board.id,
          columnId: draft.columnId,
          title: draft.title.trim(),
          description: draft.description.trim() || null,
          priority: Number.isFinite(priority) ? priority : null,
          labels: parseLabels(draft.labels),
        });
    setBoard(payload);
    setDraft(null);
  }

  async function handleArchiveTask(taskId: string) {
    const payload = await symphony.archiveKanbanTask(taskId);
    setBoard(payload);
    setDraft(null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const over = event.over;
    if (!board || !over || event.active.id === over.id) {
      return;
    }

    const activeTask = board.tasks.find((task) => task.id === event.active.id);
    const overTask = board.tasks.find((task) => task.id === over.id);
    const overColumnId = overTask?.columnId ?? String(over.id);
    if (!activeTask || !overColumnId) {
      return;
    }

    const columnTasks = tasksByColumn.get(overColumnId) ?? [];
    const targetPosition = overTask
      ? columnTasks.findIndex((task) => task.id === overTask.id)
      : columnTasks.length;
    const payload = await symphony.moveKanbanTask({
      taskId: activeTask.id,
      targetColumnId: overColumnId,
      targetPosition: Math.max(targetPosition, 0),
    });
    setBoard(payload);
  }

  if (!bootstrap.settings.localKanban.enabled) {
    return (
      <div
        className={cn("flex h-full min-h-0 items-center justify-center", isDetached && "h-screen")}
      >
        <Card className="w-full max-w-xl border-white/8 bg-black/35">
          <CardHeader>
            <CardTitle>Local Kanban is disabled</CardTitle>
            <CardDescription>
              Enable the local board from Integrations or Settings to use the embedded workspace.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!board) {
    return (
      <div
        className={cn("flex h-full min-h-0 items-center justify-center", isDetached && "h-screen")}
      >
        <Card className="w-full max-w-xl border-white/8 bg-black/35">
          <CardHeader>
            <CardTitle>Loading Local Kanban</CardTitle>
            <CardDescription>
              Fetching the latest board state from the local tracker.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const activeCount = board.columns.filter((column) => column.isActive).length;
  const terminalCount = board.columns.filter((column) => column.isTerminal).length;

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-col overflow-hidden text-foreground",
        isDetached &&
          "h-screen bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_18%),var(--background)]",
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-start justify-between gap-4 border-b border-white/5 px-6 py-5",
          isDetached ? "app-drag" : "rounded-[24px] border bg-black/25",
        )}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-white/10 bg-white/[0.04] text-zinc-200">Local Kanban</Badge>
            <Badge variant="outline">{board.tasks.length} open tasks</Badge>
            <Badge variant="outline">{activeCount} active lanes</Badge>
            <Badge variant="outline">{terminalCount} terminal lanes</Badge>
          </div>
          <h2 className="mt-3 truncate text-3xl font-semibold tracking-tight text-white">
            {board.board.name}
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-zinc-400">
            Shared board state is pushed through the Electron main process so the integrated view
            and detached window stay in lockstep.
          </p>
        </div>
        <div
          className={cn(
            "flex shrink-0 flex-wrap items-center justify-end gap-2",
            isDetached && "app-no-drag",
          )}
        >
          {!isDetached && onOpenDetached ? (
            <Button type="button" variant="outline" className="gap-2" onClick={onOpenDetached}>
              <ArrowUpRight className="h-4 w-4" />
              Open Window
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => void refreshBoard()}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => {
              setBoardNameDraft(board.board.name);
              setShowBoardSettings(true);
            }}
          >
            <Settings2 className="h-4 w-4" />
            Board Settings
          </Button>
          <Button
            type="button"
            className="gap-2"
            onClick={() =>
              setDraft({
                id: null,
                title: "",
                description: "",
                priority: "",
                columnId: board.columns[0]?.id ?? "",
                labels: "",
              })
            }
          >
            <Plus className="h-4 w-4" />
            New Task
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(event) => void handleDragEnd(event)}
        >
          <div className="h-full min-h-0 overflow-x-auto overflow-y-hidden">
            <div
              className={cn("flex min-h-full gap-4 pb-2", isDetached ? "px-6 py-6" : "px-6 pt-6")}
            >
              {board.columns.map((column) => {
                const tasks = tasksByColumn.get(column.id) ?? [];
                return (
                  <Card
                    key={column.id}
                    className="flex h-full min-h-0 w-[320px] min-w-[320px] flex-col border-white/8 bg-black/35"
                  >
                    <CardHeader className="shrink-0 border-b border-white/5 pb-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <CardTitle className="truncate text-lg">{column.name}</CardTitle>
                          <CardDescription>
                            {column.isTerminal
                              ? "Terminal lane"
                              : column.isActive
                                ? "Dispatchable work"
                                : "Holding lane"}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{tasks.length}</Badge>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              setColumnDraft({
                                id: column.id,
                                name: column.name,
                                isActive: column.isActive,
                                isTerminal: column.isTerminal,
                              })
                            }
                            aria-label={`Edit ${column.name}`}
                          >
                            <PencilLine className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pt-5">
                      <SortableContext
                        items={tasks.map((task) => task.id)}
                        strategy={rectSortingStrategy}
                      >
                        <ColumnDropZone columnId={column.id}>
                          {tasks.length === 0 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-auto rounded-2xl border border-dashed border-white/10 px-4 py-8 text-left text-sm text-zinc-400 hover:border-white/20 hover:bg-white/[0.03]"
                              onClick={() =>
                                setDraft({
                                  id: null,
                                  title: "",
                                  description: "",
                                  priority: "",
                                  columnId: column.id,
                                  labels: "",
                                })
                              }
                            >
                              Drop a task here or create one in {column.name}.
                            </Button>
                          ) : (
                            tasks.map((task) => (
                              <TaskCard
                                key={task.id}
                                task={task}
                                onEdit={() =>
                                  setDraft({
                                    id: task.id,
                                    title: task.title,
                                    description: task.description ?? "",
                                    priority: task.priority != null ? String(task.priority) : "",
                                    columnId: task.columnId,
                                    labels: task.labels.join(", "),
                                  })
                                }
                              />
                            ))
                          )}
                        </ColumnDropZone>
                      </SortableContext>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </DndContext>
      </div>

      {draft ? (
        <ModalShell>
          <Card className="w-full max-w-2xl border-white/10 bg-zinc-950">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-zinc-300">
                    <Sparkles className="h-3.5 w-3.5" />
                    Task Editor
                  </div>
                  <CardTitle className="text-2xl">
                    {draft.id ? "Edit task" : "Create task"}
                  </CardTitle>
                  <CardDescription>
                    Task updates persist directly to the shared local board.
                  </CardDescription>
                </div>
                <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                  Close
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="block space-y-2">
                <span className="text-sm text-zinc-400">Title</span>
                <Input
                  value={draft.title}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setDraft({
                      ...draft,
                      title: String((event.target as { value?: unknown }).value ?? ""),
                    })
                  }
                />
              </label>

              <div className="space-y-2">
                <span className="text-sm text-zinc-400">Column</span>
                <div className="flex flex-wrap gap-2">
                  {board.columns.map((column) => (
                    <Button
                      key={column.id}
                      type="button"
                      variant={draft.columnId === column.id ? "secondary" : "outline"}
                      onClick={() => setDraft({ ...draft, columnId: column.id })}
                    >
                      {column.name}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[160px_minmax(0,1fr)]">
                <label className="block space-y-2">
                  <span className="text-sm text-zinc-400">Priority</span>
                  <Input
                    value={draft.priority}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setDraft({
                        ...draft,
                        priority: String((event.target as { value?: unknown }).value ?? ""),
                      })
                    }
                    placeholder="1"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm text-zinc-400">Labels</span>
                  <Input
                    value={draft.labels}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setDraft({
                        ...draft,
                        labels: String((event.target as { value?: unknown }).value ?? ""),
                      })
                    }
                    placeholder="ops, review, ready"
                  />
                </label>
              </div>

              <label className="block space-y-2">
                <span className="text-sm text-zinc-400">Description</span>
                <Textarea
                  value={draft.description}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                    setDraft({
                      ...draft,
                      description: String((event.target as { value?: unknown }).value ?? ""),
                    })
                  }
                  className="min-h-36 resize-none"
                />
              </label>

              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-zinc-500">
                  Changes replicate to every open kanban view.
                </div>
                <div className="flex items-center gap-2">
                  {draft.id ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2"
                      onClick={() => void handleArchiveTask(draft.id!)}
                    >
                      <Archive className="h-4 w-4" />
                      Archive
                    </Button>
                  ) : null}
                  <Button type="button" onClick={() => void handleCreateOrUpdateTask()}>
                    {draft.id ? "Save Task" : "Create Task"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </ModalShell>
      ) : null}

      {showBoardSettings ? (
        <ModalShell>
          <Card className="w-full max-w-xl border-white/10 bg-zinc-950">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-zinc-300">
                    <Settings2 className="h-3.5 w-3.5" />
                    Board Settings
                  </div>
                  <CardTitle className="text-2xl">Edit board</CardTitle>
                </div>
                <Button type="button" variant="ghost" onClick={() => setShowBoardSettings(false)}>
                  Close
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="block space-y-2">
                <span className="text-sm text-zinc-400">Board name</span>
                <Input
                  value={boardNameDraft}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setBoardNameDraft(String((event.target as { value?: unknown }).value ?? ""))
                  }
                />
              </label>

              <Card className="border-white/8 bg-black/25">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">Columns</CardTitle>
                      <CardDescription>Lane definitions shared across both modes.</CardDescription>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowBoardSettings(false);
                        setColumnDraft({
                          id: null,
                          name: "",
                          isActive: false,
                          isTerminal: false,
                        });
                      }}
                    >
                      Add Column
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {board.columns.map((column) => (
                    <Button
                      key={column.id}
                      type="button"
                      variant="ghost"
                      className="h-auto w-full justify-between rounded-xl border border-white/8 bg-black/25 px-4 py-3 text-left hover:bg-white/[0.04]"
                      onClick={() => {
                        setShowBoardSettings(false);
                        setColumnDraft({
                          id: column.id,
                          name: column.name,
                          isActive: column.isActive,
                          isTerminal: column.isTerminal,
                        });
                      }}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-white">{column.name}</span>
                        <span className="block text-xs text-zinc-500">
                          {column.isTerminal
                            ? "Terminal lane"
                            : column.isActive
                              ? "Dispatchable lane"
                              : "Holding lane"}
                        </span>
                      </span>
                      <PencilLine className="h-4 w-4 text-zinc-500" />
                    </Button>
                  ))}
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button type="button" onClick={() => void handleUpdateBoard()}>
                  Save Board
                </Button>
              </div>
            </CardContent>
          </Card>
        </ModalShell>
      ) : null}

      {columnDraft ? (
        <ModalShell>
          <Card className="w-full max-w-xl border-white/10 bg-zinc-950">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-zinc-300">
                    <PencilLine className="h-3.5 w-3.5" />
                    Column Editor
                  </div>
                  <CardTitle className="text-2xl">
                    {columnDraft.id ? "Edit column" : "Create column"}
                  </CardTitle>
                </div>
                <Button type="button" variant="ghost" onClick={() => setColumnDraft(null)}>
                  Close
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="block space-y-2">
                <span className="text-sm text-zinc-400">Column name</span>
                <Input
                  value={columnDraft.name}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setColumnDraft({
                      ...columnDraft,
                      name: String((event.target as { value?: unknown }).value ?? ""),
                    })
                  }
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <ToggleTile
                  title="Dispatchable"
                  description="Eligible for active work."
                  active={columnDraft.isActive}
                  onToggle={() =>
                    setColumnDraft({ ...columnDraft, isActive: !columnDraft.isActive })
                  }
                />
                <ToggleTile
                  title="Terminal"
                  description="Marks work as complete."
                  active={columnDraft.isTerminal}
                  onToggle={() =>
                    setColumnDraft({ ...columnDraft, isTerminal: !columnDraft.isTerminal })
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setColumnDraft({ id: null, name: "", isActive: false, isTerminal: false })
                  }
                >
                  New Column
                </Button>
                <Button type="button" onClick={() => void handleCreateOrUpdateColumn()}>
                  {columnDraft.id ? "Save Column" : "Create Column"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </ModalShell>
      ) : null}
    </div>
  );
}

function TaskCard({ task, onEdit }: { task: KanbanTask; onEdit: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onEdit}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-4 text-left shadow-[0_18px_40px_rgba(0,0,0,0.35)] transition hover:border-white/14 hover:bg-white/[0.05]",
        isDragging && "opacity-70 ring-1 ring-white/20",
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">
            {task.identifier}
          </div>
          <div className="mt-2 line-clamp-2 text-base font-medium text-white">{task.title}</div>
        </div>
        <span
          {...attributes}
          {...listeners}
          className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/30 text-zinc-400"
          onClick={(event) => event.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </span>
      </div>
      <div className="line-clamp-3 text-sm text-zinc-400">
        {task.description ?? "No description yet."}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap gap-2">
          {task.labels.map((label) => (
            <Badge key={label} variant="outline" className="max-w-full truncate">
              {label}
            </Badge>
          ))}
        </div>
        <div className="shrink-0 text-xs text-zinc-500">
          {task.priority != null ? `P${task.priority}` : "No priority"}
        </div>
      </div>
    </button>
  );
}

function ColumnDropZone({ columnId, children }: { columnId: string; children: ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: columnId });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-full flex-col gap-3 rounded-3xl transition",
        isOver && "bg-white/[0.03]",
      )}
    >
      {children}
    </div>
  );
}

function ModalShell({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 px-6 py-10">
      {children}
    </div>
  );
}

function ToggleTile({
  title,
  description,
  active,
  onToggle,
}: {
  title: string;
  description: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" onClick={onToggle} className="text-left">
      <Card
        className={cn(
          "border px-4 py-4 transition",
          active
            ? "border-white/18 bg-white/[0.08] text-white"
            : "border-white/8 bg-white/[0.03] text-zinc-300",
        )}
      >
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-1 text-xs text-zinc-500">{description}</div>
      </Card>
    </button>
  );
}

function parseLabels(value: string) {
  return value
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);
}
