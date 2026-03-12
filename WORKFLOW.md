---
tracker:
  kind: memory
  active_states:
    - Todo
    - In Progress
  terminal_states:
    - Done
    - Closed
workspace:
  root: ./workspaces
agent:
  max_concurrent_agents: 2
  max_turns: 3
codex:
  command: printf '%s\n' '{"id":2,"result":{"thread":{"id":"demo-thread"}}}' '{"id":3,"result":{"turn":{"id":"demo-turn"}}}' '{"method":"turn/completed","params":{"message":"Demo turn completed","usage":{"input_tokens":1200,"output_tokens":220,"total_tokens":1420}}}'
---

You are working on Symphony issue {{ issue.identifier }}.

Title: {{ issue.title }}

Description:
{% if issue.description %}
{{ issue.description }}
{% else %}
No description provided.
{% endif %}

Operate inside the assigned workspace only. Leave the issue ready for the next handoff state when work is complete.
