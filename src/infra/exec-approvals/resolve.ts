import { DEFAULT_AGENT_ID } from "../../routing/session-key.js";
import { resolveCommandResolution, resolveCommandResolutionFromArgv } from "./parse.js";
import {
  ensureExecApprovals,
  EXEC_APPROVAL_DEFAULTS,
  expandHome,
  normalizeAsk,
  normalizeExecApprovals,
  normalizeSecurity,
  resolveExecApprovalsPath,
  resolveExecApprovalsSocketPath,
} from "./store.js";
import type {
  ExecApprovalsDefaultOverrides,
  ExecApprovalsDefaults,
  ExecApprovalsFile,
  ExecApprovalsResolved,
} from "./types.js";

export function resolveExecApprovals(
  agentId?: string,
  overrides?: ExecApprovalsDefaultOverrides,
): ExecApprovalsResolved {
  const file = ensureExecApprovals();
  return resolveExecApprovalsFromFile({
    file,
    agentId,
    overrides,
    path: resolveExecApprovalsPath(),
    socketPath: expandHome(file.socket?.path ?? resolveExecApprovalsSocketPath()),
    token: file.socket?.token ?? "",
  });
}

export function resolveExecApprovalsFromFile(params: {
  file: ExecApprovalsFile;
  agentId?: string;
  overrides?: ExecApprovalsDefaultOverrides;
  path?: string;
  socketPath?: string;
  token?: string;
}): ExecApprovalsResolved {
  const file = normalizeExecApprovals(params.file);
  const defaults = file.defaults ?? {};
  const agentKey = params.agentId ?? DEFAULT_AGENT_ID;
  const agent = file.agents?.[agentKey] ?? {};
  const wildcard = file.agents?.["*"] ?? {};
  const fallbackSecurity = params.overrides?.security ?? EXEC_APPROVAL_DEFAULTS.security;
  const fallbackAsk = params.overrides?.ask ?? EXEC_APPROVAL_DEFAULTS.ask;
  const fallbackAskFallback = params.overrides?.askFallback ?? EXEC_APPROVAL_DEFAULTS.askFallback;
  const fallbackAutoAllowSkills =
    params.overrides?.autoAllowSkills ?? EXEC_APPROVAL_DEFAULTS.autoAllowSkills;
  const resolvedDefaults: Required<ExecApprovalsDefaults> = {
    security: normalizeSecurity(defaults.security, fallbackSecurity),
    ask: normalizeAsk(defaults.ask, fallbackAsk),
    askFallback: normalizeSecurity(defaults.askFallback ?? fallbackAskFallback, fallbackAskFallback),
    autoAllowSkills: Boolean(defaults.autoAllowSkills ?? fallbackAutoAllowSkills),
  };
  const resolvedAgent: Required<ExecApprovalsDefaults> = {
    security: normalizeSecurity(
      agent.security ?? wildcard.security ?? resolvedDefaults.security,
      resolvedDefaults.security,
    ),
    ask: normalizeAsk(agent.ask ?? wildcard.ask ?? resolvedDefaults.ask, resolvedDefaults.ask),
    askFallback: normalizeSecurity(
      agent.askFallback ?? wildcard.askFallback ?? resolvedDefaults.askFallback,
      resolvedDefaults.askFallback,
    ),
    autoAllowSkills: Boolean(
      agent.autoAllowSkills ?? wildcard.autoAllowSkills ?? resolvedDefaults.autoAllowSkills,
    ),
  };
  const allowlist = [
    ...(Array.isArray(wildcard.allowlist) ? wildcard.allowlist : []),
    ...(Array.isArray(agent.allowlist) ? agent.allowlist : []),
  ];
  return {
    path: params.path ?? resolveExecApprovalsPath(),
    socketPath: expandHome(params.socketPath ?? file.socket?.path ?? resolveExecApprovalsSocketPath()),
    token: params.token ?? file.socket?.token ?? "",
    defaults: resolvedDefaults,
    agent: resolvedAgent,
    allowlist,
    file,
  };
}

export { resolveCommandResolution, resolveCommandResolutionFromArgv };
