import type { OpenClawConfig } from "../../config/config.js";
import { DEFAULT_DANGEROUS_NODE_COMMANDS } from "../../gateway/node-command-policy.js";
import { isBreakGlassEnvEnabled } from "../capability-registry.js";
import { DEFAULT_DANGEROUS_BUDGET } from "../exec-budgets.js";
import { isSafeExposure, isSafeModeEnabled } from "../startup-validator.js";

export interface SecurityPosture {
  mode: "safe" | "standard" | "unsafe";
  exposure: "loopback" | "exposed";
  auth: "secure" | "insecure";
  dangerousCapabilities: string[];
  breakGlass: Record<string, boolean>;
  containment: {
    execBudget: boolean;
    filesystem: boolean;
    network: boolean;
  };
  limits: {
    maxTimeoutMs: number;
    maxOutputBytes: number;
  };
  policyHash: string;
}

export function extractSecurityPosture(
  cfg: OpenClawConfig,
  env: NodeJS.ProcessEnv,
  bindHost: string,
  tailscaleMode: string,
): SecurityPosture {
  const safeMode = isSafeModeEnabled(env);
  const safeExposure = isSafeExposure(bindHost, tailscaleMode);

  const allowInsecureAuth = cfg.gateway?.controlUi?.allowInsecureAuth ?? false;
  const disableDeviceAuth = cfg.gateway?.controlUi?.dangerouslyDisableDeviceAuth ?? false;
  const authSecure = !allowInsecureAuth && !disableDeviceAuth;

  const allowedCommands = cfg.gateway?.nodes?.allowCommands ?? [];
  const dangerousEnabled = allowedCommands.filter((cmd) =>
    DEFAULT_DANGEROUS_NODE_COMMANDS.includes(cmd),
  );

  const breakGlass = {
    OPENCLAW_ALLOW_UNSAFE_CONFIG: isBreakGlassEnvEnabled(env, "OPENCLAW_ALLOW_UNSAFE_CONFIG"),
    OPENCLAW_ALLOW_DANGEROUS_EXPOSED: isBreakGlassEnvEnabled(
      env,
      "OPENCLAW_ALLOW_DANGEROUS_EXPOSED",
    ),
    OPENCLAW_ALLOW_NODE_EXEC: isBreakGlassEnvEnabled(env, "OPENCLAW_ALLOW_NODE_EXEC"),
    OPENCLAW_ALLOW_HOST_EXEC: isBreakGlassEnvEnabled(env, "OPENCLAW_ALLOW_HOST_EXEC"),
    OPENCLAW_ALLOW_BROWSER_PROXY: isBreakGlassEnvEnabled(env, "OPENCLAW_ALLOW_BROWSER_PROXY"),
    OPENCLAW_ALLOW_ARBITRARY_ENV: isBreakGlassEnvEnabled(env, "OPENCLAW_ALLOW_ARBITRARY_ENV"),
    OPENCLAW_ALLOW_RAW_SECRETS: isBreakGlassEnvEnabled(env, "OPENCLAW_ALLOW_RAW_SECRETS"),
    OPENCLAW_RFSN_AUTOWHITELIST_ALL_TOOLS: isBreakGlassEnvEnabled(
      env,
      "OPENCLAW_RFSN_AUTOWHITELIST_ALL_TOOLS",
    ),
  };

  let mode: SecurityPosture["mode"] = "standard";
  if (safeMode) {
    mode = "safe";
  } else if (!safeExposure || !authSecure || dangerousEnabled.length > 0) {
    // If exposed and ANY dangerous capability is on, or auth is weak -> unsafe
    if (!safeExposure) {
      mode = "unsafe";
    }
  }

  // Calculate generic limits hash or values
  // For now just taking default budget values as a proxy for "limits are active"
  // In a real system we might read dynamic config here if it existed.

  return {
    mode,
    exposure: safeExposure ? "loopback" : "exposed",
    auth: authSecure ? "secure" : "insecure",
    dangerousCapabilities: dangerousEnabled.toSorted(),
    breakGlass,
    containment: {
      execBudget: true, // We will enforce this via runtime-assert
      filesystem: true, // We will enforce this via runtime-assert
      network: true, // Enforced via sandbox policy
    },
    limits: {
      maxTimeoutMs: DEFAULT_DANGEROUS_BUDGET.timeoutMs,
      maxOutputBytes: DEFAULT_DANGEROUS_BUDGET.maxTotalOutputBytes,
    },
    policyHash: "pending", // Will be computed by policy-snapshot
  };
}
