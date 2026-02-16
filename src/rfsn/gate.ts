import type { RfsnPolicy } from "./policy.js";
import type { RfsnActionProposal, RfsnGateDecision, RfsnRisk } from "./types.js";
import { evaluateShellAllowlist } from "../infra/exec-approvals.js";
import { getGateFeedbackTracker, isAdaptiveRiskEnabled } from "./gate-feedback.js";
import { validateAndNormalizeActionProposal } from "./schemas.js";

// ── Decision integrity stamp ─────────────────────────────────────────
// A Symbol-based stamp that only evaluateGate can produce. Prevents
// forged RfsnGateDecision objects from being accepted by rfsnDispatch.
const GATE_DECISION_STAMP: unique symbol = Symbol.for("openclaw.rfsn.gateDecisionStamp");

type StampedGateDecision = RfsnGateDecision & {
  [GATE_DECISION_STAMP]?: true;
};

/** Check that a gate decision was produced by evaluateGate (not constructed ad-hoc). */
export function hasValidGateStamp(decision: RfsnGateDecision): boolean {
  return (decision as StampedGateDecision)[GATE_DECISION_STAMP] === true;
}

function stampDecision(decision: RfsnGateDecision): RfsnGateDecision {
  (decision as StampedGateDecision)[GATE_DECISION_STAMP] = true;
  return decision;
}

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
    if (!hasCapability(params.granted, capability)) {
      missing.push(`capability_missing:${capability}`);
    }
  }
  return missing;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasCapability(granted: Set<string>, required: string): boolean {
  if (granted.has(required) || granted.has("*")) {
    return true;
  }
  for (const candidate of granted) {
    if (!candidate.includes("*")) {
      continue;
    }
    const pattern = new RegExp(`^${candidate.split("*").map(escapeRegExp).join(".*")}$`);
    if (pattern.test(required)) {
      return true;
    }
  }
  return false;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

function isDomainAllowlisted(params: {
  hostname: string;
  allowlist: Set<string>;
  allowSubdomains: boolean;
}): boolean {
  const hostname = normalizeHostname(params.hostname);
  if (!hostname) {
    return false;
  }
  if (params.allowlist.has("*")) {
    return true;
  }
  for (const candidate of params.allowlist) {
    const normalized = normalizeHostname(candidate);
    if (!normalized) {
      continue;
    }
    if (hostname === normalized) {
      return true;
    }
    if (normalized.startsWith("*.")) {
      const suffix = normalized.slice(2);
      if (!suffix) {
        continue;
      }
      if (hostname === suffix || hostname.endsWith(`.${suffix}`)) {
        return true;
      }
      continue;
    }
    if (params.allowSubdomains && hostname.endsWith(`.${normalized}`)) {
      return true;
    }
  }
  return false;
}

function resolveUrlHost(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return undefined;
  }
  return normalizeHostname(parsed.hostname);
}

function resolveNetworkCapabilities(params: { policy: RfsnPolicy; proposal: RfsnActionProposal }): {
  requiredCapabilities: string[];
  reasons: string[];
} {
  const args = toRecord(params.proposal.args);
  const toolName = params.proposal.toolName;
  const reasons: string[] = [];
  const requiredCapabilities: string[] = [];
  const urlKeyByTool: Record<string, string[]> = {
    web_fetch: ["url"],
    image: ["image", "url"],
    browser: ["targetUrl", "url"],
    canvas: ["targetUrl", "url"],
  };
  const candidateKeys = urlKeyByTool[toolName] ?? [];
  if (candidateKeys.length === 0) {
    return { requiredCapabilities, reasons };
  }

  let hostname: string | undefined;
  for (const key of candidateKeys) {
    hostname = resolveUrlHost(args?.[key]);
    if (hostname) {
      break;
    }
  }

  if (!hostname) {
    if (toolName === "web_fetch") {
      reasons.push("policy:web_fetch_url_required");
    }
    return { requiredCapabilities, reasons };
  }

  if (params.policy.enforceFetchDomainAllowlist) {
    if (params.policy.fetchAllowedDomains.size === 0) {
      reasons.push("policy:net_domain_allowlist_empty");
      return { requiredCapabilities, reasons };
    }
    if (
      !isDomainAllowlisted({
        hostname,
        allowlist: params.policy.fetchAllowedDomains,
        allowSubdomains: params.policy.fetchAllowSubdomains,
      })
    ) {
      reasons.push(`policy:net_domain_not_allowlisted:${hostname}`);
      return { requiredCapabilities, reasons };
    }
  }

  requiredCapabilities.push(`net:outbound:${hostname}`);
  return { requiredCapabilities, reasons };
}

