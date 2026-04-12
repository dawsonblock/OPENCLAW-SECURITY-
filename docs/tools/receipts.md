---
summary: "Receipts & Metrics: Tools for structured reporting and diagnostic auditing."
title: "Receipts & Metrics"
read_when:
  - You want to generate premium UI status cards
  - You are implementing an operator handoff pattern
---

# Receipts & Metrics

OpenClaw provides specialized tools for surfacing agent status and system diagnostics in a human-readable, structured format.

## `receipt_generate`

The `receipt_generate` tool allows agents to post **Structured Receipts** into the chat. These receipts are rendered as premium, color-coded cards (Indigo and Teal) in supported interfaces (Web UI, macOS app).

### Use Cases

- **Handoff Notifications**: Informing the user when a task is delegated from Triage to a Coder.
- **Milestone Completion**: Reporting successful deployment or refactor completion.
- **Process Status**: Providing a high-density summary of long-running operations.

### Schema

| Parameter   | Type                           | Required | Description                                                       |
| :---------- | :----------------------------- | :------- | :---------------------------------------------------------------- |
| `type`      | `triage` \| `coder` \| `admin` | Yes      | The category of the receipt, determining the icon and color.      |
| `status`    | string                         | Yes      | High-level status (e.g., `"handoff"`, `"complete"`, `"pending"`). |
| `target`    | string                         | No       | The destination agent or system for the handoff.                  |
| `reasoning` | string                         | No       | Short explanation of the decision or status.                      |

### Example

```json
{
  "type": "triage",
  "status": "handoff",
  "target": "coder",
  "reasoning": "Detected request for multi-file refactor in src/media."
}
```

---

## `coding_metrics`

The `coding_metrics` tool is a diagnostic utility used by agents to gather system performance and state data for reporting.

### Use Cases

- **System Auditing**: Checking current resource usage or session counts.
- **Performance Reporting**: Including metrics in a final completion summary.
- **Diagnostics**: Helping the agent understand context-specific system limits.

### Capabilities

- **Status Retrieval**: High-level health and "ready" status of the gateway.
- **Resource Monitoring**: Basic CPU and Memory usage for the OpenClaw process.
- **Session Stats**: Counts of active, idle, and archived sessions.

## Visual Integration

Receipts and metrics are visually prioritized in OpenClaw interfaces:

- **Web UI**: Rendered as distinct cards with semantic icons.
- **macOS App**: Surfaced in the session preview stream with specialized iconography.

## See Also

- [Operator Workflows](/concepts/operator-workflows)
- [Sub-Agents](/tools/subagents)
- [Tools Index](/tools)
