import { DEFAULT_DANGEROUS_NODE_COMMANDS } from "../gateway/node-command-policy.js";

export type NodeCommandCapabilityPolicy = {
  command: string;
  capability: string;
  dangerous: boolean;
  requiresAdmin: boolean;
  requiresSessionKey: boolean;
  requiresApprovalToken: boolean;
  requiresSafeExposure: boolean;
  breakGlassEnv?: string;
};

const COMMAND_OVERRIDES: Record<
  string,
  Pick<
    NodeCommandCapabilityPolicy,
    | "requiresAdmin"
    | "requiresSessionKey"
    | "requiresApprovalToken"
    | "requiresSafeExposure"
    | "breakGlassEnv"
  >
> = {
  "system.run": {
    requiresAdmin: false,
    requiresSessionKey: true,
    requiresApprovalToken: true,
    requiresSafeExposure: true,
    breakGlassEnv: "OPENCLAW_ALLOW_NODE_EXEC",
  },
  "system.execApprovals.get": {
    requiresAdmin: true,
    requiresSessionKey: false,
    requiresApprovalToken: true,
    requiresSafeExposure: false,
  },
  "system.execApprovals.set": {
    requiresAdmin: true,
    requiresSessionKey: false,
    requiresApprovalToken: true,
    requiresSafeExposure: false,
    breakGlassEnv: "OPENCLAW_ALLOW_POLICY_MUTATION",
  },
  "browser.proxy": {
    requiresAdmin: true,
    requiresSessionKey: false,
    requiresApprovalToken: true,
    requiresSafeExposure: true,
    breakGlassEnv: "OPENCLAW_ALLOW_BROWSER_PROXY",
  },
};

function enabledByEnv(env: NodeJS.ProcessEnv, key: string): boolean {
  const value = env[key]?.trim().toLowerCase();
  return value === "1" || value === "true";
}

export function isBreakGlassEnvEnabled(env: NodeJS.ProcessEnv, key: string): boolean {
  return enabledByEnv(env, key);
}

export function resolveNodeCommandCapabilityPolicy(command: string): NodeCommandCapabilityPolicy {
  const normalized = command.trim();
  const override = COMMAND_OVERRIDES[normalized];
  const dangerous = DEFAULT_DANGEROUS_NODE_COMMANDS.includes(normalized);
  return {
    command: normalized,
    capability: `node.${normalized}`,
    dangerous,
    requiresAdmin: override?.requiresAdmin ?? false,
    requiresSessionKey: override?.requiresSessionKey ?? false,
    requiresApprovalToken: override?.requiresApprovalToken ?? false,
    requiresSafeExposure: override?.requiresSafeExposure ?? false,
    breakGlassEnv: override?.breakGlassEnv,
  };
}
