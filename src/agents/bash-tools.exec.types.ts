import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { ExecAsk, ExecHost, ExecSecurity } from "../infra/exec-approvals.js";
import type { ExecBudget } from "../security/exec-budgets.js";
import type { ProcessSession } from "./bash-process-registry.js";
import type { BashSandboxConfig } from "./bash-tools.shared.js";

export type PtyExitEvent = { exitCode: number; signal?: number };
export type PtyListener<T> = (event: T) => void;
export type PtyHandle = {
  pid: number;
  write: (data: string | Buffer) => void;
  onData: (listener: PtyListener<string>) => void;
  onExit: (listener: PtyListener<PtyExitEvent>) => void;
};
export type PtySpawn = (
  file: string,
  args: string[] | string,
  options: {
    name?: string;
    cols?: number;
    rows?: number;
    cwd?: string;
    env?: Record<string, string>;
  },
) => PtyHandle;

export type ExecProcessOutcome = {
  status: "completed" | "failed";
  exitCode: number | null;
  exitSignal: NodeJS.Signals | number | null;
  durationMs: number;
  aggregated: string;
  timedOut: boolean;
  reason?: string;
};

export type ExecProcessHandle = {
  session: ProcessSession;
  startedAt: number;
  pid?: number;
  promise: Promise<ExecProcessOutcome>;
  kill: () => void;
};

export type ExecElevatedDefaults = {
  enabled: boolean;
  allowed: boolean;
  defaultLevel: "on" | "off" | "ask" | "full";
};

export type ExecToolDefaults = {
  host?: ExecHost;
  security?: ExecSecurity;
  ask?: ExecAsk;
  node?: string;
  pathPrepend?: string[];
  safeBins?: string[];
  agentId?: string;
  backgroundMs?: number;
  timeoutSec?: number;
  approvalRunningNoticeMs?: number;
  sandbox?: BashSandboxConfig;
  elevated?: ExecElevatedDefaults;
  allowBackground?: boolean;
  scopeKey?: string;
  sessionKey?: string;
  messageProvider?: string;
  notifyOnExit?: boolean;
  cwd?: string;
  budget?: ExecBudget;
};

export type ExecToolDetails =
  | {
      status: "running";
      sessionId: string;
      pid?: number;
      startedAt: number;
      cwd?: string;
      tail?: string;
    }
  | {
      status: "completed" | "failed";
      exitCode: number | null;
      durationMs: number;
      aggregated: string;
      cwd?: string;
    }
  | {
      status: "approval-pending";
      approvalId: string;
      approvalSlug: string;
      expiresAtMs: number;
      host: ExecHost;
      command: string;
      cwd?: string;
      nodeId?: string;
    };

export const DEFAULT_NOTIFY_TAIL_CHARS = 400;
export const DEFAULT_APPROVAL_TIMEOUT_MS = 120_000;
export const DEFAULT_APPROVAL_REQUEST_TIMEOUT_MS = 130_000;
export const DEFAULT_APPROVAL_RUNNING_NOTICE_MS = 10_000;
export const APPROVAL_SLUG_LENGTH = 8;

export const execSchema = Type.Object({
  command: Type.String({ description: "Shell command to execute" }),
  workdir: Type.Optional(Type.String({ description: "Working directory (defaults to cwd)" })),
  env: Type.Optional(Type.Record(Type.String(), Type.String())),
  yieldMs: Type.Optional(
    Type.Number({
      description: "Milliseconds to wait before backgrounding (default 10000)",
    }),
  ),
  background: Type.Optional(Type.Boolean({ description: "Run in background immediately" })),
  timeout: Type.Optional(
    Type.Number({
      description: "Timeout in seconds (optional, kills process on expiry)",
    }),
  ),
  pty: Type.Optional(
    Type.Boolean({
      description:
        "Run in a pseudo-terminal (PTY) when available (TTY-required CLIs, coding agents)",
    }),
  ),
  elevated: Type.Optional(
    Type.Boolean({
      description: "Run on the host with elevated permissions (if allowed)",
    }),
  ),
  host: Type.Optional(Type.String({ description: "Exec host (sandbox|gateway|node)." })),
  security: Type.Optional(
    Type.String({ description: "Exec security mode (deny|allowlist|full)." }),
  ),
  ask: Type.Optional(Type.String({ description: "Exec ask mode (off|on-miss|always)." })),
  node: Type.Optional(Type.String({ description: "Node id/name for host=node." })),
});

export type ExecTool = AgentTool<any, ExecToolDetails>;
export type ExecToolResult = AgentToolResult<ExecToolDetails>;
export type ExecSignal = AbortSignal | undefined;
export type ExecUpdate = ((partialResult: AgentToolResult<ExecToolDetails>) => void) | undefined;
export type ExecSpawnChild = ChildProcessWithoutNullStreams;
