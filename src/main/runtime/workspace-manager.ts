import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { execFile } from 'node:child_process'
import type { HooksConfig, WorkspaceInfo } from '@shared/types'

export class WorkspaceManager {
  constructor(private root: string, private hooks: HooksConfig) {}

  ensureWorkspace(identifier: string): WorkspaceInfo {
    const workspaceKey = identifier.replace(/[^A-Za-z0-9._-]/g, '_')
    const workspacePath = resolve(this.root, workspaceKey)
    ensureInsideRoot(resolve(this.root), workspacePath)
    const createdNow = !existsSync(workspacePath)
    mkdirSync(workspacePath, { recursive: true })
    return { path: workspacePath, workspaceKey, createdNow }
  }

  async runHook(script: string | null, cwd: string) {
    if (!script) return
    await new Promise<void>((resolvePromise, reject) => {
      const child = execFile('/bin/bash', ['-lc', script], { cwd, timeout: this.hooks.timeoutMs }, (error) => {
        if (error) {
          reject(error)
          return
        }
        resolvePromise()
      })
      child.unref()
    })
  }

  removeWorkspace(identifier: string) {
    const workspace = this.ensureWorkspace(identifier)
    try {
      rmSync(workspace.path, { recursive: true, force: true })
    } catch {
      return
    }
  }
}

function ensureInsideRoot(root: string, workspacePath: string) {
  if (!(workspacePath === root || workspacePath.startsWith(root + sep))) {
    throw new Error(`invalid_workspace_path:${workspacePath}`)
  }
}
