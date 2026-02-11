import type { RfsnRisk } from "./types.js";
import {
  type RfsnPolicyConstraints,
  type RfsnPolicyToolRuleConstraints,
  loadPolicyConstraintsFromFile,
} from "./policy-file.js";
import { sha256Hex, verifyDetachedSignature } from "./policy-signature.js";
import { createDefaultRfsnPolicy, type RfsnPolicy, type RfsnToolRule } from "./policy.js";

export type PolicyBootstrap = {
  policy: RfsnPolicy;
  policySha256: string;
  source: "file" | "default";
};

const RISK_ORDER: Record<RfsnRisk, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function intersectSet(base: Set<string>, constraint: Iterable<string>): Set<string> {
  const constraintSet = new Set([...constraint].map((entry) => entry.trim()).filter(Boolean));
  return new Set([...base].filter((entry) => constraintSet.has(entry)));
}

function unionSet(base: Set<string>, extra: Iterable<string>): Set<string> {
  const next = new Set(base);
  for (const entry of extra) {
    const normalized = entry.trim();
    if (normalized) {
      next.add(normalized);
    }
  }
  return next;
}

function cloneToolRule(rule: RfsnToolRule | undefined): RfsnToolRule {
  if (!rule) {
    return {};
  }
  return {
    risk: rule.risk,
    maxArgsBytes: rule.maxArgsBytes,
    capabilitiesRequired: rule.capabilitiesRequired
      ? [...new Set(rule.capabilitiesRequired.map((cap) => cap.trim()).filter(Boolean))]
      : undefined,
    requireSandbox: rule.requireSandbox,
  };
}

function strictRisk(
  baseRisk: RfsnRisk | undefined,
  constraintRisk: RfsnRisk | undefined,
): RfsnRisk | undefined {
  if (!baseRisk) {
    return constraintRisk;
  }
  if (!constraintRisk) {
    return baseRisk;
  }
  return RISK_ORDER[baseRisk] >= RISK_ORDER[constraintRisk] ? baseRisk : constraintRisk;
}

function minDefined(baseValue?: number, constraintValue?: number): number | undefined {
  if (typeof baseValue === "number" && typeof constraintValue === "number") {
    return Math.min(baseValue, constraintValue);
  }
  if (typeof constraintValue === "number") {
    return constraintValue;
  }
  return baseValue;
}

function mergeToolRule(
  baseRule: RfsnToolRule | undefined,
  constraintRule: RfsnPolicyToolRuleConstraints | undefined,
): RfsnToolRule {
  const merged = cloneToolRule(baseRule);
  if (!constraintRule) {
    return merged;
  }
  merged.risk = strictRisk(merged.risk, constraintRule.risk);
  merged.maxArgsBytes = minDefined(merged.maxArgsBytes, constraintRule.maxArgsBytes);
  if (constraintRule.requireSandbox === true) {
    merged.requireSandbox = true;
  }
  if (constraintRule.capabilitiesRequired) {
    const baseCapabilities = merged.capabilitiesRequired ?? [];
    merged.capabilitiesRequired = [
      ...new Set(
        [...baseCapabilities, ...constraintRule.capabilitiesRequired]
          .map((capability) => capability.trim())
          .filter(Boolean),
      ),
    ];
  }
  return merged;
}

