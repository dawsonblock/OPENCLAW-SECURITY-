import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import { DEFAULT_DANGEROUS_NODE_COMMANDS } from "../gateway/node-command-policy.js";
import { getAllowedBrowserProxyRoots } from "../node-host/browser-proxy.js";
import { computePolicySnapshotHash } from "./lockdown/policy-snapshot.js";

export type InvariantCheckResult = {
  ok: boolean;
  errors: string[];
};

export function validateStartupInvariants(params: {
  cfg: OpenClawConfig;
  env: NodeJS.ProcessEnv;
  bindHost?: string;
  tailscaleMode?: string;
  deps?: {
    computePolicyHash?: typeof computePolicySnapshotHash;
    getBrowserProxyRoots?: typeof getAllowedBrowserProxyRoots;
  };
}): InvariantCheckResult {
  const errors: string[] = [];
  const isProduction = params.env.NODE_ENV === "production";
  const bindHost = params.bindHost ?? "127.0.0.1";
  const tailscaleMode = params.tailscaleMode ?? "off";
  const computePolicyHash = params.deps?.computePolicyHash ?? computePolicySnapshotHash;
  const resolveBrowserProxyRoots = params.deps?.getBrowserProxyRoots ?? getAllowedBrowserProxyRoots;

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
  const dangerous = allowedCommands.filter((cmd: string) =>
    DEFAULT_DANGEROUS_NODE_COMMANDS.includes(cmd),
  );
  if (dangerous.length > 0 && isProduction) {
    errors.push(
      `Critical Invariant Failed: Dangerous commands allowed in production config: ${dangerous.join(", ")}`,
    );
  }

  // 4. Policy Snapshot Wiring
  // Startup must be able to compute the same posture hash enforced again on the
  // dangerous hot path. If this fails, runtime drift checks cannot be trusted.
  try {
    const snapshotHash = computePolicyHash({
      cfg: params.cfg,
      env: params.env,
      bindHost,
      tailscaleMode,
    });
    if (!snapshotHash.trim()) {
      errors.push("Critical Invariant Failed: Policy snapshot hash computed as empty");
    }
  } catch (error) {
    errors.push(
      `Critical Invariant Failed: Policy snapshot hash unavailable at startup: ${String(error)}`,
    );
  }

  // 5. Browser Proxy Root Sanity
  // The runtime browser proxy read path is locked to explicit roots. Mirror that
  // guarantee at startup so root broadening/drift fails closed before serving.
  if (params.cfg.nodeHost?.browserProxy?.enabled !== false) {
    let roots: string[] = [];
    try {
      roots = resolveBrowserProxyRoots();
    } catch (error) {
      errors.push(
        `Critical Invariant Failed: Browser proxy roots unavailable at startup: ${String(error)}`,
      );
    }

    const normalizedRoots = roots.map((root) => path.resolve(root));
    if (normalizedRoots.length === 0) {
      errors.push("Critical Invariant Failed: Browser proxy has no approved roots");
    }
    const invalidRoots = normalizedRoots.filter((root) => {
      if (!root.trim() || !path.isAbsolute(root)) {
        return true;
      }
      return path.parse(root).root === root;
    });
    if (invalidRoots.length > 0) {
      errors.push(
        `Critical Invariant Failed: Browser proxy roots must be explicit absolute subdirectories (found: ${invalidRoots.join(", ")})`,
      );
    }
    const uniqueRoots = new Set(
      normalizedRoots.map((root) => (process.platform === "win32" ? root.toLowerCase() : root)),
    );
    if (uniqueRoots.size !== normalizedRoots.length) {
      errors.push("Critical Invariant Failed: Browser proxy roots must be unique");
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
