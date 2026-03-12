import { EventEmitter } from 'node:events'
import { existsSync, readFileSync, watch } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import type { WorkflowDefinition } from '@shared/types'

export class WorkflowLoader extends EventEmitter {
  private workflowPath: string
  private currentDefinition: WorkflowDefinition | null = null
  private lastGoodDefinition: WorkflowDefinition | null = null

  constructor(workflowPath = resolve(process.cwd(), 'WORKFLOW.md')) {
    super()
    this.workflowPath = workflowPath
  }

  getPath() {
    return this.workflowPath
  }

  getCurrent() {
    return this.currentDefinition ?? this.lastGoodDefinition
  }

  load(): WorkflowDefinition {
    if (!existsSync(this.workflowPath)) {
      throw new Error(`missing_workflow_file:${this.workflowPath}`)
    }

    const file = readFileSync(this.workflowPath, 'utf8')
    const definition = parseWorkflowFile(file, this.workflowPath)
    this.currentDefinition = definition
    this.lastGoodDefinition = definition
    return definition
  }

  startWatching() {
    if (!existsSync(this.workflowPath)) {
      return
    }

    watch(this.workflowPath, { persistent: false }, () => {
      try {
        const definition = this.load()
        this.emit('updated', definition)
      } catch (error) {
        this.emit('error', error)
      }
    })
  }
}

export function parseWorkflowFile(contents: string, sourcePath: string): WorkflowDefinition {
  const trimmed = contents.trimStart()
  let config: Record<string, unknown> = {}
  let promptTemplate = contents

  if (trimmed.startsWith('---')) {
    const lines = contents.split(/\r?\n/)
    const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
    if (endIndex > 0) {
      const frontMatter = lines.slice(1, endIndex).join('\n')
      const parsed = YAML.parse(frontMatter)
      if (parsed && typeof parsed !== 'object') {
        throw new Error('workflow_front_matter_not_a_map')
      }
      config = (parsed ?? {}) as Record<string, unknown>
      promptTemplate = lines.slice(endIndex + 1).join('\n')
    }
  }

  return {
    config,
    promptTemplate: promptTemplate.trim(),
    sourcePath,
    loadedAt: new Date().toISOString(),
  }
}
