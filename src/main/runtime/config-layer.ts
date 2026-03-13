import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import type { ServiceConfig, WorkflowDefinition } from "@shared/types";

const trackerSchema = z.object({
  kind: z.string().default("linear"),
  endpoint: z.string().default("https://api.linear.app/graphql"),
  api_key: z.string().optional(),
  project_slug: z.string().optional(),
  active_states: z.array(z.string()).default(["Todo", "In Progress"]),
  terminal_states: z
    .array(z.string())
    .default(["Closed", "Cancelled", "Canceled", "Duplicate", "Done"]),
});

const serviceSchema = z.object({
  tracker: trackerSchema.optional(),
  polling: z
    .object({
      interval_ms: z.coerce.number().default(30000),
    })
    .optional(),
  workspace: z
    .object({
      root: z.string().default(join(tmpdir(), "symphony_workspaces")),
    })
    .optional(),
  hooks: z
    .object({
      after_create: z.string().optional(),
      before_run: z.string().optional(),
      after_run: z.string().optional(),
      before_remove: z.string().optional(),
      timeout_ms: z.coerce.number().default(60000),
    })
    .optional(),
  agent: z
    .object({
      max_concurrent_agents: z.coerce.number().default(10),
      max_turns: z.coerce.number().default(20),
      max_retry_backoff_ms: z.coerce.number().default(300000),
      max_concurrent_agents_by_state: z.record(z.string(), z.coerce.number()).default({}),
      ssh_hosts: z.array(z.string()).default([]),
      max_concurrent_agents_per_host: z.coerce.number().nullable().optional(),
    })
    .optional(),
  codex: z
    .object({
      command: z.string().default("codex app-server"),
      approval_policy: z.union([z.string(), z.record(z.string(), z.unknown())]).default("never"),
      thread_sandbox: z.string().default("workspace-write"),
      turn_sandbox_policy: z.record(z.string(), z.unknown()).default({ type: "workspace-write" }),
      turn_timeout_ms: z.coerce.number().default(3600000),
      read_timeout_ms: z.coerce.number().default(5000),
      stall_timeout_ms: z.coerce.number().default(300000),
    })
    .optional(),
  server: z
    .object({
      port: z.coerce.number().nullable().optional(),
    })
    .optional(),
});

export class ConfigLayer {
  parse(definition: WorkflowDefinition): ServiceConfig {
    const parsed = serviceSchema.parse(definition.config);
    const tracker = trackerSchema.parse(parsed.tracker ?? {});
    const polling = serviceSchema.shape.polling.unwrap().parse(parsed.polling ?? {});
    const workspace = serviceSchema.shape.workspace.unwrap().parse(parsed.workspace ?? {});
    const hooks = serviceSchema.shape.hooks.unwrap().parse(parsed.hooks ?? {});
    const agent = serviceSchema.shape.agent.unwrap().parse(parsed.agent ?? {});
    const codex = serviceSchema.shape.codex.unwrap().parse(parsed.codex ?? {});
    const server = serviceSchema.shape.server.unwrap().parse(parsed.server ?? {});
    return {
      tracker: {
        kind: tracker.kind,
        endpoint: tracker.endpoint,
        apiKey: resolveEnv(tracker.api_key ?? process.env.LINEAR_API_KEY ?? null),
        projectSlug: tracker.project_slug ?? null,
        activeStates: tracker.active_states,
        terminalStates: tracker.terminal_states,
      },
      polling: {
        intervalMs: polling.interval_ms,
      },
      workspace: {
        root: normalizePath(resolveEnv(workspace.root) ?? join(tmpdir(), "symphony_workspaces")),
      },
      hooks: {
        afterCreate: hooks.after_create ?? null,
        beforeRun: hooks.before_run ?? null,
        afterRun: hooks.after_run ?? null,
        beforeRemove: hooks.before_remove ?? null,
        timeoutMs: hooks.timeout_ms > 0 ? hooks.timeout_ms : 60000,
      },
      agent: {
        maxConcurrentAgents: agent.max_concurrent_agents,
        maxTurns: agent.max_turns,
        maxRetryBackoffMs: agent.max_retry_backoff_ms,
        maxConcurrentAgentsByState: Object.fromEntries(
          Object.entries(agent.max_concurrent_agents_by_state ?? {}).map(([state, count]) => [
            state.toLowerCase(),
            count,
          ]),
        ),
        sshHosts: agent.ssh_hosts ?? [],
        maxConcurrentAgentsPerHost: agent.max_concurrent_agents_per_host ?? null,
      },
      codex: {
        command: codex.command,
        approvalPolicy: codex.approval_policy,
        threadSandbox: codex.thread_sandbox,
        turnSandboxPolicy: codex.turn_sandbox_policy,
        turnTimeoutMs: codex.turn_timeout_ms,
        readTimeoutMs: codex.read_timeout_ms,
        stallTimeoutMs: codex.stall_timeout_ms,
      },
      server: {
        port: server.port ?? null,
      },
    };
  }
}

function resolveEnv(value: string | null | undefined) {
  if (!value) return null;
  if (!value.startsWith("$")) return value;
  return process.env[value.slice(1)] ?? null;
}

function normalizePath(value: string) {
  if (value.startsWith("~/")) {
    return resolve(homedir(), value.slice(2));
  }
  return resolve(value);
}
