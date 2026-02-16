import { failInvariant, SecurityInvariantViolation } from "./invariants.js";

let baselineHash: string | null = null;

export function getPolicySnapshotHash(): string | null {
  return baselineHash;
}

export function initializePolicySnapshot(hash: string, _strict: boolean = false) {
  if (baselineHash !== null) {
    // Already initialized, this might happen in tests or reloads.
    // Ideally we should warn or error. For now, we allow re-init only if identical or force.
    // But strict security generally implies "once at startup".
    // Let's log if it changes, but keep the first one as baseline?
    // Or allow re-init?
    // The prompt says "On startup: compute hash ... store snapshot".
    // "Runtime detects drift."
    // So we should set it once.
    if (baselineHash !== hash) {
      console.warn(
        `[SECURITY] Policy snapshot re-initialization attempted with different hash. Ignoring.`,
      );
      return;
    }
  }
  baselineHash = hash;
}

export function assertPolicyDrift(currentHash: string, breakGlass: boolean) {
  if (baselineHash === null) {
    // If we haven't initialized, we can't assert drift.
    // This arguably is a violation itself (unsafe startup).
    failInvariant(SecurityInvariantViolation.UNSAFE_STARTUP, "Policy snapshot not initialized");
  }

  if (currentHash !== baselineHash) {
    if (breakGlass) {
      // Log drift but allow because break-glass
      // Ideally we'd log a ledger event here too.
      return;
    }

    // Strict mode or just normal runtime check: drift without break-glass is fatal.
    failInvariant(
      SecurityInvariantViolation.POLICY_DRIFT,
      `Current policy hash ${currentHash} differs from baseline ${baselineHash}`,
    );
  }
}
