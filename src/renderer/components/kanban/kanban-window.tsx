import type { ChangeEvent, ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Archive, GripVertical, PencilLine, Plus, Settings2, Sparkles } from 'lucide-react'
import type { SymphonyApi } from '@shared/ipc'
import type { BootstrapPayload, KanbanBoardPayload, KanbanTask } from '@shared/types'
import { cn } from '@shared/utils'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'

type TaskDraft = {
  id: string | null
  title: string
  description: string
  priority: string
  columnId: string
  labels: string
}

type ColumnDraft = {
  id: string | null
  name: string
  isActive: boolean
  isTerminal: boolean
}

export function KanbanWindow({
  bootstrap,
  onBootstrapRefresh,
}: {
  bootstrap: BootstrapPayload
  onBootstrapRefresh: (next: BootstrapPayload) => void
}) {
  const symphony = (globalThis as typeof globalThis & { symphony: SymphonyApi }).symphony
  const [board, setBoard] = useState<KanbanBoardPayload | null>(null)
  const [draft, setDraft] = useState<TaskDraft | null>(null)
  const [boardNameDraft, setBoardNameDraft] = useState('')
  const [columnDraft, setColumnDraft] = useState<ColumnDraft | null>(null)
  const [showBoardSettings, setShowBoardSettings] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => {
    const boardId = bootstrap.settings.localKanban.lastOpenedBoardId ?? bootstrap.kanbanBoards[0]?.id ?? null
    void symphony.getKanbanBoard(boardId).then((payload) => setBoard(payload))
  }, [bootstrap.kanbanBoards, bootstrap.settings.localKanban.lastOpenedBoardId, symphony])

  const tasksByColumn = useMemo(() => {
    const next = new Map<string, KanbanTask[]>()
    for (const column of board?.columns ?? []) {
      next.set(column.id, (board?.tasks ?? []).filter((task) => task.columnId === column.id).sort((a, b) => a.position - b.position))
    }
    return next
  }, [board])

  async function refreshBoard() {
    const next = await symphony.getKanbanBoard(board?.board.id ?? null)
    setBoard(next)
  }

  async function handleUpdateBoard() {
    if (!board) return
    const payload = await symphony.updateKanbanBoard({
      boardId: board.board.id,
      name: boardNameDraft.trim() || board.board.name,
    })
    setBoard(payload)
    setShowBoardSettings(false)
    onBootstrapRefresh(await symphony.getBootstrap())
  }

  async function handleCreateOrUpdateColumn() {
    if (!board || !columnDraft || !columnDraft.name.trim()) return
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
        })
    setBoard(payload)
    setColumnDraft(null)
    onBootstrapRefresh(await symphony.getBootstrap())
  }

  async function handleCreateOrUpdateTask() {
    if (!draft || !board || !draft.title.trim()) return
    const priority = draft.priority ? Number.parseInt(draft.priority, 10) : null
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
        })
    setBoard(payload)
    setDraft(null)
    onBootstrapRefresh(await symphony.getBootstrap())
  }

  async function handleArchiveTask(taskId: string) {
    const payload = await symphony.archiveKanbanTask(taskId)
    setBoard(payload)
    setDraft(null)
  }

  async function handleDragEnd(event: DragEndEvent) {
    const over = event.over
    if (!board || !over || event.active.id === over.id) return
    const activeTask = board.tasks.find((task) => task.id === event.active.id)
    const overTask = board.tasks.find((task) => task.id === over.id)
    const overColumnId = overTask?.columnId ?? String(over.id)
    if (!activeTask || !overColumnId) return
    const columnTasks = tasksByColumn.get(overColumnId) ?? []
    const targetPosition = overTask ? columnTasks.findIndex((task) => task.id === overTask.id) : columnTasks.length
    const payload = await symphony.moveKanbanTask({
      taskId: activeTask.id,
      targetColumnId: overColumnId,
      targetPosition: Math.max(targetPosition, 0),
    })
    setBoard(payload)
  }

  if (!board) {
    return <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">Loading Local Kanban…</div>
  }

  return (
    <div className="h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(252,211,77,0.12),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0)),var(--background)] text-foreground">
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/8 px-8 py-6">
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-amber-200/60">Local Kanban</div>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white">{board.board.name}</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">A built-in operating board for teams that want local task flow without relying on a separate tracker.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge className="border-white/10 bg-white/[0.05] text-zinc-200">{board.tasks.length} open tasks</Badge>
              <Badge className="border-white/10 bg-white/[0.05] text-zinc-200">{board.columns.filter((column) => column.isActive).length} active lanes</Badge>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" onClick={() => void refreshBoard()}>Refresh board</Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => {
                setBoardNameDraft(board.board.name)
                setShowBoardSettings(true)
              }}
            >
              <Settings2 className="h-4 w-4" />
              Board settings
            </Button>
            <Button
              type="button"
              onClick={() => setDraft({ id: null, title: '', description: '', priority: '', columnId: board.columns[0]?.id ?? '', labels: '' })}
              className="gap-2 bg-amber-300 text-black hover:bg-amber-200"
            >
              <Plus className="h-4 w-4" />
              New task
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto px-8 py-8">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void handleDragEnd(event)}>
            <div className="grid min-h-full grid-cols-1 gap-5 xl:grid-cols-5">
              {board.columns.map((column) => {
                const tasks = tasksByColumn.get(column.id) ?? []
                return (
                  <Card key={column.id} className="flex min-h-[70vh] flex-col border-white/8 bg-black/35 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur">
                    <CardHeader className="shrink-0 border-b border-white/6 pb-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <CardTitle className="text-lg">{column.name}</CardTitle>
                          <CardDescription>{column.isTerminal ? 'Terminal' : column.isActive ? 'Dispatchable' : 'Holding lane'}</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="border-amber-300/20 bg-amber-300/10 text-amber-100">{tasks.length}</Badge>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setColumnDraft({
                              id: column.id,
                              name: column.name,
                              isActive: column.isActive,
                              isTerminal: column.isTerminal,
                            })}
                            aria-label={`Edit ${column.name}`}
                          >
                            <PencilLine className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pt-5">
                      <SortableContext items={tasks.map((task) => task.id)} strategy={rectSortingStrategy}>
                        <ColumnDropZone columnId={column.id}>
                          {tasks.length === 0 ? (
                            <button
                              type="button"
                              className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-10 text-left text-sm text-zinc-500 transition hover:border-amber-200/25 hover:text-zinc-300"
                              onClick={() => setDraft({ id: null, title: '', description: '', priority: '', columnId: column.id, labels: '' })}
                            >
                              Drop a task here or create one in {column.name}.
                            </button>
                          ) : (
                            tasks.map((task) => (
                              <TaskCard key={task.id} task={task} onEdit={() => setDraft({
                                id: task.id,
                                title: task.title,
                                description: task.description ?? '',
                                priority: task.priority != null ? String(task.priority) : '',
                                columnId: task.columnId,
                                labels: task.labels.join(', '),
                              })}
                              />
                            ))
                          )}
                        </ColumnDropZone>
                      </SortableContext>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </DndContext>
        </div>
      </div>

      {draft ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/65 px-6">
          <div className="w-full max-w-2xl rounded-[28px] border border-white/10 bg-zinc-950 p-7 shadow-[0_28px_120px_rgba(0,0,0,0.7)]">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-amber-100">
                  <Sparkles className="h-3.5 w-3.5" />
                  Task editor
                </div>
                <h2 className="text-2xl font-semibold text-white">{draft.id ? 'Edit task' : 'Create task'}</h2>
              </div>
              <Button type="button" variant="ghost" onClick={() => setDraft(null)}>Close</Button>
            </div>

            <div className="space-y-4">
              <label className="block space-y-2">
                <span className="text-sm text-zinc-400">Title</span>
                <Input value={draft.title} onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, title: String((event.target as { value?: unknown }).value ?? '') })} />
              </label>
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_160px]">
                <label className="block space-y-2">
                  <span className="text-sm text-zinc-400">Column</span>
                  <select
                    value={draft.columnId}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) => setDraft({ ...draft, columnId: String((event.target as { value?: unknown }).value ?? '') })}
                    className="flex h-10 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm text-zinc-100 outline-none"
                  >
                    {board.columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
                  </select>
                </label>
                <label className="block space-y-2">
                  <span className="text-sm text-zinc-400">Priority</span>
                  <Input value={draft.priority} onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, priority: String((event.target as { value?: unknown }).value ?? '') })} placeholder="1" />
                </label>
              </div>
              <label className="block space-y-2">
                <span className="text-sm text-zinc-400">Labels</span>
                <Input
                  value={draft.labels}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, labels: String((event.target as { value?: unknown }).value ?? '') })}
                  placeholder="ops, demo, review"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm text-zinc-400">Description</span>
                <textarea
                  value={draft.description}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDraft({ ...draft, description: String((event.target as { value?: unknown }).value ?? '') })}
                  className="min-h-32 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-zinc-100 outline-none"
                />
              </label>
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <div className="text-sm text-zinc-500">Changes persist immediately to the local SQLite board.</div>
              <div className="flex items-center gap-3">
                {draft.id ? (
                  <Button type="button" variant="outline" className="gap-2" onClick={() => void handleArchiveTask(draft.id!)}>
                    <Archive className="h-4 w-4" />
                    Archive
                  </Button>
                ) : null}
                <Button type="button" onClick={() => void handleCreateOrUpdateTask()} className="bg-amber-300 text-black hover:bg-amber-200">
                  {draft.id ? 'Save task' : 'Create task'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showBoardSettings ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/65 px-6">
          <div className="w-full max-w-xl rounded-[28px] border border-white/10 bg-zinc-950 p-7 shadow-[0_28px_120px_rgba(0,0,0,0.7)]">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-zinc-300">
                  <Settings2 className="h-3.5 w-3.5" />
                  Board settings
                </div>
                <h2 className="text-2xl font-semibold text-white">Edit board</h2>
              </div>
              <Button type="button" variant="ghost" onClick={() => setShowBoardSettings(false)}>Close</Button>
            </div>

            <div className="space-y-4">
              <label className="block space-y-2">
                <span className="text-sm text-zinc-400">Board name</span>
                <Input value={boardNameDraft} onChange={(event: ChangeEvent<HTMLInputElement>) => setBoardNameDraft(String((event.target as { value?: unknown }).value ?? ''))} />
              </label>
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-white">Columns</div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowBoardSettings(false)
                      setColumnDraft({ id: null, name: '', isActive: false, isTerminal: false })
                    }}
                  >
                    Add column
                  </Button>
                </div>
                <div className="space-y-2">
                  {board.columns.map((column) => (
                    <button
                      key={column.id}
                      type="button"
                      onClick={() => {
                        setShowBoardSettings(false)
                        setColumnDraft({
                          id: column.id,
                          name: column.name,
                          isActive: column.isActive,
                          isTerminal: column.isTerminal,
                        })
                      }}
                      className="flex w-full items-center justify-between rounded-xl border border-white/8 bg-black/25 px-4 py-3 text-left hover:bg-white/[0.04]"
                    >
                      <div>
                        <div className="text-sm text-white">{column.name}</div>
                        <div className="text-xs text-zinc-500">{column.isTerminal ? 'Terminal' : column.isActive ? 'Dispatchable' : 'Holding lane'}</div>
                      </div>
                      <PencilLine className="h-4 w-4 text-zinc-500" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button type="button" onClick={() => void handleUpdateBoard()} className="bg-amber-300 text-black hover:bg-amber-200">Save board</Button>
            </div>
          </div>
        </div>
      ) : null}

      {columnDraft ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/65 px-6">
          <div className="w-full max-w-xl rounded-[28px] border border-white/10 bg-zinc-950 p-7 shadow-[0_28px_120px_rgba(0,0,0,0.7)]">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-zinc-300">
                  <PencilLine className="h-3.5 w-3.5" />
                  Column editor
                </div>
                <h2 className="text-2xl font-semibold text-white">{columnDraft.id ? 'Edit column' : 'Create column'}</h2>
              </div>
              <Button type="button" variant="ghost" onClick={() => setColumnDraft(null)}>Close</Button>
            </div>

            <div className="space-y-4">
              <label className="block space-y-2">
                <span className="text-sm text-zinc-400">Column name</span>
                <Input value={columnDraft.name} onChange={(event: ChangeEvent<HTMLInputElement>) => setColumnDraft({ ...columnDraft, name: String((event.target as { value?: unknown }).value ?? '') })} />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <ToggleTile
                  title="Dispatchable"
                  description="Eligible for active work."
                  active={columnDraft.isActive}
                  onToggle={() => setColumnDraft({ ...columnDraft, isActive: !columnDraft.isActive })}
                />
                <ToggleTile
                  title="Terminal"
                  description="Marks work as complete."
                  active={columnDraft.isTerminal}
                  onToggle={() => setColumnDraft({ ...columnDraft, isTerminal: !columnDraft.isTerminal })}
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setColumnDraft({ id: null, name: '', isActive: false, isTerminal: false })}
              >
                New column
              </Button>
              <Button type="button" onClick={() => void handleCreateOrUpdateColumn()} className="bg-amber-300 text-black hover:bg-amber-200">
                {columnDraft.id ? 'Save column' : 'Create column'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function TaskCard({ task, onEdit }: { task: KanbanTask; onEdit: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onEdit}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-4 text-left shadow-[0_18px_40px_rgba(0,0,0,0.35)] transition hover:border-amber-200/20 hover:bg-white/[0.08]',
        isDragging && 'opacity-70 ring-1 ring-amber-200/40',
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">{task.identifier}</div>
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
      <div className="line-clamp-3 text-sm text-zinc-400">{task.description ?? 'No description yet.'}</div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {task.labels.map((label) => (
            <Badge key={label} className="border-white/10 bg-white/[0.04] text-[10px] uppercase tracking-[0.16em] text-zinc-300">{label}</Badge>
          ))}
        </div>
        <div className="text-xs text-zinc-500">{task.priority != null ? `P${task.priority}` : 'No priority'}</div>
      </div>
    </button>
  )
}

function ColumnDropZone({ columnId, children }: { columnId: string; children: ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: columnId })
  return (
    <div ref={setNodeRef} className={cn('flex min-h-full flex-col gap-3 rounded-3xl transition', isOver && 'bg-amber-300/6')}>
      {children}
    </div>
  )
}

function parseLabels(value: string) {
  return value.split(',').map((label) => label.trim()).filter(Boolean)
}

function ToggleTile({
  title,
  description,
  active,
  onToggle,
}: {
  title: string
  description: string
  active: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'rounded-2xl border px-4 py-4 text-left transition',
        active ? 'border-amber-300/30 bg-amber-300/10 text-white' : 'border-white/8 bg-white/[0.03] text-zinc-300',
      )}
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-1 text-xs text-zinc-500">{description}</div>
    </button>
  )
}
