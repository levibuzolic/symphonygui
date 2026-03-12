import { describe, expect, it } from 'vitest'
import { parseWorkflowFile } from '../src/main/runtime/workflow-loader'
import { ConfigLayer } from '../src/main/runtime/config-layer'

describe('workflow loader', () => {
  it('parses front matter and prompt body', () => {
    const definition = parseWorkflowFile(
      `---
tracker:
  kind: linear
  project_slug: demo
---
Hello {{ issue.identifier }}`,
      '/tmp/WORKFLOW.md',
    )
    expect(definition.config).toMatchObject({ tracker: { kind: 'linear', project_slug: 'demo' } })
    expect(definition.promptTemplate).toBe('Hello {{ issue.identifier }}')
  })

  it('coerces workflow config into typed settings', () => {
    const definition = parseWorkflowFile(
      `---
tracker:
  kind: linear
  project_slug: demo
  api_key: abc
polling:
  interval_ms: "1000"
---
Prompt`,
      '/tmp/WORKFLOW.md',
    )
    const config = new ConfigLayer().parse(definition)
    expect(config.polling.intervalMs).toBe(1000)
    expect(config.tracker.projectSlug).toBe('demo')
  })
})
