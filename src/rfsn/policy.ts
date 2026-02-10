import type { RfsnCapability, RfsnRisk } from "./types.js";

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
  toolRules: Record<string, RfsnToolRule>;
};

const DEFAULT_MAX_ARGS_BYTES = 128_000;

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
}): RfsnPolicy {
  const seededAllowTools = toSet(params?.allowTools ?? []);
  const envAllowTools = toSet(parseCsv(process.env.OPENCLAW_RFSN_ALLOW_TOOLS));
  const envDenyTools = toSet(parseCsv(process.env.OPENCLAW_RFSN_DENY_TOOLS));
  const envGrantedCapabilities = toSet(parseCsv(process.env.OPENCLAW_RFSN_GRANTED_CAPABILITIES));

  const mode = params?.mode ?? resolveMode(process.env.OPENCLAW_RFSN_MODE, "allowlist");

  return {
    mode,
    maxArgsBytes:
      typeof params?.maxArgsBytes === "number" && Number.isFinite(params.maxArgsBytes)
        ? Math.max(1, Math.floor(params.maxArgsBytes))
        : DEFAULT_MAX_ARGS_BYTES,
    allowTools: toSet([...seededAllowTools, ...envAllowTools]),
    denyTools: toSet([...(params?.denyTools ?? []), ...envDenyTools]),
    grantedCapabilities: toSet([...(params?.grantedCapabilities ?? []), ...envGrantedCapabilities]),
    toolRules: {
      exec: { risk: "high" },
      bash: { risk: "high" },
      process: { risk: "high" },
      apply_patch: { risk: "medium" },
      write: { risk: "medium" },
      ...params?.toolRules,
    },
  };
}
