# Repository Agent Instructions

This repository is an Electron desktop app. Treat build output and runtime verification as first-class requirements, not optional cleanup.

## Required verification before calling work "done"

For any change that affects Electron startup, bundling, renderer styling, IPC, or main/renderer lifecycle:

1. Run `npm run test`
2. Run `npm run test:bundle`
3. If the change could affect boot/runtime behavior, run `npm run smoke`

Do not stop after unit tests if the change can break the built app at startup. The smoke run is required for:

- Electron main/preload build changes
- package/build config changes
- renderer boot shell changes
- preload / IPC changes
- lifecycle / shutdown changes
- CSS pipeline / Tailwind / shadcn changes

## Build artifact rules

- The Electron app must boot from CommonJS main/preload bundles.
- `dist-electron/` must not contain stale `index.js` or `preload.mjs` artifacts.
- Any regression where the built app crashes on launch should result in a permanent automated check when feasible.

## Runtime quality bar

- Desktop shell should use fixed-height app layout with internal pane scrolling, not full-page document scrolling.
- Buttons and navigation must perform visible actions or be omitted.
- Long paths, log lines, and identifiers must truncate or wrap cleanly without breaking layout.
- Shutdown and dev reload should not spam unhandled promise rejections.

## When fixing a runtime bug

- Reproduce from the built artifact path, not only `vite` dev rendering.
- Add or extend an automated test or verification script that would have caught the issue earlier.
- Update `IMPLEMENTATION.md` when the verification surface changes materially.
