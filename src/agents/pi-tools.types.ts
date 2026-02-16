import type { AgentTool } from "@mariozechner/pi-agent-core";

// oxlint-disable-next-line typescript/no-explicit-any
export type AnyAgentTool = AgentTool<any, unknown>;

// oxlint-disable-next-line typescript/no-explicit-any
export type AgentToolResult<T = unknown> = Awaited<ReturnType<AgentTool<any, T>["execute"]>>;
