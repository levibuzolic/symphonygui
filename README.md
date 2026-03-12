# Symphony Desktop

Electron implementation of the Symphony service spec with:

- Electron main-process runtime orchestration
- React + TypeScript renderer
- `shadcn/ui`-style component primitives over a Vercel-like dark operations UI
- Tracker adapter architecture with Linear implemented first
- In-repo implementation progress tracking via [`IMPLEMENTATION.md`](./IMPLEMENTATION.md)

## Scripts

```bash
npm install
npm run dev
npm run build
npm run test
```

## Structure

- `src/main/`: Electron main process, runtime services, tracker adapters, IPC, optional HTTP observability surface
- `src/renderer/`: dashboard UI and development progress surface
- `src/shared/`: shared contracts, types, and progress artifact
- `test/`: unit and renderer smoke tests

## Workflow

The app expects a repository-owned `WORKFLOW.md` in the current working directory by default. If the file is missing or invalid, the UI still boots and surfaces the configuration error through the observability store.

## Reference Spec

The upstream Symphony service specification is kept locally at [`docs/SPEC.md`](./docs/SPEC.md) for implementation reference.

## Progress Tracking

Implementation progress is tracked in two places:

- [`IMPLEMENTATION.md`](./IMPLEMENTATION.md): human-readable milestone board
- [`src/shared/progress.ts`](./src/shared/progress.ts): machine-readable progress artifact used by the dev-only progress panel
