import type { RfsnCapability, RfsnRisk } from "./types.js";
import { DEFAULT_SAFE_BINS } from "../infra/exec-approvals.js";

export type RfsnPolicyMode = "allow_all" | "allowlist";

export type RfsnToolRule = {
  risk?: RfsnRisk;
  maxArgsBytes?: number;
  capabilitiesRequired?: RfsnCapability[];
  requireSandbox?: boolean;
};

export type RfsnPolicy = {
  mode: RfsnPolicyMode;
  maxArgsBytes: number;
  allowTools: Set<string>;
  denyTools: Set<string>;
  grantedCapabilities: Set<RfsnCapability>;
  execSafeBins: Set<string>;
  fetchAllowedDomains: Set<string>;
  fetchAllowSubdomains: boolean;
  enforceFetchDomainAllowlist: boolean;
  blockExecCommandSubstitution: boolean;
  toolRules: Record<string, RfsnToolRule>;
};

const DEFAULT_MAX_ARGS_BYTES = 128_000;
const DEFAULT_ALLOWED_TOOLS = [
  "agents_list",
  "apply_patch",
  "browser",
  "canvas",
  "cron",
  "edit",
  "exec",
  "gateway",
  "image",
  "memory_get",
  "memory_search",
  "message",
  "nodes",
  "process",
  "read",
  "session_status",
  "sessions_history",
  "sessions_list",
  "sessions_send",
  "sessions_spawn",
  "tts",
  "web_fetch",
  "web_search",
  "write",
] as const;
const DEFAULT_GRANTED_CAPABILITIES = [
  "fs:read:workspace",
  "fs:write:workspace",
  "session:spawn",
] as const;
const DEFAULT_EXEC_SAFE_BINS = [
  ...DEFAULT_SAFE_BINS,
  "cat",
  "cp",
  "echo",
  "find",
  "git",
  "ls",
  "mkdir",
  "mv",
  "pwd",
  "rg",
  "sed",
  "touch",
  "which",
] as const;
const DEFAULT_TOOL_RULES: Record<string, RfsnToolRule> = {
  agents_list: { risk: "low", capabilitiesRequired: ["fs:read:workspace"] },
  apply_patch: { risk: "medium", capabilitiesRequired: ["fs:write:workspace"] },
  browser: { risk: "high", capabilitiesRequired: ["net:browser"] },
  canvas: { risk: "high", capabilitiesRequired: ["server:local:canvas"] },
  cron: { risk: "medium", capabilitiesRequired: ["fs:write:workspace"] },
  edit: { risk: "medium", capabilitiesRequired: ["fs:write:workspace"] },
  exec: { risk: "high", capabilitiesRequired: ["proc:manage"], requireSandbox: true },
  gateway: { risk: "high", capabilitiesRequired: ["net:gateway"] },
  image: { risk: "medium", capabilitiesRequired: ["net:outbound"] },
  memory_get: { risk: "low", capabilitiesRequired: ["fs:read:workspace"] },
  memory_search: { risk: "low", capabilitiesRequired: ["fs:read:workspace"] },
  message: { risk: "high", capabilitiesRequired: ["net:messaging"] },
  nodes: { risk: "high", capabilitiesRequired: ["net:gateway"] },
  process: { risk: "high", capabilitiesRequired: ["proc:manage"], requireSandbox: true },
  read: { risk: "low", capabilitiesRequired: ["fs:read:workspace"] },
  session_status: { risk: "low", capabilitiesRequired: ["fs:read:workspace"] },
  sessions_history: { risk: "low", capabilitiesRequired: ["fs:read:workspace"] },
  sessions_list: { risk: "low", capabilitiesRequired: ["fs:read:workspace"] },
  sessions_send: { risk: "high", capabilitiesRequired: ["net:messaging"] },
  sessions_spawn: { risk: "medium", capabilitiesRequired: ["session:spawn"] },
  tts: { risk: "medium", capabilitiesRequired: ["net:tts"] },
  web_fetch: { risk: "high", capabilitiesRequired: ["net:outbound"] },
  web_search: { risk: "high", capabilitiesRequired: ["net:search"] },
  write: { risk: "medium", capabilitiesRequired: ["fs:write:workspace"] },
};

