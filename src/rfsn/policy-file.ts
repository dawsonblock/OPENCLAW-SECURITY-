import fs from "node:fs";
import type { RfsnRisk } from "./types.js";

export type RfsnPolicyToolRuleConstraints = {
  risk?: RfsnRisk;
  maxArgsBytes?: number;
  capabilitiesRequired?: string[];
  requireSandbox?: boolean;
};

export type RfsnPolicyConstraints = {
  mode?: "allow_all" | "allowlist";
  maxArgsBytes?: number;
  allowTools?: string[];
  denyTools?: string[];
  grantedCapabilities?: string[];
  execSafeBins?: string[];
  fetchAllowedDomains?: string[];
  fetchAllowSubdomains?: boolean;
  enforceFetchDomainAllowlist?: boolean;
  blockExecCommandSubstitution?: boolean;
  toolRules?: Record<string, RfsnPolicyToolRuleConstraints>;
};

function normalizeStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = [...new Set(value.map((entry) => String(entry).trim()).filter(Boolean))];
  return normalized.length > 0 ? normalized : [];
}

function normalizeMode(value: unknown): "allow_all" | "allowlist" | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "allow_all" || normalized === "allowlist") {
    return normalized;
  }
  return undefined;
}

function normalizeRisk(value: unknown): RfsnRisk | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high") {
    return normalized;
  }
  return undefined;
}

function normalizePositiveInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(1, Math.floor(value));
}

function normalizeBoolean(value: unknown): boolean | undefined {
  if (typeof value !== "boolean") {
    return undefined;
  }
  return value;
}

function normalizeToolRule(value: unknown): RfsnPolicyToolRuleConstraints | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const normalized: RfsnPolicyToolRuleConstraints = {};
  const risk = normalizeRisk(record.risk);
  if (risk) {
    normalized.risk = risk;
  }
  const maxArgsBytes = normalizePositiveInt(record.maxArgsBytes);
  if (maxArgsBytes !== undefined) {
    normalized.maxArgsBytes = maxArgsBytes;
  }
  const capabilitiesRequired = normalizeStringList(record.capabilitiesRequired);
  if (capabilitiesRequired) {
    normalized.capabilitiesRequired = capabilitiesRequired;
  }
  const requireSandbox = normalizeBoolean(record.requireSandbox);
  if (requireSandbox !== undefined) {
    normalized.requireSandbox = requireSandbox;
  }
  return normalized;
}

function normalizeToolRules(
  value: unknown,
): Record<string, RfsnPolicyToolRuleConstraints> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const rules: Record<string, RfsnPolicyToolRuleConstraints> = {};
  for (const [toolName, rawRule] of Object.entries(value)) {
    const normalizedToolName = toolName.trim();
    if (!normalizedToolName) {
      continue;
    }
    const rule = normalizeToolRule(rawRule);
    if (!rule) {
      continue;
    }
    rules[normalizedToolName] = rule;
  }
  return rules;
}

export function parsePolicyConstraints(raw: unknown): RfsnPolicyConstraints {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("invalid_policy_document");
  }
  const record = raw as Record<string, unknown>;
  return {
    mode: normalizeMode(record.mode),
    maxArgsBytes: normalizePositiveInt(record.maxArgsBytes),
    allowTools: normalizeStringList(record.allowTools),
    denyTools: normalizeStringList(record.denyTools),
    grantedCapabilities: normalizeStringList(record.grantedCapabilities),
    execSafeBins: normalizeStringList(record.execSafeBins),
    fetchAllowedDomains: normalizeStringList(record.fetchAllowedDomains),
    fetchAllowSubdomains: normalizeBoolean(record.fetchAllowSubdomains),
    enforceFetchDomainAllowlist: normalizeBoolean(record.enforceFetchDomainAllowlist),
    blockExecCommandSubstitution: normalizeBoolean(record.blockExecCommandSubstitution),
    toolRules: normalizeToolRules(record.toolRules),
  };
}

export function loadPolicyConstraintsFromFile(policyPath: string): {
  constraints: RfsnPolicyConstraints;
  bytes: Buffer;
} {
  const bytes = fs.readFileSync(policyPath);
  const parsed = JSON.parse(bytes.toString("utf8")) as unknown;
  const constraints = parsePolicyConstraints(parsed);
  return { constraints, bytes };
}
