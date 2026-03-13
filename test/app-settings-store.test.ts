import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { AppSettingsStore } from "../src/main/settings/app-settings-store";

describe("app settings store", () => {
  it("persists local kanban enablement without deleting stored metadata", () => {
    const dir = mkdtempSync(join(tmpdir(), "symphonygui-settings-"));
    const store = new AppSettingsStore(dir);

    store.update({
      localKanban: {
        enabled: true,
        initialized: true,
        databasePath: "/tmp/local-kanban.sqlite",
        lastOpenedBoardId: "board-default",
      },
    });
    store.update({
      localKanban: {
        ...store.get().localKanban,
        enabled: false,
      },
    });

    expect(store.get().localKanban.enabled).toBe(false);
    expect(store.get().localKanban.databasePath).toBe("/tmp/local-kanban.sqlite");
    expect(store.get().localKanban.initialized).toBe(true);
  });
});
