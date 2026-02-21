import { OpenClawConfig } from "./config.js";

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyError";
  }
}

/**
 * Validates that the new configuration is a "tightening" of the current configuration.
 * Tightening means permissions are only reduced, never expanded.
 */
export function validateTightenOnly(current: OpenClawConfig, proposed: OpenClawConfig): void {
  validateNetworkAllowlist(current, proposed);
  validateFsAllowlist(current, proposed);
  validateExecutionBudget(current, proposed);
}

function validateNetworkAllowlist(current: OpenClawConfig, proposed: OpenClawConfig) {
  const currentList = current.security?.network?.allowlist;
  const proposedList = proposed.security?.network?.allowlist;

  // If current is effectively "allow all" (empty/undefined), any proposed change is valid (tightening).
  // Note: This assumes empty list = allow all, which might be legacy behavior.
  // If empty list = deny all, then we need to be careful.
  // Based on previous phases, we added an allowlist. If it was missing, it was "allow all".
  if (!currentList || currentList.length === 0) {
    return;
  }

  // If proposed is "allow all" (undefined/empty) but current was restricted, that's loosening.
  if (!proposedList || proposedList.length === 0) {
    throw new PolicyError("Cannot remove network allowlist (would relax security).");
  }

  // Every entry in proposed must be present in current.
  // This is a strict string match. Regex logic complicates this (subset of regex is hard),
  // so we enforce strict subset of string entries for now.
  for (const entry of proposedList) {
    if (!currentList.includes(entry)) {
      throw new PolicyError(
        `Cannot add new network allowlist entry: '${entry}'. Only subsetting is allowed.`,
      );
    }
  }
}

function validateFsAllowlist(current: OpenClawConfig, proposed: OpenClawConfig) {
  const currentFs = current.agents?.defaults?.sandbox?.fs?.allow;
  const proposedFs = proposed.agents?.defaults?.sandbox?.fs?.allow;

  if (!currentFs) {
    return; // Current allows everything (or default)
  }

  if (!proposedFs) {
    throw new PolicyError("Cannot remove filesystem allowlist (would relax security).");
  }

  for (const entry of proposedFs) {
    if (!currentFs.includes(entry)) {
      throw new PolicyError(`Cannot expand filesystem access to: '${entry}'.`);
    }
  }
}

function validateExecutionBudget(current: OpenClawConfig, proposed: OpenClawConfig) {
  const currentBudget = current.agents?.defaults?.sandbox?.executionBudget;
  const proposedBudget = proposed.agents?.defaults?.sandbox?.executionBudget;

  if (!currentBudget) {
    return;
  }

  if (!proposedBudget) {
    throw new PolicyError("Cannot remove execution budget.");
  }

  if (currentBudget.timeoutMs !== undefined && proposedBudget.timeoutMs !== undefined) {
    if (proposedBudget.timeoutMs > currentBudget.timeoutMs) {
      throw new PolicyError(
        `Cannot increase timeout budget from ${currentBudget.timeoutMs} to ${proposedBudget.timeoutMs}.`,
      );
    }
  }
}
