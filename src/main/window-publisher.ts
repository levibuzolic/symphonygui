import type { BrowserWindow } from "electron";

export function safeSendToWindow<T>(
  targetWindow: BrowserWindow | null,
  channel: string,
  payload: T,
) {
  if (!targetWindow) {
    return false;
  }

  try {
    if (targetWindow.isDestroyed()) {
      return false;
    }

    const contents = targetWindow.webContents;
    if (!contents || contents.isDestroyed() || contents.isCrashed()) {
      return false;
    }

    contents.send(channel, payload);
    return true;
  } catch {
    return false;
  }
}
