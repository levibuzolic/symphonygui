import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { LocalKanbanStore } from "../src/main/tracker/local-kanban-store";

describe("local kanban store", () => {
  it("seeds a default board with a sample task and supports task creation", () => {
    const dir = mkdtempSync(join(tmpdir(), "symphonygui-kanban-"));
    const store = new LocalKanbanStore(join(dir, "local-kanban.sqlite"));

    const boards = store.initializeDefaults();
    const board = store.getBoard(boards[0]?.id);

    expect(boards[0]?.name).toBe("My Tasks");
    expect(board?.columns.map((column) => column.name)).toEqual([
      "Inbox",
      "Todo",
      "In Progress",
      "Blocked",
      "Done",
    ]);
    expect(board?.tasks[0]?.identifier).toBe("LOCAL-1");

    const next = store.createTask({
      boardId: board!.board.id,
      columnId: board!.columns[1]!.id,
      title: "Ship local kanban foundation",
      description: "Wire settings and SQLite storage",
      priority: 1,
      labels: ["runtime", "sqlite"],
    });

    expect(next.tasks.some((task) => task.identifier === "LOCAL-2")).toBe(true);
    expect(store.fetchCandidateIssues().some((issue) => issue.identifier === "LOCAL-2")).toBe(true);
    expect(next.tasks.find((task) => task.identifier === "LOCAL-2")?.labels).toEqual([
      "runtime",
      "sqlite",
    ]);

    const moved = store.moveTask({
      taskId: next.tasks.find((task) => task.identifier === "LOCAL-2")!.id,
      targetColumnId: board!.columns[2]!.id,
      targetPosition: 0,
    });

    expect(moved.tasks.find((task) => task.identifier === "LOCAL-2")?.columnId).toBe(
      board!.columns[2]!.id,
    );

    const renamed = store.updateBoard({
      boardId: board!.board.id,
      name: "Operations Board",
    });

    expect(renamed.board.name).toBe("Operations Board");

    const withColumn = store.createColumn({
      boardId: board!.board.id,
      name: "Review",
      isActive: true,
      isTerminal: false,
    });

    expect(withColumn.columns.some((column) => column.name === "Review")).toBe(true);
  });
});
