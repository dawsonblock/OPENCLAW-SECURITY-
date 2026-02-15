import type { OpenClawConfig } from "../../config/config.js";
import { DEFAULT_DANGEROUS_NODE_COMMANDS } from "../gateway/node-command-policy.js";

export type InvariantCheckResult = {
  ok: boolean;
  errors: string[];
};

export function validateStartupInvariants(params: {
  cfg: OpenClawConfig;
  env: NodeJS.ProcessEnv;
}): InvariantCheckResult {
  const errors: string[] = [];
  const isProduction = params.env.NODE_ENV === "production";

  // 1. Break-Glass Flags in Production
  // In production, NO break-glass flags should be active, period.
  if (isProduction) {
    const breakGlassKeys = Object.keys(params.env).filter((k) => k.startsWith("OPENCLAW_ALLOW_"));
    if (breakGlassKeys.length > 0) {
      errors.push(
        `Critical Invariant Failed: Break-glass flags detection in production: ${breakGlassKeys.join(
          ", ",
        )}`,
      );
    }
  }

  // 2. Sandbox Requirement
  // "Exec" functionality MUST require sandbox.
  // This is a semantic check on the config/policy.
  // (Assuming typical RFSN policy structure, or checking hardcoded defaults if policy isn't loaded yet)
  const networkMode = params.env.OPENCLAW_SANDBOX_NETWORK;
  if (networkMode && networkMode !== "none" && isProduction) {
    // In strict hardening, we might want to fail if network is anything but 'none'
    // unless a specific override is present (which we just banned above).
    errors.push(
      `Critical Invariant Failed: Sandbox network must be 'none' in production (found: ${networkMode})`,
    );
  }

  // 3. Dangerous Commands in Config
  // Ensure no "always allowed" dangerous commands are present in the config if running in production
  const allowedCommands = params.cfg.gateway?.nodes?.allowCommands ?? [];
  const dangerous = allowedCommands.filter((cmd) => DEFAULT_DANGEROUS_NODE_COMMANDS.includes(cmd));
  if (dangerous.length > 0 && isProduction) {
    errors.push(
      `Critical Invariant Failed: Dangerous commands allowed in production config: ${dangerous.join(", ")}`,
    );
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
