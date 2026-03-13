import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import type { CodexUpdateEvent, NormalizedIssue, ServiceConfig, TrackerToolSpec } from '@shared/types'
import { safeJsonParse } from '@shared/utils'
import type { TrackerAdapter } from '../tracker/types'

export class AgentRunner extends EventEmitter {
  async runIssue(
    issue: NormalizedIssue,
    config: ServiceConfig,
    workspacePath: string,
    prompt: string,
    adapter: TrackerAdapter,
  ) {
    const child = spawn('/bin/bash', ['-lc', config.codex.command], {
      cwd: workspacePath,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const pid = child.pid ? String(child.pid) : null
    const tools = adapter.getDynamicTools?.() ?? []
    let transportClosed = false
    let transportError: string | null = null
    const emitTransportUpdate = (event: string, message: string) => {
      this.emit('update', {
        event,
        timestamp: new Date().toISOString(),
        message,
        pid,
      } satisfies CodexUpdateEvent)
    }

    child.once('close', (code) => {
      transportClosed = true
      emitTransportUpdate('transport_closed', `child process closed${code === null ? '' : ` (${code})`}`)
    })
    child.once('exit', () => {
      transportClosed = true
    })
    child.stdin.on('error', (error) => {
      transportClosed = true
      transportError = (error as NodeJS.ErrnoException).code ?? String(error)
      emitTransportUpdate('transport_error', `stdin error: ${transportError}`)
    })

    const write = (payload: Record<string, unknown>) => {
      if (transportClosed || child.stdin.destroyed || child.stdin.writableEnded) {
        return false
      }

      try {
        child.stdin.write(`${JSON.stringify(payload)}\n`)
        return true
      } catch (error) {
        transportClosed = true
        transportError = (error as NodeJS.ErrnoException).code ?? String(error)
        emitTransportUpdate('transport_error', `write failed: ${transportError}`)
        return false
      }
    }

    write({
      id: 1,
      method: 'initialize',
      params: {
        clientInfo: { name: 'symphony-desktop', version: '0.1.0' },
        capabilities: { experimentalApi: true },
      },
    })
    write({ method: 'initialized', params: {} })
    write({
      id: 2,
      method: 'thread/start',
      params: {
        approvalPolicy: config.codex.approvalPolicy,
        sandbox: config.codex.threadSandbox,
        cwd: workspacePath,
        tools,
      },
    })

    let threadId = ''
    let turnId = ''
    const stream = async (line: string) => {
      const message = safeJsonParse<Record<string, unknown>>(line)
      if (!message) {
        this.emit('update', {
          event: 'malformed',
          timestamp: new Date().toISOString(),
          message: line.slice(0, 200),
          pid,
        } satisfies CodexUpdateEvent)
        return
      }

      if (message.id === 2) {
        threadId = String(((message.result as { thread?: { id?: string } } | undefined)?.thread?.id) ?? '')
        const wroteTurnStart = write({
          id: 3,
          method: 'turn/start',
          params: {
            threadId,
            input: [{ type: 'text', text: prompt }],
            cwd: workspacePath,
            title: `${issue.identifier}: ${issue.title}`,
            approvalPolicy: config.codex.approvalPolicy,
            sandboxPolicy: config.codex.turnSandboxPolicy,
          },
        })
        if (!wroteTurnStart) {
          emitTransportUpdate('transport_closed', `turn/start skipped because stdin closed${transportError ? ` (${transportError})` : ''}`)
        }
      }

      if (message.id === 3) {
        turnId = String(((message.result as { turn?: { id?: string } } | undefined)?.turn?.id) ?? '')
      }

      const event = extractEvent(message)
      if (event) {
        this.emit('update', {
          ...event,
          pid,
          threadId: threadId || event.threadId,
          turnId: turnId || event.turnId,
          sessionId: threadId && turnId ? `${threadId}-${turnId}` : undefined,
        } satisfies CodexUpdateEvent)

        if (event.event === 'client/tool_call' && adapter.executeDynamicTool) {
          const params = (message.params as { name?: string; arguments?: unknown; id?: string } | undefined)
          const toolName = params?.name ?? ''
          const result = await adapter.executeDynamicTool(toolName, params?.arguments, config)
          const wroteToolResult = write({
            method: 'client/tool_result',
            params: {
              id: params?.id,
              success: true,
              output: JSON.stringify(result, null, 2),
            },
          })
          if (!wroteToolResult) {
            emitTransportUpdate('transport_closed', `tool result skipped because stdin closed${transportError ? ` (${transportError})` : ''}`)
          }
        }
      }
    }

    child.stdout.setEncoding('utf8')
    let buffer = ''
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines.filter(Boolean)) {
        void stream(line)
      }
    })

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      this.emit('update', {
        event: 'stderr',
        timestamp: new Date().toISOString(),
        message: chunk.trim().slice(0, 200),
        pid,
      } satisfies CodexUpdateEvent)
    })

    return await new Promise<{ code: number | null }>((resolve) => {
      child.on('close', (code) => resolve({ code }))
    })
  }
}

function extractEvent(message: Record<string, unknown>): CodexUpdateEvent | null {
  const method = typeof message.method === 'string' ? message.method : null
  if (!method) return null
  const params = (message.params as Record<string, unknown> | undefined) ?? {}
  const usage = (params.usage as Record<string, unknown> | undefined) ?? {}
  return {
    event: method,
    timestamp: new Date().toISOString(),
    message: typeof params.text === 'string' ? params.text : typeof params.message === 'string' ? params.message : method,
    usage: {
      inputTokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : typeof usage.inputTokens === 'number' ? usage.inputTokens : undefined,
      outputTokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : typeof usage.outputTokens === 'number' ? usage.outputTokens : undefined,
      totalTokens: typeof usage.total_tokens === 'number' ? usage.total_tokens : typeof usage.totalTokens === 'number' ? usage.totalTokens : undefined,
    },
    rateLimits: (params.rate_limits as CodexUpdateEvent['rateLimits']) ?? undefined,
    threadId: typeof params.threadId === 'string' ? params.threadId : undefined,
    turnId: typeof params.turnId === 'string' ? params.turnId : undefined,
  }
}

export function serializeToolSpecs(tools: TrackerToolSpec[]) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }))
}
