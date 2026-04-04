import type { ExecToolDetails, ExecToolResult } from "./bash-tools.exec.types.js";

export function createApprovalPendingResult(params: {
  text: string;
  approvalId: string;
  approvalSlug: string;
  expiresAtMs: number;
  host: ExecToolDetails extends infer _T ? "gateway" | "node" | "sandbox" : never;
  command: string;
  cwd?: string;
  nodeId?: string;
}): ExecToolResult {
  return {
    content: [{ type: "text", text: params.text }],
    details: {
      status: "approval-pending",
      approvalId: params.approvalId,
      approvalSlug: params.approvalSlug,
      expiresAtMs: params.expiresAtMs,
      host: params.host,
      command: params.command,
      cwd: params.cwd,
      nodeId: params.nodeId,
    },
  };
}

export function createRunningResult(params: {
  text: string;
  sessionId: string;
  pid?: number;
  startedAt: number;
  cwd?: string;
  tail?: string;
}): ExecToolResult {
  return {
    content: [{ type: "text", text: params.text }],
    details: {
      status: "running",
      sessionId: params.sessionId,
      pid: params.pid,
      startedAt: params.startedAt,
      cwd: params.cwd,
      tail: params.tail,
    },
  };
}

export function createCompletedResult(params: {
  text: string;
  exitCode: number | null;
  durationMs: number;
  aggregated: string;
  cwd?: string;
}): ExecToolResult {
  return {
    content: [{ type: "text", text: params.text }],
    details: {
      status: "completed",
      exitCode: params.exitCode ?? 0,
      durationMs: params.durationMs,
      aggregated: params.aggregated,
      cwd: params.cwd,
    },
  };
}
