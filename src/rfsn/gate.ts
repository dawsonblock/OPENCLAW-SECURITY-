import type { RfsnPolicy } from "./policy.js";
import type { RfsnActionProposal, RfsnGateDecision, RfsnRisk } from "./types.js";
import { validateAndNormalizeActionProposal } from "./schemas.js";

function approxJsonBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function resolveRisk(toolName: string, policy: RfsnPolicy, declaredRisk?: RfsnRisk): RfsnRisk {
  if (declaredRisk) {
    return declaredRisk;
  }
  const configured = policy.toolRules[toolName]?.risk;
  if (configured) {
    return configured;
  }
  const normalized = toolName.toLowerCase();
  if (
    normalized.includes("exec") ||
    normalized.includes("bash") ||
    normalized.includes("process") ||
    normalized.includes("spawn")
  ) {
    return "high";
  }
  if (
    normalized.includes("fetch") ||
    normalized.includes("web") ||
    normalized.includes("browser") ||
    normalized.includes("http")
  ) {
    return "high";
  }
  if (
    normalized.includes("write") ||
    normalized.includes("edit") ||
    normalized.includes("patch") ||
    normalized.includes("delete")
  ) {
    return "medium";
  }
  return "low";
}

function collectMissingCapabilities(params: {
  required: string[];
  granted: Set<string>;
}): string[] {
  const missing: string[] = [];
  for (const capability of params.required) {
    if (!params.granted.has(capability)) {
      missing.push(`capability_missing:${capability}`);
    }
  }
  return missing;
}

export function evaluateGate(params: {
  policy: RfsnPolicy;
  proposal: RfsnActionProposal;
  sandboxed?: boolean;
}): RfsnGateDecision {
  const validated = validateAndNormalizeActionProposal(params.proposal);
  if (!validated.ok) {
    return {
      verdict: "deny",
      reasons: validated.reasons,
      risk: "high",
    };
  }

  const proposal = validated.proposal;
  const rule = params.policy.toolRules[proposal.toolName];
  const risk = resolveRisk(proposal.toolName, params.policy, proposal.risk);

  if (params.policy.denyTools.has(proposal.toolName)) {
    return {
      verdict: "deny",
      reasons: ["policy:tool_denied"],
      risk,
    };
  }

  if (params.policy.mode === "allowlist" && !params.policy.allowTools.has(proposal.toolName)) {
    return {
      verdict: "deny",
      reasons: ["policy:tool_not_allowlisted"],
      risk,
    };
  }

  const maxArgsBytes = rule?.maxArgsBytes ?? params.policy.maxArgsBytes;
  const argsBytes = approxJsonBytes(proposal.args);
  if (!Number.isFinite(argsBytes) || argsBytes > maxArgsBytes) {
    return {
      verdict: "deny",
      reasons: ["policy:args_too_large"],
      risk,
    };
  }

  if (rule?.requireSandbox && !params.sandboxed) {
    return {
      verdict: "require_sandbox_only",
      reasons: ["policy:sandbox_required"],
      risk,
    };
  }

  const requiredCapabilities = [
    ...(proposal.capabilitiesRequired ?? []),
    ...(rule?.capabilitiesRequired ?? []),
  ];
  const dedupedCapabilities = [...new Set(requiredCapabilities.map((cap) => cap.trim()))].filter(
    Boolean,
  );
  if (dedupedCapabilities.length > 0) {
    const missing = collectMissingCapabilities({
      required: dedupedCapabilities,
      granted: params.policy.grantedCapabilities,
    });
    if (missing.length > 0) {
      return {
        verdict: "deny",
        reasons: missing,
        risk,
      };
    }
  }

  return {
    verdict: "allow",
    reasons: ["ok"],
    risk,
    normalizedArgs: proposal.args,
    capsGranted: dedupedCapabilities,
  };
}
