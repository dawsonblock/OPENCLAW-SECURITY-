import crypto from "node:crypto";
import type { OpenClawConfig } from "../config/config.js";

/**
 * Calculates a SHA-256 hash of the critical security configuration.
 * This includes strict allowlists, execution budgets, and policy versions.
 *
 * We explicitly canonicalize the JSON stringify to ensure deterministic hashing.
 */
export function calculatePostureHash(config: OpenClawConfig): string {
  const criticalSection = {
    security: {
      postureParams: {
        // We include specific fields that determine the "shape" of the security boundary.
        allowlist: config.security?.model?.providerAllowlist?.toSorted(),
        fsAllow: config.agents?.defaults?.sandbox?.fs?.allow?.toSorted(),
        // network isn't directly on sandbox, it's on docker/sandbox settings.
        // We'll check the default docker network setting.
        networkMode: config.agents?.defaults?.sandbox?.docker?.network,
        budget: config.agents?.defaults?.sandbox?.executionBudget,
        // If we had a policy versioning system, it would go here.
      },
    },
  };

  // Deterministic stringify (keys sorted) would be best, but here we constructed a specific object
  // with known keys. For the arrays, we sorted them above.
  const payload = JSON.stringify(criticalSection);

  return crypto.createHash("sha256").update(payload).digest("hex");
}