function resolveBrowserUnsafeEvalCapabilities(params: { proposal: RfsnActionProposal }): {
  requiredCapabilities: string[];
  reasons: string[];
} {
  if (params.proposal.toolName !== "browser") {
    return { requiredCapabilities: [], reasons: [] };
  }

  const args = toRecord(params.proposal.args);
  const action = typeof args?.action === "string" ? args.action.trim().toLowerCase() : "";
  if (action !== "act") {
    return { requiredCapabilities: [], reasons: [] };
  }

  const request = toRecord(args?.request);
  const kind = typeof request?.kind === "string" ? request.kind.trim().toLowerCase() : "";
  const fn = typeof request?.fn === "string" ? request.fn.trim() : "";
  const unsafeEvalRequested = kind === "evaluate" || (kind === "wait" && fn.length > 0);
  if (!unsafeEvalRequested) {
    return { requiredCapabilities: [], reasons: [] };
  }

  const profile = typeof args?.profile === "string" ? args.profile.trim().toLowerCase() : "";
  if (profile === "chrome") {
    return {
      requiredCapabilities: [],
      reasons: ["policy:browser_unsafe_eval_chrome_forbidden"],
    };
  }

  return {
    requiredCapabilities: ["browser:unsafe_eval"],
    reasons: [],
  };
}

function resolveExecCapabilities(params: { policy: RfsnPolicy; proposal: RfsnActionProposal }): {
  requiredCapabilities: string[];
  reasons: string[];
} {
  if (params.proposal.toolName !== "exec") {
    return { requiredCapabilities: [], reasons: [] };
  }
  const args = toRecord(params.proposal.args);
  if (
    args &&
    ("host" in args ||
      "node" in args ||
      "elevated" in args ||
      "security" in args ||
      "ask" in args ||
      "env" in args)
  ) {
    const host = typeof args.host === "string" ? args.host.trim().toLowerCase() : "sandbox";
    const elevated = args.elevated === true;
    // Normalized exec args are sandbox-only unless an explicit capability is granted.
    if (host !== "sandbox" || elevated) {
      return { requiredCapabilities: [], reasons: ["policy:exec_args_not_normalized"] };
    }
  }
  const command = typeof args?.command === "string" ? args.command.trim() : "";
  if (!command) {
    return { requiredCapabilities: [], reasons: ["policy:exec_command_required"] };
  }
  if (command.includes("\0") || command.includes("\r")) {
    return { requiredCapabilities: [], reasons: ["policy:exec_command_invalid_characters"] };
  }
  if (
    params.policy.blockExecCommandSubstitution &&
    (command.includes("$(") || command.includes("`"))
  ) {
    return { requiredCapabilities: [], reasons: ["policy:exec_command_substitution_blocked"] };
  }

  const evaluation = evaluateShellAllowlist({
    command,
    allowlist: [],
    safeBins: params.policy.execSafeBins,
    cwd: process.cwd(),
    env: process.env,
  });
  if (!evaluation.analysisOk) {
    return { requiredCapabilities: [], reasons: ["policy:exec_command_unparseable"] };
  }
  if (!evaluation.allowlistSatisfied) {
    return { requiredCapabilities: [], reasons: ["policy:exec_bin_not_allowlisted"] };
  }

  const bins = new Set<string>();
  for (const segment of evaluation.segments) {
    const executable = segment.resolution?.executableName?.trim().toLowerCase();
    if (executable) {
      bins.add(executable);
    }
  }
  const requiredCapabilities = [...bins].map((bin) => `proc:spawn:${bin}`);
  return { requiredCapabilities, reasons: [] };
}

