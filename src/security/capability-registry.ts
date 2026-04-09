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
  // ── Execution ──
  "system.run": {
    requiresAdmin: false,
    requiresSessionKey: true,
    requiresApprovalToken: true,
    requiresSafeExposure: true,
    breakGlassEnv: "OPENCLAW_ALLOW_NODE_EXEC",
  },
  // ── Policy mutation ──
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
  // ── Browser / proxy ──
  "browser.proxy": {
    requiresAdmin: true,
    requiresSessionKey: false,
    requiresApprovalToken: true,
    requiresSafeExposure: true,
    breakGlassEnv: "OPENCLAW_ALLOW_BROWSER_PROXY",
  },
  // ── File write / delete ──
  "system.write": {
    requiresAdmin: false,
    requiresSessionKey: true,
    requiresApprovalToken: true,
    requiresSafeExposure: true,
  },
  "system.delete": {
    requiresAdmin: false,
    requiresSessionKey: true,
    requiresApprovalToken: true,
    requiresSafeExposure: true,
  },
  "system.mkdir": {
    requiresAdmin: false,
    requiresSessionKey: true,
    requiresApprovalToken: true,
    requiresSafeExposure: false,
  },
  // ── Download / fetch ──
  "web.fetch": {
    requiresAdmin: false,
    requiresSessionKey: false,
    requiresApprovalToken: true,
    requiresSafeExposure: true,
  },
  "web.download": {
    requiresAdmin: false,
    requiresSessionKey: false,
    requiresApprovalToken: true,
    requiresSafeExposure: true,
  },
  // ── Dependency installation ──
  "system.install": {
    requiresAdmin: true,
    requiresSessionKey: true,
    requiresApprovalToken: true,
    requiresSafeExposure: true,
    breakGlassEnv: "OPENCLAW_ALLOW_INSTALL",
  },
  // ── Secrets access ──
  "secrets.get": {
    requiresAdmin: true,
    requiresSessionKey: true,
    requiresApprovalToken: true,
    requiresSafeExposure: true,
  },
  "secrets.set": {
    requiresAdmin: true,
    requiresSessionKey: true,
    requiresApprovalToken: true,
    requiresSafeExposure: true,
  },
  // ── Contacts / SMS / calendar / email send ──
  "contacts.add": {
    requiresAdmin: false,
    requiresSessionKey: true,
    requiresApprovalToken: true,
    requiresSafeExposure: false,
  },
  "sms.send": {
    requiresAdmin: false,
    requiresSessionKey: true,
    requiresApprovalToken: true,
    requiresSafeExposure: false,
  },
  "calendar.add": {
    requiresAdmin: false,
    requiresSessionKey: true,
    requiresApprovalToken: true,
    requiresSafeExposure: false,
  },
  "reminders.add": {
    requiresAdmin: false,
    requiresSessionKey: true,
    requiresApprovalToken: true,
    requiresSafeExposure: false,
  },
  // ── Screen / camera (privacy-sensitive) ──
  "screen.record": {
    requiresAdmin: false,
    requiresSessionKey: true,
    requiresApprovalToken: true,
    requiresSafeExposure: false,
  },
  "camera.snap": {
    requiresAdmin: false,
    requiresSessionKey: true,
    requiresApprovalToken: true,
    requiresSafeExposure: false,
  },
  "camera.clip": {
    requiresAdmin: false,
    requiresSessionKey: true,
    requiresApprovalToken: true,
    requiresSafeExposure: false,
  },
  // ── System introspection ──
  "system.which": {
    requiresAdmin: false,
    requiresSessionKey: false,
    requiresApprovalToken: true,
    requiresSafeExposure: true,
  },
  "system.env": {
    requiresAdmin: true,
    requiresSessionKey: true,
    requiresApprovalToken: true,
    requiresSafeExposure: true,
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
