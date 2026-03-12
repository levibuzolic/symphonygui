import type { NormalizedIssue, ServiceConfig, TrackerDescriptor, TrackerToolSpec } from '@shared/types'
import type { TrackerAdapter } from './types'

const LINEAR_TOOL: TrackerToolSpec = {
  name: 'linear_graphql',
  description: 'Execute a raw GraphQL query or mutation against Linear using Symphony auth.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['query'],
    properties: {
      query: { type: 'string' },
      variables: { type: ['object', 'null'] },
    },
  },
}

export class LinearTrackerAdapter implements TrackerAdapter {
  descriptor(config: ServiceConfig): TrackerDescriptor {
    return {
      kind: 'linear',
      label: 'Linear',
      status: config.tracker.kind === 'linear' ? 'active' : 'available',
      capabilities: ['candidate-fetch', 'state-refresh', 'terminal-fetch', 'dynamic-tool:linear_graphql'],
      description: 'Linear issue tracker adapter for Symphony orchestration.',
    }
  }

  async fetchCandidateIssues(config: ServiceConfig): Promise<NormalizedIssue[]> {
    const response = await this.queryLinear(
      config,
      `
      query SymphonyIssues($project: String!, $states: [String!]) {
        issues(filter: { project: { slug: { eq: $project } }, state: { name: { in: $states } } }, first: 50) {
          nodes {
            id
            identifier
            title
            description
            priority
            url
            branchName
            createdAt
            updatedAt
            state { name }
            labels { nodes { name } }
            blockers { nodes { id identifier state { name } } }
          }
        }
      }
      `,
      { project: config.tracker.projectSlug, states: config.tracker.activeStates },
    )

    const issues = (((response.data as { issues?: { nodes?: unknown[] } })?.issues?.nodes) ?? []) as Record<string, unknown>[]
    return issues.map(normalizeLinearIssue)
  }

  async fetchCurrentStates(config: ServiceConfig, issueIds: string[]) {
    if (issueIds.length === 0) return new Map<string, string>()
    const response = await this.queryLinear(
      config,
      `
      query SymphonyIssueStates($ids: [String!]) {
        issues(filter: { id: { in: $ids } }, first: 50) {
          nodes { id state { name } }
        }
      }
      `,
      { ids: issueIds },
    )
    const nodes = (((response.data as { issues?: { nodes?: unknown[] } })?.issues?.nodes) ?? []) as Array<{ id: string; state?: { name?: string } }>
    return new Map(nodes.map((node) => [node.id, node.state?.name ?? 'Unknown']))
  }

  async fetchTerminalIssues(config: ServiceConfig): Promise<NormalizedIssue[]> {
    const response = await this.queryLinear(
      config,
      `
      query SymphonyTerminalIssues($project: String!, $states: [String!]) {
        issues(filter: { project: { slug: { eq: $project } }, state: { name: { in: $states } } }, first: 50) {
          nodes { id identifier title description priority url branchName createdAt updatedAt state { name } labels { nodes { name } } blockers { nodes { id identifier state { name } } } }
        }
      }
      `,
      { project: config.tracker.projectSlug, states: config.tracker.terminalStates },
    )
    const issues = (((response.data as { issues?: { nodes?: unknown[] } })?.issues?.nodes) ?? []) as Record<string, unknown>[]
    return issues.map(normalizeLinearIssue)
  }

  async fetchIssueByIdentifier(config: ServiceConfig, identifier: string) {
    const response = await this.queryLinear(
      config,
      `
      query SymphonyIssueByIdentifier($identifier: String!) {
        issue(id: $identifier) {
          id
          identifier
          title
          description
          priority
          url
          branchName
          createdAt
          updatedAt
          state { name }
          labels { nodes { name } }
          blockers { nodes { id identifier state { name } } }
        }
      }
      `,
      { identifier },
    )
    const issue = ((response.data as { issue?: Record<string, unknown> })?.issue) ?? null
    return issue ? normalizeLinearIssue(issue) : null
  }

  getDynamicTools() {
    return [LINEAR_TOOL]
  }

  async executeDynamicTool(name: string, args: unknown, config: ServiceConfig) {
    if (name !== 'linear_graphql') {
      throw new Error(`unsupported_tool:${name}`)
    }
    const payload = typeof args === 'object' && args ? (args as { query?: string; variables?: Record<string, unknown> }) : {}
    return this.queryLinear(config, payload.query ?? '', payload.variables ?? {})
  }

  private async queryLinear(config: ServiceConfig, query: string, variables: Record<string, unknown>) {
    if (!config.tracker.apiKey) {
      throw new Error('missing_linear_api_token')
    }
    if (!config.tracker.projectSlug && query.includes('$project')) {
      throw new Error('missing_linear_project_slug')
    }

    const response = await fetch(config.tracker.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: config.tracker.apiKey,
      },
      body: JSON.stringify({ query, variables }),
    })

    if (!response.ok) {
      throw new Error(`linear_api_status:${response.status}`)
    }

    return (await response.json()) as Record<string, unknown>
  }
}

function normalizeLinearIssue(node: Record<string, unknown>): NormalizedIssue {
  const labels = ((((node.labels as { nodes?: Array<{ name?: string }> } | undefined)?.nodes) ?? []).map((label) => (label.name ?? '').toLowerCase()).filter(Boolean))
  const blockedBy = (((node.blockers as { nodes?: Array<{ id?: string; identifier?: string; state?: { name?: string } }> } | undefined)?.nodes) ?? []).map((blocker) => ({
    id: blocker.id ?? null,
    identifier: blocker.identifier ?? null,
    state: blocker.state?.name ?? null,
  }))

  return {
    id: String(node.id),
    identifier: String(node.identifier),
    title: String(node.title),
    description: typeof node.description === 'string' ? node.description : null,
    priority: typeof node.priority === 'number' ? node.priority : null,
    state: String((node.state as { name?: string } | undefined)?.name ?? 'Unknown'),
    branchName: typeof node.branchName === 'string' ? node.branchName : null,
    url: typeof node.url === 'string' ? node.url : null,
    labels,
    blockedBy,
    createdAt: typeof node.createdAt === 'string' ? node.createdAt : null,
    updatedAt: typeof node.updatedAt === 'string' ? node.updatedAt : null,
    metadata: node,
  }
}
