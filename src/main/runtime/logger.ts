import { randomUUID } from 'node:crypto'
import type { RuntimeLogEntry } from '@shared/types'

export class RuntimeLogger {
  private entries: RuntimeLogEntry[] = []

  push(level: RuntimeLogEntry['level'], scope: string, message: string, metadata?: Record<string, unknown>) {
    const entry: RuntimeLogEntry = {
      id: randomUUID(),
      level,
      timestamp: new Date().toISOString(),
      scope,
      message,
      metadata,
    }
    this.entries = [entry, ...this.entries].slice(0, 250)
    return entry
  }

  info(scope: string, message: string, metadata?: Record<string, unknown>) {
    return this.push('info', scope, message, metadata)
  }

  warn(scope: string, message: string, metadata?: Record<string, unknown>) {
    return this.push('warn', scope, message, metadata)
  }

  error(scope: string, message: string, metadata?: Record<string, unknown>) {
    return this.push('error', scope, message, metadata)
  }

  list() {
    return this.entries
  }
}
