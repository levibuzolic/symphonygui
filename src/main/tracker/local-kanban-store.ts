import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type {
  CreateKanbanColumnInput,
  CreateKanbanTaskInput,
  KanbanBoard,
  KanbanBoardPayload,
  KanbanColumn,
  KanbanTask,
  MoveKanbanTaskInput,
  NormalizedIssue,
  UpdateKanbanBoardInput,
  UpdateKanbanColumnInput,
  UpdateKanbanTaskInput,
} from '@shared/types'

interface BoardRow {
  id: string
  name: string
  created_at: string
  updated_at: string
}

interface ColumnRow {
  id: string
  board_id: string
  name: string
  position: number
  is_active: number
  is_terminal: number
}

interface TaskRow {
  id: string
  board_id: string
  column_id: string
  identifier: string
  title: string
  description: string | null
  priority: number | null
  branch_name: string | null
  url: string | null
  position: number
  created_at: string
  updated_at: string
  archived_at: string | null
}

const DEFAULT_BOARD_ID = 'board-default'

export class LocalKanbanStore {
  private db: DatabaseSync

  constructor(private readonly databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true })
    this.db = new DatabaseSync(databasePath)
    this.db.exec('PRAGMA journal_mode = WAL;')
    this.migrate()
  }

  getDatabasePath() {
    return this.databasePath
  }

  initializeDefaults() {
    const boardCount = this.db.prepare('SELECT COUNT(*) as count FROM boards').get() as { count: number }
    if (boardCount.count > 0) {
      return this.listBoards()
    }

    const now = isoNow()
    const boardId = DEFAULT_BOARD_ID
    this.db.prepare(
      'INSERT INTO boards (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
    ).run(boardId, 'My Tasks', now, now)

    const columns = [
      { id: 'col-inbox', name: 'Inbox', position: 0, isActive: 0, isTerminal: 0 },
      { id: 'col-todo', name: 'Todo', position: 1, isActive: 1, isTerminal: 0 },
      { id: 'col-progress', name: 'In Progress', position: 2, isActive: 1, isTerminal: 0 },
      { id: 'col-blocked', name: 'Blocked', position: 3, isActive: 1, isTerminal: 0 },
      { id: 'col-done', name: 'Done', position: 4, isActive: 0, isTerminal: 1 },
    ]

    const insertColumn = this.db.prepare(
      'INSERT INTO columns (id, board_id, name, position, is_active, is_terminal) VALUES (?, ?, ?, ?, ?, ?)',
    )
    for (const column of columns) {
      insertColumn.run(column.id, boardId, column.name, column.position, column.isActive, column.isTerminal)
    }

    const taskId = 'task-demo-1'
    const identifier = 'LOCAL-1'
    this.db.prepare(
      `INSERT INTO tasks
        (id, board_id, column_id, identifier, title, description, priority, branch_name, url, position, created_at, updated_at, archived_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    ).run(
      taskId,
      boardId,
      'col-inbox',
      identifier,
      'Try moving this task',
      'Drag this card into Todo or In Progress, then open it to edit the details. Local Kanban can run as Symphony’s default tracker when no external integration is configured.',
      1,
      'local-1-try-moving-this-task',
      null,
      0,
      now,
      now,
    )

    this.db.prepare('INSERT INTO task_labels (task_id, label) VALUES (?, ?)').run(taskId, 'sample')
    return this.listBoards()
  }

  listBoards(): KanbanBoard[] {
    const rows = this.db.prepare('SELECT * FROM boards ORDER BY updated_at DESC').all() as unknown as BoardRow[]
    return rows.map(mapBoard)
  }

  getBoard(boardId?: string | null): KanbanBoardPayload | null {
    const boardRow = boardId
      ? (this.db.prepare('SELECT * FROM boards WHERE id = ?').get(boardId) as BoardRow | undefined)
      : (this.db.prepare('SELECT * FROM boards ORDER BY updated_at DESC LIMIT 1').get() as BoardRow | undefined)

    if (!boardRow) return null

    const columns = (this.db.prepare('SELECT * FROM columns WHERE board_id = ? ORDER BY position ASC').all(boardRow.id) as unknown as ColumnRow[]).map(mapColumn)
    const tasks = (this.db.prepare('SELECT * FROM tasks WHERE board_id = ? AND archived_at IS NULL ORDER BY position ASC, updated_at DESC').all(boardRow.id) as unknown as TaskRow[]).map((task) => this.mapTask(task))

    return {
      board: mapBoard(boardRow),
      columns,
      tasks,
    }
  }

  updateBoard(input: UpdateKanbanBoardInput) {
    const now = isoNow()
    this.db.prepare('UPDATE boards SET name = ?, updated_at = ? WHERE id = ?').run(input.name.trim() || 'My Tasks', now, input.boardId)
    return this.getBoard(input.boardId)!
  }

  createColumn(input: CreateKanbanColumnInput) {
    const positionRow = this.db.prepare('SELECT COALESCE(MAX(position), -1) as position FROM columns WHERE board_id = ?').get(input.boardId) as { position: number }
    const columnId = `col-${randomUUID()}`
    this.db.prepare(
      'INSERT INTO columns (id, board_id, name, position, is_active, is_terminal) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(
      columnId,
      input.boardId,
      input.name.trim() || 'New Column',
      positionRow.position + 1,
      input.isActive ? 1 : 0,
      input.isTerminal ? 1 : 0,
    )
    this.bumpBoard(input.boardId, isoNow())
    return this.getBoard(input.boardId)!
  }

  updateColumn(input: UpdateKanbanColumnInput) {
    const existing = this.db.prepare('SELECT board_id FROM columns WHERE id = ?').get(input.id) as { board_id: string } | undefined
    if (!existing) throw new Error(`unknown_column:${input.id}`)
    this.db.prepare(
      `UPDATE columns
       SET name = ?, is_active = COALESCE(?, is_active), is_terminal = COALESCE(?, is_terminal)
       WHERE id = ?`,
    ).run(
      input.name.trim() || 'Unnamed Column',
      typeof input.isActive === 'boolean' ? Number(input.isActive) : null,
      typeof input.isTerminal === 'boolean' ? Number(input.isTerminal) : null,
      input.id,
    )
    this.bumpBoard(existing.board_id, isoNow())
    return this.getBoard(existing.board_id)!
  }

  createTask(input: CreateKanbanTaskInput) {
    const now = isoNow()
    const taskId = `task-${randomUUID()}`
    const identifier = this.nextIdentifier()
    const position = this.nextTaskPosition(input.columnId)
    this.db.prepare(
      `INSERT INTO tasks
        (id, board_id, column_id, identifier, title, description, priority, branch_name, url, position, created_at, updated_at, archived_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    ).run(
      taskId,
      input.boardId,
      input.columnId,
      identifier,
      input.title,
      input.description ?? null,
      input.priority ?? null,
      toBranchName(identifier, input.title),
      null,
      position,
      now,
      now,
    )
    this.replaceLabels(taskId, normalizeLabels(input.labels ?? []))
    this.bumpBoard(input.boardId, now)
    return this.getBoard(input.boardId)!
  }

  updateTask(input: UpdateKanbanTaskInput) {
    const existing = this.db.prepare('SELECT board_id FROM tasks WHERE id = ?').get(input.id) as { board_id: string } | undefined
    if (!existing) throw new Error(`unknown_task:${input.id}`)
    const now = isoNow()
    this.db.prepare(
      `UPDATE tasks
       SET title = ?, description = ?, priority = ?, column_id = COALESCE(?, column_id), updated_at = ?
       WHERE id = ?`,
    ).run(input.title, input.description ?? null, input.priority ?? null, input.columnId ?? null, now, input.id)
    if (input.labels) {
      this.replaceLabels(input.id, normalizeLabels(input.labels))
    }
    this.bumpBoard(existing.board_id, now)
    return this.getBoard(existing.board_id)!
  }

  moveTask(input: MoveKanbanTaskInput) {
    const existing = this.db.prepare('SELECT board_id, column_id FROM tasks WHERE id = ?').get(input.taskId) as { board_id: string; column_id: string } | undefined
    if (!existing) throw new Error(`unknown_task:${input.taskId}`)
    const now = isoNow()
    const targetTasks = (this.db.prepare(
      'SELECT id FROM tasks WHERE column_id = ? AND archived_at IS NULL AND id != ? ORDER BY position ASC, updated_at DESC',
    ).all(input.targetColumnId, input.taskId) as unknown as Array<{ id: string }>)
    const nextOrder = [...targetTasks]
    nextOrder.splice(Math.min(Math.max(input.targetPosition, 0), nextOrder.length), 0, { id: input.taskId })

    try {
      this.db.exec('BEGIN')
      this.db.prepare('UPDATE tasks SET column_id = ?, updated_at = ? WHERE id = ?').run(input.targetColumnId, now, input.taskId)
      nextOrder.forEach((task, index) => {
        this.db.prepare('UPDATE tasks SET position = ?, updated_at = ? WHERE id = ?').run(index, now, task.id)
      })
      if (existing.column_id !== input.targetColumnId) {
        this.reindexColumn(existing.column_id, now)
      }
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    this.bumpBoard(existing.board_id, now)
    return this.getBoard(existing.board_id)!
  }

  archiveTask(taskId: string) {
    const existing = this.db.prepare('SELECT board_id FROM tasks WHERE id = ?').get(taskId) as { board_id: string } | undefined
    if (!existing) throw new Error(`unknown_task:${taskId}`)
    const now = isoNow()
    this.db.prepare('UPDATE tasks SET archived_at = ?, updated_at = ? WHERE id = ?').run(now, now, taskId)
    this.bumpBoard(existing.board_id, now)
    return this.getBoard(existing.board_id)!
  }

  fetchCandidateIssues(): NormalizedIssue[] {
    const rows = this.db.prepare(
      `SELECT tasks.*, columns.name as column_name
       FROM tasks
       INNER JOIN columns ON columns.id = tasks.column_id
       WHERE tasks.archived_at IS NULL AND columns.is_active = 1
       ORDER BY tasks.position ASC, tasks.updated_at DESC`,
    ).all() as unknown as Array<TaskRow & { column_name: string }>
    return rows.map((row) => this.toNormalizedIssue(row, row.column_name))
  }

  fetchTerminalIssues(): NormalizedIssue[] {
    const rows = this.db.prepare(
      `SELECT tasks.*, columns.name as column_name
       FROM tasks
       INNER JOIN columns ON columns.id = tasks.column_id
       WHERE tasks.archived_at IS NULL AND columns.is_terminal = 1
       ORDER BY tasks.position ASC, tasks.updated_at DESC`,
    ).all() as unknown as Array<TaskRow & { column_name: string }>
    return rows.map((row) => this.toNormalizedIssue(row, row.column_name))
  }

  fetchCurrentStates(issueIds: string[]) {
    if (issueIds.length === 0) return new Map<string, string>()
    const placeholders = issueIds.map(() => '?').join(', ')
    const rows = this.db.prepare(
      `SELECT tasks.id, columns.name as state
       FROM tasks
       INNER JOIN columns ON columns.id = tasks.column_id
       WHERE tasks.id IN (${placeholders})`,
    ).all(...issueIds) as unknown as Array<{ id: string; state: string }>
    return new Map(rows.map((row) => [row.id, row.state]))
  }

  fetchIssueByIdentifier(identifier: string): NormalizedIssue | null {
    const row = this.db.prepare(
      `SELECT tasks.*, columns.name as column_name
       FROM tasks
       INNER JOIN columns ON columns.id = tasks.column_id
       WHERE tasks.identifier = ? AND tasks.archived_at IS NULL`,
    ).get(identifier) as (TaskRow & { column_name: string }) | undefined
    return row ? this.toNormalizedIssue(row, row.column_name) : null
  }

  private mapTask(task: TaskRow): KanbanTask {
    const labels = (this.db.prepare('SELECT label FROM task_labels WHERE task_id = ? ORDER BY label ASC').all(task.id) as unknown as Array<{ label: string }>).map((row) => row.label)
    return {
      id: task.id,
      boardId: task.board_id,
      columnId: task.column_id,
      identifier: task.identifier,
      title: task.title,
      description: task.description,
      priority: task.priority,
      branchName: task.branch_name,
      url: task.url,
      position: task.position,
      labels,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
      archivedAt: task.archived_at,
    }
  }

  private toNormalizedIssue(task: TaskRow, state: string): NormalizedIssue {
    const taskPayload = this.mapTask(task)
    return {
      id: taskPayload.id,
      identifier: taskPayload.identifier,
      title: taskPayload.title,
      description: taskPayload.description,
      priority: taskPayload.priority,
      state,
      branchName: taskPayload.branchName,
      url: taskPayload.url,
      labels: taskPayload.labels,
      blockedBy: [],
      createdAt: taskPayload.createdAt,
      updatedAt: taskPayload.updatedAt,
      metadata: {
        boardId: taskPayload.boardId,
        columnId: taskPayload.columnId,
      },
    }
  }

  private nextIdentifier() {
    const row = this.db.prepare("SELECT identifier FROM tasks WHERE identifier LIKE 'LOCAL-%' ORDER BY CAST(SUBSTR(identifier, 7) AS INTEGER) DESC LIMIT 1").get() as { identifier?: string } | undefined
    const nextNumber = row?.identifier ? Number.parseInt(row.identifier.slice(6), 10) + 1 : 1
    return `LOCAL-${nextNumber}`
  }

  private nextTaskPosition(columnId: string) {
    const row = this.db.prepare('SELECT COALESCE(MAX(position), -1) as position FROM tasks WHERE column_id = ? AND archived_at IS NULL').get(columnId) as { position: number }
    return row.position + 1
  }

  private bumpBoard(boardId: string, now: string) {
    this.db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(now, boardId)
  }

  private reindexColumn(columnId: string, now: string) {
    const tasks = this.db.prepare(
      'SELECT id FROM tasks WHERE column_id = ? AND archived_at IS NULL ORDER BY position ASC, updated_at DESC',
    ).all(columnId) as unknown as Array<{ id: string }>
    tasks.forEach((task, index) => {
      this.db.prepare('UPDATE tasks SET position = ?, updated_at = ? WHERE id = ?').run(index, now, task.id)
    })
  }

  private replaceLabels(taskId: string, labels: string[]) {
    this.db.prepare('DELETE FROM task_labels WHERE task_id = ?').run(taskId)
    const insert = this.db.prepare('INSERT INTO task_labels (task_id, label) VALUES (?, ?)')
    labels.forEach((label) => insert.run(taskId, label))
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS boards (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS columns (
        id TEXT PRIMARY KEY,
        board_id TEXT NOT NULL,
        name TEXT NOT NULL,
        position INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 0,
        is_terminal INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        board_id TEXT NOT NULL,
        column_id TEXT NOT NULL,
        identifier TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        description TEXT,
        priority INTEGER,
        branch_name TEXT,
        url TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT,
        FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
        FOREIGN KEY (column_id) REFERENCES columns(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS task_labels (
        task_id TEXT NOT NULL,
        label TEXT NOT NULL,
        PRIMARY KEY (task_id, label),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS task_blockers (
        task_id TEXT NOT NULL,
        blocked_by_task_id TEXT NOT NULL,
        PRIMARY KEY (task_id, blocked_by_task_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (blocked_by_task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );
    `)
  }
}

function mapBoard(row: BoardRow): KanbanBoard {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapColumn(row: ColumnRow): KanbanColumn {
  return {
    id: row.id,
    boardId: row.board_id,
    name: row.name,
    position: row.position,
    isActive: Boolean(row.is_active),
    isTerminal: Boolean(row.is_terminal),
  }
}

function toBranchName(identifier: string, title: string) {
  return `${identifier.toLowerCase()}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`.slice(0, 64)
}

function isoNow() {
  return new Date().toISOString()
}

function normalizeLabels(labels: string[]) {
  return [...new Set(labels.map((label) => label.trim().toLowerCase()).filter(Boolean))]
}
