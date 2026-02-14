import { failInvariant, SecurityInvariantViolation } from "./invariants.js";

// System-wide limits
const MAX_CONCURRENT_DANGEROUS_OPS = 5; // Conservative default
const MAX_LEDGER_QUEUE_LENGTH = 1000;
const MAX_APPROVAL_TOKEN_MAP_SIZE = 5000;

let concurrentDangerousOps = 0;
// We don't have direct access to ledger queue or token map size here unless we hook into them or they report here.
// For now, we'll just track concurrent ops.

/**
 * Acquires a slot for a dangerous operation.
 * Throws if system limits are exceeded.
 */
export function acquireDangerousSlot() {
  if (concurrentDangerousOps >= MAX_CONCURRENT_DANGEROUS_OPS) {
    failInvariant(
      SecurityInvariantViolation.RESOURCE_EXHAUSTION,
      `Max concurrent dangerous operations exceeded (${MAX_CONCURRENT_DANGEROUS_OPS})`,
    );
  }
  concurrentDangerousOps++;
}

/**
 * Releases a slot for a dangerous operation.
 */
export function releaseDangerousSlot() {
  if (concurrentDangerousOps > 0) {
    concurrentDangerousOps--;
  }
}

/**
 * Returns current usage stats.
 */
export function getResourceUsage() {
  return {
    concurrentDangerousOps,
    maxConcurrentDangerousOps: MAX_CONCURRENT_DANGEROUS_OPS,
  };
}