export function evaluateGate(params: {
  policy: RfsnPolicy;
  proposal: RfsnActionProposal;
  sandboxed?: boolean;
}): RfsnGateDecision {
  const validated = validateAndNormalizeActionProposal(params.proposal, {
    policy: params.policy,
    sandboxed: params.sandboxed,
  });
  if (!validated.ok) {
    return stampDecision({
      verdict: "deny",
      reasons: validated.reasons,
      risk: "high",
    });
  }

  const proposal = validated.proposal;
  const rule = params.policy.toolRules[proposal.toolName];
  const baseRisk = resolveRisk(proposal.toolName, params.policy, proposal.risk);
  const risk = isAdaptiveRiskEnabled()
    ? getGateFeedbackTracker().resolveAdaptiveRisk(proposal.toolName, baseRisk)
    : baseRisk;

  if (params.policy.denyTools.has(proposal.toolName)) {
    return stampDecision({
      verdict: "deny",
      reasons: ["policy:tool_denied"],
      risk,
    });
  }

  if (params.policy.mode === "allowlist" && !params.policy.allowTools.has(proposal.toolName)) {
    return stampDecision({
      verdict: "deny",
      reasons: ["policy:tool_not_allowlisted"],
      risk,
    });
  }

  const maxArgsBytes = rule?.maxArgsBytes ?? params.policy.maxArgsBytes;
  const argsBytes = approxJsonBytes(proposal.args);
  if (!Number.isFinite(argsBytes) || argsBytes > maxArgsBytes) {
    return stampDecision({
      verdict: "deny",
      reasons: ["policy:args_too_large"],
      risk,
    });
  }

  if (rule?.requireSandbox && !params.sandboxed) {
    return stampDecision({
      verdict: "require_sandbox_only",
      reasons: ["policy:sandbox_required"],
      risk,
    });
  }

  const dynamicNetwork = resolveNetworkCapabilities({
    policy: params.policy,
    proposal,
  });
  if (dynamicNetwork.reasons.length > 0) {
    return stampDecision({
      verdict: "deny",
      reasons: dynamicNetwork.reasons,
      risk,
    });
  }
  const dynamicExec = resolveExecCapabilities({
    policy: params.policy,
    proposal,
  });
  if (dynamicExec.reasons.length > 0) {
    return stampDecision({
      verdict: "deny",
      reasons: dynamicExec.reasons,
      risk,
    });
  }
  const dynamicBrowserUnsafeEval = resolveBrowserUnsafeEvalCapabilities({
    proposal,
  });
  if (dynamicBrowserUnsafeEval.reasons.length > 0) {
    return stampDecision({
      verdict: "deny",
      reasons: dynamicBrowserUnsafeEval.reasons,
      risk,
    });
  }

  const requiredCapabilities = [
    ...(proposal.capabilitiesRequired ?? []),
    ...(rule?.capabilitiesRequired ?? []),
    ...dynamicNetwork.requiredCapabilities,
    ...dynamicExec.requiredCapabilities,
    ...dynamicBrowserUnsafeEval.requiredCapabilities,
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
      return stampDecision({
        verdict: "deny",
        reasons: missing,
        risk,
      });
    }
  }

  return stampDecision({
    verdict: "allow",
    reasons: ["ok"],
    risk,
    normalizedArgs: proposal.args,
    capsGranted: dedupedCapabilities,
  });
}