function applyPolicyConstraints(
  basePolicy: RfsnPolicy,
  constraints: RfsnPolicyConstraints,
): RfsnPolicy {
  const next: RfsnPolicy = {
    ...basePolicy,
    mode:
      basePolicy.mode === "allowlist" || constraints.mode === "allowlist"
        ? "allowlist"
        : "allow_all",
    allowTools: new Set(basePolicy.allowTools),
    denyTools: new Set(basePolicy.denyTools),
    grantedCapabilities: new Set(basePolicy.grantedCapabilities),
    execSafeBins: new Set(basePolicy.execSafeBins),
    fetchAllowedDomains: new Set(basePolicy.fetchAllowedDomains),
    toolRules: Object.fromEntries(
      Object.entries(basePolicy.toolRules).map(([toolName, rule]) => [
        toolName,
        cloneToolRule(rule),
      ]),
    ),
  };

  if (constraints.allowTools) {
    next.allowTools = intersectSet(next.allowTools, constraints.allowTools);
  }
  if (constraints.denyTools) {
    next.denyTools = unionSet(next.denyTools, constraints.denyTools);
  }
  if (constraints.grantedCapabilities) {
    next.grantedCapabilities = intersectSet(
      next.grantedCapabilities,
      constraints.grantedCapabilities,
    );
  }
  if (constraints.execSafeBins) {
    next.execSafeBins = intersectSet(next.execSafeBins, constraints.execSafeBins);
  }
  if (constraints.fetchAllowedDomains) {
    next.fetchAllowedDomains = intersectSet(
      next.fetchAllowedDomains,
      constraints.fetchAllowedDomains,
    );
  }
  if (typeof constraints.fetchAllowSubdomains === "boolean") {
    next.fetchAllowSubdomains = next.fetchAllowSubdomains && constraints.fetchAllowSubdomains;
  }
  if (constraints.enforceFetchDomainAllowlist === true) {
    next.enforceFetchDomainAllowlist = true;
  }
  if (constraints.blockExecCommandSubstitution === true) {
    next.blockExecCommandSubstitution = true;
  }
  next.maxArgsBytes = minDefined(next.maxArgsBytes, constraints.maxArgsBytes) ?? next.maxArgsBytes;

  if (constraints.toolRules) {
    for (const [toolName, constraintRule] of Object.entries(constraints.toolRules)) {
      next.toolRules[toolName] = mergeToolRule(next.toolRules[toolName], constraintRule);
    }
  }

  return next;
}

export function bootstrapRfsnPolicy(params: {
  basePolicy: RfsnPolicy;
  policyPath?: string;
  verify?: boolean;
  publicKeyPem?: string;
}): PolicyBootstrap {
  const verify = params.verify === true;
  const policyPath = params.policyPath?.trim();

  if (!policyPath) {
    if (verify) {
      throw new Error("policy_verify_enabled_but_no_policy_path");
    }
    return {
      policy: params.basePolicy,
      policySha256: "default",
      source: "default",
    };
  }

  const loaded = loadPolicyConstraintsFromFile(policyPath);
  if (verify) {
    const publicKeyPem = params.publicKeyPem?.trim();
    if (!publicKeyPem) {
      throw new Error("policy_verify_enabled_but_no_public_key");
    }
    const signaturePath = `${policyPath}.sig`;
    const verified = verifyDetachedSignature({
      data: loaded.bytes,
      signaturePath,
      publicKeyPem,
    });
    if (!verified) {
      throw new Error("policy_signature_invalid");
    }
  }

  return {
    policy: applyPolicyConstraints(params.basePolicy, loaded.constraints),
    policySha256: sha256Hex(loaded.bytes),
    source: "file",
  };
}

export function createAndBootstrapDefaultPolicy(params?: {
  basePolicyOptions?: Parameters<typeof createDefaultRfsnPolicy>[0];
  policyPath?: string;
  verify?: boolean;
  publicKeyPem?: string;
}): PolicyBootstrap {
  const verify =
    typeof params?.verify === "boolean"
      ? params.verify
      : process.env.OPENCLAW_VERIFY_POLICY === "1";
  const policyPath = params?.policyPath ?? process.env.OPENCLAW_POLICY_PATH;
  const publicKeyPem = params?.publicKeyPem ?? process.env.OPENCLAW_POLICY_PUBKEY;
  const basePolicy = createDefaultRfsnPolicy({
    ...params?.basePolicyOptions,
    // File-backed policy bootstraps should not be widened by ambient OPENCLAW_RFSN_* env.
    useEnvOverrides: !policyPath,
  });
  return bootstrapRfsnPolicy({
    basePolicy,
    policyPath,
    verify,
    publicKeyPem,
  });
}