function parseCsv(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function toSet(values: Iterable<string>): Set<string> {
  return new Set([...values].map((value) => value.trim()).filter(Boolean));
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function resolveMode(rawMode: string | undefined, fallback: RfsnPolicyMode): RfsnPolicyMode {
  const normalized = rawMode?.trim().toLowerCase();
  if (normalized === "allow_all") {
    return "allow_all";
  }
  if (normalized === "allowlist") {
    return "allowlist";
  }
  return fallback;
}

export function createDefaultRfsnPolicy(params?: {
  mode?: RfsnPolicyMode;
  allowTools?: Iterable<string>;
  denyTools?: Iterable<string>;
  grantedCapabilities?: Iterable<RfsnCapability>;
  toolRules?: Record<string, RfsnToolRule>;
  maxArgsBytes?: number;
  execSafeBins?: Iterable<string>;
  fetchAllowedDomains?: Iterable<string>;
  fetchAllowSubdomains?: boolean;
  enforceFetchDomainAllowlist?: boolean;
  blockExecCommandSubstitution?: boolean;
}): RfsnPolicy {
  const seededAllowTools = toSet(
    params?.allowTools ?? (DEFAULT_ALLOWED_TOOLS as readonly string[]),
  );
  const seededCapabilities = toSet([
    ...(DEFAULT_GRANTED_CAPABILITIES as readonly string[]),
    ...(params?.grantedCapabilities ?? []),
  ]);
  const seededExecSafeBins = toSet(
    params?.execSafeBins ?? (DEFAULT_EXEC_SAFE_BINS as readonly string[]),
  );
  const seededFetchAllowedDomains = toSet(params?.fetchAllowedDomains ?? []);
  const envAllowTools = toSet(parseCsv(process.env.OPENCLAW_RFSN_ALLOW_TOOLS));
  const envDenyTools = toSet(parseCsv(process.env.OPENCLAW_RFSN_DENY_TOOLS));
  const envGrantedCapabilities = toSet(parseCsv(process.env.OPENCLAW_RFSN_GRANTED_CAPABILITIES));
  const envExecSafeBins = toSet(parseCsv(process.env.OPENCLAW_RFSN_EXEC_SAFE_BINS));
  const envFetchAllowedDomains = toSet(parseCsv(process.env.OPENCLAW_RFSN_FETCH_ALLOW_DOMAINS));

  const mode = params?.mode ?? resolveMode(process.env.OPENCLAW_RFSN_MODE, "allowlist");
  const execSafeBins = toSet([...seededExecSafeBins, ...envExecSafeBins]);
  const fetchAllowedDomains = toSet([...seededFetchAllowedDomains, ...envFetchAllowedDomains]);
  const fetchAllowSubdomains =
    params?.fetchAllowSubdomains ??
    parseBooleanEnv(process.env.OPENCLAW_RFSN_FETCH_ALLOW_SUBDOMAINS, true);
  const enforceFetchDomainAllowlist =
    params?.enforceFetchDomainAllowlist ??
    parseBooleanEnv(process.env.OPENCLAW_RFSN_ENFORCE_FETCH_DOMAIN_ALLOWLIST, true);
  const blockExecCommandSubstitution =
    params?.blockExecCommandSubstitution ??
    parseBooleanEnv(process.env.OPENCLAW_RFSN_BLOCK_EXEC_COMMAND_SUBSTITUTION, true);

  const grantedCapabilities = toSet([...seededCapabilities, ...envGrantedCapabilities]);
  for (const bin of execSafeBins) {
    grantedCapabilities.add(`proc:spawn:${bin}`);
  }
  for (const domain of fetchAllowedDomains) {
    grantedCapabilities.add(`net:outbound:${domain.toLowerCase()}`);
  }

  return {
    mode,
    maxArgsBytes:
      typeof params?.maxArgsBytes === "number" && Number.isFinite(params.maxArgsBytes)
        ? Math.max(1, Math.floor(params.maxArgsBytes))
        : DEFAULT_MAX_ARGS_BYTES,
    allowTools: toSet([...seededAllowTools, ...envAllowTools]),
    denyTools: toSet([...(params?.denyTools ?? []), ...envDenyTools]),
    grantedCapabilities,
    execSafeBins,
    fetchAllowedDomains,
    fetchAllowSubdomains,
    enforceFetchDomainAllowlist,
    blockExecCommandSubstitution,
    toolRules: {
      ...DEFAULT_TOOL_RULES,
      ...params?.toolRules,
    },
  };
}
