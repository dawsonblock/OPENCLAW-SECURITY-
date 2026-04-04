import crypto from "node:crypto";
import { DEFAULT_AGENT_ID } from "../../routing/session-key.js";
import { saveExecApprovals } from "./store.js";
import type { ExecAllowlistEntry, ExecApprovalsFile, ExecAsk, ExecSecurity } from "./types.js";

export function requiresExecApproval(params: {
  ask: ExecAsk;
  security: ExecSecurity;
  analysisOk: boolean;
  allowlistSatisfied: boolean;
}): boolean {
  return (
    params.ask === "always" ||
    (params.ask === "on-miss" &&
      params.security === "allowlist" &&
      (!params.analysisOk || !params.allowlistSatisfied))
  );
}

export function recordAllowlistUse(
  approvals: ExecApprovalsFile,
  agentId: string | undefined,
  entry: ExecAllowlistEntry,
  command: string,
  resolvedPath?: string,
) {
  const target = agentId ?? DEFAULT_AGENT_ID;
  const agents = approvals.agents ?? {};
  const existing = agents[target] ?? {};
  const allowlist = Array.isArray(existing.allowlist) ? existing.allowlist : [];
  const nextAllowlist = allowlist.map((item) =>
    item.pattern === entry.pattern
      ? {
          ...item,
          id: item.id ?? crypto.randomUUID(),
          lastUsedAt: Date.now(),
          lastUsedCommand: command,
          lastResolvedPath: resolvedPath,
        }
      : item,
  );
  agents[target] = { ...existing, allowlist: nextAllowlist };
  approvals.agents = agents;
  saveExecApprovals(approvals);
}

export function addAllowlistEntry(
  approvals: ExecApprovalsFile,
  agentId: string | undefined,
  pattern: string,
) {
  const target = agentId ?? DEFAULT_AGENT_ID;
  const agents = approvals.agents ?? {};
  const existing = agents[target] ?? {};
  const allowlist = Array.isArray(existing.allowlist) ? existing.allowlist : [];
  const trimmed = pattern.trim();
  if (!trimmed || allowlist.some((entry) => entry.pattern === trimmed)) {
    return;
  }
  allowlist.push({ id: crypto.randomUUID(), pattern: trimmed, lastUsedAt: Date.now() });
  agents[target] = { ...existing, allowlist };
  approvals.agents = agents;
  saveExecApprovals(approvals);
}

export function minSecurity(a: ExecSecurity, b: ExecSecurity): ExecSecurity {
  const order: Record<ExecSecurity, number> = { deny: 0, allowlist: 1, full: 2 };
  return order[a] <= order[b] ? a : b;
}

export function maxAsk(a: ExecAsk, b: ExecAsk): ExecAsk {
  const order: Record<ExecAsk, number> = { off: 0, "on-miss": 1, always: 2 };
  return order[a] >= order[b] ? a : b;
}
