import type { ImplementationProgress } from './types'

export const implementationProgress: ImplementationProgress = {
  updatedAt: '2026-03-13T10:45:00.000Z',
  milestones: [
    {
      id: 'foundation',
      label: 'Foundation',
      status: 'done',
      verification: 'Scaffolded Electron/Vite shell and progress tracking.',
      tasks: [
        { id: 'foundation-scaffold', label: 'Bootstrap project structure', status: 'done' },
        { id: 'foundation-ipc', label: 'Wire preload and IPC bootstrap', status: 'done' },
        { id: 'foundation-progress', label: 'Add progress tracking artifacts', status: 'done' },
      ],
    },
    {
      id: 'runtime-core',
      label: 'Runtime Core',
      status: 'done',
      verification: 'Workflow/config/workspace/store runtime services implemented.',
      tasks: [
        { id: 'runtime-workflow', label: 'Workflow loader and reload handling', status: 'done' },
        { id: 'runtime-config', label: 'Typed config layer', status: 'done' },
        { id: 'runtime-workspace', label: 'Workspace manager and hooks', status: 'done' },
        { id: 'runtime-store', label: 'Observability store', status: 'done' },
      ],
    },
    {
      id: 'linear-adapter',
      label: 'Linear Adapter',
      status: 'done',
      verification: 'Tracker registry and Linear adapter wired into orchestrator.',
      tasks: [
        { id: 'adapter-registry', label: 'Tracker adapter abstraction', status: 'done' },
        { id: 'adapter-linear', label: 'Linear GraphQL adapter', status: 'done' },
      ],
    },
    {
      id: 'codex',
      label: 'Codex Integration',
      status: 'done',
      verification: 'Codex runner and protocol parsing path implemented.',
      tasks: [
        { id: 'codex-process', label: 'App-server transport', status: 'done' },
        { id: 'codex-tools', label: 'Dynamic tool support', status: 'done' },
      ],
    },
    {
      id: 'ui',
      label: 'Observability UI',
      status: 'done',
      verification: 'Renderer shell and live dashboard views implemented.',
      tasks: [
        { id: 'ui-shell', label: 'Vercel-style shell', status: 'done' },
        { id: 'ui-panels', label: 'Metrics, queues, logs, integrations', status: 'done' },
        { id: 'ui-progress', label: 'Dev-only progress panel', status: 'done' },
      ],
    },
    {
      id: 'extensibility',
      label: 'Extensibility',
      status: 'done',
      verification: 'Core contracts are tracker-agnostic.',
      tasks: [
        { id: 'ext-tracker', label: 'Generic tracker contracts', status: 'done' },
      ],
    },
    {
      id: 'packaging',
      label: 'Packaging',
      status: 'in_progress',
      verification: 'Builder config added; packaged artifact validation pending.',
      tasks: [
        { id: 'pack-builder', label: 'Electron builder configuration', status: 'done' },
        { id: 'pack-validate', label: 'Validate packaged app output', status: 'in_progress' },
      ],
    },
    {
      id: 'testing',
      label: 'Testing',
      status: 'in_progress',
      verification: 'Unit and renderer smoke tests added.',
      tasks: [
        { id: 'test-unit', label: 'Runtime unit coverage', status: 'done' },
        { id: 'test-renderer', label: 'Renderer smoke coverage', status: 'done' },
        { id: 'test-e2e', label: 'Broader e2e validation', status: 'in_progress' },
      ],
    },
  ],
}

export function milestoneCompletion(milestone: ImplementationProgress['milestones'][number]) {
  const total = milestone.tasks.length || 1
  const done = milestone.tasks.filter((task) => task.status === 'done').length
  return Math.round((done / total) * 100)
}

export function overallCompletion(progress: ImplementationProgress) {
  const tasks = progress.milestones.flatMap((milestone) => milestone.tasks)
  const total = tasks.length || 1
  const done = tasks.filter((task) => task.status === 'done').length
  return Math.round((done / total) * 100)
}
