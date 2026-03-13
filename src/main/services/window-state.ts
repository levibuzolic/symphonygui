import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

export interface WindowState {
  bounds: WindowBounds;
  isMaximized: boolean;
}

const DEFAULT_WINDOW_STATE: WindowState = {
  bounds: {
    width: 1560,
    height: 980,
  },
  isMaximized: false,
};

export class WindowStateStore {
  constructor(private readonly filePath: string) {}

  load(): WindowState {
    try {
      const raw = readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<WindowState>;
      return normalizeWindowState(parsed);
    } catch {
      return DEFAULT_WINDOW_STATE;
    }
  }

  save(state: WindowState) {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(normalizeWindowState(state), null, 2), "utf8");
  }
}

export function createWindowStateStore(userDataPath: string) {
  return new WindowStateStore(join(userDataPath, "window-state.json"));
}

function normalizeWindowState(state: Partial<WindowState>): WindowState {
  const bounds = state.bounds ?? DEFAULT_WINDOW_STATE.bounds;

  return {
    bounds: {
      x: typeof bounds.x === "number" ? bounds.x : undefined,
      y: typeof bounds.y === "number" ? bounds.y : undefined,
      width:
        typeof bounds.width === "number" && bounds.width > 0
          ? bounds.width
          : DEFAULT_WINDOW_STATE.bounds.width,
      height:
        typeof bounds.height === "number" && bounds.height > 0
          ? bounds.height
          : DEFAULT_WINDOW_STATE.bounds.height,
    },
    isMaximized: state.isMaximized === true,
  };
}
