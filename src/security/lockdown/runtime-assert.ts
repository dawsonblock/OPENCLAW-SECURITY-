import type { OpenClawConfig } from "../../config/config.js";
import {
  resolveNodeCommandCapabilityPolicy,
  isBreakGlassEnvEnabled,
} from "../capability-registry.js";
import { isSafeExposure } from "../startup-validator.js";
import { failInvariant, SecurityInvariantViolation } from "./invariants.js";
import { assertPolicyDrift, computePolicySnapshotHash } from "./policy-snapshot.js";
import { containsRawSecret } from "./secret-scrubber.js";

// We assume the context has these or we pass them in
export type SecurityContext = {
  cfg: OpenClawConfig;
  bindHost: string;
  tailscaleMode: string;
  env: NodeJS.ProcessEnv;
  breakGlass?: boolean; // explicit override if needed
};

/**
 * Main entry point to assert all security invariants before a dangerous operation.
 * Throws InvariantViolationError if any check fails.
 */
export async function assertDangerousCapabilityInvariants(
  capability: string,
  params: unknown,
  context: SecurityContext,
) {
  // 1. Assert Capability Registered
  // We derive policy. If it's not registered/known, resolveNodeCommandCapabilityPolicy might handle it or we check manually.
  // The current registry implementation returns a policy even for unknown commands (defaults to safe?).
  // We should strictly require it to be a known dangerous capability if we are here.
  // But this function is called *because* it's dangerous.
  const command = capability.replace("node.", ""); // naive, adjust if capability format differs
  const policy = resolveNodeCommandCapabilityPolicy(command);

  if (!policy) {
    failInvariant(
      SecurityInvariantViolation.CAPABILITY_UNREGISTERED,
      `Capability ${capability} has no policy definition`,
    );
  }

  // 2. Assert Exposure Safe (Runtime)
  // Re-check exposure at this exact moment.
  if (policy.requiresSafeExposure) {
    const safe = isSafeExposure(context.bindHost, context.tailscaleMode);
    if (!safe) {
      // Check for break-glass
      const allowed = isBreakGlassEnvEnabled(context.env, "OPENCLAW_ALLOW_DANGEROUS_EXPOSED");
      if (!allowed) {
        failInvariant(
          SecurityInvariantViolation.EXPOSURE_UNSAFE,
          `Dangerous capability ${capability} blocked on exposed gateway (OPENCLAW_ALLOW_DANGEROUS_EXPOSED=0)`,
        );
      }
    }
  }

  // 3. Assert Secrets (Input Scan)
  // Naive scan of params.
  // We skip if explicitly allowed (rare).
  const allowRawSecrets = isBreakGlassEnvEnabled(context.env, "OPENCLAW_ALLOW_RAW_SECRETS");
  if (!allowRawSecrets && params && typeof params === "object") {
    const payloadStr = JSON.stringify(params); // expensive? maybe.
    if (containsRawSecret(payloadStr)) {
      failInvariant(
        SecurityInvariantViolation.RAW_SECRET_LEAK,
        `Payload for ${capability} contains likely raw secret`,
      );
    }
  }

  // 4. Policy Drift
  assertPolicyDrift(
    computePolicySnapshotHash({
      cfg: context.cfg,
      env: context.env,
      bindHost: context.bindHost,
      tailscaleMode: context.tailscaleMode,
    }),
    isBreakGlassEnvEnabled(context.env, "OPENCLAW_ALLOW_UNSAFE_CONFIG"),
  );

  // 5. Resource Governance
  // Acquire slot. The caller is responsible for releasing it (try/finally).
  // We just enforce the acquiring here? No, caller should do it to ensure release.
  // But we can check if the system is overloaded.
  // Actually, let's make the caller call `acquireDangerousSlot()`.

  // 6. Break-glass Env Required (if any)
  if (policy.breakGlassEnv) {
    if (!isBreakGlassEnvEnabled(context.env, policy.breakGlassEnv)) {
      failInvariant(
        SecurityInvariantViolation.UNSAFE_STARTUP, // or a better code
        `Capability ${capability} requires break-glass env ${policy.breakGlassEnv}`,
      );
    }
  }
}
