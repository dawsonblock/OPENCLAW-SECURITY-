---
summary: "Operator Workflows: Triage, specialized agents, and structured handoffs."
title: "Operator Workflows"
read_when:
  - You want to implement a high-confidence operator routing pattern
  - You are configuring specialized triage and coder agents
---

# Operator Workflows

OpenClaw supports advanced **Operator Workflows** that allow a primary assistant to delegate complex tasks to specialized agents. This pattern ensures high-confidence routing, isolated execution environments, and structured reporting.

## The Operator Pattern

The core of this workflow is the **Triage pattern**:

1.  **Inbound**: A request arrives at the `main` agent.
2.  **Triage**: The `main` agent identifies the request as task-oriented and hands it off to a specialized `triage` agent.
3.  **Specialization**: The `triage` agent analyzes the requirements and spawns a target agent (e.g., `coder` for development, `admin` for system tasks).
4.  **Announce**: Once the task is complete, the specialized agent announces the result back to the original chat.

## Configuration

To enable operator workflows, you must register the specialized agents and configure their sub-agent permissions in `openclaw.json`.

```json5
{
  agents: {
    list: [
      { id: "main", default: true },
      { id: "triage", subagents: { allowAgents: ["coder", "admin"] } },
      { id: "coder", workspace: "/path/to/project" },
      { id: "admin", tools: { profile: "full" } },
    ],
  },
}
```

### Handoff Instructions

The `main` agent should be instructed to use the `sessions_spawn` tool for any request that exceeds general chat capabilities.

Example `main.md`:

```markdown
If the user asks for a specific coding task, research, or system change:

1. Use `sessions_spawn` to hand off the task to the `triage` agent.
2. Inform the user that the request is being processed.
```

## Visual Indicators

OpenClaw provides first-class UI support for tracking operator activity.

### Operator Lanes

In the **Web Control UI**, the topbar features dynamic **Lane Badges**. These badges indicate real-time activity for specialized agents:

- **TRIAGE**: Analyzing and routing inbound requests.
- **CODER**: Active development or file modification.
- **ADMIN**: System-level automation or maintenance.

Badges turn **Active** (Indigo/Teal) when an agent is processing a message or running a tool in a sub-session.

### Structured Receipts

When an agent hands off a task or completes a significant milestone, it can generate a **Structured Receipt**. These are rendered as premium UI cards in both the Web UI and the macOS companion app.

To generate a receipt, the agent uses the `receipt_generate` tool:

```json
{
  "type": "triage",
  "status": "handoff",
  "target": "coder",
  "reasoning": "Complex UI alignment issue detected."
}
```

## Tools

Operator workflows are supported by several diagnostic and coordination tools:

- `receipt_generate`: Create structured UI status cards.
- `coding_metrics`: Audit system state and gather performance data for reporting.
- `sessions_spawn`: Programmatic delegation of tasks to other agents.

## See Also

- [Multi-Agent Routing](/concepts/multi-agent)
- [Sub-Agents](/tools/subagents)
- [Receipts & Metrics](/tools/receipts)
